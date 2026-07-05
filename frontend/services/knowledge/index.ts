/**
 * services/knowledge/index.ts
 * ────────────────────────────
 * Barrel export — import from '@/services/knowledge' everywhere.
 */
export {
    loadKnowledge,
    searchKnowledge,
    getRelevantKnowledge,
    formatChunksForPrompt,
    getKnowledgeStats,
} from './knowledgeLoader';

export type { KnowledgeChunk, SensorContext } from './knowledgeLoader';
