// ============================================================
// Génération des PDF (devis / factures) — 100% côté navigateur
// ============================================================
// Contrairement à la version précédente (tout dessiné en code), le PDF
// généré utilise maintenant TON fichier Canva (assets/gabarit-document.pdf)
// comme fond, sur chaque page. On ne fait qu'écrire les données par-dessus,
// aux coordonnées exactes relevées sur tes modèles remplis. Le rendu est
// donc fidèle à ton design (logo, courbes, couleurs, pastilles) au pixel
// près pour tout ce qui est fixe.
//
// Rien n'est stocké côté serveur : tout est reconstruit à la demande à
// partir des données Supabase.
// ============================================================
import { supabase } from './supabase.js';
import { PDFDocument, StandardFonts, rgb } from 'https://esm.sh/pdf-lib@1.17.1';

const VERT_TEXTE = rgb(0.514, 0.627, 0.314); // #83A050 — couleur des libellés/titres du gabarit
const ENCRE = rgb(0.106, 0.129, 0.114);      // texte courant
const BLANC = rgb(1, 1, 1);

const LARGEUR_PAGE = 595.5;
const HAUTEUR_PAGE = 842.25;

// Coordonnées relevées précisément sur les deux gabarits (voir l'analyse
// pdfplumber). Toutes en points PDF, origine en bas à gauche.
// La partie haute (logo, "À l'attention de", "Projet Jardin", "date :",
// en-tête du tableau) est identique sur les deux gabarits.
const X_GAUCHE = 15.5;
const X_DROITE_BLOC = 318;
const X_TITRE_DROITE = 568; // bord droit du titre "Devis n° / Facture n°"
const X_DESC = 70;
const X_UNITES_DROITE = 539; // bord droit de la valeur "quantité + unité"
const Y_TITRE = 797;
const Y_NOM_DOCUMENT = 778;
const Y_ENTREPRISE_ADRESSE = 628.5;
const Y_ENTREPRISE_SIRET = 610.5;
const Y_ENTREPRISE_TEL = 592.5;
const Y_ENTREPRISE_EMAIL = 574.5;
const Y_CLIENT_NOM = 644.75;
const Y_CLIENT_ADRESSE = 626.75;
const Y_CLIENT_VILLE = 608.75;
const X_DATE_VALEUR = 488;
const Y_DATE = 527;
const Y_PREMIERE_LIGNE = 449;
const HAUTEUR_LIGNE = 34;

// La partie basse (totaux, mode de règlement) diffère selon le gabarit :
// celui avec TVA prévoit des lignes Total H.T / TVA dédiées, ce qui pousse
// tout le reste plus haut et laisse moins de place pour les lignes du tableau.
const GABARIT_SANS_TVA = {
  fichier: '../assets/gabarit-document.pdf',
  maxLignesParPage: 6,
  yPastilleTtc: 236,           // baseline fixe de "Total TTC :" sur le gabarit
  xValeurTtc: 498,
  yModeReglementValeur: 218,
};
const GABARIT_AVEC_TVA = {
  fichier: '../assets/gabarit-document-tva.pdf',
  maxLignesParPage: 4,
  yTotalHt: 306,                // baseline fixe de "Total H.T :"
  yTva: 283,                    // baseline fixe de "TVA :"
  yPastilleTtc: 261,            // baseline fixe de "Total TTC :"
  xValeurTotaux: 503,          // les 3 libellés se terminent quasiment à la même abscisse
  yModeReglementValeur: 263,
};

/**
 * Point d'entrée : génère et télécharge le PDF du document dont
 * l'id est fourni.
 */
export async function genererPdfDocument(documentId) {
  const [{ data: doc, error: erreurDoc }, { data: prestations, error: erreurPrest }, { data: parametres }] = await Promise.all([
    supabase.from('documents').select('*').eq('id', documentId).single(),
    supabase.from('prestations').select('*').eq('document_id', documentId).order('ordre', { ascending: true }),
    supabase.from('entreprise_parametres').select('*').eq('id', 1).single(),
  ]);
  if (erreurDoc) throw erreurDoc;
  if (erreurPrest) throw erreurPrest;

  const gabarit = doc.afficher_tva ? GABARIT_AVEC_TVA : GABARIT_SANS_TVA;

  const pdfDoc = await PDFDocument.create();
  const police = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const policeGrasse = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const octetsGabarit = await fetch(gabarit.fichier).then(r => r.arrayBuffer());
  const [pageGabarit] = await pdfDoc.embedPdf(octetsGabarit);

  const p = parametres || {};
  const lignesPrestations = construireLignes(doc, prestations || []);

  const pagesDeLignes = decouperEnPages(lignesPrestations, gabarit.maxLignesParPage);
  const nombrePages = Math.max(pagesDeLignes.length, 1);

  for (let i = 0; i < nombrePages; i++) {
    const page = pdfDoc.addPage([LARGEUR_PAGE, HAUTEUR_PAGE]);
    page.drawPage(pageGabarit, { x: 0, y: 0, width: LARGEUR_PAGE, height: HAUTEUR_PAGE });

    const estPremierePage = i === 0;
    const estDernierePage = i === nombrePages - 1;

    if (estPremierePage) {
      dessinerEnTete(page, doc, p, police, policeGrasse);
    }

    dessinerLignes(page, pagesDeLignes[i] || [], police, policeGrasse);

    if (estDernierePage) {
      dessinerTotauxEtPied(page, doc, p, police, policeGrasse, gabarit);
    }
  }

  const octets = await pdfDoc.save();
  telechargerFichier(octets, `${doc.type}-${doc.numero}.pdf`);
}

