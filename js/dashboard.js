// ============================================================
// Tableau de bord admin
// ============================================================
import { supabase } from './supabase.js';
import { protegerPage, deconnexion } from './auth.js';
import { injecterMenuLateral, formaterMontant, formaterDate, afficherToast } from './ui.js';

await protegerPage();
injecterMenuLateral('dashboard');
document.querySelector('#bouton-deconnexion').addEventListener('click', deconnexion);

const zoneStats = document.querySelector('#zone-stats');
const zoneDerniers = document.querySelector('#zone-derniers-documents');

async function chargerTableauDeBord() {
  try {
    const [
      { count: nombreClients },
      { count: nombreDevis },
      { count: nombreFactures },
      { count: devisEnAttente },
      { data: devisAcceptes },
      { data: facturesLieesADevis },
      { data: factures },
      { data: derniers },
    ] = await Promise.all([
      supabase.from('clients').select('*', { count: 'exact', head: true }).eq('archive', false),
      supabase.from('documents').select('*', { count: 'exact', head: true }).eq('type', 'devis'),
      supabase.from('documents').select('*', { count: 'exact', head: true }).eq('type', 'facture'),
      supabase.from('documents').select('*', { count: 'exact', head: true }).eq('type', 'devis').eq('statut', 'envoye'),
      supabase.from('documents').select('id').eq('type', 'devis').eq('statut', 'accepte'),
      supabase.from('documents').select('document_origine_id').eq('type', 'facture').not('document_origine_id', 'is', null),
      supabase.from('documents').select('total_ttc, statut').eq('type', 'facture'),
      supabase.from('documents').select('id, type, numero, nom, date, statut, total_ttc, client_nom, client_entreprise')
        .order('created_at', { ascending: false }).limit(6),
    ]);

    // Devis acceptés mais dont aucune facture ne référence encore document_origine_id
    const idsDevisFactures = new Set((facturesLieesADevis || []).map(f => f.document_origine_id));
    const devisNonFactures = (devisAcceptes || []).filter(d => !idsDevisFactures.has(d.id)).length;

    const facturesValides = (factures || []).filter(f => f.statut !== 'annulee');
    const montantFacture = facturesValides.reduce((s, f) => s + Number(f.total_ttc || 0), 0);
    const montantEncaisse = facturesValides.filter(f => f.statut === 'payee').reduce((s, f) => s + Number(f.total_ttc || 0), 0);
    const montantRestant = montantFacture - montantEncaisse;
    const facturesImpayees = facturesValides.filter(f => f.statut === 'impayee' || f.statut === 'partiellement-payee').length;

    zoneStats.innerHTML = `
      <div class="carte-stat"><div class="valeur">${nombreClients ?? 0}</div><div class="libelle">Clients actifs</div></div>
      <div class="carte-stat"><div class="valeur">${nombreDevis ?? 0}</div><div class="libelle">Devis créés</div></div>
      <div class="carte-stat"><div class="valeur">${nombreFactures ?? 0}</div><div class="libelle">Factures créées</div></div>
      <div class="carte-stat${devisEnAttente ? ' alerte' : ''}"><div class="valeur">${devisEnAttente ?? 0}</div><div class="libelle">Devis en attente de réponse</div></div>
      <div class="carte-stat${devisNonFactures ? ' alerte' : ''}"><div class="valeur">${devisNonFactures}</div><div class="libelle">Devis acceptés non facturés</div></div>
      <div class="carte-stat${facturesImpayees ? ' alerte' : ''}"><div class="valeur">${facturesImpayees}</div><div class="libelle">Factures impayées</div></div>
      <div class="carte-stat accent"><div class="valeur">${formaterMontant(montantFacture)}</div><div class="libelle">Chiffre d'affaires facturé</div></div>
      <div class="carte-stat"><div class="valeur">${formaterMontant(montantRestant)}</div><div class="libelle">Reste à encaisser</div></div>
    `;

    if (!derniers || derniers.length === 0) {
      zoneDerniers.innerHTML = `<div class="etat-vide">Aucun document pour le moment.<br><a href="document-form.html?type=devis" class="bouton bouton-principal">+ Créer un devis</a></div>`;
    } else {
      zoneDerniers.innerHTML = `
        <div class="tableau-wrapper tableau-responsive">
          <table>
            <thead><tr><th>Type</th><th>Numéro</th><th>Nom</th><th>Date</th><th>Client</th><th>Statut</th><th>Montant TTC</th></tr></thead>
            <tbody>
              ${derniers.map(d => `
                <tr>
                  <td data-label="Type">${d.type === 'devis' ? 'Devis' : 'Facture'}</td>
                  <td data-label="Numéro"><a href="document-form.html?id=${d.id}">${d.numero}</a></td>
                  <td data-label="Nom">${d.nom || '—'}</td>
                  <td data-label="Date">${formaterDate(d.date)}</td>
                  <td data-label="Client">${d.client_entreprise || d.client_nom || '—'}</td>
                  <td data-label="Statut"><span class="badge badge-${d.statut}">${d.statut.replace('-', ' ')}</span></td>
                  <td data-label="Montant TTC">${formaterMontant(d.total_ttc)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    }
  } catch (err) {
    console.error(err);
    afficherToast("Impossible de charger le tableau de bord. Vérifie ta connexion.", 'erreur');
    zoneStats.innerHTML = `<div class="erreur-reseau">Erreur de chargement des statistiques.</div>`;
  }
}

chargerTableauDeBord();
