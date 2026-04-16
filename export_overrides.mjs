// ═══════════════════════════════════════════════════════════════════════════
// export_overrides.mjs
//
// Lit le sheet CATALOG de l'Excel, n'exporte que les lignes marquées
// dans la colonne "updated" (n'importe quelle valeur non-vide).
// Merge avec le overrides.json existant (cumulatif).
//
// Format colonne "updated" : mettre 1, x, ou n'importe quoi pour marquer.
// Si la colonne "updated" est absente → export de TOUTES les lignes valides.
// ═══════════════════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { read, utils } from 'xlsx';

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

const wb = read(readFileSync(xlsxFile));
const ws = wb.Sheets['CATALOG'];
if (!ws) { console.error('Sheet CATALOG introuvable'); process.exit(1); }

const rows = utils.sheet_to_json(ws, { defval: '' });

// Détecter si la colonne "updated" est présente
const hasFlag = rows.length > 0 && 'updated' in rows[0];
if (hasFlag) {
  console.log('Colonne "updated" détectée — export des lignes marquées uniquement');
} else {
  console.log('Colonne "updated" absente — export de toutes les lignes valides');
}

// ── 3. Charger overrides.json existant (merge cumulatif) ──────────────────
let out = {};
if (existsSync('overrides.json')) {
  try {
    out = JSON.parse(readFileSync('overrides.json', 'utf8'));
    console.log(`overrides.json existant : ${Object.keys(out).length} entrées`);
  } catch(e) {
    console.warn('overrides.json illisible, on repart de zéro');
  }
}

// ── 4. Appliquer les nouvelles entrées ────────────────────────────────────
let added = 0, nbUpdated = 0;

for (const r of rows) {
  if (hasFlag && !r.updated) continue;

  const setCode = String(r.setCode || '').trim();
  const num     = parseInt(r.num, 10);
  if (!setCode || isNaN(num)) continue;

  const key = `${setCode}-${num}`;
  if (validKeys && !validKeys.has(key)) continue;

  const img     = (r.imageHD   || '').trim();
  const cmUrl   = (r.JP_cmUrl  || '').trim();
  const cmUrlCn = (r.CN_cmUrl  || '').trim();
  if (!img && !cmUrl && !cmUrlCn) continue;

  const patch = {};
  if (img)     patch.img     = img;
  if (cmUrl)   patch.cmUrl   = cmUrl;
  if (cmUrlCn) patch.cmUrlCn = cmUrlCn;

  const isNew = !(key in out);
  out[key] = patch;
  isNew ? added++ : nbUpdated++;
}

// ── 5. Écrire ─────────────────────────────────────────────────────────────
writeFileSync('overrides.json', JSON.stringify(out, null, 2) + '\n');
console.log(`overrides.json : ${Object.keys(out).length} entrées total (+${added} nouvelles, ~${nbUpdated} mises à jour)`);
