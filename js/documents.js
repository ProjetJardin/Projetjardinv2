// ============================================================
// Liste des documents (devis + factures)
// ============================================================
import { supabase } from './supabase.js';
import { protegerPage, deconnexion } from './auth.js';
import { injecterMenuLateral, afficherToast, confirmer, formaterDate, formaterMontant } from './ui.js';
import { proposerNumero } from './numerotation.js';
import { genererPdfDocument } from './pdf.js';

await protegerPage();
injecterMenuLateral('documents');
document.querySelector('#bouton-deconnexion').addEventListener('click', deconnexion);

window.addEventListener('pageshow', (e) => { if (e.persisted) window.location.reload(); });

const STATUTS_DEVIS = ['brouillon', 'envoye', 'accepte', 'refuse', 'expire'];
const STATUTS_FACTURE = ['brouillon', 'envoyee', 'payee', 'partiellement-payee', 'impayee', 'annulee'];

const zoneTableau = document.querySelector('#zone-tableau-documents');
const champRecherche = document.querySelector('#recherche-documents');
const filtreType = document.querySelector('#filtre-type');
const filtreAnnee = document.querySelector('#filtre-annee');
const filtreStatut = document.querySelector('#filtre-statut');
const chipNonFactures = document.querySelector('#chip-non-factures');
const zoneChipsAnnees = document.querySelector('#chips-annees');
const zoneChipsRapides = document.querySelector('#chips-rapides');

// Les 4 étiquettes qui correspondent directement aux chiffres du tableau de bord
const FILTRES_RAPIDES = [
  { cle: 'devis-en-attente', label: 'Devis en attente de réponse', type: 'devis', statut: 'envoye' },
  { cle: 'factures-impayees', label: 'Factures impayées', type: 'facture', statut: 'impayee' },
  { cle: 'ca-facture', label: "Chiffre d'affaires facturé", type: 'facture', statut: 'payee' },
  { cle: 'reste-a-encaisser', label: 'Reste à encaisser', type: 'facture', statut: 'envoyee' },
];

let tousLesDocuments = [];
let idsFacturesLieesADevis = new Set();
const parametresUrl = new URLSearchParams(window.location.search);
let modeNonFactures = parametresUrl.get('filtre') === 'non-factures';

async function chargerDocuments() {
  try {
    const [{ data, error }, { data: liaisons }] = await Promise.all([
      supabase.from('documents')
        .select('id, type, numero, nom, date, statut, total_ttc, client_nom, client_entreprise, document_origine_id')
        .order('date', { ascending: false }),
      supabase.from('documents').select('document_origine_id').eq('type', 'facture').not('document_origine_id', 'is', null),
    ]);
    if (error) throw error;
    tousLesDocuments = data || [];
    idsFacturesLieesADevis = new Set((liaisons || []).map(l => l.document_origine_id));
    remplirFiltreAnnees();
    remplirFiltreStatuts();
    mettreAJourChipNonFactures();
    genererChipsAnnees();
    genererChipsRapides();
    appliquerFiltreDepuisUrl();
    appliquerFiltres();
  } catch (err) {
    console.error(err);
    zoneTableau.innerHTML = `<div class="erreur-reseau">Impossible de charger les documents. Vérifie ta connexion et réessaie.</div>`;
  }
}

function remplirFiltreAnnees() {
  const annees = [...new Set(tousLesDocuments.map(d => d.date?.slice(0, 4)).filter(Boolean))].sort().reverse();
  filtreAnnee.innerHTML = `<option value="">Toutes années</option>` + annees.map(a => `<option value="${a}">${a}</option>`).join('');
}

function remplirFiltreStatuts() {
  const statuts = [...new Set([...STATUTS_DEVIS, ...STATUTS_FACTURE])];
  filtreStatut.innerHTML = `<option value="">Tous statuts</option>` + statuts.map(s => `<option value="${s}">${s.replace('-', ' ')}</option>`).join('');
}

// Génère automatiquement une étiquette par combinaison (type, année) réellement
// présente dans les documents — "Devis 2025", "Facture 2026", etc. Une nouvelle
// étiquette apparaît d'elle-même dès qu'un document existe pour une nouvelle année.
function genererChipsAnnees() {
  const combinaisons = new Map();
  tousLesDocuments.forEach((d) => {
    const annee = d.date?.slice(0, 4);
    if (!annee) return;
    const cle = `${d.type}-${annee}`;
    combinaisons.set(cle, { type: d.type, annee });
  });

  const liste = [...combinaisons.values()].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'devis' ? -1 : 1;
    return b.annee.localeCompare(a.annee);
  });

  zoneChipsAnnees.innerHTML = liste.map(({ type, annee }) => {
    const actif = filtreType.value === type && filtreAnnee.value === annee;
    const libelle = type === 'devis' ? 'Devis' : 'Facture';
    return `<button type="button" class="chip-filtre" data-type="${type}" data-annee="${annee}" aria-pressed="${actif}">${libelle} ${annee}</button>`;
  }).join('');
}

