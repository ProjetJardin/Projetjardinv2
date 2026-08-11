// ============================================================
// Formulaire de devis / facture (création, modification, consultation)
// ============================================================
import { supabase } from './supabase.js';
import { protegerPage, deconnexion } from './auth.js';
import { injecterMenuLateral, afficherToast, formaterMontant } from './ui.js';
import { proposerNumero, numeroEstDisponible } from './numerotation.js';
import { genererPdfDocument } from './pdf.js';

await protegerPage();
injecterMenuLateral('documents');
document.querySelector('#bouton-deconnexion').addEventListener('click', deconnexion);

const STATUTS = {
  devis: ['brouillon', 'envoye', 'accepte', 'refuse', 'expire'],
  facture: ['brouillon', 'envoyee', 'payee', 'partiellement-payee', 'impayee', 'annulee'],
};

const parametresUrl = new URLSearchParams(window.location.search);
const idDocument = parametresUrl.get('id');
const modeVue = parametresUrl.get('mode') === 'vue';
let typeDocument = parametresUrl.get('type') || 'devis';
const clientIdPresetionne = parametresUrl.get('client_id');

const form = document.querySelector('#formulaire-document');
const corpsPrestations = document.querySelector('#corps-prestations');
const modeleLigne = document.querySelector('#modele-ligne-prestation');
const zoneErreur = document.querySelector('#message-erreur-page');

let tousLesClients = [];

// --------------------------------------------------------------
// Initialisation
// --------------------------------------------------------------
async function initialiser() {
  await chargerListeClients();

  if (idDocument) {
    await chargerDocumentExistant(idDocument);
  } else {
    document.querySelector('#document-type').value = typeDocument;
    document.querySelector('#champ-date').value = new Date().toISOString().slice(0, 10);
    remplirStatuts(typeDocument);
    document.querySelector('#titre-page').textContent = typeDocument === 'devis' ? 'Nouveau devis' : 'Nouvelle facture';
    document.querySelector('#champ-numero').value = await proposerNumero(typeDocument);
    if (clientIdPresetionne) {
      document.querySelector('#select-client').value = clientIdPresetionne;
      appliquerClientSelectionne(clientIdPresetionne);
    }
    ajouterLignePrestation();
  }

  if (modeVue) activerModeLectureSeule();

  recalculerTotaux();
}

async function chargerListeClients() {
  const { data, error } = await supabase.from('clients').select('id, nom, prenom, entreprise').eq('archive', false).order('entreprise').order('nom');
  if (error) { console.error(error); return; }
  tousLesClients = data || [];
  const select = document.querySelector('#select-client');
  const optionNouveau = select.querySelector('option[value="__nouveau__"]');
  tousLesClients.forEach((c) => {
    const option = document.createElement('option');
    option.value = c.id;
    option.textContent = c.entreprise || `${c.prenom || ''} ${c.nom || ''}`.trim();
    select.insertBefore(option, optionNouveau);
  });
}

function remplirStatuts(type) {
  const select = document.querySelector('#champ-statut');
  select.innerHTML = STATUTS[type].map(s => `<option value="${s}">${s.replace('-', ' ')}</option>`).join('');
}

// --------------------------------------------------------------
// Chargement d'un document existant (modification / consultation)
// --------------------------------------------------------------
async function chargerDocumentExistant(id) {
  try {
    const [{ data: doc, error: erreurDoc }, { data: prestations, error: erreurPrest }] = await Promise.all([
      supabase.from('documents').select('*').eq('id', id).single(),
      supabase.from('prestations').select('*').eq('document_id', id).order('ordre', { ascending: true }),
    ]);
    if (erreurDoc) throw erreurDoc;
    if (erreurPrest) throw erreurPrest;

    typeDocument = doc.type;
    document.querySelector('#document-id').value = doc.id;
    document.querySelector('#document-type').value = doc.type;
    document.querySelector('#titre-page').textContent = `${doc.type === 'devis' ? 'Devis' : 'Facture'} ${doc.numero}${doc.nom ? ' — ' + doc.nom : ''}`;
    document.querySelector('#champ-numero').value = doc.numero;
    document.querySelector('#champ-nom').value = doc.nom || '';
    document.querySelector('#champ-date').value = doc.date;
    remplirStatuts(doc.type);
    document.querySelector('#champ-statut').value = doc.statut;
    document.querySelector('#select-client').value = doc.client_id || '';
    document.querySelector('#cs-adresse').value = doc.client_adresse || '';
    document.querySelector('#cs-code-postal').value = doc.client_code_postal || '';
    document.querySelector('#cs-ville').value = doc.client_ville || '';
    document.querySelector('#cs-telephone').value = doc.client_telephone || '';
    document.querySelector('#cs-email').value = doc.client_email || '';
    document.querySelector('#champ-chantier-nom').value = doc.chantier_nom || '';
    document.querySelector('#champ-chantier-adresse').value = doc.chantier_adresse || '';
    document.querySelector('#champ-afficher-tva').checked = doc.afficher_tva;
    document.querySelector('#champ-mode-paiement').value = doc.mode_paiement || '';
    document.querySelector('#champ-conditions-paiement').value = doc.conditions_paiement || '';
    document.querySelector('#champ-notes').value = doc.notes || '';

    corpsPrestations.innerHTML = '';
    (prestations || []).forEach((p) => ajouterLignePrestation(p));
    if (!prestations || prestations.length === 0) ajouterLignePrestation();

    appliquerAffichageTva();
  } catch (err) {
    console.error(err);
    zoneErreur.innerHTML = `<div class="erreur-reseau">Impossible de charger ce document. <a href="documents.html">Retour à la liste</a>.</div>`;
    form.style.display = 'none';
  }
}

