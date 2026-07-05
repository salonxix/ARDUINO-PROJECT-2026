/**
 * services/knowledge/knowledgeLoader.ts
 * ──────────────────────────────────────
 * Loads research data (CSV + PDFs) from the data/ folder, extracts
 * useful text, splits it into searchable chunks, and caches everything
 * in memory for the lifetime of the server process.
 *
 * Exposed functions:
 *   loadKnowledge()                  — parse & cache all files (call once at startup)
 *   searchKnowledge(query)           — find relevant chunks for any text query
 *   getRelevantKnowledge(sensorData) — find chunks relevant to live sensor readings
 *
 * Design constraints:
 *   - No vector DB, no embeddings — pure keyword TF-IDF scoring
 *   - Files parsed only once (module-level cache)
 *   - Only relevant chunks are returned (never entire files)
 *   - Server-side only (Node.js / Next.js API routes)
 */

import fs from 'fs';
import path from 'path';

// ── Types ─────────────────────────────────────────────────────────────────────

/** A single searchable unit of knowledge */
export interface KnowledgeChunk {
    id: string;    // unique ID: sourceName-chunkIndex
    source: string;    // original filename
    topic: string;    // inferred topic label
    text: string;    // the actual text content
    tokens: number;    // approximate word count
}

/** Minimal sensor shape used by getRelevantKnowledge */
export interface SensorContext {
    ph?: number;
    tds?: number;
    turbidity?: number;
    temp?: number;
    gas?: number;
    wqi?: number;
    grade?: string;
}

// ── Module-level cache ────────────────────────────────────────────────────────

let chunks: KnowledgeChunk[] = [];
let isLoaded = false;

const DATA_DIR = path.join(process.cwd(), 'services', 'knowledge', 'data');

// ── Chunking utility ──────────────────────────────────────────────────────────

/**
 * splitIntoChunks()
 * Splits a long string into overlapping word-windows.
 * Overlap prevents losing context at chunk boundaries.
 *
 * @param text      Full text to split
 * @param size      Target words per chunk (default 100)
 * @param overlap   Words shared between consecutive chunks (default 20)
 */
function splitIntoChunks(text: string, size = 100, overlap = 20): string[] {
    const words = text.split(/\s+/).filter(Boolean);
    const out: string[] = [];
    let start = 0;
    while (start < words.length) {
        const end = Math.min(start + size, words.length);
        out.push(words.slice(start, end).join(' '));
        start += size - overlap;
    }
    return out.filter((c) => c.trim().length > 20);
}

/** Create a KnowledgeChunk object */
function makeChunk(source: string, topic: string, text: string, idx: number): KnowledgeChunk {
    const base = path.basename(source, path.extname(source)).replace(/\s+/g, '_').slice(0, 30);
    return { id: `${base}-${idx}`, source: path.basename(source), topic, text: text.trim(), tokens: text.split(/\s+/).length };
}

// ── CSV parser ────────────────────────────────────────────────────────────────

/**
 * parseCSV()
 * Converts the water-pollution-disease CSV into knowledge chunks.
 * Each row becomes a plain-English sentence summarising that record.
 * Rows with missing critical fields are skipped.
 */
