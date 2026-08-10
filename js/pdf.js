// ============================================================
// Génération des PDF (devis / factures) — 100% côté navigateur
// ============================================================
// Rien n'est stocké côté serveur : on récupère les données du
// doc et des prestations dans Supabase, et on construit le
// PDF à la volée avec pdf-lib. Le style reprend le modèle fourni :
// bandeau végétal en haut à droite / bas à gauche, logo, titre
// "Devis n° / Facture n°", tableau des prestations, total en
// pastille verte, mode de paiement, zone de signature.
// ============================================================
import { supabase } from './supabase.js';
import { PDFDocument, StandardFonts, rgb } from 'https://esm.sh/pdf-lib@1.17.1';

// Couleurs échantillonnées directement sur le modèle Canva fourni
const VERT_FONCE = rgb(0.224, 0.502, 0.141);   // #398024 — vague foncée (haut/bas de page)
const VERT_MOUSSE = rgb(0.514, 0.627, 0.314);  // #83A050 — pastilles (entête, lignes, total)
const VERT_VAGUE_CLAIRE = rgb(0.569, 0.710, 0.247); // #91B53F — vague claire
const GRIS_CLAIR = rgb(0.961, 0.953, 0.933);   // lignes alternées du tableau
const BLANC = rgb(1, 1, 1);
const ENCRE = rgb(0.106, 0.129, 0.114);        // #1B211D (anthracite)

const MARGE = 48;
const LARGEUR_PAGE = 595.28;  // A4 portrait, en points
const HAUTEUR_PAGE = 841.89;