// --------------------------------------------------------------
// Sélection d'un client existant → recopie des coordonnées
// --------------------------------------------------------------
document.querySelector('#select-client').addEventListener('change', (e) => {
  const bloc = document.querySelector('#bloc-nouveau-client');
  if (e.target.value === '__nouveau__') {
    bloc.style.display = 'block';
    return;
  }
  bloc.style.display = 'none';
  appliquerClientSelectionne(e.target.value);
});

async function appliquerClientSelectionne(clientId) {
  if (!clientId) return;
  const { data: client, error } = await supabase.from('clients').select('*').eq('id', clientId).single();
  if (error) { console.error(error); return; }
  document.querySelector('#cs-adresse').value = client.adresse || '';
  document.querySelector('#cs-code-postal').value = client.code_postal || '';
  document.querySelector('#cs-ville').value = client.ville || '';
  document.querySelector('#cs-telephone').value = client.telephone || '';
  document.querySelector('#cs-email').value = client.email || '';
}

document.querySelector('#bouton-creer-client').addEventListener('click', async () => {
  const resultat = await creerNouveauClientDepuisFormulaire();
  if (resultat) afficherToast('Client créé et sélectionné.');
});

// Extrait dans une fonction réutilisable : utilisée à la fois par le bouton
// "Créer et utiliser ce client" ET automatiquement au moment d'enregistrer
// le document, au cas où l'administrateur aurait rempli les champs du
// nouveau client sans avoir pensé à cliquer sur ce bouton avant d'enregistrer.
// C'est ce filet de sécurité qui manquait et empêchait le client d'être
// réellement sauvegardé dans la table clients.
async function creerNouveauClientDepuisFormulaire() {
  const nom = document.querySelector('#nc-nom').value.trim();
  const entreprise = document.querySelector('#nc-entreprise').value.trim();
  if (!nom && !entreprise) {
    afficherToast('Renseigne au moins un nom ou une entreprise pour le nouveau client.', 'erreur');
    return null;
  }
  const donnees = {
    nom: nom || null,
    prenom: document.querySelector('#nc-prenom').value.trim() || null,
    entreprise: entreprise || null,
    adresse: document.querySelector('#nc-adresse').value.trim() || null,
    code_postal: document.querySelector('#nc-code-postal').value.trim() || null,
    ville: document.querySelector('#nc-ville').value.trim() || null,
    telephone: document.querySelector('#nc-telephone').value.trim() || null,
    email: document.querySelector('#nc-email').value.trim() || null,
  };
  const { data, error } = await supabase.from('clients').insert(donnees).select().single();
  if (error) {
    afficherToast("La création du client a échoué.", 'erreur');
    return null;
  }
  tousLesClients.push(data);
  const select = document.querySelector('#select-client');
  const option = document.createElement('option');
  option.value = data.id;
  option.textContent = data.entreprise || `${data.prenom || ''} ${data.nom || ''}`.trim();
  select.insertBefore(option, select.querySelector('option[value="__nouveau__"]'));
  select.value = data.id;
  document.querySelector('#bloc-nouveau-client').style.display = 'none';

  // Recopie immédiate des coordonnées dans les champs "snapshot" du document
  document.querySelector('#cs-adresse').value = data.adresse || '';
  document.querySelector('#cs-code-postal').value = data.code_postal || '';
  document.querySelector('#cs-ville').value = data.ville || '';
  document.querySelector('#cs-telephone').value = data.telephone || '';
  document.querySelector('#cs-email').value = data.email || '';

  return data;
}

