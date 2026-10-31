import { z } from 'zod'
import { askGemini } from '../config/gemini.js'
import {
  researchSystem,
  researchQualityRules,
  writingSystem,
  rewriteSystem,
  editorialSystem,
} from '../utils/prompts.js'
import { writingRuleSignals } from './writingRules.js'
const comparisonClaim = z.object({ text: z.string(), sourceIds: z.array(z.string()) })
const opportunityPoint = z.union([
  z.string(),
  z.object({ text: z.string(), sourceIds: z.array(z.string()).default([]) }).passthrough(),
])
const researchResult = z.object({
  executiveSummary: z.string(),
  summarySourceIds: z.array(z.string()),
  sourceQuality: z.array(
    z.object({ sourceId: z.string(), relevant: z.boolean(), reason: z.string() }),
  ),
  whatHappened: z.array(
    z.object({
      text: z.string(),
      sourceIds: z.array(z.string()),
      kind: z.enum(['reported_fact', 'analysis', 'speculation']),
    }),
  ),
  whyItMatters: z.array(
    z.object({
      text: z.string(),
      sourceIds: z.array(z.string()),
      kind: z.enum(['reported_fact', 'analysis', 'speculation']),
    }),
  ),
  whoShouldCare: z.array(z.string()),
  keyDevelopments: z.array(z.object({ text: z.string(), sourceIds: z.array(z.string()) })),
  evidence: z.array(
    z.object({ claim: z.string(), sourceIds: z.array(z.string()), classification: z.string() }),
  ),
  factsVsAnalysis: z.array(
    z.object({
      text: z.string(),
      kind: z.enum(['reported_fact', 'analysis', 'speculation']),
      sourceIds: z.array(z.string()),
    }),
  ),
  opportunities: z.object({
    founders: z.array(opportunityPoint),
    builders: z.array(opportunityPoint),
  }),
  angles: z
    .array(
      z.object({
        title: z.string(),
        description: z.string(),
        whyItWorks: z.string(),
        sourceIds: z.array(z.string()),
      }),
    )
    .min(3),
  recommendedAngle: z.object({
    title: z.string(),
    reason: z.string(),
    sourceIds: z.array(z.string()),
  }),
  comparison: z.object({
    commonFindings: z.array(comparisonClaim),
    uniqueInformation: z.array(comparisonClaim),
    contradictions: z.array(comparisonClaim),
    missingInformation: z.array(z.string()),
  }),
  questions: z.array(z.string()),
})
const writingResult = z.object({
  issues: z.array(
    z.object({
      category: z.enum([
        'long_sentence',
        'passive_voice',
        'filler_words',
        'unexplained_jargon',
        'repetitive_wording',
        'difficult_paragraph',
      ]),
      excerpt: z.string().min(1).max(4000),
      explanation: z.string(),
      suggestion: z.string().min(1).max(4000),
      severity: z.enum(['high', 'medium', 'low']),
    }),
  ),
  overallNote: z.string(),
})
const editorialResult = z.object({
  headline: z.string(),
  draft: z.string(),
  sourceReferences: z.array(z.object({ index: z.number(), title: z.string(), url: z.string() })),
})
const redundantPercentagePattern = /\b(\d+(?:\.\d+)?)\s*%\s+(?:in|of)\s+\1\s*%\s+of\b/gi
const numberWords = new Map([
  ['zero', '0'],
  ['one', '1'],
  ['two', '2'],
  ['three', '3'],
  ['four', '4'],
  ['five', '5'],
  ['six', '6'],
  ['seven', '7'],
  ['eight', '8'],
  ['nine', '9'],
  ['ten', '10'],
  ['eleven', '11'],
  ['twelve', '12'],
  ['thirteen', '13'],
  ['fourteen', '14'],
  ['fifteen', '15'],
  ['sixteen', '16'],
  ['seventeen', '17'],
  ['eighteen', '18'],
  ['nineteen', '19'],
  ['twenty', '20'],
  ['thirty', '30'],
  ['forty', '40'],
  ['fifty', '50'],
  ['sixty', '60'],
  ['seventy', '70'],
  ['eighty', '80'],
  ['ninety', '90'],
])

function normalizeRedundantPercentage(text) {
  return text.replace(redundantPercentagePattern, '$1% of')
}