zoneChipsAnnees.addEventListener('click', (e) => {
  const chip = e.target.closest('button[data-type]');
  if (!chip) return;
  const dejaActif = chip.getAttribute('aria-pressed') === 'true';

  if (dejaActif) {
    filtreType.value = '';
    filtreAnnee.value = '';
  } else {
    filtreType.value = chip.dataset.type;
    filtreAnnee.value = chip.dataset.annee;
  }
  genererChipsAnnees();
  appliquerFiltres();
});

// Applique automatiquement, au chargement de la page, le filtre indiqué par
// le lien cliqué depuis le tableau de bord (ex: documents.html?filtre=ca-facture)
function appliquerFiltreDepuisUrl() {
  const filtre = FILTRES_RAPIDES.find(f => f.cle === parametresUrl.get('filtre'));
  if (filtre) {
    filtreType.value = filtre.type;
    filtreStatut.value = filtre.statut;
    genererChipsRapides();
  }
}

function genererChipsRapides() {
  zoneChipsRapides.innerHTML = FILTRES_RAPIDES.map(({ cle, label, type, statut }) => {
    const actif = filtreType.value === type && filtreStatut.value === statut;
    return `<button type="button" class="chip-filtre" data-cle="${cle}" data-type="${type}" data-statut="${statut}" aria-pressed="${actif}">${label}</button>`;
  }).join('');
}

zoneChipsRapides.addEventListener('click', (e) => {
  const chip = e.target.closest('button[data-cle]');
  if (!chip) return;
  const dejaActif = chip.getAttribute('aria-pressed') === 'true';

  if (dejaActif) {
    filtreType.value = '';
    filtreStatut.value = '';
  } else {
    filtreType.value = chip.dataset.type;
    filtreStatut.value = chip.dataset.statut;
  }
  genererChipsRapides();
  genererChipsAnnees();
  appliquerFiltres();
});

function estDevisNonFacture(d) {
  return d.type === 'devis' && d.statut === 'accepte' && !idsFacturesLieesADevis.has(d.id);
}

function mettreAJourChipNonFactures() {
  const total = tousLesDocuments.filter(estDevisNonFacture).length;
  chipNonFactures.textContent = `Devis non facturés (${total})`;
  chipNonFactures.setAttribute('aria-pressed', String(modeNonFactures));
}

chipNonFactures.addEventListener('click', () => {
  modeNonFactures = !modeNonFactures;
  mettreAJourChipNonFactures();
  appliquerFiltres();
});

function appliquerFiltres() {
  const terme = champRecherche.value.trim().toLowerCase();
  let resultats = tousLesDocuments;

  if (modeNonFactures) resultats = resultats.filter(estDevisNonFacture);
  if (filtreType.value) resultats = resultats.filter(d => d.type === filtreType.value);
  if (filtreAnnee.value) resultats = resultats.filter(d => d.date?.startsWith(filtreAnnee.value));
  if (filtreStatut.value) resultats = resultats.filter(d => d.statut === filtreStatut.value);
  if (terme) {
    resultats = resultats.filter(d => [d.numero, d.nom, d.client_nom, d.client_entreprise, String(d.total_ttc)]
      .filter(Boolean).some(v => String(v).toLowerCase().includes(terme)));
  }

  afficherDocuments(resultats);
}

[champRecherche, filtreType, filtreAnnee, filtreStatut].forEach(el => el.addEventListener('input', () => {
  genererChipsAnnees();
  genererChipsRapides();
  appliquerFiltres();
}));

function ancienneteDevis(dateIso) {
  const jours = Math.floor((Date.now() - new Date(dateIso + 'T00:00:00').getTime()) / 86400000);
  if (jours <= 7) return { texte: 'Récent', classe: 'badge-accepte' };
  if (jours <= 30) return { texte: 'En attente', classe: 'badge-envoye' };
  return { texte: 'Ancien', classe: 'badge-refuse' };
}

