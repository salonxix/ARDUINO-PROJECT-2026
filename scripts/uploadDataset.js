/**
 * scripts/uploadDataset.js
 * ─────────────────────────
 * AquaVitals — Automatic KSPCB Dataset Ingestion Script
 *
 * Usage:  npm run upload-dataset
 *
 * What it does:
 *   1. Scans dataset/ for every .xlsx file
 *   2. Reads all worksheets using the xlsx package
 *   3. Normalises column headers
 *   4. Extracts water quality parameters
 *   5. Groups records by lake name
 *   6. Infers month/year from data or filename
 *   7. Looks up GPS coordinates for each lake
 *   8. Uploads to Firebase under lake-dataset/{lakeName}/
 *   9. Skips duplicates
 *  10. Prints a full upload report
 */

'use strict';

const XLSX           = require('xlsx');
const { initializeApp, cert } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');
const fs             = require('fs');
const path           = require('path');
const serviceAccount = require('../serviceAccountKey.json');

// ── Firebase init ─────────────────────────────────────────────────────────────

initializeApp({
    credential:  cert(serviceAccount),
    databaseURL: 'https://aquavitals-7c1d3-default-rtdb.asia-southeast1.firebasedatabase.app',
});
const db = getDatabase();

// ── Bengaluru lake coordinates ────────────────────────────────────────────────

const LAKE_COORDS = {
    // Ulsoor / Halasuru
    'ulsoor lake':                              { lat: 12.9855, lng: 77.6197 },
    'halasuru lake':                            { lat: 12.9855, lng: 77.6197 },
    // Bellandur
    'bellandur lake':                           { lat: 12.9306, lng: 77.6684 },
    'bellandur tank':                           { lat: 12.9306, lng: 77.6684 },
    // Hebbal
    'hebbal lake':                              { lat: 13.0358, lng: 77.5948 },
    'hebbal tank':                              { lat: 13.0358, lng: 77.5948 },
    // Madiwala / Begur
    'madiwala lake':                            { lat: 12.9210, lng: 77.6172 },
    'madiwala tank':                            { lat: 12.9210, lng: 77.6172 },
    'begur lake':                               { lat: 12.8794, lng: 77.6239 },
    // Sankey
    'sankey tank':                              { lat: 13.0019, lng: 77.5739 },
    'sankey lake':                              { lat: 13.0019, lng: 77.5739 },
    // Yelahanka
    'yelahanka lake':                           { lat: 13.1019, lng: 77.5963 },
    'yelahanka new town lake':                  { lat: 13.1019, lng: 77.5963 },
    // Puttenahalli
    'puttenahalli lake':                        { lat: 12.9026, lng: 77.6280 },
    'puttenahalli tank':                        { lat: 12.9026, lng: 77.6280 },
    // Agara
    'agara lake':                               { lat: 12.9170, lng: 77.6394 },
    'agara tank':                               { lat: 12.9170, lng: 77.6394 },
    // Kaikondrahalli
    'kaikondrahalli lake':                      { lat: 12.9134, lng: 77.6638 },
    'kaikondrahalli tank':                      { lat: 12.9134, lng: 77.6638 },
    // Nagawara
    'nagawara lake':                            { lat: 13.0376, lng: 77.6131 },
    'nagawara tank':                            { lat: 13.0376, lng: 77.6131 },
    // Lalbagh
    'lalbagh tank':                             { lat: 12.9500, lng: 77.5855 },
    'lalbagh lake':                             { lat: 12.9500, lng: 77.5855 },
    // Varthur
    'varthur lake':                             { lat: 12.9391, lng: 77.7408 },
    'varthur tank':                             { lat: 12.9391, lng: 77.7408 },
    // Jakkur
    'jakkur lake':                              { lat: 13.0654, lng: 77.6051 },
    'jakkur aerodrome lake':                    { lat: 13.0654, lng: 77.6051 },
    // Rachenahalli
    'rachenahalli lake':                        { lat: 13.0630, lng: 77.6292 },
    'rachenahalli tank':                        { lat: 13.0630, lng: 77.6292 },
    // Allalasandra
    'allalasandra lake':                        { lat: 13.0706, lng: 77.6316 },
    'allalasandra tank':                        { lat: 13.0706, lng: 77.6316 },
    // Doddabommasandra
    'doddabommasandra lake':                    { lat: 13.0792, lng: 77.6047 },
    // Kundalahalli
    'kundalahalli lake':                        { lat: 12.9768, lng: 77.7082 },
    // Horamavu / Byrasandra
    'byrasandra tank':                          { lat: 13.0204, lng: 77.6514 },
    'horamavu lake':                            { lat: 13.0294, lng: 77.6543 },
    // Mariyammanahalli
    'mariyammanahalli lake':                    { lat: 13.0499, lng: 77.5674 },
    // Challaghatta
    'challaghatta lake':                        { lat: 12.9019, lng: 77.5726 },
    // Thubarahalli
    'thubarahalli lake':                        { lat: 12.9588, lng: 77.7205 },
    // Chikkabanavara
    'chikkabanavara lake':                      { lat: 13.0905, lng: 77.5179 },
    // Default fallback for unrecognised lakes — centre of Bengaluru
    '__default__':                              { lat: 12.9716, lng: 77.5946 },
};