// Construit la liste des lignes à afficher : le chantier (s'il existe) en
// premier, puis chaque prestation sous la forme "description" + "quantité unité".
function construireLignes(doc, prestations) {
  const lignes = [];
  if (doc.chantier_nom) {
    lignes.push({ description: `Chantier : ${doc.chantier_nom}`, valeur: '', gras: true });
  }
  prestations.forEach((p) => {
    const valeur = [p.quantite, p.unite].filter(Boolean).join(' ').trim();
    lignes.push({ description: p.description || '', valeur, gras: false });
  });
  if (lignes.length === 0) {
    lignes.push({ description: 'Aucune prestation ajoutée.', valeur: '', gras: false });
  }
  return lignes;
}

function decouperEnPages(lignes, maxParPage) {
  const pages = [];
  for (let i = 0; i < lignes.length; i += maxParPage) {
    pages.push(lignes.slice(i, i + maxParPage));
  }
  return pages;
}

function dessinerEnTete(page, doc, p, police, policeGrasse) {
  // Titre "Devis n° : XXX" / "Facture n° : XXX"
  // On garde "Devis n° :" mais on retire le préfixe DEVIS-/FACT- du numéro
  // affiché (déjà indiqué par le mot "Devis"/"Facture" juste avant), pour
  // une phrase plus courte : "Devis n° : 2026-0001" plutôt que
  // "Devis n° : DEVIS-2026-0001".
  const numeroAffiche = doc.numero.replace(/^(DEVIS|FACT)-/i, '');
  const titre = `${doc.type === 'devis' ? 'Devis' : 'Facture'} n° : ${numeroAffiche}`;
  const tailleTitre = 26;
  const largeurTitre = policeGrasse.widthOfTextAtSize(titre, tailleTitre);
  page.drawText(titre, { x: X_TITRE_DROITE - largeurTitre, y: Y_TITRE, size: tailleTitre, font: policeGrasse, color: VERT_TEXTE });

  if (doc.nom) {
    const largeurNom = police.widthOfTextAtSize(doc.nom, 10);
    page.drawText(doc.nom, { x: X_TITRE_DROITE - largeurNom, y: Y_NOM_DOCUMENT, size: 10, font: police, color: ENCRE });
  }

  // Coordonnées de l'entreprise (le nom "Projet Jardin" et le logo sont déjà
  // imprimés dans le gabarit — on ne redessine que le reste)
  page.drawText([p.adresse, p.code_postal, p.ville].filter(Boolean).join(' '), { x: X_GAUCHE, y: Y_ENTREPRISE_ADRESSE, size: 9.5, font: police, color: ENCRE });
  if (p.siret) page.drawText(`Siret : ${p.siret}`, { x: X_GAUCHE, y: Y_ENTREPRISE_SIRET, size: 9.5, font: police, color: ENCRE });
  if (p.telephone) page.drawText(`Numéro : ${p.telephone}`, { x: X_GAUCHE, y: Y_ENTREPRISE_TEL, size: 9.5, font: police, color: ENCRE });
  if (p.email) page.drawText(p.email, { x: X_GAUCHE, y: Y_ENTREPRISE_EMAIL, size: 9.5, font: police, color: ENCRE });

  // Coordonnées du client
  const nomClient = doc.client_entreprise || `${doc.client_prenom || ''} ${doc.client_nom || ''}`.trim() || '—';
  page.drawText(nomClient, { x: X_DROITE_BLOC, y: Y_CLIENT_NOM, size: 11, font: policeGrasse, color: ENCRE });
  if (doc.client_adresse) page.drawText(doc.client_adresse, { x: X_DROITE_BLOC, y: Y_CLIENT_ADRESSE, size: 9.5, font: police, color: ENCRE });
  const villeClient = [doc.client_code_postal, doc.client_ville].filter(Boolean).join(' ');
  if (villeClient) page.drawText(villeClient, { x: X_DROITE_BLOC, y: Y_CLIENT_VILLE, size: 9.5, font: police, color: ENCRE });

  // Date
  const dateAffichee = new Date(doc.date + 'T00:00:00').toLocaleDateString('fr-FR');
  page.drawText(dateAffichee, { x: X_DATE_VALEUR, y: Y_DATE, size: 10, font: police, color: ENCRE });
}