async function parseCSV(filePath: string): Promise<KnowledgeChunk[]> {
    const Papa = (await import('papaparse')).default;
    const raw = fs.readFileSync(filePath, 'utf-8');
    const result = Papa.parse<Record<string, string>>(raw, { header: true, skipEmptyLines: true });
    const out: KnowledgeChunk[] = [];

    result.data.forEach((row, i) => {
        // Build a readable sentence from the most informative columns
        const parts: string[] = [];

        if (row['Country']) parts.push(`Country: ${row['Country']}`);
        if (row['Region']) parts.push(`Region: ${row['Region']}`);
        if (row['Year']) parts.push(`Year: ${row['Year']}`);
        if (row['Water Source Type']) parts.push(`Source: ${row['Water Source Type']}`);
        if (row['pH Level']) parts.push(`pH: ${row['pH Level']}`);
        if (row['Turbidity (NTU)']) parts.push(`Turbidity: ${row['Turbidity (NTU)']} NTU`);
        if (row['Contaminant Level (ppm)']) parts.push(`Contaminants: ${row['Contaminant Level (ppm)']} ppm`);
        if (row['Nitrate Level (mg/L)']) parts.push(`Nitrates: ${row['Nitrate Level (mg/L)']} mg/L`);
        if (row['Bacteria Count (CFU/mL)']) parts.push(`Bacteria: ${row['Bacteria Count (CFU/mL)']} CFU/mL`);
        if (row['Water Treatment Method']) parts.push(`Treatment: ${row['Water Treatment Method']}`);
        if (row['Diarrheal Cases per 100,000 people']) parts.push(`Diarrheal cases/100k: ${row['Diarrheal Cases per 100,000 people']}`);
        if (row['Cholera Cases per 100,000 people']) parts.push(`Cholera cases/100k: ${row['Cholera Cases per 100,000 people']}`);
        if (row['Typhoid Cases per 100,000 people']) parts.push(`Typhoid cases/100k: ${row['Typhoid Cases per 100,000 people']}`);
        if (row['Infant Mortality Rate (per 1,000 live births)']) parts.push(`Infant mortality/1k: ${row['Infant Mortality Rate (per 1,000 live births)']}`);

        if (parts.length < 4) return; // skip empty/incomplete rows

        const text = parts.join('. ') + '.';
        const topic = `${row['Country'] ?? 'unknown'} water data ${row['Year'] ?? ''}`.trim();
        out.push(makeChunk(filePath, topic, text, i));
    });

    return out;
}

// ── PDF parser ────────────────────────────────────────────────────────────────

/**
 * parsePDF()
 * Extracts text from a PDF and splits it into overlapping chunks.
 * Normalises whitespace and strips non-printable characters.
 * Larger chunk size (150 words) preserves more paragraph context.
 */
async function parsePDF(filePath: string): Promise<KnowledgeChunk[]> {
    // pdf-parse has inconsistent export shapes depending on bundler/Node version.
    // Try every known export location until we find a callable function.
    const pdfMod = await import('pdf-parse');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod = pdfMod as any;
    const pdfParse: ((buf: Buffer) => Promise<{ text: string }>) | null =
        typeof mod.default === 'function' ? mod.default :
            typeof mod === 'function' ? mod :
                typeof mod.default?.default === 'function' ? mod.default.default :
                    null;

    if (!pdfParse) {
        console.error('[KnowledgeLoader] pdf-parse: could not find callable export. Skipping', filePath);
        return [];
    }

    const buffer = fs.readFileSync(filePath);
    const data = await pdfParse(buffer);

    const text = data.text
        .replace(/[^\x20-\x7E\n]/g, ' ')  // remove non-printable chars
        .replace(/\s{3,}/g, '\n')          // collapse excessive whitespace
        .replace(/\n{3,}/g, '\n\n')        // collapse excessive blank lines
        .trim();

    const topic = path.basename(filePath, '.pdf').replace(/[-_]/g, ' ').slice(0, 60);
    return splitIntoChunks(text, 150, 30).map((c, i) => makeChunk(filePath, topic, c, i));
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * loadKnowledge()
 * ──────────────
 * Scans the data/ directory for supported files, parses each one,
 * and stores all chunks in the module-level cache.
 *
 * Safe to call multiple times — subsequent calls are instant (cache hit).
 * Call this once per server startup (or at the start of each API handler).
 *
 * @param force  Pass true to force a reload even if already cached
 * @returns      Total number of chunks loaded
 */
export async function loadKnowledge(force = false): Promise<number> {
    if (isLoaded && !force) return chunks.length;

    chunks = [];
    isLoaded = false;

    if (!fs.existsSync(DATA_DIR)) {
        console.warn('[KnowledgeLoader] data/ directory not found:', DATA_DIR);
        isLoaded = true;
        return 0;
    }

    const files = fs.readdirSync(DATA_DIR).filter((f) => {
        const ext = path.extname(f).toLowerCase();
        return ['.csv', '.pdf', '.json'].includes(ext);
    });

    for (const filename of files) {
        const fullPath = path.join(DATA_DIR, filename);
        const ext = path.extname(filename).toLowerCase();

        try {
            let loaded: KnowledgeChunk[] = [];

            if (ext === '.csv') loaded = await parseCSV(fullPath);
            if (ext === '.pdf') loaded = await parsePDF(fullPath);
            if (ext === '.json') {
                // Re-use the existing JSON logic for the built-in facts file
                const raw = fs.readFileSync(fullPath, 'utf-8');
                const items = JSON.parse(raw) as Array<{ topic?: string; content?: string }>;
                items.forEach((item, i) => {
                    if (item.topic && item.content) {
                        splitIntoChunks(item.content, 100, 20).forEach((c, ci) => {
                            chunks.push(makeChunk(fullPath, item.topic!, c, i * 100 + ci));
                        });
                    }
                });
                continue; // already pushed
            }

            chunks.push(...loaded);
            console.log(`[KnowledgeLoader] ${filename}: ${loaded.length} chunks`);
        } catch (err) {
            // Log but continue — one bad file should not break the whole system
            console.error(`[KnowledgeLoader] Failed to parse ${filename}:`, err);
        }
    }

    isLoaded = true;
    console.log(`[KnowledgeLoader] Total chunks in cache: ${chunks.length}`);
    return chunks.length;
}

// ── Scoring helpers ───────────────────────────────────────────────────────────

/** Count word occurrences using word-boundary regex */
function countMatches(text: string, term: string): number {
    if (!term) return 0;
    const re = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    return (text.match(re) ?? []).length;
}

const STOP_WORDS = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
    'from', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does',
    'did', 'will', 'would', 'could', 'should', 'may', 'might', 'not', 'this', 'that',
    'these', 'those', 'it', 'its', 'they', 'we', 'you', 'what', 'which', 'who', 'how',
]);

