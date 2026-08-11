// ============================================================
// Connexion à Supabase
// ============================================================
// Ce fichier est le SEUL endroit où les identifiants Supabase
// apparaissent. Il est importé par tous les autres fichiers JS
// qui ont besoin de parler à la base de données.
//
// IMPORTANT :
// - SUPABASE_URL et SUPABASE_ANON_KEY sont des valeurs PUBLIQUES,
//   prévues pour être visibles dans le navigateur.
// - Ne mets JAMAIS la "service_role key" ici ou ailleurs dans ce
//   projet : elle donnerait un accès total sans aucune protection.
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// TODO : remplace ces deux valeurs par celles de ton projet
// (Supabase > Project Settings > API)
const SUPABASE_URL = 'https://tmepwfiepvnafycdljie.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Ne6TCHNkyoBei6yvCcqvjA_yXtt_S9L';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