function dessinerLignes(page, lignes, police, policeGrasse) {
  let y = Y_PREMIERE_LIGNE;
  lignes.forEach((ligne) => {
    const largeurMaxDescription = X_UNITES_DROITE - 90 - X_DESC;
    const texteDescription = tronquerTexte(ligne.description, ligne.gras ? policeGrasse : police, 9.5, largeurMaxDescription);
    page.drawText(texteDescription, { x: X_DESC, y, size: 9.5, font: ligne.gras ? policeGrasse : police, color: ENCRE });

    if (ligne.valeur) {
      const largeurValeur = police.widthOfTextAtSize(ligne.valeur, 9.5);
      page.drawText(ligne.valeur, { x: X_UNITES_DROITE - largeurValeur, y, size: 9.5, font: police, color: ENCRE });
    }
    y -= HAUTEUR_LIGNE;
  });
}

function dessinerTotauxEtPied(page, doc, p, police, policeGrasse, gabarit) {
  if (doc.afficher_tva) {
    // Gabarit avec cases HT/TVA dédiées : chaque libellé se termine quasiment
    // à la même abscisse, donc les 3 valeurs s'alignent en colonne, juste après.
    page.drawText(formaterNombre(doc.total_ht) + ' €', { x: gabarit.xValeurTotaux, y: gabarit.yTotalHt, size: 10, font: policeGrasse, color: ENCRE });
    page.drawText(formaterNombre(doc.total_tva) + ' €', { x: gabarit.xValeurTotaux, y: gabarit.yTva, size: 10, font: policeGrasse, color: ENCRE });
    page.drawText(`${formaterNombre(doc.total_ttc)} €`, { x: gabarit.xValeurTotaux, y: gabarit.yPastilleTtc, size: 11, font: policeGrasse, color: BLANC });
  } else {
    // Gabarit simple : la pastille "Total TTC :" est déjà imprimée dans le
    // gabarit, on écrit juste la valeur à côté.
    page.drawText(`${formaterNombre(doc.total_ttc)} €`, { x: gabarit.xValeurTtc, y: gabarit.yPastilleTtc, size: 11, font: policeGrasse, color: BLANC });
  }

  // "Mode de règlement :" est déjà imprimé dans le gabarit
  const yValeur = gabarit.yModeReglementValeur;
  if (doc.mode_paiement) {
    page.drawText(doc.mode_paiement, { x: X_GAUCHE, y: yValeur, size: 9.5, font: police, color: ENCRE });
  }
  if (doc.conditions_paiement) {
    page.drawText(tronquerTexte(doc.conditions_paiement, police, 8.5, 250), { x: X_GAUCHE, y: yValeur - 16, size: 8.5, font: police, color: ENCRE });
  }
  if (doc.notes) {
    page.drawText('Notes :', { x: X_GAUCHE, y: yValeur - 36, size: 8.5, font: policeGrasse, color: VERT_TEXTE });
    page.drawText(tronquerTexte(doc.notes, police, 8, 300), { x: X_GAUCHE, y: yValeur - 50, size: 8, font: police, color: ENCRE });
  }

  if (p.texte_legal || p.pied_de_page) {
    let yBas = 40;
    [p.texte_legal, p.pied_de_page].filter(Boolean).forEach((texte) => {
      page.drawText(tronquerTexte(texte, police, 7, 500), { x: X_GAUCHE, y: yBas, size: 7, font: police, color: rgb(0.4, 0.42, 0.36) });
      yBas -= 10;
    });
  }
  // La mention "Signature suivie de la mention bon pour accord" est déjà
  // imprimée dans le gabarit — rien à ajouter.
}

function formaterNombre(valeur) {
  // toLocaleString('fr-FR') insère un espace fine insécable (U+202F) comme
  // séparateur de milliers, un caractère que la police du PDF (WinAnsi) ne
  // sait pas encoder — d'où l'échec sur tout montant ≥ 1000. On le remplace
  // par un espace normal, parfaitement lisible et sans risque.
  return Number(valeur || 0)
    .toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .replace(/[\u202f\u00a0]/g, ' ');
}

function tronquerTexte(texte, police, taille, largeurMax) {
  texte = String(texte || '');
  while (police.widthOfTextAtSize(texte, taille) > largeurMax && texte.length > 1) {
    texte = texte.slice(0, -2) + '…';
  }
  return texte;
}

function telechargerFichier(octets, nomFichier) {
  const blob = new Blob([octets], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const lien = document.createElement('a');
  lien.href = url;
  lien.download = nomFichier;
  document.body.appendChild(lien);
  lien.click();
  lien.remove();
  URL.revokeObjectURL(url);
}