/**
 * Find coordinates for a lake name using fuzzy matching.
 * Returns coordinates or null if not found.
 */
function findCoords(rawName) {
    if (!rawName) return null;
    const key = rawName.toLowerCase().trim()
        .replace(/\s+/g, ' ')
        .replace(/[^a-z0-9 ]/g, '');

    // Exact match
    if (LAKE_COORDS[key]) return LAKE_COORDS[key];

    // Partial match — try if any known key is contained in the name or vice versa
    for (const [k, v] of Object.entries(LAKE_COORDS)) {
        if (k === '__default__') continue;
        if (key.includes(k) || k.includes(key)) return v;
        // Match on first meaningful word (e.g. "Ulsoor")
        const first = key.split(' ')[0];
        if (first.length > 4 && k.startsWith(first)) return v;
    }
    return null;
}

// ── Column name normalisation ─────────────────────────────────────────────────

/**
 * Maps messy/variant column headers to standard keys.
 * KSPCB reports use inconsistent whitespace, line breaks, and HTML entities.
 */
const COL_MAP = [
    { key: 'stnCode',         patterns: [/stn.*code/i, /station.*code/i] },
    { key: 'month',           patterns: [/sampling.*month/i, /^month$/i] },
    { key: 'lakeName',        patterns: [/name.*monitoring/i, /monitoring.*location/i, /lake.*name/i, /location/i] },
    { key: 'useClass',        patterns: [/use.*class/i, /class/i] },
    { key: 'temperature',     patterns: [/tempe?ra?t/i] },
    { key: 'do',              patterns: [/dissolved\s*o[2²]/i, /d\.?o\.?/i] },
    { key: 'ph',              patterns: [/^ph$/i, /\bph\b/i] },
    { key: 'conductivity',    patterns: [/conduct/i] },
    { key: 'bod',             patterns: [/\bbod\b/i, /biochemical.*oxygen/i] },
    { key: 'cod',             patterns: [/\bcod\b/i, /chemical.*oxygen/i] },
    { key: 'turbidity',       patterns: [/turbidit/i] },
    { key: 'tds',             patterns: [/total\s+dissolved\s+solids/i, /\btds\b/i] },
    { key: 'tss',             patterns: [/total\s+suspended\s+solids/i, /\btss\b/i] },
    { key: 'nitrate',         patterns: [/nitrate/i] },
    { key: 'nitrite',         patterns: [/nitrite/i] },
    { key: 'phosphate',       patterns: [/phosphate/i, /ortho.*phosphate/i] },
    { key: 'chloride',        patterns: [/chloride/i] },
    { key: 'sulphate',        patterns: [/sulphate/i, /sulfate/i] },
    { key: 'totalHardness',   patterns: [/total.*hardness/i] },
    { key: 'totalAlkalinity', patterns: [/total.*alkalinity/i] },
    { key: 'fecalColiform',   patterns: [/fecal.*coliform/i, /faecal.*coliform/i] },
    { key: 'totalColiform',   patterns: [/total.*coliform/i] },
    { key: 'sodium',          patterns: [/^sodium/i] },
    { key: 'potassium',       patterns: [/^potassium/i] },
    { key: 'calcium',         patterns: [/^calcium|^ca$/i] },
    { key: 'magnesium',       patterns: [/^magnesium|^mg$/i] },
    { key: 'iron',            patterns: [/^iron/i] },
    { key: 'manganese',       patterns: [/^manganese/i] },
    { key: 'fluoride',        patterns: [/^fluoride/i] },
    { key: 'boron',           patterns: [/^boron/i] },
    { key: 'zinc',            patterns: [/^zinc/i] },
    { key: 'copper',          patterns: [/^copper/i] },
    { key: 'lead',            patterns: [/^lead/i] },
    { key: 'cadmium',         patterns: [/^cadmium/i] },
    { key: 'chromium',        patterns: [/chromium/i] },
    { key: 'nickel',          patterns: [/^nickel/i] },
    { key: 'ammonicalN',      patterns: [/ammonical/i, /ammonia/i] },
    { key: 'tkn',             patterns: [/total\s+kjeldahl/i] },
];