// --------------------------------------------------------------
// Prestations dynamiques
// --------------------------------------------------------------
function ajouterLignePrestation(donnees = null) {
  const fragment = modeleLigne.content.cloneNode(true);
  const ligne = fragment.querySelector('tr');
  if (donnees) {
    ligne.querySelector('.pl-description').value = donnees.description || '';
    ligne.querySelector('.pl-quantite').value = donnees.quantite ?? 1;
    ligne.querySelector('.pl-unite').value = donnees.unite || '';
    ligne.querySelector('.pl-prix').value = donnees.prix_unitaire_ht ?? 0;
    ligne.querySelector('.pl-tva').value = donnees.taux_tva ?? 0;
  }
  corpsPrestations.appendChild(ligne);
  recalculerTotaux();
}

document.querySelector('#bouton-ajouter-ligne').addEventListener('click', () => ajouterLignePrestation());

corpsPrestations.addEventListener('input', (e) => {
  if (e.target.matches('.pl-quantite, .pl-prix, .pl-tva')) recalculerLigne(e.target.closest('tr'));
});

corpsPrestations.addEventListener('click', (e) => {
  if (e.target.matches('.pl-supprimer')) {
    e.target.closest('tr').remove();
    recalculerTotaux();
  }
});

function recalculerLigne(ligne) {
  const quantite = parseFloat(ligne.querySelector('.pl-quantite').value) || 0;
  const prix = parseFloat(ligne.querySelector('.pl-prix').value) || 0;
  const total = quantite * prix;
  ligne.querySelector('.pl-total').textContent = formaterMontant(total);
  recalculerTotaux();
}

function recalculerTotaux() {
  const afficherTva = document.querySelector('#champ-afficher-tva').checked;
  let totalHt = 0;
  let totalTva = 0;

  corpsPrestations.querySelectorAll('tr').forEach((ligne) => {
    const quantite = parseFloat(ligne.querySelector('.pl-quantite').value) || 0;
    const prix = parseFloat(ligne.querySelector('.pl-prix').value) || 0;
    const tva = parseFloat(ligne.querySelector('.pl-tva').value) || 0;
    const totalLigne = quantite * prix;
    ligne.querySelector('.pl-total').textContent = formaterMontant(totalLigne);
    totalHt += totalLigne;
    if (afficherTva) totalTva += totalLigne * (tva / 100);
  });

  document.querySelector('#affiche-total-ht').textContent = formaterMontant(totalHt);
  document.querySelector('#affiche-total-tva').textContent = formaterMontant(totalTva);
  document.querySelector('#affiche-total-ttc').textContent = formaterMontant(totalHt + totalTva);
}

document.querySelector('#champ-afficher-tva').addEventListener('change', (e) => {
  // Si on vient d'activer la TVA, on met 20% par défaut sur les lignes
  // encore à 0% (l'administrateur peut toujours l'ajuster ligne par ligne).
  if (e.target.checked) {
    corpsPrestations.querySelectorAll('.pl-tva').forEach((champ) => {
      if (!champ.value || parseFloat(champ.value) === 0) champ.value = '20';
    });
  }
  appliquerAffichageTva();
  recalculerTotaux();
});

function appliquerAffichageTva() {
  const afficher = document.querySelector('#champ-afficher-tva').checked;
  document.querySelectorAll('.col-tva').forEach(el => { el.style.display = afficher ? '' : 'none'; });
  document.querySelector('#ligne-total-tva').style.display = afficher ? '' : 'none';
}

// --------------------------------------------------------------
// Vérification du numéro à la volée
// --------------------------------------------------------------
document.querySelector('#champ-numero').addEventListener('blur', async (e) => {
  const numero = e.target.value.trim();
  const erreur = document.querySelector('#erreur-numero');
  if (!numero) return;
  const disponible = await numeroEstDisponible(typeDocument, numero, idDocument);
  erreur.textContent = disponible ? '' : 'Ce numéro est déjà utilisé par un autre document. Choisis-en un autre.';
});

