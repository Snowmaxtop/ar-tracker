// ═══════════════════════════════════════════════════════════════════════════
// export_overrides.mjs
//
// Lit le sheet CATALOG de l'Excel.
// Exporte uniquement les lignes avec "1" dans la colonne "export".
// Après traitement : vide la colonne "export" et note la date dans "updated".
// Merge avec overrides.json existant (cumulatif).
//
// Workflow :
//   1. Tu modifies une ligne dans l'Excel
//   2. Tu mets "1" dans la colonne "export" de cette ligne
//   3. Tu pushs l'Excel
//   4. L'Action génère overrides.json et remet "export" à vide automatiquement
// ═══════════════════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { read, utils, write } from 'xlsx';

// ── 1. Clés valides depuis data.js ────────────────────────────────────────
const dataJs = readFileSync('data.js', 'utf8');
let validKeys;
try {
  const fn = new Function(dataJs.replace(/^const /gm, 'var ') + '\nreturn DISCOVER_DB;');
  const db = fn();
  validKeys = new Set();
  for (const set of db) {
    for (const card of set.cards) {
      validKeys.add(`${set.id}-${parseInt(card.num, 10)}`);
    }
  }
  console.log(`data.js : ${validKeys.size} cartes valides`);
} catch(e) {
  console.warn('Impossible de parser data.js, pas de filtre :', e.message);
  validKeys = null;
}

// ── 2. Lire l'Excel ───────────────────────────────────────────────────────
const files    = readdirSync('.');
const xlsxFile = files.find(f => /^Encyclopedie_FRJPKRCN.*\.xlsx$/i.test(f));
if (!xlsxFile) { console.error('Fichier Excel introuvable'); process.exit(1); }
console.log('Lecture de', xlsxFile);

const wb      = read(readFileSync(xlsxFile), { type: 'buffer', cellDates: true });
const ws      = wb.Sheets['CATALOG'];
if (!ws) { console.error('Sheet CATALOG introuvable'); process.exit(1); }

const rows    = utils.sheet_to_json(ws, { defval: '', raw: false });
const headers = utils.sheet_to_json(ws, { header: 1 })[0];

// Trouver les colonnes export et updated
const hasExport  = rows.length > 0 && 'export'  in rows[0];
const hasUpdated = rows.length > 0 && 'updated' in rows[0];

if (!hasExport) {
  console.error('Colonne "export" introuvable dans CATALOG — rien à faire');
  process.exit(0);
}

const flaggedCount = rows.filter(r => String(r.export || '').trim() === '1').length;
if (flaggedCount === 0) {
  console.log('Aucune ligne avec export=1 — rien à faire');
  process.exit(0);
}
console.log(`${flaggedCount} lignes avec export=1 détectées`);

// ── 3. Charger overrides.json existant ───────────────────────────────────
let out = {};
if (existsSync('overrides.json')) {
  try {
    out = JSON.parse(readFileSync('overrides.json', 'utf8'));
    console.log(`overrides.json existant : ${Object.keys(out).length} entrées`);
  } catch(e) { console.warn('overrides.json illisible, on repart de zéro'); }
}

// ── 4. Traiter les lignes flaggées ────────────────────────────────────────
const today = new Date().toISOString().slice(0, 10);
let added = 0, nbUpdated = 0;

for (const r of rows) {
  if (String(r.export || '').trim() !== '1') continue;

  const setCode = String(r.setCode || '').trim();
  const num     = parseInt(r.num, 10);
  if (!setCode || isNaN(num)) continue;

  const key = `${setCode}-${num}`;
  if (validKeys && !validKeys.has(key)) continue;

  const img     = (r.imageHD   || '').trim();
  const cmUrl   = (r.JP_cmUrl  || '').trim();
  const cmUrlFr = (r.FR_cmUrl  || '').trim();
  const cmUrlCn = (r.CN_cmUrl  || '').trim();
  if (!img && !cmUrl && !cmUrlFr && !cmUrlCn) continue;

  const patch = {};
  if (img)     patch.img     = img;
  if (cmUrl)   patch.cmUrl   = cmUrl;
  if (cmUrlFr) patch.cmUrlFr = cmUrlFr;
  if (cmUrlCn) patch.cmUrlCn = cmUrlCn;

  const isNew = !(key in out);
  out[key] = patch;
  isNew ? added++ : nbUpdated++;
}

// ── 5. Écrire overrides.json ──────────────────────────────────────────────
writeFileSync('overrides.json', JSON.stringify(out, null, 2) + '\n');
console.log(`overrides.json : ${Object.keys(out).length} entrées (+${added} nouvelles, ~${nbUpdated} mises à jour)`);

// ── 6. Vider la colonne "export" + mettre à jour "updated" dans l'Excel ───
const exportColIdx  = headers.indexOf('export');
const updatedColIdx = headers.indexOf('updated');

// sheet_to_json donne les données ; on itère sur les cellules directement
const range = utils.decode_range(ws['!ref']);
for (let R = range.s.r + 1; R <= range.e.r; R++) {
  const exportCell = ws[utils.encode_cell({ r: R, c: exportColIdx })];
  if (!exportCell || String(exportCell.v || '').trim() !== '1') continue;

  // Vider export
  exportCell.v = '';
  exportCell.w = '';

  // Mettre à jour updated avec la date du jour
  if (updatedColIdx >= 0) {
    const updCell = ws[utils.encode_cell({ r: R, c: updatedColIdx })] || {};
    updCell.t = 's';
    updCell.v = today;
    updCell.w = today;
    ws[utils.encode_cell({ r: R, c: updatedColIdx })] = updCell;
  }
}

// Sauvegarder l'Excel modifié
const outBuf = write(wb, { type: 'buffer', bookType: 'xlsx' });
writeFileSync(xlsxFile, outBuf);
console.log(`Excel mis à jour : colonne "export" vidée, "updated" → ${today}`);