/** Normalise a header cell to a clean string */
function cleanHeader(h) {
    return String(h ?? '')
        .replace(/&[a-z]+;/gi, '')   // strip HTML entities
        .replace(/[\n\r]+/g, ' ')    // flatten line breaks
        .replace(/\s+/g, ' ')
        .trim();
}

/** Build a header→standardKey map for a row of headers */
function buildColIndex(headerRow) {
    const index = {};
    headerRow.forEach((raw, colIdx) => {
        const h = cleanHeader(raw);
        if (!h) return;
        for (const { key, patterns } of COL_MAP) {
            if (patterns.some(p => p.test(h))) {
                if (!(key in index)) index[key] = colIdx;  // first match wins
                break;
            }
        }
    });
    return index;
}

// ── Month/year inference ──────────────────────────────────────────────────────

const MONTH_NAMES = {
    jan:'January', feb:'February', mar:'March', apr:'April',
    may:'May', jun:'June', jul:'July', aug:'August',
    sep:'September', oct:'October', nov:'November', dec:'December',
    january:'January', february:'February', march:'March', april:'April',
    june:'June', july:'July', august:'August', september:'September',
    october:'October', november:'November', december:'December',
};

function normaliseMonth(raw) {
    if (!raw) return null;
    const s = String(raw).toLowerCase().trim().slice(0, 3);
    return MONTH_NAMES[String(raw).toLowerCase().trim()] || MONTH_NAMES[s] || String(raw).trim();
}

/** Try to infer year from workbook filename */
function inferYearFromFilename(filename) {
    const m = filename.match(/20\d{2}/);
    return m ? parseInt(m[0]) : new Date().getFullYear();
}

/** Try to infer month from workbook title row */
function inferMonthFromTitle(titleRow) {
    if (!titleRow) return null;
    const title = titleRow.join(' ').toLowerCase();
    for (const [abbr, full] of Object.entries(MONTH_NAMES)) {
        if (title.includes(abbr) && full.length > 3) return full;
    }
    return null;
}

// ── Numeric coerce ────────────────────────────────────────────────────────────

function toNum(v) {
    if (v === null || v === undefined || v === '' || String(v).toLowerCase() === 'bdl') return null;
    const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
    return isNaN(n) ? null : n;
}

// ── Canonical lake name ───────────────────────────────────────────────────────

function canonicalLake(raw) {
    if (!raw) return null;
    return String(raw)
        .trim()
        .replace(/\s+/g, ' ')
        .split(' ')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
}

// ── Safe Firebase key ─────────────────────────────────────────────────────────