/**
 * Point d'entrée : génère et télécharge le PDF du doc dont
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

  const pdfDoc = await PDFDocument.create();
  const police = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const policeGrasse = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let logoImage = null;
  try {
    // Le logo est un fichier statique du dépôt, servi à côté des pages admin.
    const reponseLogo = await fetch('../assets/logo.png');
    const octetsLogo = await reponseLogo.arrayBuffer();
    logoImage = await pdfDoc.embedPng(octetsLogo);
  } catch {
    logoImage = null; // Pas bloquant : le PDF se génère sans logo si besoin.
  }

  const contexte = {
    pdfDoc, police, policeGrasse, logoImage,
    doc, prestations: prestations || [], parametres: parametres || {},
  };

  let page = nouvellePage(pdfDoc);
  dessinerDecor(page);
  dessinerLogoEtTitre(page, contexte);
  let y = 700;
  y = dessinerCoordonnees(page, contexte, y);
  y = dessinerChantierEtDate(page, contexte, y);

  const resultatTableau = dessinerTableau(page, contexte, y, () => {
    page = nouvellePage(pdfDoc);
    dessinerDecor(page);
    return page;
  });
  page = resultatTableau.page;
  y = resultatTableau.y;

  y = dessinerTotaux(page, contexte, y);
  dessinerPiedDePage(page, contexte, y);

  const octets = await pdfDoc.save();
  telechargerFichier(octets, `${doc.type}-${doc.numero}.pdf`);
}

function nouvellePage(pdfDoc) {
  return pdfDoc.addPage([LARGEUR_PAGE, HAUTEUR_PAGE]);
}

// Bandeaux végétaux décoratifs (approximation du logo, haut-droite / bas-gauche)
function dessinerDecor(page) {
  page.drawEllipse({ x: LARGEUR_PAGE + 40, y: HAUTEUR_PAGE - 10, xScale: 220, yScale: 90, color: VERT_MOUSSE, opacity: 0.9 });
  page.drawEllipse({ x: LARGEUR_PAGE + 90, y: HAUTEUR_PAGE + 20, xScale: 220, yScale: 90, color: VERT_FONCE });
  page.drawEllipse({ x: -60, y: 20, xScale: 260, yScale: 110, color: VERT_VAGUE_CLAIRE, opacity: 0.95 });
  page.drawEllipse({ x: -100, y: -30, xScale: 260, yScale: 110, color: VERT_FONCE });
}

// Dessine une pastille (pilule) parfaitement arrondie aux deux extrémités,
// comme sur le modèle Canva : un rectangle central + deux demi-cercles.
function dessinerPilule(page, x, y, largeur, hauteur, couleur) {
  const rayon = hauteur / 2;
  if (largeur > hauteur) {
    page.drawRectangle({ x: x + rayon, y, width: largeur - 2 * rayon, height: hauteur, color: couleur });
  }
  page.drawEllipse({ x: x + rayon, y: y + rayon, xScale: rayon, yScale: rayon, color: couleur });
  page.drawEllipse({ x: x + largeur - rayon, y: y + rayon, xScale: rayon, yScale: rayon, color: couleur });
}

function dessinerLogoEtTitre(page, { logoImage, doc, police, policeGrasse }) {
  if (logoImage) {
    const dims = logoImage.scale(70 / logoImage.width);
    page.drawImage(logoImage, { x: MARGE, y: HAUTEUR_PAGE - 60 - dims.height, width: dims.width, height: dims.height });
  }

  const titre = `${doc.type === 'devis' ? 'Devis' : 'Facture'} n° : ${doc.numero}`;
  const taille = 26;
  const largeurTexte = policeGrasse.widthOfTextAtSize(titre, taille);
  page.drawText(titre, {
    x: LARGEUR_PAGE - MARGE - largeurTexte, y: HAUTEUR_PAGE - 70,
    size: taille, font: policeGrasse, color: VERT_MOUSSE,
  });
  page.drawLine({
    start: { x: LARGEUR_PAGE - MARGE - largeurTexte, y: HAUTEUR_PAGE - 82 },
    end: { x: LARGEUR_PAGE - MARGE, y: HAUTEUR_PAGE - 82 },
    thickness: 1, color: VERT_MOUSSE,
  });

  if (doc.nom) {
    const taillePetite = 10;
    const largeurNom = police.widthOfTextAtSize(doc.nom, taillePetite);
    page.drawText(doc.nom, {
      x: LARGEUR_PAGE - MARGE - largeurNom, y: HAUTEUR_PAGE - 96,
      size: taillePetite, font: police, color: ENCRE,
    });
  }
}

function dessinerCoordonnees(page, { doc, parametres, police, policeGrasse }, yDepart) {
  let y = yDepart;

  // Colonne gauche : entreprise
  page.drawText(parametres.nom_entreprise || 'Nom de l\'entreprise', { x: MARGE, y, size: 15, font: policeGrasse, color: VERT_MOUSSE });
  y -= 20;
  const lignesEntreprise = [
    [parametres.adresse, parametres.code_postal, parametres.ville].filter(Boolean).join(' '),
    parametres.siret ? `SIRET : ${parametres.siret}` : null,
    parametres.telephone ? `Tél. : ${parametres.telephone}` : null,
    parametres.email || null,
  ].filter(Boolean);
  lignesEntreprise.forEach((ligne) => {
    page.drawText(ligne, { x: MARGE, y, size: 9.5, font: police, color: ENCRE });
    y -= 14;
  });

  // Colonne droite : client
  let yDroite = yDepart;
  const xDroite = LARGEUR_PAGE - MARGE - 220;
  page.drawText("À l'attention de :", { x: xDroite, y: yDroite, size: 12, font: policeGrasse, color: VERT_MOUSSE });
  yDroite -= 18;
  const nomClient = doc.client_entreprise || `${doc.client_prenom || ''} ${doc.client_nom || ''}`.trim() || '—';
  page.drawText(nomClient, { x: xDroite, y: yDroite, size: 10.5, font: policeGrasse, color: ENCRE });
  yDroite -= 14;
  const lignesClient = [
    doc.client_adresse,
    [doc.client_code_postal, doc.client_ville].filter(Boolean).join(' '),
  ].filter(Boolean);
  lignesClient.forEach((ligne) => {
    page.drawText(ligne, { x: xDroite, y: yDroite, size: 9.5, font: police, color: ENCRE });
    yDroite -= 14;
  });

  return Math.min(y, yDroite) - 10;
}

function dessinerChantierEtDate(page, { doc, police, policeGrasse }, yDepart) {
  let y = yDepart;

  const dateAffichee = new Date(doc.date + 'T00:00:00').toLocaleDateString('fr-FR');
  const texteDate = `date : ${dateAffichee}`;
  const largeur = policeGrasse.widthOfTextAtSize('date : ', 10) + police.widthOfTextAtSize(dateAffichee, 10);
  page.drawText('date : ', { x: LARGEUR_PAGE - MARGE - largeur, y, size: 10, font: policeGrasse, color: ENCRE });
  page.drawText(dateAffichee, { x: LARGEUR_PAGE - MARGE - largeur + policeGrasse.widthOfTextAtSize('date : ', 10), y, size: 10, font: police, color: ENCRE });

  if (doc.chantier_nom) {
    page.drawText(`Chantier : ${doc.chantier_nom}`, { x: MARGE, y, size: 11, font: policeGrasse, color: ENCRE });
    y -= 16;
  }
  if (doc.chantier_adresse) {
    page.drawText(doc.chantier_adresse, { x: MARGE, y, size: 9.5, font: police, color: ENCRE });
    y -= 16;
  }

  return y - 20;
}

// Colonnes du tableau, avec ou sans TVA selon le doc
function colonnesTableau(afficherTva) {
  const base = [
    { cle: 'description', titre: 'Descriptif', largeur: afficherTva ? 200 : 240 },
    { cle: 'quantite', titre: 'Qté', largeur: 45 },
    { cle: 'unite', titre: 'Unité', largeur: 55 },
    { cle: 'prix_unitaire_ht', titre: 'Prix unit. HT', largeur: 75 },
  ];
  if (afficherTva) base.push({ cle: 'taux_tva', titre: 'TVA', largeur: 40 });
  base.push({ cle: 'total_ht', titre: 'Total HT', largeur: 75 });
  return base;
}

function dessinerTableau(page, contexte, yDepart, creerNouvellePage) {
  const { doc, prestations, police, policeGrasse } = contexte;
  const colonnes = colonnesTableau(doc.afficher_tva);
  const largeurTableau = LARGEUR_PAGE - 2 * MARGE;
  const hauteurLigne = 26;
  const hauteurEntete = 28;
  let y = yDepart;

  function dessinerEntete() {
    dessinerPilule(page, MARGE, y - hauteurEntete, largeurTableau, hauteurEntete, VERT_MOUSSE);
    let x = MARGE + 18;
    colonnes.forEach((col) => {
      page.drawText(col.titre, { x, y: y - hauteurEntete + 9, size: 9.5, font: policeGrasse, color: BLANC });
      x += col.largeur;
    });
    y -= hauteurEntete;
  }

  dessinerEntete();

  prestations.forEach((ligne, index) => {
    if (y - hauteurLigne < 140) {
      page = creerNouvellePage();
      contexte.page = page;
      y = HAUTEUR_PAGE - 80;
      dessinerEntete();
    }

    if (index % 2 === 1) {
      dessinerPilule(page, MARGE, y - hauteurLigne + 3, largeurTableau, hauteurLigne - 6, GRIS_CLAIR);
    }

    let x = MARGE + 18;
    const valeurs = {
      description: ligne.description || '',
      quantite: String(ligne.quantite ?? ''),
      unite: ligne.unite || '',
      prix_unitaire_ht: formaterNombre(ligne.prix_unitaire_ht),
      taux_tva: ligne.taux_tva ? `${ligne.taux_tva}%` : '0%',
      total_ht: formaterNombre(ligne.total_ht),
    };
    colonnes.forEach((col) => {
      const texte = tronquerTexte(valeurs[col.cle], police, 9, col.largeur - 12);
      page.drawText(texte, { x, y: y - hauteurLigne + 9, size: 9, font: police, color: ENCRE });
      x += col.largeur;
    });
    y -= hauteurLigne;
  });

  if (prestations.length === 0) {
    page.drawText('Aucune prestation ajoutée.', { x: MARGE + 10, y: y - 18, size: 9.5, font: police, color: ENCRE });
    y -= 30;
  }

  return { page, y: y - 20 };
}

function dessinerTotaux(page, { doc, policeGrasse, police }, yDepart) {
  let y = yDepart;
  const xLabel = LARGEUR_PAGE - MARGE - 200;

  page.drawText(`Total HT :`, { x: xLabel, y, size: 10, font: police, color: ENCRE });
  page.drawText(formaterNombre(doc.total_ht) + ' €', { x: xLabel + 90, y, size: 10, font: policeGrasse, color: ENCRE });
  y -= 16;

  if (doc.afficher_tva) {
    page.drawText(`TVA :`, { x: xLabel, y, size: 10, font: police, color: ENCRE });
    page.drawText(formaterNombre(doc.total_tva) + ' €', { x: xLabel + 90, y, size: 10, font: policeGrasse, color: ENCRE });
    y -= 16;
  }

  // Pastille verte "Total TTC", comme sur le modèle
  const texteTtc = `Total TTC : ${formaterNombre(doc.total_ttc)} €`;
  const largeurPastille = policeGrasse.widthOfTextAtSize(texteTtc, 11) + 30;
  dessinerPilule(page, LARGEUR_PAGE - MARGE - largeurPastille, y - 6, largeurPastille, 26, VERT_MOUSSE);
  page.drawText(texteTtc, {
    x: LARGEUR_PAGE - MARGE - largeurPastille + 15, y: y + 1, size: 11, font: policeGrasse, color: BLANC,
  });

  return y - 40;
}

function dessinerPiedDePage(page, { doc, parametres, police, policeGrasse }, yDepart) {
  let y = yDepart;

  if (doc.mode_paiement) {
    page.drawText('Mode de règlement :', { x: MARGE, y, size: 10, font: policeGrasse, color: VERT_MOUSSE });
    y -= 15;
    page.drawText(doc.mode_paiement, { x: MARGE, y, size: 9.5, font: police, color: ENCRE });
    y -= 20;
  }
  if (doc.conditions_paiement) {
    page.drawText(doc.conditions_paiement, { x: MARGE, y, size: 8.5, font: police, color: ENCRE });
    y -= 16;
  }
  if (doc.notes) {
    page.drawText('Notes :', { x: MARGE, y, size: 9, font: policeGrasse, color: VERT_MOUSSE });
    y -= 13;
    page.drawText(tronquerTexte(doc.notes, police, 8.5, 400), { x: MARGE, y, size: 8.5, font: police, color: ENCRE });
    y -= 20;
  }

  if (doc.type === 'devis') {
    page.drawText('Signature suivie de la mention « bon pour accord »', {
      x: LARGEUR_PAGE - MARGE - 220, y: 130, size: 8.5, font: police, color: ENCRE,
    });
    page.drawLine({ start: { x: LARGEUR_PAGE - MARGE - 200, y: 100 }, end: { x: LARGEUR_PAGE - MARGE, y: 100 }, thickness: 0.8, color: ENCRE });
  }

  const bas = [parametres.texte_legal, parametres.pied_de_page].filter(Boolean);
  let yBas = 55;
  bas.forEach((texte) => {
    page.drawText(tronquerTexte(texte, police, 7.5, LARGEUR_PAGE - 2 * MARGE), { x: MARGE, y: yBas, size: 7.5, font: police, color: rgb(0.4, 0.42, 0.36) });
    yBas -= 11;
  });
}

function formaterNombre(valeur) {
  return Number(valeur || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
