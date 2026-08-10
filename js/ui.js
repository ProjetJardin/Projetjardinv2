// ============================================================
// Petits utilitaires d'interface partagés par toutes les pages admin
// ============================================================

/**
 * Affiche un message temporaire en bas à droite de l'écran.
 * type: 'succes' (par défaut) ou 'erreur'
 */
export function afficherToast(message, type = 'succes') {
  let zone = document.querySelector('.zone-toasts');
  if (!zone) {
    zone = document.createElement('div');
    zone.className = 'zone-toasts';
    document.body.appendChild(zone);
  }
  const toast = document.createElement('div');
  toast.className = `toast${type === 'erreur' ? ' toast-erreur' : ''}`;
  toast.setAttribute('role', 'status');
  toast.textContent = message;
  zone.appendChild(toast);
  setTimeout(() => toast.remove(), 4500);
}

/**
 * Affiche une modale de confirmation avant une action destructive
 * (ex : suppression). Retourne une Promise<boolean>.
 *
 * Exemple :
 *   const ok = await confirmer('Supprimer ce client ?', 'Cette action est définitive.');
 *   if (!ok) return;
 */
export function confirmer(titre, description, libelleValider = 'Confirmer') {
  return new Promise((resolve) => {
    let fond = document.querySelector('.fond-modale');
    if (!fond) {
      fond = document.createElement('div');
      fond.className = 'fond-modale';
      document.body.appendChild(fond);
    }
    fond.innerHTML = `
      <div class="modale" role="alertdialog" aria-modal="true">
        <h3>${titre}</h3>
        <p>${description}</p>
        <div class="actions-modale">
          <button type="button" class="bouton bouton-secondaire" data-action="annuler">Annuler</button>
          <button type="button" class="bouton bouton-danger" data-action="valider">${libelleValider}</button>
        </div>
      </div>
    `;
    fond.classList.add('visible');

    const fermer = (resultat) => {
      fond.classList.remove('visible');
      resolve(resultat);
    };

    fond.querySelector('[data-action="annuler"]').addEventListener('click', () => fermer(false));
    fond.querySelector('[data-action="valider"]').addEventListener('click', () => fermer(true));
    fond.addEventListener('click', (e) => { if (e.target === fond) fermer(false); }, { once: true });
  });
}

/** Formate un nombre en euros, ex : 1234.5 -> "1 234,50 €" */
export function formaterMontant(nombre) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(nombre || 0);
}

/** Formate une date ISO (YYYY-MM-DD) en format français lisible */
export function formaterDate(dateIso) {
  if (!dateIso) return '';
  return new Date(dateIso + 'T00:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Construit le menu latéral admin (évite de dupliquer le HTML sur chaque page) */
export function injecterMenuLateral(pageActive) {
  const conteneur = document.querySelector('#menu-lateral');
  if (!conteneur) return;
  const items = [
    { href: 'index.html', label: 'Tableau de bord', cle: 'dashboard' },
    { href: 'clients.html', label: 'Clients', cle: 'clients' },
    { href: 'documents.html', label: 'Documents', cle: 'documents' },
    { href: 'documents.html?filtre=non-factures', label: 'Devis non facturés', cle: 'non-factures' },
    { href: 'settings.html', label: 'Paramètres', cle: 'settings' },
  ];
  conteneur.innerHTML = `
    <nav aria-label="Navigation admin">
      <ul>
        ${items.map(i => `<li><a href="${i.href}" ${i.cle === pageActive ? 'aria-current="page"' : ''}>${i.label}</a></li>`).join('')}
      </ul>
    </nav>
    <div class="bas-menu">
      <a href="../index.html" class="lien-retour-site-admin">← Retour au site</a>
      <button type="button" class="bouton-deconnexion" id="bouton-deconnexion">Se déconnecter</button>
    </div>
  `;
}
