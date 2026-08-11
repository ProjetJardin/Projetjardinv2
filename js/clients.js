// ============================================================
// Gestion des clients — avec archivage (voir explication dans le chat)
// ============================================================
import { supabase } from './supabase.js';
import { protegerPage, deconnexion } from './auth.js';
import { injecterMenuLateral, afficherToast, confirmer, formaterDate, formaterMontant } from './ui.js';

await protegerPage();
injecterMenuLateral('clients');
document.querySelector('#bouton-deconnexion').addEventListener('click', deconnexion);

const zoneTableau = document.querySelector('#zone-tableau-clients');
const champRecherche = document.querySelector('#recherche-clients');
const boutonAfficherArchives = document.querySelector('#bouton-afficher-archives');

let tousLesClients = [];
let afficherArchives = false;

// --- Chargement et affichage de la liste ---

async function chargerClients() {
  try {
    const { data, error } = await supabase.from('clients').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    tousLesClients = data || [];
    appliquerFiltres();
  } catch (err) {
    console.error(err);
    zoneTableau.innerHTML = `<div class="erreur-reseau">Impossible de charger les clients. Vérifie ta connexion et réessaie.</div>`;
  }
}

function appliquerFiltres() {
  const terme = champRecherche.value.trim().toLowerCase();
  let resultats = afficherArchives ? tousLesClients : tousLesClients.filter(c => !c.archive);
  if (terme) {
    resultats = resultats.filter(c => [c.nom, c.prenom, c.entreprise, c.email, c.ville]
      .filter(Boolean).some(v => v.toLowerCase().includes(terme)));
  }
  afficherClients(resultats);
}