function normalizeStatisticalNumberWords(text) {
  return text.replace(
    /\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)\b/gi,
    (word, offset) => {
      const before = text.slice(0, offset)
      const after = text.slice(offset + word.length)
      const afterNumber = after.trimStart()
      const followsStatUnit =
        /^(?:\(\s*\d|%)/i.test(afterNumber) ||
        /^(?:of|percent(?:age points?)?|participants?|analysts?|cases?|decisions?|choices?|errors?|users?|responses?|farms?|minutes?|hours?|times?|points?)\b/i.test(
          afterNumber,
        )
      const followsNumeralInRatio = /\bof\s+(?:the\s+)?$/i.test(before)
      return followsStatUnit || followsNumeralInRatio ? numberWords.get(word.toLowerCase()) : word
    },
  )
}

function removeRepeatedSentences(text) {
  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text]
  const seen = new Set()
  return sentences
    .filter((sentence) => {
      const key = sentence.trim().toLowerCase().replace(/\s+/g, ' ')
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
    .join(' ')
}

function numericFacts(text) {
  return (
    normalizeStatisticalNumberWords(normalizeRedundantPercentage(removeRepeatedSentences(text)))
      .replace(/\[\d+\]/g, '')
      .match(/\d+(?:,\d{3})*(?:\.\d+)?(?:\s*(?:%|percent(?:age points?)?))?/gi) || []
  ).map((fact) => fact.toLowerCase().replace(/,/g, '').replace(/\s+/g, ''))
}

function sameValues(left, right) {
  if (left.length !== right.length) return false
  const sortedLeft = [...left].sort()
  const sortedRight = [...right].sort()
  return sortedLeft.every((value, index) => value === sortedRight[index])
}

function sameCitationMarkers(left, right) {
  const leftMarkers = [...new Set(left.match(/\[\d+\]/g) || [])]
  const rightMarkers = [...new Set(right.match(/\[\d+\]/g) || [])]
  return sameValues(leftMarkers, rightMarkers)
}

function collectBriefText(value, key = '') {
  if (key === 'sourceIds' || key === 'id' || key === 'url') return []
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap((item) => collectBriefText(item))
  if (value && typeof value === 'object')
    return Object.entries(value).flatMap(([childKey, child]) => collectBriefText(child, childKey))
  return []
}

function unsupportedNumericFacts(text, reference) {
  const available = new Map()
  for (const fact of numericFacts(reference)) available.set(fact, (available.get(fact) || 0) + 1)
  const used = new Map()
  const unsupported = []
  for (const fact of numericFacts(text)) {
    used.set(fact, (used.get(fact) || 0) + 1)
    if (used.get(fact) > (available.get(fact) || 0) && !unsupported.includes(fact))
      unsupported.push(fact)
  }
  return unsupported
}

function numericFactsSupported(text, reference) {
  return unsupportedNumericFacts(text, reference).length === 0
}

function writingResultFor(text) {
  return writingResult.superRefine((value, ctx) => {
    value.issues.forEach((issue, index) => {
      if (!text.includes(issue.excerpt)) return
      if (!sameValues(numericFacts(issue.excerpt), numericFacts(issue.suggestion)))
        ctx.addIssue({
          code: 'custom',
          path: ['issues', index, 'suggestion'],
          message:
            'Preserve every numerical finding, percentage, and denominator from the excerpt.',
        })
      if (!sameCitationMarkers(issue.excerpt, issue.suggestion))
        ctx.addIssue({
          code: 'custom',
          path: ['issues', index, 'suggestion'],
          message: 'Preserve the citation markers from the excerpt.',
        })
    })
  })
}

function editorialResultFor(brief) {
  const supportedText = collectBriefText(brief).join(' ')
  return editorialResult.superRefine((value, ctx) => {
    if ([...value.draft.matchAll(redundantPercentagePattern)].length)
      ctx.addIssue({
        code: 'custom',
        path: ['draft'],
        message:
          'Remove duplicated percentage wording while preserving the single intended statistic.',
      })
    const unsupportedFacts = unsupportedNumericFacts(value.draft, supportedText)
    if (unsupportedFacts.length)
      ctx.addIssue({
        code: 'custom',
        path: ['draft'],
        message: `Remove unsupported numerical findings from the research brief: ${unsupportedFacts.slice(0, 10).join(', ')}. Preserve only values and units stated in the brief.`,
      })
    if (
      /\b(shocking|stunning|explosive|game[- ]changing|revolutionary|takeover|conquest|dominates?|manipulated?|proves?|destroys?|shatters?|will change everything)\b/i.test(
        value.headline,
      )
    )
      ctx.addIssue({
        code: 'custom',
        path: ['headline'],
        message: 'Use a measured headline that does not overstate the evidence.',
      })
  })
}

function researchResultFor(material) {
  return researchResult.superRefine((brief, ctx) => {
    const statements = [
      {
        path: ['executiveSummary'],
        text: brief.executiveSummary,
        sourceIds: brief.summarySourceIds,
      },
      ...[
        'whatHappened',
        'whyItMatters',
        'keyDevelopments',
        'evidence',
        'factsVsAnalysis',
        'angles',
        'comparison.commonFindings',
        'comparison.uniqueInformation',
        'comparison.contradictions',
      ].flatMap((path) => {
        const items = path.split('.').reduce((value, key) => value[key], brief)
        return items.map((item, index) => ({
          path: [...path.split('.'), index],
          text:
            item.text || item.claim || [item.title, item.description, item.whyItWorks].join(' '),
          sourceIds: item.sourceIds,
        }))
      }),
      ...['founders', 'builders'].flatMap((group) =>
        brief.opportunities[group].flatMap((item, index) =>
          typeof item === 'string'
            ? []
            : [
                {
                  path: ['opportunities', group, index, 'text'],
                  text: item.text,
                  sourceIds: item.sourceIds,
                },
              ],
        ),
      ),
    ]
    const sourcesById = new Map(material.map((source) => [source.id, source.content]))
    for (const statement of statements) {
      const citedContent = (statement.sourceIds || [])
        .map((id) => sourcesById.get(id) || '')
        .join(' ')
      for (const fact of numericFacts(statement.text)) {
        const supportedSingleSourceCount =
          fact === '1' &&
          material.length === 1 &&
          statement.path[0] === 'comparison' &&
          /\b(?:source|document|article)\b/i.test(statement.text)
        if (!supportedSingleSourceCount && !numericFactsSupported(fact, citedContent))
          ctx.addIssue({
            code: 'custom',
            path: statement.path,
            message: `Numerical finding "${fact}" is not present in the cited source.`,
          })
      }
    }
  })
}

const geminiString = { type: 'STRING' }
const geminiNumber = { type: 'NUMBER' }
const geminiArray = (items, minItems) => ({
  type: 'ARRAY',
  items,
  ...(minItems ? { minItems } : {}),
})
const geminiObject = (properties) => ({
  type: 'OBJECT',
  properties,
  required: Object.keys(properties),
})
const sourceIdsSchema = geminiArray(geminiString)
const claimSchema = geminiObject({ text: geminiString, sourceIds: sourceIdsSchema })
const researchResponseSchema = geminiObject({
  executiveSummary: geminiString,
  summarySourceIds: sourceIdsSchema,
  sourceQuality: geminiArray(
    geminiObject({
      sourceId: geminiString,
      relevant: { type: 'BOOLEAN' },
      reason: geminiString,
    }),
  ),
  whatHappened: geminiArray(
    geminiObject({
      text: geminiString,
      sourceIds: sourceIdsSchema,
      kind: { type: 'STRING', enum: ['reported_fact', 'analysis', 'speculation'] },
    }),
  ),
  whyItMatters: geminiArray(
    geminiObject({
      text: geminiString,
      sourceIds: sourceIdsSchema,
      kind: { type: 'STRING', enum: ['reported_fact', 'analysis', 'speculation'] },
    }),
  ),
  whoShouldCare: geminiArray(geminiString),
  keyDevelopments: geminiArray(claimSchema),
  evidence: geminiArray(
    geminiObject({
      claim: geminiString,
      sourceIds: sourceIdsSchema,
      classification: geminiString,
    }),
  ),
  factsVsAnalysis: geminiArray(
    geminiObject({
      text: geminiString,
      kind: { type: 'STRING', enum: ['reported_fact', 'analysis', 'speculation'] },
      sourceIds: sourceIdsSchema,
    }),
  ),
  opportunities: geminiObject({
    founders: geminiArray(claimSchema),
    builders: geminiArray(claimSchema),
  }),
  angles: geminiArray(
    geminiObject({
      title: geminiString,
      description: geminiString,
      whyItWorks: geminiString,
      sourceIds: sourceIdsSchema,
    }),
    3,
  ),
  recommendedAngle: geminiObject({
    title: geminiString,
    reason: geminiString,
    sourceIds: sourceIdsSchema,
  }),
  comparison: geminiObject({
    commonFindings: geminiArray(claimSchema),
    uniqueInformation: geminiArray(claimSchema),
    contradictions: geminiArray(claimSchema),
    missingInformation: geminiArray(geminiString),
  }),
  questions: geminiArray(geminiString),
})
const writingResponseSchema = geminiObject({
  issues: geminiArray(
    geminiObject({
      category: {
        type: 'STRING',
        enum: [
          'long_sentence',
          'passive_voice',
          'filler_words',
          'unexplained_jargon',
          'repetitive_wording',
          'difficult_paragraph',
        ],
      },
      excerpt: geminiString,
      explanation: geminiString,
      suggestion: geminiString,
      severity: { type: 'STRING', enum: ['high', 'medium', 'low'] },
    }),
  ),
  overallNote: geminiString,
})
const rewriteResponseSchema = geminiObject({
  suggestion: geminiString,
  rationale: geminiString,
})
const editorialResponseSchema = geminiObject({
  headline: geminiString,
  draft: geminiString,
  sourceReferences: geminiArray(
    geminiObject({
      index: { type: 'INTEGER' },
      title: geminiString,
      url: geminiString,
    }),
  ),
})
const findingStopWords = new Set([
  'about',
  'after',
  'also',
  'because',
  'been',
  'being',
  'between',
  'could',
  'does',
  'from',
  'have',
  'into',
  'more',
  'most',
  'other',
  'over',
  'said',
  'same',
  'some',
  'than',
  'that',
  'their',
  'them',
  'then',
  'there',
  'these',
  'they',
  'this',
  'those',
  'through',
  'under',
  'very',
  'what',
  'when',
  'where',
  'which',
  'while',
  'with',
  'would',
])
function findingTerms(value) {
  return new Set(
    value
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 2 && !findingStopWords.has(word)),
  )
}
function sameFinding(left, right) {
  const leftTerms = findingTerms(left),
    rightTerms = findingTerms(right)
  if (leftTerms.size < 5 || rightTerms.size < 5)
    return (
      left.toLowerCase().replace(/\W+/g, ' ').trim() ===
      right.toLowerCase().replace(/\W+/g, ' ').trim()
    )
  let shared = 0
  for (const term of leftTerms) if (rightTerms.has(term)) shared++
  return shared / (leftTerms.size + rightTerms.size - shared) >= 0.78
}
function removeRepeatedSectionFindings(brief) {
  const kept = []
  for (const key of ['whatHappened', 'whyItMatters', 'keyDevelopments']) {
    brief[key] = brief[key].filter((item) => {
      const duplicate = kept.some((prior) => sameFinding(prior.text, item.text))
      if (!duplicate) kept.push(item)
      return !duplicate
    })
  }
}