function afficherDocuments(docs) {
  if (docs.length === 0) {
    zoneTableau.innerHTML = `
      <div class="etat-vide">
        ${modeNonFactures ? 'Aucun devis non facturé pour le moment.' : 'Aucun document ne correspond à ta recherche.'}
        <div><a href="document-form.html?type=devis" class="bouton bouton-principal">+ Créer un devis</a></div>
      </div>`;
    return;
  }
  zoneTableau.innerHTML = `
    <div class="tableau-wrapper tableau-responsive">
      <table>
        <thead><tr><th>Type</th><th>Numéro</th><th>Nom</th><th>Date</th><th>Client</th><th>Statut</th>${modeNonFactures ? '<th>Ancienneté</th>' : ''}<th>Montant TTC</th><th></th></tr></thead>
        <tbody>
          ${docs.map(d => `
            <tr data-id="${d.id}" data-type="${d.type}" data-statut="${d.statut}">
              <td data-label="Type">${d.type === 'devis' ? 'Devis' : 'Facture'}</td>
              <td data-label="Numéro">${d.numero}</td>
              <td data-label="Nom">${d.nom || '—'}</td>
              <td data-label="Date">${formaterDate(d.date)}</td>
              <td data-label="Client">${d.client_entreprise || d.client_nom || '—'}</td>
              <td data-label="Statut"><span class="badge badge-${d.statut}">${d.statut.replace('-', ' ')}</span></td>
              ${modeNonFactures ? `<td data-label="Ancienneté">${(() => { const a = ancienneteDevis(d.date); return `<span class="badge ${a.classe}">${a.texte}</span>`; })()}</td>` : ''}
              <td data-label="Montant TTC">${formaterMontant(d.total_ttc)}</td>
              <td class="actions-ligne">
                <button class="bouton bouton-secondaire bouton-petit" data-action="etat">État</button>
                <a class="bouton bouton-secondaire bouton-petit" href="document-form.html?id=${d.id}&mode=vue">Voir</a>
                <a class="bouton bouton-secondaire bouton-petit" href="document-form.html?id=${d.id}">Modifier</a>
                <button class="bouton bouton-secondaire bouton-petit" data-action="pdf">PDF</button>
                <button class="bouton bouton-secondaire bouton-petit" data-action="dupliquer">Dupliquer</button>
                ${d.type === 'devis' && !idsFacturesLieesADevis.has(d.id) ? `<button class="bouton bouton-principal bouton-petit" data-action="transformer">→ Facture</button>` : ''}
                ${peutSupprimer(d) ? `<button class="bouton bouton-danger bouton-petit" data-action="supprimer-document">Supprimer</button>` : ''}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

zoneTableau.addEventListener('click', async (e) => {
  const bouton = e.target.closest('button[data-action]');
  if (!bouton) return;

  if (bouton.dataset.action === 'etat') {
    activerSelecteurStatut(bouton.closest('tr'));
    return;
  }

  const ligne = bouton.closest('tr');
  const id = ligne.dataset.id;
  bouton.disabled = true;

  try {
    if (bouton.dataset.action === 'pdf') {
      afficherToast('Génération du PDF…');
      await genererPdfDocument(id);
    }
    if (bouton.dataset.action === 'dupliquer') {
      await dupliquerDocument(id);
    }
    if (bouton.dataset.action === 'transformer') {
      await transformerEnFacture(id);
    }
    if (bouton.dataset.action === 'supprimer-document') {
      await supprimerDocument(id, ligne.dataset.type, ligne.dataset.statut);
    }
  } catch (err) {
    console.error(err);
    afficherToast("L'action a échoué. Réessaie dans un instant.", 'erreur');
  } finally {
    bouton.disabled = false;
  }
});

// Permet de changer le statut d'un document directement depuis la liste,
// sans passer par la page de modification complète (le lien "Modifier" reste
// disponible pour les changements plus complets).
function activerSelecteurStatut(ligne) {
  const tdStatut = ligne.querySelector('td[data-label="Statut"]');
  const type = ligne.dataset.type;
  const statutActuel = ligne.dataset.statut;
  const options = type === 'devis' ? STATUTS_DEVIS : STATUTS_FACTURE;

  tdStatut.innerHTML = `<select class="select-etat-rapide">${options.map(s => `<option value="${s}" ${s === statutActuel ? 'selected' : ''}>${s.replace('-', ' ')}</option>`).join('')}</select>`;
  const select = tdStatut.querySelector('select');
  select.focus();

  select.addEventListener('change', async () => {
    const { error } = await supabase.from('documents').update({ statut: select.value }).eq('id', ligne.dataset.id);
    if (error) {
      afficherToast('Le changement de statut a échoué.', 'erreur');
      return;
    }
    afficherToast('Statut mis à jour.');
    chargerDocuments();
  });
}

// Un devis peut être supprimé quel que soit son statut (brouillon, envoyé,
// accepté, refusé, expiré) tant qu'il n'a pas déjà été transformé en facture
// — supprimer un devis déjà facturé casserait le lien avec cette facture.
// Une facture, elle, reste protégée dès qu'elle n'est plus un brouillon :
// c'est un document comptable, on ne supprime pas une facture envoyée/payée.
function peutSupprimer(d) {
  if (d.type === 'devis') return !idsFacturesLieesADevis.has(d.id);
  return d.statut === 'brouillon';
}
async function supprimerDocument(id, type, statut) {
  const doc = tousLesDocuments.find(d => d.id === id);
  if (!doc || !peutSupprimer(doc)) {
    afficherToast(
      type === 'devis'
        ? 'Ce devis a déjà été transformé en facture, impossible de le supprimer.'
        : "Seules les factures à l'état « brouillon » peuvent être supprimées.",
      'erreur'
    );
    return;
  }
  const ok = await confirmer(
    `Supprimer ${type === 'devis' ? 'ce devis' : 'cette facture'} ?`,
    `Ce document (statut « ${statut.replace('-', ' ')} ») sera définitivement supprimé, ainsi que ses prestations. Cette action est irréversible.`,
    'Supprimer'
  );
  if (!ok) return;

  const { error } = await supabase.from('documents').delete().eq('id', id);
  if (error) { afficherToast('La suppression a échoué.', 'erreur'); return; }
  afficherToast(`${type === 'devis' ? 'Devis' : 'Facture'} supprimé(e).`);
  chargerDocuments();
}

async function dupliquerDocument(id) {
  const ok = await confirmer('Dupliquer ce document ?', 'Un nouveau document sera créé avec un nouveau numéro et la date du jour, en reprenant le client et les prestations.', 'Dupliquer');
  if (!ok) return;

  const { data: original, error: erreurOriginal } = await supabase.from('documents').select('*').eq('id', id).single();
  if (erreurOriginal) throw erreurOriginal;
  const { data: prestations, error: erreurPrest } = await supabase.from('prestations').select('*').eq('document_id', id).order('ordre');
  if (erreurPrest) throw erreurPrest;

  const nouveauNumero = await proposerNumero(original.type);

  const { id: _id, created_at, updated_at, numero, date, document_origine_id, ...copie } = original;
  const { data: nouveauDoc, error: erreurCreation } = await supabase.from('documents').insert({
    ...copie,
    numero: nouveauNumero,
    date: new Date().toISOString().slice(0, 10),
    statut: 'brouillon',
    document_origine_id: null,
  }).select().single();
  if (erreurCreation) throw erreurCreation;

  if (prestations.length > 0) {
    const nouvellesPrestations = prestations.map(({ id, total_ht, ...p }) => ({ ...p, document_id: nouveauDoc.id }));
    const { error: erreurPrestations } = await supabase.from('prestations').insert(nouvellesPrestations);
    if (erreurPrestations) throw erreurPrestations;
  }

  afficherToast(`Document dupliqué sous le numéro ${nouveauNumero}.`);
  chargerDocuments();
}

async function transformerEnFacture(idDevis) {
  const ok = await confirmer('Transformer ce devis en facture ?', 'Une nouvelle facture sera créée à partir de ce devis, avec son propre numéro. Le devis original est conservé tel quel.', 'Transformer');
  if (!ok) return;

  const { data: devis, error: erreurDevis } = await supabase.from('documents').select('*').eq('id', idDevis).single();
  if (erreurDevis) throw erreurDevis;
  const { data: prestations, error: erreurPrest } = await supabase.from('prestations').select('*').eq('document_id', idDevis).order('ordre');
  if (erreurPrest) throw erreurPrest;

  const nouveauNumero = await proposerNumero('facture');

  const { id: _id, created_at, updated_at, numero, date, type, statut, document_origine_id, ...copie } = devis;
  const { data: nouvelleFacture, error: erreurCreation } = await supabase.from('documents').insert({
    ...copie,
    type: 'facture',
    numero: nouveauNumero,
    date: new Date().toISOString().slice(0, 10),
    statut: 'brouillon',
    document_origine_id: idDevis,
  }).select().single();
  if (erreurCreation) throw erreurCreation;

  if (prestations.length > 0) {
    const nouvellesPrestations = prestations.map(({ id, total_ht, ...p }) => ({ ...p, document_id: nouvelleFacture.id }));
    const { error: erreurPrestations } = await supabase.from('prestations').insert(nouvellesPrestations);
    if (erreurPrestations) throw erreurPrestations;
  }

  afficherToast(`Facture ${nouveauNumero} créée à partir du devis.`);
  chargerDocuments();
}

chargerDocuments();