/**
 * scoreChunk()
 * Computes a relevance score for a chunk against a set of query terms.
 * Topic matches are weighted 3× vs body text matches.
 * Score is normalised by sqrt(tokens) so shorter focused chunks rank higher.
 */
function scoreChunk(chunk: KnowledgeChunk, terms: string[]): number {
    if (!terms.length) return 0;
    const body = chunk.text.toLowerCase();
    const topic = chunk.topic.toLowerCase();
    let score = 0;
    for (const term of terms) {
        score += countMatches(body, term) + countMatches(topic, term) * 3;
    }
    return score / Math.sqrt(chunk.tokens + 1);
}

/** Tokenise a query string, removing stop words and short tokens */
function tokenise(query: string): string[] {
    return query
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .split(/\s+/)
        .filter((t) => t.length > 2 && !STOP_WORDS.has(t));
}

// ── Public search API ─────────────────────────────────────────────────────────

/**
 * searchKnowledge(query, topK)
 * ─────────────────────────────
 * Finds the most relevant knowledge chunks for any free-text query.
 * Uses keyword TF-IDF scoring — no embeddings, no external calls.
 *
 * @param query  User question or search string
 * @param topK   Max chunks to return (default 6)
 * @returns      Array of KnowledgeChunk sorted by relevance
 */
export function searchKnowledge(query: string, topK = 6): KnowledgeChunk[] {
    if (!isLoaded || !chunks.length) {
        console.warn('[KnowledgeLoader] Call loadKnowledge() first.');
        return [];
    }

    const terms = tokenise(query);
    if (!terms.length) return [];

    return chunks
        .map((c) => ({ c, s: scoreChunk(c, terms) }))
        .filter(({ s }) => s > 0)
        .sort((a, b) => b.s - a.s)
        .slice(0, topK)
        .map(({ c }) => c);
}

/**
 * getRelevantKnowledge(sensorData, topK)
 * ───────────────────────────────────────
 * Builds a contextual query from live sensor readings and retrieves
 * the most relevant research chunks for those specific conditions.
 *
 * This produces water-quality-specific search terms rather than
 * generic text, so the results are much more targeted.
 *
 * @param sensorData  Live sensor values from Firebase
 * @param topK        Max chunks to return (default 8)
 * @returns           Array of relevant KnowledgeChunk
 */