function afficherClients(clients) {
  if (clients.length === 0) {
    zoneTableau.innerHTML = `
      <div class="etat-vide">
        Aucun client pour l'instant.
        <div><button class="bouton bouton-principal" id="etat-vide-nouveau-client">+ Nouveau client</button></div>
      </div>`;
    document.querySelector('#etat-vide-nouveau-client')?.addEventListener('click', () => ouvrirFormulaireClient(null));
    return;
  }
  zoneTableau.innerHTML = `
    <div class="tableau-wrapper tableau-responsive">
      <table>
        <thead><tr><th>Nom / Entreprise</th><th>Ville</th><th>Téléphone</th><th>Email</th><th></th></tr></thead>
        <tbody>
          ${clients.map(c => `
            <tr data-id="${c.id}" class="${c.archive ? 'ligne-archivee' : ''}">
              <td data-label="Client">${(c.entreprise || `${c.prenom || ''} ${c.nom || ''}`).trim()} ${c.archive ? '<span class="badge badge-archive">archivé</span>' : ''}</td>
              <td data-label="Ville">${c.ville || '—'}</td>
              <td data-label="Téléphone">${c.telephone || '—'}</td>
              <td data-label="Email">${c.email || '—'}</td>
              <td class="actions-ligne">
                <button class="bouton bouton-secondaire bouton-petit" data-action="voir">Voir</button>
                <button class="bouton bouton-secondaire bouton-petit" data-action="modifier">Modifier</button>
                ${c.archive
                  ? `<button class="bouton bouton-secondaire bouton-petit" data-action="desarchiver">Réactiver</button>`
                  : `<button class="bouton bouton-danger bouton-petit" data-action="supprimer">Supprimer</button>`}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

champRecherche.addEventListener('input', appliquerFiltres);
boutonAfficherArchives.addEventListener('click', () => {
  afficherArchives = !afficherArchives;
  boutonAfficherArchives.setAttribute('aria-pressed', String(afficherArchives));
  boutonAfficherArchives.textContent = afficherArchives ? 'Masquer les clients archivés' : 'Afficher les clients archivés';
  appliquerFiltres();
});

zoneTableau.addEventListener('click', async (e) => {
  const bouton = e.target.closest('button[data-action]');
  if (!bouton) return;
  const ligne = bouton.closest('tr');
  const id = ligne.dataset.id;
  const client = tousLesClients.find(c => c.id === id);

  if (bouton.dataset.action === 'modifier') ouvrirFormulaireClient(client);
  if (bouton.dataset.action === 'voir') ouvrirVueClient(client);
  if (bouton.dataset.action === 'supprimer') await supprimerOuArchiverClient(client);
  if (bouton.dataset.action === 'desarchiver') await reactiverClient(client);
});

// --- Suppression / archivage ---
// Explication de la logique : un client sans devis/facture peut être
// supprimé pour de bon. S'il a au moins un document lié, la suppression
// physique casserait l'historique (numéros, montants, PDF) — on
// l'archive donc à la place : il disparaît de la liste par défaut,
// mais ses documents restent intacts et consultables.

async function supprimerOuArchiverClient(client) {
  const nomAffiche = client.entreprise || `${client.prenom || ''} ${client.nom || ''}`.trim();
  const { count, error: erreurCompte } = await supabase.from('documents')
    .select('*', { count: 'exact', head: true }).eq('client_id', client.id);

  if (erreurCompte) {
    afficherToast("Impossible de vérifier les documents de ce client.", 'erreur');
    return;
  }

  if (count === 0) {
    const ok = await confirmer('Supprimer ce client ?', `« ${nomAffiche} » n'a aucun devis ni facture associé : il sera définitivement supprimé.`, 'Supprimer');
    if (!ok) return;
    const { error } = await supabase.from('clients').delete().eq('id', client.id);
    if (error) { afficherToast('La suppression a échoué.', 'erreur'); return; }
    afficherToast('Client supprimé.');
  } else {
    const ok = await confirmer(
      'Archiver ce client ?',
      `« ${nomAffiche} » a ${count} document(s) associé(s) (devis/factures). Pour préserver ton historique, il ne peut pas être supprimé définitivement : il sera archivé — retiré de la liste principale, mais tous ses documents resteront intacts et consultables. Tu pourras le réactiver à tout moment.`,
      'Archiver'
    );
    if (!ok) return;
    const { error } = await supabase.from('clients').update({ archive: true }).eq('id', client.id);
    if (error) { afficherToast("L'archivage a échoué.", 'erreur'); return; }
    afficherToast('Client archivé.');
  }
  chargerClients();
}

async function reactiverClient(client) {
  const { error } = await supabase.from('clients').update({ archive: false }).eq('id', client.id);
  if (error) { afficherToast('La réactivation a échoué.', 'erreur'); return; }
  afficherToast('Client réactivé.');
  chargerClients();
}

// --- Panneau création / modification ---

const panneauFond = document.querySelector('#panneau-client-fond');
const formulaire = document.querySelector('#formulaire-client');
const titrePanneau = document.querySelector('#titre-panneau-client');
const erreurNom = document.querySelector('#erreur-client-nom');

document.querySelector('#bouton-nouveau-client').addEventListener('click', () => ouvrirFormulaireClient(null));
document.querySelector('#fermer-panneau-client').addEventListener('click', fermerFormulaireClient);
document.querySelector('#annuler-panneau-client').addEventListener('click', fermerFormulaireClient);
panneauFond.addEventListener('click', (e) => { if (e.target === panneauFond) fermerFormulaireClient(); });

function ouvrirFormulaireClient(client) {
  formulaire.reset();
  erreurNom.textContent = '';
  titrePanneau.textContent = client ? 'Modifier le client' : 'Nouveau client';
  document.querySelector('#client-id').value = client?.id || '';
  document.querySelector('#client-nom').value = client?.nom || '';
  document.querySelector('#client-prenom').value = client?.prenom || '';
  document.querySelector('#client-entreprise').value = client?.entreprise || '';
  document.querySelector('#client-adresse').value = client?.adresse || '';
  document.querySelector('#client-complement').value = client?.complement_adresse || '';
  document.querySelector('#client-code-postal').value = client?.code_postal || '';
  document.querySelector('#client-ville').value = client?.ville || '';
  document.querySelector('#client-telephone').value = client?.telephone || '';
  document.querySelector('#client-email').value = client?.email || '';
  document.querySelector('#client-notes').value = client?.notes || '';
  panneauFond.classList.add('visible');
}

function fermerFormulaireClient() {
  panneauFond.classList.remove('visible');
}

formulaire.addEventListener('submit', async (e) => {
  e.preventDefault();
  erreurNom.textContent = '';

  const nom = document.querySelector('#client-nom').value.trim();
  const entreprise = document.querySelector('#client-entreprise').value.trim();

  if (!nom && !entreprise) {
    erreurNom.textContent = 'Renseigne au moins un nom ou une entreprise.';
    return;
  }

  const donnees = {
    nom: nom || null,
    prenom: document.querySelector('#client-prenom').value.trim() || null,
    entreprise: entreprise || null,
    adresse: document.querySelector('#client-adresse').value.trim() || null,
    complement_adresse: document.querySelector('#client-complement').value.trim() || null,
    code_postal: document.querySelector('#client-code-postal').value.trim() || null,
    ville: document.querySelector('#client-ville').value.trim() || null,
    telephone: document.querySelector('#client-telephone').value.trim() || null,
    email: document.querySelector('#client-email').value.trim() || null,
    notes: document.querySelector('#client-notes').value.trim() || null,
  };

  const id = document.querySelector('#client-id').value;
  const boutonEnregistrer = document.querySelector('#bouton-enregistrer-client');
  boutonEnregistrer.disabled = true;

  try {
    if (id) {
      const { error } = await supabase.from('clients').update(donnees).eq('id', id);
      if (error) throw error;
      afficherToast('Client mis à jour.');
    } else {
      const { error } = await supabase.from('clients').insert(donnees);
      if (error) throw error;
      afficherToast('Client créé.');
    }
    fermerFormulaireClient();
    chargerClients();
  } catch (err) {
    console.error(err);
    afficherToast("L'enregistrement a échoué. Réessaie dans un instant.", 'erreur');
  } finally {
    boutonEnregistrer.disabled = false;
  }
});

// --- Panneau consultation + historique documents ---

const panneauVueFond = document.querySelector('#panneau-vue-client-fond');
document.querySelector('#fermer-panneau-vue-client').addEventListener('click', () => panneauVueFond.classList.remove('visible'));
panneauVueFond.addEventListener('click', (e) => { if (e.target === panneauVueFond) panneauVueFond.classList.remove('visible'); });

async function ouvrirVueClient(client) {
  const nomAffiche = client.entreprise || `${client.prenom || ''} ${client.nom || ''}`.trim();
  document.querySelector('#titre-vue-client').textContent = nomAffiche;
  const contenu = document.querySelector('#contenu-vue-client');
  contenu.innerHTML = `
    <ul class="liste-coordonnees" style="list-style:none; padding:0; margin-bottom:1.5rem; display:grid; gap:0.7rem;">
      <li><strong>Adresse</strong><br>${[client.adresse, client.complement_adresse, [client.code_postal, client.ville].filter(Boolean).join(' ')].filter(Boolean).join(', ') || '—'}</li>
      <li><strong>Téléphone</strong><br>${client.telephone || '—'}</li>
      <li><strong>Email</strong><br>${client.email || '—'}</li>
      ${client.notes ? `<li><strong>Notes</strong><br>${client.notes}</li>` : ''}
    </ul>
    <div class="actions-panneau" style="margin-bottom:0.5rem;">
      <a class="bouton bouton-secondaire bouton-petit" href="document-form.html?type=devis&client_id=${client.id}">+ Devis pour ce client</a>
      <a class="bouton bouton-secondaire bouton-petit" href="document-form.html?type=facture&client_id=${client.id}">+ Facture pour ce client</a>
    </div>
    <div class="bloc-historique">
      <h3>Historique</h3>
      <div id="historique-client-liste"><div class="chargement">Chargement…</div></div>
    </div>
  `;
  panneauVueFond.classList.add('visible');

  const { data, error } = await supabase.from('documents')
    .select('id, type, numero, nom, date, statut, total_ttc')
    .eq('client_id', client.id)
    .order('date', { ascending: false });

  const zoneHistorique = document.querySelector('#historique-client-liste');
  if (error) {
    zoneHistorique.innerHTML = `<p class="erreur-reseau">Impossible de charger l'historique.</p>`;
    return;
  }
  if (!data || data.length === 0) {
    zoneHistorique.innerHTML = `<p style="color:var(--gris); font-size:0.88rem;">Aucun devis ni facture pour ce client.</p>`;
    return;
  }
  zoneHistorique.innerHTML = data.map(d => `
    <a class="ligne-historique" href="document-form.html?id=${d.id}" style="text-decoration:none; color:inherit;">
      <span>${d.type === 'devis' ? 'Devis' : 'Facture'} ${d.numero}${d.nom ? ' — ' + d.nom : ''} — ${formaterDate(d.date)}</span>
      <span>${formaterMontant(d.total_ttc)} · <span class="badge badge-${d.statut}">${d.statut}</span></span>
    </a>
  `).join('');
}

chargerClients();
