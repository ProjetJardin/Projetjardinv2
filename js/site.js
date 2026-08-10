// ============================================================
// Script du site public premium
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  initialiserNavAuScroll();
  initialiserMenuMobile();
  initialiserRevelationAuScroll();
  initialiserFormulaireContact();
});

// --- Barre de navigation qui se fonce légèrement au scroll ---
function initialiserNavAuScroll() {
  const entete = document.querySelector('.entete');
  if (!entete) return;
  const bascule = () => entete.classList.toggle('scrolled', window.scrollY > 40);
  bascule();
  window.addEventListener('scroll', bascule, { passive: true });
}

// --- Menu mobile plein écran ---
function initialiserMenuMobile() {
  const bouton = document.querySelector('.bouton-menu-mobile');
  const fond = document.querySelector('.menu-mobile-fond');
  if (!bouton || !fond) return;

  const ouvrir = () => {
    fond.classList.add('ouvert');
    bouton.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
  };
  const fermer = () => {
    fond.classList.remove('ouvert');
    bouton.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  };

  bouton.addEventListener('click', () => {
    fond.classList.contains('ouvert') ? fermer() : ouvrir();
  });
  fond.querySelectorAll('a').forEach(a => a.addEventListener('click', fermer));
  fond.addEventListener('click', (e) => { if (e.target === fond) fermer(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fermer(); });
}

// --- Apparition progressive des éléments au scroll ---
function initialiserRevelationAuScroll() {
  const elements = document.querySelectorAll('.reveal');
  if (elements.length === 0) return;

  if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    elements.forEach(el => el.classList.add('visible'));
    return;
  }

  const observateur = new IntersectionObserver((entrees) => {
    entrees.forEach((entree) => {
      if (entree.isIntersecting) {
        entree.target.classList.add('visible');
        observateur.unobserve(entree.target);
      }
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -60px 0px' });

  elements.forEach(el => observateur.observe(el));
}

// --- Formulaire de contact : validation + états + redirection vers merci.html ---
function initialiserFormulaireContact() {
  const formulaire = document.querySelector('#formulaire-contact');
  if (!formulaire) return;

  const etat = document.querySelector('#etat-formulaire');
  const boutonEnvoi = document.querySelector('#bouton-envoi');

  formulaire.addEventListener('submit', (e) => {
    e.preventDefault();

    const champsObligatoires = formulaire.querySelectorAll('[required]');
    let formulaireValide = true;

    champsObligatoires.forEach((champ) => {
      const conteneurChamp = champ.closest('.champ-verre');
      const messageErreur = conteneurChamp?.querySelector('.message-erreur-champ');
      const estVide = !champ.value.trim();
      const emailInvalide = champ.type === 'email' && champ.value && !champ.value.includes('@');

      if (estVide || emailInvalide) {
        formulaireValide = false;
        conteneurChamp?.classList.add('invalide');
        if (messageErreur) messageErreur.textContent = estVide ? 'Ce champ est obligatoire.' : 'Adresse email invalide.';
      } else {
        conteneurChamp?.classList.remove('invalide');
        if (messageErreur) messageErreur.textContent = '';
      }
    });

    if (!formulaireValide) {
      afficherEtatFormulaire('erreur', 'Merci de corriger les champs signalés ci-dessus.');
      return;
    }

    // Pas de backend dans ce projet : on ouvre le client mail avec le
    // message pré-rempli, puis on emmène la personne vers la page de
    // remerciement. (Pour un envoi silencieux, il faudrait un service
    // tiers type Formspree ou une fonction serveur — hors périmètre ici.)
    const donnees = Object.fromEntries(new FormData(formulaire).entries());
    const sujet = encodeURIComponent(`Demande de devis — ${donnees.prenom || ''} ${donnees.nom || ''}`.trim());
    const corps = encodeURIComponent(
      `Nom : ${donnees.nom || ''}\nPrénom : ${donnees.prenom || ''}\nEmail : ${donnees.email || ''}\nTéléphone : ${donnees.telephone || ''}\nVille : ${donnees.ville || ''}\nType de projet : ${donnees.typeProjet || ''}\n\n${donnees.message || ''}`
    );

    boutonEnvoi.dataset.chargement = 'true';
    boutonEnvoi.textContent = 'Envoi en cours…';
    afficherEtatFormulaire('envoi', 'Ouverture de votre messagerie…');

    window.location.href = `mailto:contact@projet-jardin.fr?subject=${sujet}&body=${corps}`;

    setTimeout(() => {
      window.location.href = 'merci.html';
    }, 900);
  });

  function afficherEtatFormulaire(type, message) {
    if (!etat) return;
    etat.textContent = message;
    etat.className = `etat-formulaire visible ${type}`;
  }
}