function safeKey(s) {
    return String(s).replace(/[.#$[\]/]/g, '_');
}

// ── Parse a single .xlsx file ─────────────────────────────────────────────────

function parseXlsx(filePath, filename) {
    const records = [];
    const wb = XLSX.readFile(filePath);

    for (const sheetName of wb.SheetNames) {
        const sheet = wb.Sheets[sheetName];
        const raw   = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
        if (raw.length < 3) continue;

        // Row 0 is usually the title ("Water Quality Data of Bengaluru Lakes…")
        // Row 1 is headers
        const titleRow  = raw[0];
        const headerRow = raw[1];

        const inferredMonth = inferMonthFromTitle(titleRow);
        const inferredYear  = inferYearFromFilename(filename);

        const colIdx = buildColIndex(headerRow);
        if (!colIdx.lakeName) {
            console.warn(`  ⚠ Sheet "${sheetName}" in ${filename}: could not find lake name column — skipped`);
            continue;
        }

        // Data starts at row 2
        for (let i = 2; i < raw.length; i++) {
            const row = raw[i];
            if (!row || row.every(c => c === '' || c === null)) continue;

            const rawLake = row[colIdx.lakeName];
            if (!rawLake || String(rawLake).trim() === '') continue;

            const lake  = canonicalLake(rawLake);
            const month = normaliseMonth(colIdx.month !== undefined ? row[colIdx.month] : null) || inferredMonth || 'Unknown';
            const year  = inferredYear;

            const rec = {
                lake,
                month,
                year,
                period: `${month} ${year}`,
            };

            // Extract every mapped parameter
            const numFields = ['temperature','do','ph','conductivity','bod','cod',
                'turbidity','tds','tss','nitrate','nitrite','phosphate','chloride',
                'sulphate','totalHardness','totalAlkalinity','fecalColiform',
                'totalColiform','sodium','potassium','calcium','magnesium',
                'iron','manganese','fluoride','boron','zinc','copper',
                'lead','cadmium','chromium','nickel','ammonicalN','tkn'];

            for (const f of numFields) {
                if (colIdx[f] !== undefined) {
                    const v = toNum(row[colIdx[f]]);
                    if (v !== null) rec[f] = v;
                }
            }

            if (colIdx.useClass !== undefined) {
                const uc = String(row[colIdx.useClass]).trim();
                if (uc) rec.useClass = uc;
            }

            records.push(rec);
        }
    }
    return records;
}

// ── Main upload logic ─────────────────────────────────────────────────────────

async function main() {
    const DATASET_DIR = path.join(__dirname, '..', 'dataset');
    if (!fs.existsSync(DATASET_DIR)) {
        console.error(`❌ dataset/ folder not found at: ${DATASET_DIR}`);
        process.exit(1);
    }

    const files = fs.readdirSync(DATASET_DIR).filter(f => f.toLowerCase().endsWith('.xlsx'));
    if (files.length === 0) {
        console.error('❌ No .xlsx files found in dataset/');
        process.exit(1);
    }

    console.log(`\n📂 Found ${files.length} .xlsx file(s) in dataset/\n`);

    // ── Collect all records grouped by lake ───────────────────────────────────
    /** @type {Map<string, Map<string, object>>} lakeName → periodKey → record */
    const lakeMap = new Map();
    let totalRows = 0, totalValid = 0, totalSkipped = 0;

    for (const filename of files) {
        const filePath = path.join(DATASET_DIR, filename);
        console.log(`📄 Reading ${filename}...`);

        let records;
        try {
            records = parseXlsx(filePath, filename);
        } catch (err) {
            console.warn(`  ⚠ Could not parse ${filename}: ${err.message}`);
            continue;
        }

        // Count all non-empty rows (rough estimate)
        const wb  = XLSX.readFile(filePath);
        const sht = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json(sht, { header: 1, defval: '' });
        const dataRows = raw.slice(2).filter(r => r.some(c => c !== '')).length;
        totalRows += dataRows;

        console.log(`   Rows found: ${dataRows}  |  Valid records: ${records.length}`);
        totalValid += records.length;
        totalSkipped += Math.max(0, dataRows - records.length);

        for (const rec of records) {
            if (!rec.lake) continue;
            if (!lakeMap.has(rec.lake)) lakeMap.set(rec.lake, new Map());
            const periodMap = lakeMap.get(rec.lake);
            const key = safeKey(rec.period);
            if (!periodMap.has(key)) {
                periodMap.set(key, rec);
            }
            // If same period seen in multiple files, merge (prefer non-null values)
            else {
                const existing = periodMap.get(key);
                for (const [k, v] of Object.entries(rec)) {
                    if (v !== null && v !== undefined && !existing[k]) {
                        existing[k] = v;
                    }
                }
            }
        }
    }

    console.log(`\n📊 Aggregation complete: ${lakeMap.size} unique lake(s) found\n`);

    // ── Upload to Firebase ────────────────────────────────────────────────────
    let lakesUploaded = 0, firebaseWrites = 0;

    for (const [lakeName, periodMap] of lakeMap.entries()) {
        console.log(`☁️  Uploading ${lakeName} (${periodMap.size} period(s))...`);

        const lakeKey  = safeKey(lakeName);
        const coords   = findCoords(lakeName);

        // Get the latest record (sorted by year then month)
        const sorted = [...periodMap.entries()].sort(([a], [b]) => {
            const ra = periodMap.get(a), rb = periodMap.get(b);
            if (ra.year !== rb.year) return rb.year - ra.year;
            const months = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];
            return months.indexOf(rb.month) - months.indexOf(ra.month);
        });

        const latestRec = sorted.length > 0 ? periodMap.get(sorted[0][0]) : {};

        // Check what's already in Firebase to avoid overwriting
        const snap     = await db.ref(`lake-dataset/${lakeKey}`).once('value');
        const existing = snap.val() || {};
        const existingHistory = existing.history || {};

        // Build history object — skip periods already uploaded
        const historyToWrite = {};
        let skippedPeriods = 0;
        for (const [periodKey, rec] of periodMap.entries()) {
            if (existingHistory[periodKey]) {
                skippedPeriods++;
                continue;  // already exists — do not overwrite
            }
            const { lake, month, year, period, ...params } = rec;
            historyToWrite[periodKey] = { month, year, period, ...params };
        }

        if (Object.keys(historyToWrite).length === 0 && existing.coordinates) {
            console.log(`   ↩ All ${periodMap.size} periods already uploaded — skipped`);
            continue;
        }

        // Coordinates
        const coordinatesObj = coords
            ? { latitude: coords.lat, longitude: coords.lng }
            : existing.coordinates || null;

        if (!coords) {
            console.warn(`   ⚠ Coordinate not found for: ${lakeName}`);
        }

        // Build latest summary (key parameters only)
        const { lake: _l, month: _m, year: _y, period: _p, useClass: _u, ...latestParams } = latestRec;
        const latestObj = {
            month:   latestRec.month   || null,
            year:    latestRec.year    || null,
            period:  latestRec.period  || null,
            ...latestParams,
        };

        // Write to Firebase using modular update
        const updates = {};
        if (coordinatesObj) updates[`lake-dataset/${lakeKey}/coordinates`] = coordinatesObj;
        updates[`lake-dataset/${lakeKey}/name`]   = lakeName;
        updates[`lake-dataset/${lakeKey}/latest`] = latestObj;

        for (const [pk, pv] of Object.entries(historyToWrite)) {
            updates[`lake-dataset/${lakeKey}/history/${pk}`] = pv;
        }

        await db.ref('/').update(updates);
        firebaseWrites += Object.keys(updates).length;
        lakesUploaded++;

        if (skippedPeriods > 0) {
            console.log(`   ✅ Uploaded ${Object.keys(historyToWrite).length} new period(s), skipped ${skippedPeriods} duplicate(s)`);
        } else {
            console.log(`   ✅ Uploaded ${Object.keys(historyToWrite).length} period(s)`);
        }
    }

    // ── Final report ──────────────────────────────────────────────────────────
    console.log(`
=================================
       UPLOAD SUCCESSFUL
=================================
Files Processed  : ${files.length}
Rows Read        : ${totalRows}
Valid Records    : ${totalValid}
Skipped Rows     : ${totalSkipped}
Lakes Uploaded   : ${lakesUploaded}
Firebase Writes  : ${firebaseWrites}
=================================
`);

    process.exit(0);
}

main().catch(err => {
    console.error('❌ Fatal error:', err);
    process.exit(1);
});
