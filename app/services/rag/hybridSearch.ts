/**
 * Hybrid Search with Reranking for SuperBrain RAG
 *
 * Combines semantic (vector) search with keyword matching and source diversity
 * to dramatically improve retrieval quality over pure cosine similarity.
 *
 * Ported from Project N.O.M.A.D. rag_service.ts (Apache 2.0, Crosstalk Solutions LLC)
 */

import { removeStopwords, eng } from 'stopword'
import { searchSimilarDocuments, type RetrievedDocWithScore } from './vectorStore'

// ── Configuration ────────────────────────────────────────────────────────

const MIN_SEMANTIC_THRESHOLD = 0.35
const KEYWORD_BOOST_FACTOR = 0.10
const TERM_MATCH_BOOST_FACTOR = 0.075
const SOURCE_DIVERSITY_DECAY = 0.85

// ── Keyword Extraction ───────────────────────────────────────────────────

/**
 * Extract meaningful keywords from text.
 * Removes stopwords, normalizes, and deduplicates.
 */
export function extractKeywords(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length >= 3)

  const filtered = removeStopwords(words, eng)
  return [...new Set(filtered)]
}

// ── Reranking ────────────────────────────────────────────────────────────

export interface RankedResult extends RetrievedDocWithScore {
  originalScore: number
  keywordBoost: number
  termBoost: number
  diversityPenalty: number
}

/**
 * Rerank semantic search results using hybrid scoring:
 * 1. Keyword overlap boost (sqrt(overlap) * 10% of base score)
 * 2. Direct term match boost (sqrt(matches/total) * 7.5% of base score)
 * 3. Source diversity penalty (0.85^n for nth result from same source)
 *
 * Results below MIN_SEMANTIC_THRESHOLD receive no keyword/term boosts —
 * this prevents low-relevance docs from gaming their way up via keyword stuffing.
 */
export function rerankResults(
  results: RetrievedDocWithScore[],
  queryKeywords: string[]
): RankedResult[] {
  if (results.length === 0 || queryKeywords.length === 0) {
    return results.map((r) => ({
      ...r,
      originalScore: r.score,
      keywordBoost: 0,
      termBoost: 0,
      diversityPenalty: 1,
    }))
  }

  const sourceCount: Record<string, number> = {}

  const ranked = results.map((result) => {
    const originalScore = result.score
    let score = originalScore

    // Only apply boosts if the semantic score passes the minimum gate
    let keywordBoost = 0
    let termBoost = 0

    if (score >= MIN_SEMANTIC_THRESHOLD) {
      // Keyword overlap boost
      const docKeywords = extractKeywords(result.pageContent)
      const overlap = queryKeywords.filter((kw) => docKeywords.includes(kw)).length

      if (overlap > 0) {
        keywordBoost = Math.sqrt(overlap / queryKeywords.length) * score * KEYWORD_BOOST_FACTOR
        score += keywordBoost
      }

      // Direct term match boost (check raw content, not just keywords)
      const contentLower = result.pageContent.toLowerCase()
      const directMatches = queryKeywords.filter((kw) => contentLower.includes(kw)).length

      if (directMatches > 0) {
        termBoost =
          Math.sqrt(directMatches / queryKeywords.length) * score * TERM_MATCH_BOOST_FACTOR
        score += termBoost
      }
    }

    // Source diversity penalty — penalize repeated sources
    const src = result.metadata?.source || result.metadata?.fileName || 'unknown'
    sourceCount[src] = (sourceCount[src] || 0) + 1
    const diversityPenalty = Math.pow(SOURCE_DIVERSITY_DECAY, sourceCount[src] - 1)
    score *= diversityPenalty

    return {
      ...result,
      score: Math.min(score, 1.0),
      originalScore,
      keywordBoost,
      termBoost,
      diversityPenalty,
    }
  })

  // Sort by final reranked score descending
  return ranked.sort((a, b) => b.score - a.score)
}

// ── Hybrid Search Wrapper ────────────────────────────────────────────────

/**
 * Full hybrid search pipeline:
 * 1. Run semantic search with 3x the requested limit (for reranking headroom)
 * 2. Extract keywords from query
 * 3. Rerank with hybrid scoring
 * 4. Return top `limit` results
 */
export async function hybridSearch(
  query: string,
  limit: number = 5
): Promise<RankedResult[]> {
  // Fetch 3x results for reranking headroom (same pattern as N.O.M.A.D.)
  const fetchLimit = Math.min(limit * 3, 20)
  const rawResults = await searchSimilarDocuments(query, fetchLimit)

  const queryKeywords = extractKeywords(query)
  const reranked = rerankResults(rawResults, queryKeywords)

  return reranked.slice(0, limit)
}
