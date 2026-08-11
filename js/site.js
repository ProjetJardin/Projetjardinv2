// ============================================================
// Script du site public premium
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  initialiserNavAuScroll();
  initialiserMenuMobile();
  initialiserRevelationAuScroll();
  initialiserCompteursAnimes();
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

// --- Chiffres animés (0 → valeur finale) au moment où ils entrent dans l'écran ---
function initialiserCompteursAnimes() {
  const compteurs = document.querySelectorAll('[data-compteur]');
  if (compteurs.length === 0) return;

  const reduireMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const animerCompteur = (element) => {
    const cible = parseInt(element.dataset.compteur, 10) || 0;
    const suffixe = element.dataset.suffixe || '';

    if (reduireMotion) {
      element.textContent = cible + suffixe;
      return;
    }

    const duree = 1800; // ms
    const debut = performance.now();

    const etape = (maintenant) => {
      const progres = Math.min((maintenant - debut) / duree, 1);
      // Easing "ease-out" pour un ralentissement doux en fin de course
      const progresAdouci = 1 - Math.pow(1 - progres, 3);
      const valeurActuelle = Math.round(cible * progresAdouci);
      element.textContent = valeurActuelle + suffixe;
      if (progres < 1) requestAnimationFrame(etape);
    };
    requestAnimationFrame(etape);
  };

  if (!('IntersectionObserver' in window)) {
    compteurs.forEach(animerCompteur);
    return;
  }

  const observateur = new IntersectionObserver((entrees) => {
    entrees.forEach((entree) => {
      if (entree.isIntersecting) {
        animerCompteur(entree.target);
        observateur.unobserve(entree.target);
      }
    });
  }, { threshold: 0.4 });

  compteurs.forEach(el => observateur.observe(el));
}

// --- Formulaire de contact : validation + états + redirection vers merci.html ---
function initialiserFormulaireContact() {
  const formulaire = document.querySelector('#formulaire-contact');
  if (!formulaire) return;

  const etat = document.querySelector('#etat-formulaire');
  const boutonEnvoi = document.querySelector('#bouton-envoi');

  formulaire.addEventListener('submit', async (e) => {
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

    boutonEnvoi.dataset.chargement = 'true';
    boutonEnvoi.textContent = 'Envoi en cours…';
    afficherEtatFormulaire('envoi', 'Envoi de votre message…');

    try {
      const reponse = await fetch('https://formspree.io/f/xaewobdj', {
        method: 'POST',
        headers: { Accept: 'application/json' },
        body: new FormData(formulaire),
      });

      if (!reponse.ok) throw new Error('Réponse Formspree non valide');

      window.location.href = 'merci.html';
    } catch (err) {
      console.error(err);
      afficherEtatFormulaire('erreur', "L'envoi a échoué. Réessaie, ou contacte-nous directement par téléphone ou par email.");
      boutonEnvoi.dataset.chargement = 'false';
      boutonEnvoi.textContent = 'Envoyer la demande';
    }
  });

  function afficherEtatFormulaire(type, message) {
    if (!etat) return;
    etat.textContent = message;
    etat.className = `etat-formulaire visible ${type}`;
  }
}
