const countWords = (value) => (value.match(/\b[\w’'-]+\b/g) || []).length
const sentencePattern = /[^.!?]+[.!?]+|[^.!?]+$/g
export function writingRuleSignals(text, metrics) {
  const sentences = text.match(sentencePattern) || []
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim())
  const short = (value) => value.trim().slice(0, 3900)
  const sentenceCounts = new Map()
  for (const sentence of sentences) {
    const normalized = sentence
      .replace(/\[\d+\]/g, '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}%]+/gu, ' ')
      .trim()
    if (normalized) sentenceCounts.set(normalized, (sentenceCounts.get(normalized) || 0) + 1)
  }
  const repeatedSentences = [...sentenceCounts]
    .filter(([, count]) => count > 1)
    .map(([sentence]) => `Repeated sentence: ${sentence}`)
    .slice(0, 3)
  const redundantStatistics = [
    ...text.matchAll(/\b(\d+(?:\.\d+)?)\s*%\s+(?:in|of)\s+\1\s*%\s+of\b/gi),
  ]
    .map(([, percentage]) => `Redundant percentage: ${percentage}%`)
    .slice(0, 3)
  const fillerPattern =
    /\b(very|really|just|quite|actually|basically|in order to|it is important to note that|at the end of the day)\b/i
  const passivePattern = /\b(am|is|are|was|were|be|been|being)\s+(?:\w+ed|\w+en)\b/i
  return {
    longSentences: sentences
      .filter((s) => countWords(s) > 28)
      .slice(0, 3)
      .map(short),
    passiveVoice: sentences
      .filter((s) => passivePattern.test(s))
      .slice(0, 3)
      .map(short),
    filler: sentences
      .filter((s) => fillerPattern.test(s))
      .slice(0, 3)
      .map(short),
    unexplainedJargon: metrics.jargonTerms
      .map((term) => short(sentences.find((s) => new RegExp(term, 'i').test(s)) || ''))
      .filter(Boolean)
      .slice(0, 6),
    repeatedWording: [
      ...new Set([
        ...redundantStatistics,
        ...repeatedSentences,
        ...metrics.repeatedPhrases.slice(0, 4),
      ]),
    ].slice(0, 8),
    difficultParagraphs: paragraphs
      .filter((p) => countWords(p) > 120)
      .slice(0, 2)
      .map(short),
  }
}