// --------------------------------------------------------------
// Enregistrement
// --------------------------------------------------------------
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const boutonEnregistrer = document.querySelector('#bouton-enregistrer');
  const numero = document.querySelector('#champ-numero').value.trim();

  if (!numero) {
    afficherToast('Le numéro est obligatoire.', 'erreur');
    return;
  }

  // Si "+ Nouveau client" est encore sélectionné à ce stade, c'est que
  // l'administrateur a rempli les champs sans cliquer sur "Créer et
  // utiliser ce client" : on le crée maintenant, automatiquement.
  if (document.querySelector('#select-client').value === '__nouveau__') {
    const clientCree = await creerNouveauClientDepuisFormulaire();
    if (!clientCree) return; // message d'erreur déjà affiché
  }

  const disponible = await numeroEstDisponible(typeDocument, numero, idDocument);
  if (!disponible) {
    document.querySelector('#erreur-numero').textContent = 'Ce numéro est déjà utilisé. Choisis-en un autre avant d\'enregistrer.';
    afficherToast('Impossible d\'enregistrer : numéro déjà utilisé.', 'erreur');
    return;
  }

  const afficherTva = document.querySelector('#champ-afficher-tva').checked;
  let totalHt = 0, totalTva = 0;
  const lignesPrestations = [...corpsPrestations.querySelectorAll('tr')].map((ligne, index) => {
    const quantite = parseFloat(ligne.querySelector('.pl-quantite').value) || 0;
    const prix = parseFloat(ligne.querySelector('.pl-prix').value) || 0;
    const tva = parseFloat(ligne.querySelector('.pl-tva').value) || 0;
    const totalLigne = quantite * prix;
    totalHt += totalLigne;
    if (afficherTva) totalTva += totalLigne * (tva / 100);
    return {
      description: ligne.querySelector('.pl-description').value.trim(),
      quantite, unite: ligne.querySelector('.pl-unite').value.trim(),
      prix_unitaire_ht: prix, taux_tva: afficherTva ? tva : 0, ordre: index,
    };
  }).filter(p => p.description);

  const clientId = document.querySelector('#select-client').value;
  const clientChoisi = tousLesClients.find(c => c.id === clientId);

  const donneesDocument = {
    type: typeDocument,
    numero,
    nom: document.querySelector('#champ-nom').value.trim() || null,
    date: document.querySelector('#champ-date').value,
    statut: document.querySelector('#champ-statut').value,
    client_id: (clientId && clientId !== '__nouveau__') ? clientId : null,
    client_nom: clientChoisi?.nom || null,
    client_prenom: clientChoisi?.prenom || null,
    client_entreprise: clientChoisi?.entreprise || null,
    client_adresse: document.querySelector('#cs-adresse').value.trim() || null,
    client_code_postal: document.querySelector('#cs-code-postal').value.trim() || null,
    client_ville: document.querySelector('#cs-ville').value.trim() || null,
    client_telephone: document.querySelector('#cs-telephone').value.trim() || null,
    client_email: document.querySelector('#cs-email').value.trim() || null,
    chantier_nom: document.querySelector('#champ-chantier-nom').value.trim() || null,
    chantier_adresse: document.querySelector('#champ-chantier-adresse').value.trim() || null,
    afficher_tva: afficherTva,
    total_ht: totalHt,
    total_tva: totalTva,
    total_ttc: totalHt + totalTva,
    mode_paiement: document.querySelector('#champ-mode-paiement').value.trim() || null,
    conditions_paiement: document.querySelector('#champ-conditions-paiement').value.trim() || null,
    notes: document.querySelector('#champ-notes').value.trim() || null,
  };

  boutonEnregistrer.disabled = true;
  boutonEnregistrer.textContent = 'Enregistrement…';

  try {
    let idFinal = idDocument;
    if (idDocument) {
      const { error } = await supabase.from('documents').update(donneesDocument).eq('id', idDocument);
      if (error) throw error;
      await supabase.from('prestations').delete().eq('document_id', idDocument);
    } else {
      const { data, error } = await supabase.from('documents').insert(donneesDocument).select().single();
      if (error) throw error;
      idFinal = data.id;
    }

    if (lignesPrestations.length > 0) {
      const { error: erreurPrestations } = await supabase.from('prestations')
        .insert(lignesPrestations.map(p => ({ ...p, document_id: idFinal })));
      if (erreurPrestations) throw erreurPrestations;
    }

    afficherToast('Document enregistré.');
    window.location.href = `document-form.html?id=${idFinal}`;
  } catch (err) {
    console.error(err);
    afficherToast("L'enregistrement a échoué. Vérifie ta connexion et réessaie.", 'erreur');
  } finally {
    boutonEnregistrer.disabled = false;
    boutonEnregistrer.textContent = 'Enregistrer';
  }
});

// --------------------------------------------------------------
// Génération du PDF
// --------------------------------------------------------------
document.querySelector('#bouton-pdf').addEventListener('click', async () => {
  if (!idDocument) {
    afficherToast('Enregistre le document une première fois avant de générer le PDF.', 'erreur');
    return;
  }
  try {
    afficherToast('Génération du PDF…');
    await genererPdfDocument(idDocument);
  } catch (err) {
    console.error(err);
    afficherToast('La génération du PDF a échoué.', 'erreur');
  }
});

// --------------------------------------------------------------
// Mode consultation (lecture seule)
// --------------------------------------------------------------
function activerModeLectureSeule() {
  document.querySelector('#titre-page').textContent += ' (consultation)';
  form.querySelectorAll('input, select, textarea, button').forEach((el) => {
    if (el.id === 'bouton-pdf') return;
    el.disabled = true;
  });
  const actions = document.querySelector('.actions-panneau');
  actions.innerHTML = `<a class="bouton bouton-principal" href="document-form.html?id=${idDocument}">Modifier ce document</a><a class="bouton bouton-secondaire" href="documents.html">Retour</a>`;
}

initialiser();
