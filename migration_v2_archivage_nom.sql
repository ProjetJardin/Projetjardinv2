-- ============================================================
-- MIGRATION v2 — Archivage client + nom de document
-- Additive uniquement : ne supprime rien, ne touche aucune donnée existante.
-- À coller dans Supabase > SQL Editor > Run.
-- ============================================================

-- Un client "archivé" n'apparaît plus dans la liste par défaut,
-- mais n'est jamais supprimé physiquement s'il a des documents liés.
alter table public.clients
  add column if not exists archive boolean not null default false;

create index if not exists idx_clients_archive on public.clients (archive);

-- Nom libre et facultatif du devis/facture (indépendant du numéro officiel),
-- pour faciliter la recherche dans la liste des documents.
alter table public.documents
  add column if not exists nom text;

-- Rien d'autre ne change : les policies RLS existantes s'appliquent
-- automatiquement à ces nouvelles colonnes, aucune policy supplémentaire
-- n'est nécessaire.