export function getRelevantKnowledge(sensorData: SensorContext, topK = 8): KnowledgeChunk[] {
    if (!isLoaded || !chunks.length) return [];

    // Build a rich query from sensor values and their known implications
    const terms: string[] = ['water quality', 'drinking water', 'contamination'];

    // pH — out of normal range
    if (sensorData.ph !== undefined) {
        terms.push('pH');
        if (sensorData.ph < 6.5) terms.push('acidic', 'corrosion', 'heavy metals');
        else if (sensorData.ph > 8.5) terms.push('alkaline', 'scale', 'taste');
        else terms.push('neutral pH', 'safe');
    }

    // TDS
    if (sensorData.tds !== undefined) {
        terms.push('dissolved solids', 'TDS', 'minerals');
        if (sensorData.tds > 600) terms.push('high TDS', 'salinity', 'kidney', 'filtration', 'reverse osmosis');
        else if (sensorData.tds > 300) terms.push('elevated TDS', 'taste', 'treatment');
        else terms.push('safe TDS');
    }

    // Turbidity
    if (sensorData.turbidity !== undefined) {
        terms.push('turbidity', 'clarity', 'suspended particles');
        if (sensorData.turbidity > 4) terms.push('cloudy water', 'pathogens', 'sediment', 'bacteria', 'filtration');
        else if (sensorData.turbidity > 1) terms.push('slightly cloudy', 'particles');
        else terms.push('clear water');
    }

    // Temperature
    if (sensorData.temp !== undefined) {
        terms.push('temperature', 'water temperature');
        if (sensorData.temp > 25) terms.push('warm water', 'bacterial growth', 'Legionella');
        else if (sensorData.temp < 10) terms.push('cold water');
    }

    // WQI and grade
    if (sensorData.wqi !== undefined) {
        terms.push('water quality index', 'WQI');
        if (sensorData.wqi < 50) terms.push('poor quality', 'health risk', 'disease', 'treatment required');
        else if (sensorData.wqi < 70) terms.push('moderate quality', 'caution', 'filtration');
        else terms.push('good quality');
    }

    if (sensorData.grade) {
        if (['D', 'F'].includes(sensorData.grade.toUpperCase())) {
            terms.push('contaminated', 'unsafe', 'waterborne disease', 'cholera', 'typhoid', 'diarrhea');
        }
    }

    // Deduplicate terms
    const uniqueTerms = [...new Set(terms)];

    return chunks
        .map((c) => ({ c, s: scoreChunk(c, uniqueTerms) }))
        .filter(({ s }) => s > 0)
        .sort((a, b) => b.s - a.s)
        .slice(0, topK)
        .map(({ c }) => c);
}

/**
 * formatChunksForPrompt(chunks, maxChars)
 * ────────────────────────────────────────
 * Formats knowledge chunks into a compact string suitable for
 * embedding in a Gemini prompt without exceeding token limits.
 *
 * Only sends relevant excerpts — never entire documents.
 *
 * @param chunks    Chunks to include
 * @param maxChars  Hard character cap (default 3000)
 * @returns         Formatted string ready to embed in a prompt
 */
export function formatChunksForPrompt(
    chunks: KnowledgeChunk[],
    maxChars = 3000,
): string {
    if (!chunks.length) return '';

    const lines: string[] = ['─── RESEARCH KNOWLEDGE BASE ───'];
    let total = 0;

    for (const chunk of chunks) {
        const entry = `[${chunk.source}] ${chunk.text}`;
        if (total + entry.length > maxChars) break;
        lines.push(entry);
        total += entry.length;
    }

    lines.push('─── END RESEARCH ───');
    return lines.join('\n');
}

/** Returns stats about the current cache (useful for debugging / health check) */
export function getKnowledgeStats() {
    return {
        loaded: isLoaded,
        totalChunks: chunks.length,
        sources: [...new Set(chunks.map((c) => c.source))],
    };
}
