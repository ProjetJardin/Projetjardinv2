// ============================================================
// Authentification
// ============================================================
import { supabase } from './supabase.js';

/**
 * Connecte l'administrateur avec email + mot de passe.
 * Retourne { success: true } ou { success: false, message }.
 */
export async function connexion(email, motDePasse) {
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password: motDePasse,
  });

  if (error) {
    return { success: false, message: traduireErreurAuth(error) };
  }
  return { success: true };
}

/**
 * Déconnecte l'administrateur et le renvoie vers la page de connexion.
 */
export async function deconnexion() {
  await supabase.auth.signOut();
  window.location.href = cheminVersLogin();
}

/**
 * À appeler en haut de CHAQUE page admin (sauf login.html).
 * Si personne n'est connecté, redirige immédiatement vers la
 * page de connexion. Sinon, ne fait rien.
 */
export async function protegerPage() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    window.location.href = cheminVersLogin();
  }
  return session;
}

/**
 * À appeler en haut de login.html : si l'utilisateur est déjà
 * connecté, on le renvoie directement au tableau de bord.
 */
export async function redirigerSiDejaConnecte() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    window.location.href = 'index.html';
  }
}

// Calcule le bon chemin relatif vers login.html, qu'on soit sur
// une page à la racine de /admin ou non.
function cheminVersLogin() {
  return 'login.html';
}

function traduireErreurAuth(error) {
  if (error.message.includes('Invalid login credentials')) {
    return 'Email ou mot de passe incorrect.';
  }
  return "Une erreur est survenue lors de la connexion. Réessaie dans un instant.";
}
