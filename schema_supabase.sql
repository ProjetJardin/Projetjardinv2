-- ============================================================
-- SCHÉMA BASE DE DONNÉES — Application de gestion Projet Jardin
-- À exécuter dans Supabase > SQL Editor
-- ============================================================

-- Extension nécessaire pour générer des identifiants uuid aléatoires
create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- Fonction utilitaire : met à jour automatiquement le champ
-- "updated_at" à chaque modification d'une ligne
-- ------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;


-- ============================================================
-- TABLE : clients
-- ============================================================
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  nom text,
  prenom text,
  entreprise text,
  adresse text,
  complement_adresse text,
  code_postal text,
  ville text,
  telephone text,
  email text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- un client doit avoir au moins un nom OU une raison sociale
  constraint clients_nom_ou_entreprise check (nom is not null or entreprise is not null)
);

create index idx_clients_nom on public.clients (nom);
create index idx_clients_entreprise on public.clients (entreprise);
create index idx_clients_email on public.clients (email);

create trigger trg_clients_updated_at
before update on public.clients
for each row execute function public.set_updated_at();


-- ============================================================
-- TABLE : documents (devis + factures)
-- ============================================================
create table public.documents (
  id uuid primary key default gen_random_uuid(),  -- ne change JAMAIS
  type text not null check (type in ('devis','facture')),
  numero text not null,
  date date not null default current_date,

  -- lien vers le client (peut devenir NULL si le client est supprimé,
  -- mais les infos ci-dessous restent affichées sur le document)
  client_id uuid references public.clients(id) on delete set null,
  client_nom text,
  client_prenom text,
  client_entreprise text,
  client_adresse text,
  client_code_postal text,
  client_ville text,
  client_telephone text,
  client_email text,

  -- chantier (lieu du projet), distinct du client
  chantier_nom text,
  chantier_adresse text,

  statut text not null default 'brouillon',

  -- la TVA peut être affichée ou non selon les paramètres au moment
  -- de la création (figé, ne change pas si le paramètre global change ensuite)
  afficher_tva boolean not null default true,

  total_ht numeric(10,2) not null default 0,
  total_tva numeric(10,2) not null default 0,
  total_ttc numeric(10,2) not null default 0,

  mode_paiement text,
  conditions_paiement text,
  notes text,

  -- si cette facture a été créée à partir d'un devis, on garde le lien
  document_origine_id uuid references public.documents(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- empêche deux devis (ou deux factures) d'avoir le même numéro
  constraint documents_numero_unique_par_type unique (type, numero)
);

create index idx_documents_client_id on public.documents (client_id);
create index idx_documents_numero on public.documents (numero);
create index idx_documents_type_date on public.documents (type, date);
create index idx_documents_statut on public.documents (statut);

create trigger trg_documents_updated_at
before update on public.documents
for each row execute function public.set_updated_at();


-- ============================================================
-- TABLE : prestations (lignes d'un devis ou d'une facture)
-- ============================================================
create table public.prestations (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  description text not null,
  quantite numeric(10,2) not null default 1,
  unite text,                          -- ex : jour, m², forfait, unité
  prix_unitaire_ht numeric(10,2) not null default 0,
  taux_tva numeric(5,2) not null default 0,  -- ignoré si documents.afficher_tva = false
  -- calculé automatiquement par PostgreSQL, jamais saisi à la main
  total_ht numeric(10,2) generated always as (quantite * prix_unitaire_ht) stored,
  ordre integer not null default 0
);

create index idx_prestations_document_id on public.prestations (document_id);
create index idx_prestations_ordre on public.prestations (document_id, ordre);


-- ============================================================
-- TABLE : entreprise_parametres (une seule ligne, id = 1)
-- ============================================================
create table public.entreprise_parametres (
  id integer primary key default 1 check (id = 1),
  nom_entreprise text,
  nom_responsable text,
  adresse text,
  code_postal text,
  ville text,
  telephone text,
  email text,
  siret text,
  numero_tva text,
  logo_url text,                 -- ex : "assets/logo.png" (fichier statique du dépôt)
  iban text,
  bic text,
  conditions_paiement_defaut text,
  texte_legal text,
  pied_de_page text,
  afficher_tva_par_defaut boolean not null default true,
  updated_at timestamptz not null default now()
);

create trigger trg_parametres_updated_at
before update on public.entreprise_parametres
for each row execute function public.set_updated_at();

-- On crée tout de suite la ligne unique (vide), l'admin la remplira
-- depuis l'interface plus tard. Comme ça le code n'a jamais besoin
-- de faire un "insert", uniquement des "update".
insert into public.entreprise_parametres (id) values (1)
on conflict (id) do nothing;


-- ============================================================
-- TABLE : historique_modifications
-- ============================================================
create table public.historique_modifications (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references public.documents(id) on delete cascade,
  utilisateur_id uuid,             -- correspond à auth.uid()
  date_modification timestamptz not null default now(),
  type_modification text not null, -- creation / modification / changement_statut / changement_numero / suppression
  ancienne_valeur jsonb,
  nouvelle_valeur jsonb
);

create index idx_historique_document_id on public.historique_modifications (document_id);


-- ============================================================
-- SÉCURITÉ : activation de la Row Level Security (RLS)
-- ============================================================
-- Dès qu'on active RLS sans créer de policy, PERSONNE ne peut
-- accéder à la table — c'est le comportement le plus sûr par défaut.
alter table public.clients enable row level security;
alter table public.documents enable row level security;
alter table public.prestations enable row level security;
alter table public.entreprise_parametres enable row level security;
alter table public.historique_modifications enable row level security;

-- ------------------------------------------------------------
-- Policies : seul un utilisateur connecté (authenticated) peut
-- lire/écrire. Un visiteur non connecté (anon) n'a AUCUN accès,
-- ce qui protège les données même si quelqu'un contourne l'interface.
-- ------------------------------------------------------------

create policy "Admin full access clients"
on public.clients for all
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');

create policy "Admin full access documents"
on public.documents for all
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');

create policy "Admin full access prestations"
on public.prestations for all
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');

create policy "Admin full access parametres"
on public.entreprise_parametres for all
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');

create policy "Admin full access historique"
on public.historique_modifications for all
using (auth.role() = 'authenticated')
with check (auth.role() = 'authenticated');

-- ============================================================
-- FIN DU SCRIPT
-- ============================================================
