// ============================================================
// Numérotation automatique des devis et factures
// ============================================================
import { supabase } from './supabase.js';

function prefixe(type) {
  return type === 'devis' ? 'DEVIS' : 'FACT';
}

/**
 * Propose le prochain numéro disponible pour un type de document,
 * au format PREFIXE-ANNEE-0001, en se basant sur l'année en cours.
 */
export async function proposerNumero(type) {
  const annee = new Date().getFullYear();
  const base = `${prefixe(type)}-${annee}-`;

  const { data, error } = await supabase
    .from('documents')
    .select('numero')
    .eq('type', type)
    .ilike('numero', `${base}%`);

  if (error) throw error;

  let maxTrouve = 0;
  (data || []).forEach((doc) => {
    const correspondance = doc.numero.match(/(\d+)$/);
    if (correspondance) {
      maxTrouve = Math.max(maxTrouve, parseInt(correspondance[1], 10));
    }
  });

  const suivant = String(maxTrouve + 1).padStart(4, '0');
  return `${base}${suivant}`;
}

/**
 * Vérifie qu'un numéro n'est pas déjà utilisé par un AUTRE document
 * du même type. idDocumentActuel permet d'exclure le document en
 * cours de modification de la vérification.
 */
export async function numeroEstDisponible(type, numero, idDocumentActuel = null) {
  const { data, error } = await supabase
    .from('documents')
    .select('id')
    .eq('type', type)
    .eq('numero', numero);

  if (error) throw error;
  if (!data || data.length === 0) return true;
  if (idDocumentActuel) {
    return data.every((doc) => doc.id === idDocumentActuel);
  }
  return false;
}
