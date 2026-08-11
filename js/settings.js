// ============================================================
// Paramètres de l'entreprise
// ============================================================
import { supabase } from './supabase.js';
import { protegerPage, deconnexion } from './auth.js';
import { injecterMenuLateral, afficherToast } from './ui.js';

await protegerPage();
injecterMenuLateral('settings');
document.querySelector('#bouton-deconnexion').addEventListener('click', deconnexion);

const form = document.querySelector('#formulaire-parametres');

const champs = {
  nom_entreprise: '#p-nom-entreprise',
  nom_responsable: '#p-nom-responsable',
  logo_url: '#p-logo-url',
  adresse: '#p-adresse',
  code_postal: '#p-code-postal',
  ville: '#p-ville',
  telephone: '#p-telephone',
  email: '#p-email',
  siret: '#p-siret',
  numero_tva: '#p-numero-tva',
  iban: '#p-iban',
  bic: '#p-bic',
  conditions_paiement_defaut: '#p-conditions-defaut',
  texte_legal: '#p-texte-legal',
  pied_de_page: '#p-pied-de-page',
};

async function chargerParametres() {
  const { data, error } = await supabase.from('entreprise_parametres').select('*').eq('id', 1).single();
  if (error) {
    afficherToast("Impossible de charger les paramètres.", 'erreur');
    return;
  }
  Object.entries(champs).forEach(([cle, selecteur]) => {
    document.querySelector(selecteur).value = data[cle] || '';
  });
  document.querySelector('#p-afficher-tva-defaut').checked = !!data.afficher_tva_par_defaut;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const bouton = document.querySelector('#bouton-enregistrer-parametres');
  bouton.disabled = true;
  bouton.textContent = 'Enregistrement…';

  const donnees = {};
  Object.entries(champs).forEach(([cle, selecteur]) => {
    donnees[cle] = document.querySelector(selecteur).value.trim() || null;
  });
  donnees.afficher_tva_par_defaut = document.querySelector('#p-afficher-tva-defaut').checked;

  const { error } = await supabase.from('entreprise_parametres').update(donnees).eq('id', 1);

  bouton.disabled = false;
  bouton.textContent = 'Enregistrer les paramètres';

  if (error) {
    afficherToast("L'enregistrement a échoué. Réessaie dans un instant.", 'erreur');
  } else {
    afficherToast('Paramètres enregistrés.');
  }
});

chargerParametres();