// The response schema has no separate evidence-request field, so keep follow-up needs in classification.
function evidenceNeededForClaim(claim) {
  if (/benchmark|speed|performance|accuracy|intelligence|quality|capabilit/i.test(claim))
    return 'independent benchmark results or reproducible third-party evaluations'
  if (/rollout|availability|access|free|plus|team|enterprise|user|launch/i.test(claim))
    return 'official rollout records or independent confirmation of availability'
  if (/date|introduced|announced|released/i.test(claim))
    return 'a primary announcement and a separate independent report'
  return 'independent reporting or relevant primary records'
}
function ensureEvidenceRequirements(brief) {
  for (const item of brief.evidence) {
    if (
      /uncorroborated|unsupported/i.test(item.classification) &&
      !/(additional evidence|requires?|needs?)/i.test(item.classification)
    )
      item.classification = `${item.classification}; additional evidence needed: ${evidenceNeededForClaim(item.claim)}`
  }
}

// Check and normalize the Gemini output before returning the existing client response shape.
export async function analyzeResearch({ sources, question }) {
  const material = sources.map((s, i) => ({
    id: String(i + 1),
    title: s.title || `Source ${i + 1}`,
    url: s.url || '',
    publishedAt: s.publishedAt || '',
    content: s.content,
  }))
  const parsed = await askGemini({
    system: [researchSystem, researchQualityRules].join(String.fromCharCode(10)),
    user: JSON.stringify({ editorQuestion: question, sources: material }),
    maxTokens: 6000,
    responseSchema: researchResponseSchema,
    validateResponse: (value) => researchResultFor(material).safeParse(value),
    diagnosticContext: {
      operation: 'research',
      sourceCount: material.length,
      sourceIds: material.map((source) => source.id),
    },
    invalidOutput: {
      code: 'INVALID_RESEARCH_OUTPUT',
      message: 'The AI response did not match the research brief format. Try again.',
    },
  })
  if (
    parsed.whatHappened.some((item) => item.kind !== 'reported_fact') ||
    parsed.whyItMatters.some((item) => item.kind === 'reported_fact')
  )
    throw Object.assign(
      new Error('The research brief misclassified a report or interpretation. Please retry.'),
      { status: 502, code: 'MISCLASSIFIED_RESEARCH_CLAIM' },
    )
  const valid = new Set(material.map((s) => s.id))
  const qualityIds = parsed.sourceQuality.map((q) => q.sourceId)
  if (
    qualityIds.length !== material.length ||
    new Set(qualityIds).size !== material.length ||
    qualityIds.some((id) => !valid.has(id))
  )
    throw Object.assign(
      new Error('The AI response did not classify all source relevance. Please retry.'),
      { status: 502, code: 'INVALID_SOURCE_QUALITY' },
    )
  if (
    !parsed.summarySourceIds.length ||
    !parsed.recommendedAngle.sourceIds.length ||
    [...parsed.summarySourceIds, ...parsed.recommendedAngle.sourceIds].some((id) => !valid.has(id))
  )
    throw Object.assign(
      new Error(
        'The AI response left the summary or recommended angle without valid source support. Please retry.',
      ),
      { status: 502, code: 'UNSUPPORTED_RESEARCH_SUMMARY' },
    )
  const irrelevant = parsed.sourceQuality.filter((q) => !q.relevant)
  if (irrelevant.length)
    throw Object.assign(
      new Error(
        `Some sources do not appear relevant to the same story: ${irrelevant.map((q) => `Source ${q.sourceId}: ${q.reason}`).join(' ')}`,
      ),
      { status: 422, code: 'IRRELEVANT_SOURCES' },
    )
  ensureEvidenceRequirements(parsed)
  const opportunities = [...parsed.opportunities.founders, ...parsed.opportunities.builders].filter(
    (item) => typeof item !== 'string',
  )
  for (const arr of [
    parsed.whatHappened,
    parsed.whyItMatters,
    parsed.keyDevelopments,
    parsed.evidence,
    parsed.factsVsAnalysis,
    parsed.angles,
    parsed.comparison.commonFindings,
    parsed.comparison.uniqueInformation,
    parsed.comparison.contradictions,
    opportunities,
  ])
    for (const item of arr) {
      if (typeof item === 'string') continue
      const refs = item.sourceIds || []
      if (refs.some((id) => !valid.has(id)))
        throw Object.assign(
          new Error('The AI response referenced a source that was not supplied. Try again.'),
          { status: 502, code: 'INVALID_SOURCE_REFERENCE' },
        )
      const unsupportedEvidence =
        arr === parsed.evidence && /unsupported/i.test(item.classification || '')
      if (
        unsupportedEvidence &&
        !/(additional evidence|requires?|needs?)/i.test(item.classification)
      )
        throw Object.assign(
          new Error('An unsupported claim must identify what additional evidence is needed.'),
          { status: 502, code: 'MISSING_EVIDENCE_REQUIREMENT' },
        )
      const citedClaimArray =
        arr === parsed.whatHappened ||
        arr === parsed.whyItMatters ||
        arr === parsed.keyDevelopments ||
        arr === parsed.evidence ||
        arr === parsed.factsVsAnalysis ||
        arr === parsed.angles ||
        arr === parsed.comparison.commonFindings ||
        arr === parsed.comparison.uniqueInformation ||
        arr === parsed.comparison.contradictions
      const requiresEvidence = citedClaimArray && !unsupportedEvidence
      if (requiresEvidence && !refs.length)
        throw Object.assign(
          new Error(
            'The AI response left an important claim without source support. Please retry.',
          ),
          { status: 502, code: 'UNSUPPORTED_RESEARCH_CLAIM' },
        )
    }
  if (!parsed.comparison.contradictions.length)
    parsed.comparison.contradictions.push({
      text: 'The supplied source set does not establish any contradictions.',
      sourceIds: material.map((s) => s.id),
    })
  if (material.length === 1) {
    const singleSourceNote =
      'Independent corroboration and source comparison are unavailable because only one source was provided.'
    parsed.comparison.missingInformation = [
      singleSourceNote,
      ...parsed.comparison.missingInformation.filter(
        (item) => !/independent corroboration|source comparison/i.test(item),
      ),
    ]
  }
  removeRepeatedSectionFindings(parsed)
  return {
    brief: parsed,
    sources: material.map(({ id, title, url, publishedAt }) => ({ id, title, url, publishedAt })),
  }
}
function analyzeMetrics(text) {
  const words = text.match(/\b[\w’'-]+\b/g) || []
  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || []
  const count = sentences.filter((s) => s.trim()).length
  const avg = count ? Math.round((words.length / count) * 10) / 10 : 0
  const long = sentences.filter((s) => (s.match(/\b[\w’'-]+\b/g) || []).length > 28)
  const passive = sentences.filter((s) =>
    /\b(am|is|are|was|were|be|been|being)\s+(?:\w+ed|\w+en)\b/i.test(s),
  )
  const filler =
    /\b(very|really|just|quite|actually|basically|in order to|it is important to note that|at the end of the day)\b/gi
  const fillers = [...text.matchAll(filler)]
  const jargonTerms = [
    'LLM',
    'RAG',
    'vector database',
    'inference',
    'fine-tuning',
    'API',
    'transformer',
    'agentic',
  ]
  const jargon = jargonTerms.filter(
    (term) =>
      new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text) &&
      !new RegExp(`(?:${term})[^.!?]{0,35}(?:is|means|refers to|, which)`, 'i').test(text),
  )
  const paras = text.split(/\n\s*\n/).filter((p) => p.trim())
  const difficult = paras.filter((p) => (p.match(/\b[\w’'-]+\b/g) || []).length > 120)
  const tokens = words.map((w) => w.toLowerCase().replace(/[^a-z]/g, '')).filter(Boolean)
  const repeated = []
  for (let i = 0; i < tokens.length - 3; i++) {
    const phrase = tokens.slice(i, i + 3).join(' ')
    if (
      phrase.length > 10 &&
      (
        text.toLowerCase().match(new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) ||
        []
      ).length > 1 &&
      !repeated.includes(phrase)
    )
      repeated.push(phrase)
  }
  return {
    wordCount: words.length,
    sentenceCount: count,
    averageWordsPerSentence: avg,
    readingTimeMinutes: Math.max(1, Math.ceil(words.length / 220)),
    readability: avg > 26 ? 'Dense' : avg > 19 ? 'Moderate' : 'Clear',
    longSentences: long.length,
    passiveSentences: passive.length,
    fillerMatches: fillers.length,
    jargonTerms: jargon,
    difficultParagraphs: difficult.length,
    repeatedPhrases: repeated.slice(0, 5),
  }
}
export async function analyzeWriting({ text }) {
  const metrics = analyzeMetrics(text)
  const ruleSignals = writingRuleSignals(text, metrics)
  const result = await askGemini({
    system: writingSystem,
    user: JSON.stringify({ draft: text, ruleSignals }),
    maxTokens: 4500,
    responseSchema: writingResponseSchema,
    validateResponse: (value) => writingResultFor(text).safeParse(value),
    invalidOutput: {
      code: 'INVALID_WRITING_OUTPUT',
      message: 'The AI response did not match the writing feedback format. Try again.',
    },
  })
  const issues = result.issues.filter(
    (issue) => text.includes(issue.excerpt) && issue.suggestion.trim() !== issue.excerpt.trim(),
  )
  const required = {
    long_sentence: ruleSignals.longSentences,
    passive_voice: ruleSignals.passiveVoice,
    filler_words: ruleSignals.filler,
    unexplained_jargon: ruleSignals.unexplainedJargon,
    repetitive_wording: ruleSignals.repeatedWording,
    difficult_paragraph: ruleSignals.difficultParagraphs,
  }
  const missing = Object.entries(required)
    .filter(
      ([category, signals]) =>
        signals.length && !issues.some((issue) => issue.category === category),
    )
    .map(([category]) => category)
  if (missing.length)
    throw Object.assign(
      new Error('Some detected writing checks did not receive actionable feedback. Please retry.'),
      { status: 502, code: 'MISSING_WRITING_CHECKS', details: missing },
    )
  return { metrics, analysis: { ...result, issues } }
}
export async function rewriteSentence(input) {
  const resultSchema = z
    .object({ suggestion: z.string(), rationale: z.string() })
    .superRefine((value, ctx) => {
      if (!sameValues(numericFacts(input.sentence), numericFacts(value.suggestion)))
        ctx.addIssue({
          code: 'custom',
          path: ['suggestion'],
          message:
            'Preserve every numerical finding, percentage, and denominator from the supplied sentence.',
        })
      if (!sameCitationMarkers(input.sentence, value.suggestion))
        ctx.addIssue({
          code: 'custom',
          path: ['suggestion'],
          message: 'Preserve the citation markers from the supplied sentence.',
        })
    })
  return askGemini({
    system: rewriteSystem,
    user: JSON.stringify(input),
    maxTokens: 800,
    responseSchema: rewriteResponseSchema,
    validateResponse: (value) => resultSchema.safeParse(value),
    invalidOutput: {
      code: 'INVALID_REWRITE_OUTPUT',
      message: 'The AI response did not match the rewrite format. Try again.',
    },
  })
}
export async function generateEditorial(input) {
  const responseSchema = editorialResultFor(input.brief)
  const sourceRefs = input.sources.map((s, i) => ({
    index: i + 1,
    title: s.title,
    url: s.url || '',
  }))
  const generate = (regenerationInstruction = '') =>
    askGemini({
      system: editorialSystem,
      user: JSON.stringify({
        audience: input.audience,
        brief: input.brief,
        sources: sourceRefs,
        ...(regenerationInstruction ? { regenerationInstruction } : {}),
      }),
      maxTokens: 3000,
      responseSchema: editorialResponseSchema,
      validateResponse: (value) => responseSchema.safeParse(value),
      invalidOutput: {
        code: 'INVALID_EDITORIAL_OUTPUT',
        message: 'The AI response did not match the editorial format. Try again.',
      },
    })
  let result = await generate()
  let words = result.draft.trim().split(/\s+/).filter(Boolean).length
  if (words < 300 || words > 500) {
    const lengthInstruction =
      words < 300
        ? `The previous draft was ${words} words, below the 300-word minimum.`
        : `The previous draft was ${words} words, above the 500-word maximum.`
    result = await generate(
      `${lengthInstruction} Regenerate it at 350-400 words. Keep the research-supported findings, correct statistics, qualifications, and citations. ${words > 500 ? 'Remove repetition and unnecessary detail without dropping important evidence.' : "Develop the supplied brief's supported context, implications, and practical takeaways in useful detail."} Do not invent facts or add filler. The draft body alone must be 300-500 words.`,
    )
    words = result.draft.trim().split(/\s+/).filter(Boolean).length
  }
  const refs = result.sourceReferences
  const validIndexes = new Set(sourceRefs.map((s) => s.index))
  if (
    refs.length !== sourceRefs.length ||
    new Set(refs.map((s) => s.index)).size !== refs.length ||
    refs.some(
      (s) =>
        !validIndexes.has(s.index) ||
        sourceRefs[s.index - 1].title !== s.title ||
        sourceRefs[s.index - 1].url !== s.url,
    ) ||
    [...result.draft.matchAll(/\[(\d+)\]/g)].some((m) => !validIndexes.has(Number(m[1])))
  )
    throw Object.assign(
      new Error('The editorial draft returned invalid source references. Please try again.'),
      { status: 502, code: 'INVALID_EDITORIAL_REFERENCES' },
    )
  if (words < 300 || words > 500)
    throw Object.assign(
      new Error(
        `The generated draft was ${words} words, outside the 300-500 word target. Please try again.`,
      ),
      { status: 502, code: 'EDITORIAL_LENGTH_INVALID' },
    )
  return { ...result, wordCount: words }
}
