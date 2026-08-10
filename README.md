# Projet Jardin — Site premium + espace administration

Application de gestion pour entreprise de paysagisme haut de gamme : site
public premium + espace admin (clients, devis, factures, PDF), en HTML/CSS/JS
vanilla, avec Supabase comme base de données et système d'authentification.
Compatible GitHub Pages (aucun serveur Node.js nécessaire en production).

## Structure

```
/
├── index.html, services.html, realisations.html, apropos.html,
│   contact.html, merci.html          → site public premium
├── admin/
│   ├── login.html            → connexion admin (+ retour au site)
│   ├── index.html            → tableau de bord enrichi
│   ├── clients.html          → gestion des clients (+ archivage)
│   ├── documents.html        → liste des devis/factures (+ devis non facturés)
│   ├── document-form.html    → création / modification / consultation
│   └── settings.html         → paramètres de l'entreprise
├── css/
│   ├── style.css             → site public (noir / anthracite / vert profond)
│   └── admin.css             → espace admin (même identité, tableaux → cartes sur mobile)
├── js/                       → (inchangé dans sa structure, logique enrichie)
├── assets/
│   ├── logo.png
│   ├── hero-pergola.jpg, about-jardin-contemporain.jpg
│   └── realisations/         → photos de la galerie
├── schema_supabase.sql              → script de création initial (déjà exécuté)
└── migration_v2_archivage_nom.sql   → migration additive (à exécuter une fois)
```

## Ce qui a changé dans cette refonte (v2)

- **Identité visuelle** : palette noir / anthracite / vert profond, navigation
  glassmorphism, animations au scroll (respecte `prefers-reduced-motion`),
  menu mobile plein écran.
- **Nouvelle page** `apropos.html`, et `merci.html` après envoi du formulaire.
- **Avis clients** sur l'accueil : 6 avis de démonstration, clairement
  indiqués comme tels dans le code (commentaire juste au-dessus de la
  section `#avis` dans `index.html`) — à remplacer par de vrais avis dès
  qu'ils seront disponibles.
- **Archivage des clients** : un client sans document lié peut être
  supprimé pour de bon ; un client avec des devis/factures est **archivé**
  (colonne `clients.archive`), jamais supprimé physiquement — ses documents
  restent intacts. Filtre "Afficher les clients archivés" dans `clients.html`.
- **Nom de document** (colonne `documents.nom`) : facultatif, affiché dans
  la liste, indépendant du numéro officiel.
- **Suppression des brouillons** : possible uniquement si `statut = brouillon`.
- **Devis non facturés** : filtre dédié dans `documents.html` (devis
  `accepte` sans facture liée), avec indicateur d'ancienneté.
- **Client créé à la volée** depuis le formulaire de devis/facture, avec
  toutes ses coordonnées (adresse, téléphone, email).
- **Tableau de bord enrichi** : clients actifs, devis en attente, devis non
  facturés, factures impayées, chiffre d'affaires facturé, reste à encaisser.
- **Responsive admin** : les tableaux se transforment en cartes empilées sur
  mobile (classe `.tableau-responsive`, attributs `data-label` sur chaque
  cellule).
- **SEO** : meta descriptions, Open Graph, hiérarchie de titres et textes
  alternatifs sur toutes les pages publiques.

## Configuration requise avant utilisation

1. Si ce n'est pas déjà fait : exécute `schema_supabase.sql` puis
   `migration_v2_archivage_nom.sql` dans Supabase > SQL Editor (dans cet
   ordre). La migration v2 est additive : elle n'efface aucune donnée.
2. Ouvre `js/supabase.js` et renseigne `SUPABASE_URL` et `SUPABASE_ANON_KEY`
   (Supabase > Project Settings > API) si ce n'est pas déjà fait.
3. Vérifie que ton compte admin existe dans Supabase (Authentication > Users).

## Déploiement sur GitHub Pages

Identique à la version précédente : pousse le contenu de ce dossier à la
racine du dépôt GitHub, puis active GitHub Pages (Settings > Pages, branche
`main`, dossier `/root`).

## Sécurité

- La seule clé Supabase présente dans le code est la clé publique (`anon key`).
- Toute la protection des données repose sur les règles RLS (inchangées par
  cette migration), pas sur le fait de cacher l'interface `/admin`.
- Ne jamais coller la `service_role key` de Supabase dans ce projet.

## Limites connues

- Le formulaire de contact envoie un email via un lien `mailto:` puis
  redirige vers `merci.html` (aucun backend prévu pour un envoi silencieux).
- L'historique des modifications (table `historique_modifications`) existe
  mais n'est pas encore rempli automatiquement — l'architecture est prête
  pour un futur trigger SQL.
- Le logo utilisé dans les PDF est lu directement depuis `assets/logo.png`.
