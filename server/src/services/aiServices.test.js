import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import {
  analyzeResearch,
  analyzeWriting,
  generateEditorial,
  rewriteSentence,
} from './aiServices.js'
import { writingRuleSignals } from './writingRules.js'

const originalFetch = globalThis.fetch
const originalApiKey = process.env.GEMINI_API_KEY
const originalModel = process.env.GEMINI_MODEL
const originalInfo = console.info
const originalWarn = console.warn

afterEach(() => {
  globalThis.fetch = originalFetch
  console.info = originalInfo
  console.warn = originalWarn
  if (originalApiKey === undefined) delete process.env.GEMINI_API_KEY
  else process.env.GEMINI_API_KEY = originalApiKey
  if (originalModel === undefined) delete process.env.GEMINI_MODEL
  else process.env.GEMINI_MODEL = originalModel
})

function researchBrief(overrides = {}) {
  return {
    executiveSummary: 'The source describes a reported development and its stated context.',
    summarySourceIds: ['1'],
    sourceQuality: [{ sourceId: '1', relevant: true, reason: 'The source covers this story.' }],
    whatHappened: [
      { text: 'The source reports the development.', sourceIds: ['1'], kind: 'reported_fact' },
    ],
    whyItMatters: [
      { text: 'The development may affect readers.', sourceIds: ['1'], kind: 'analysis' },
    ],
    whoShouldCare: ['Readers following this development'],
    keyDevelopments: [],
    evidence: [
      {
        claim: 'The article reports the development.',
        sourceIds: ['1'],
        classification: 'Source-reported; independent confirmation is unavailable.',
      },
    ],
    factsVsAnalysis: [
      { text: 'The development was reported.', kind: 'reported_fact', sourceIds: ['1'] },
    ],
    opportunities: {
      founders: [{ text: 'Consider the implications for founders.', sourceIds: ['1'] }],
      builders: [{ text: 'Consider the implications for builders.', sourceIds: ['1'] }],
    },
    angles: ['Alpha', 'Beta', 'Gamma'].map((name) => ({
      title: `Editorial angle ${name}`,
      description: `A distinct supported perspective: ${name}.`,
      whyItWorks: `This angle focuses on a different source detail.`,
      sourceIds: ['1'],
    })),
    recommendedAngle: {
      title: 'The reported development and its implications',
      reason: 'It is grounded in the supplied report.',
      sourceIds: ['1'],
    },
    comparison: {
      commonFindings: [],
      uniqueInformation: [],
      contradictions: [{ text: 'No contradiction is established.', sourceIds: ['1'] }],
      missingInformation: [],
    },
    questions: ['What further reporting would clarify the impact?'],
    ...overrides,
  }
}

function configureResearchResponses(outputs) {
  process.env.GEMINI_API_KEY = 'test-key'
  process.env.GEMINI_MODEL = 'test-model'
  const requests = []
  requests.logs = []
  globalThis.fetch = async (_url, options) => {
    const request = JSON.parse(options.body)
    requests.push(request)
    const output = outputs.shift()
    const text = typeof output === 'string' ? output : JSON.stringify(output)
    return new Response(
      JSON.stringify({
        candidates: [{ finishReason: 'STOP', content: { parts: [{ text }] } }],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  }
  console.info = (message, details) => requests.logs.push({ message, details })
  console.warn = () => {}
  return requests
}

const researchInput = {
  question: 'What does this report mean for readers?',
  sources: [
    {
      title: 'Synthetic source fixture',
      url: 'https://example.com/report',
      content:
        'Synthetic test material only. This source fixture contains enough text to pass request validation without making claims about real events.',
      publishedAt: '',
    },
  ],
}

const anthropicSource = {
  title: 'Agents and judgment calls',
  url: 'https://www.anthropic.com/research/agents-judgment-calls',
  content: [
    'Anthropic recruited 61 professional analysts for a randomized study; 11 chose not to use the AI agent, leaving 50 agent users for the main analysis.',
    'Across four analytical decisions, analysts followed the agent lean 86% of the time.',
    'In 38 cases where analysts had stated an initial preference, they switched 60% of the time when the agent disagreed and 6% when it agreed.',
    'Six of the 11 non-agent participants (55%) made serious methodological errors, compared with three of the 50 agent users (6%).',
    'The groups were not directly comparable because participants who did not use the agent were less experienced on average.',
    'Anthropic cautions that these are reported study findings and that the group differences do not establish that using the agent caused the outcomes.',
  ].join(' '),
}

function anthropicBrief(overrides = {}) {
  return researchBrief({
    executiveSummary:
      'Anthropic reports that analysts often followed an AI agent’s preferred option, while cautioning that group comparisons do not establish causation.',
    whatHappened: [
      {
        text: 'The study recruited 61 analysts; 11 chose not to use the agent, leaving 50 who used it.',
        sourceIds: ['1'],
        kind: 'reported_fact',
      },
      {
        text: 'Across four analytical decisions, analysts followed the agent lean 86% of the time.',
        sourceIds: ['1'],
        kind: 'reported_fact',
      },
      {
        text: 'In 38 cases, analysts switched 60% of the time when the agent disagreed, versus 6% when it agreed.',
        sourceIds: ['1'],
        kind: 'reported_fact',
      },
      {
        text: 'Six of 11 non-agent participants (55%) made serious errors, compared with three of 50 agent users (6%).',
        sourceIds: ['1'],
        kind: 'reported_fact',
      },
    ],
    evidence: [
      {
        claim:
          'The article reports different error rates for participants who did not use the agent and those who did.',
        sourceIds: ['1'],
        classification: 'Source-reported study finding; not independently verified.',
      },
    ],
    ...overrides,
  })
}

test('accepts a complete research response with valid angles and citations', async () => {
  const requests = configureResearchResponses([researchBrief()])

  const result = await analyzeResearch(researchInput)

  assert.equal(result.brief.angles.length, 3)
  assert.equal(result.sources[0].url, researchInput.sources[0].url)
  assert.deepEqual(result.brief.summarySourceIds, ['1'])
  assert.deepEqual(requests[0].generationConfig.responseSchema.properties.angles.minItems, 3)
  assert.deepEqual(requests.logs[0].details, {
    operation: 'research',
    model: 'test-model',
    sourceCount: 1,
    sourceIds: ['1'],
    attempt: 1,
    httpStatus: 200,
    finishReason: 'STOP',
    responseTextEmpty: false,
    jsonParseSuccess: true,
    schemaValidationPaths: [],
  })
})

test('retries a response with missing required fields and explains the issue', async () => {
  const incomplete = researchBrief()
  delete incomplete.questions
  const requests = configureResearchResponses([incomplete, researchBrief()])

  const result = await analyzeResearch(researchInput)

  assert.equal(result.brief.questions.length, 1)
  assert.equal(requests.length, 2)
  assert.match(requests[1].systemInstruction.parts[0].text, /questions: Required/)
  assert.equal(requests[0].contents[0].parts[0].text, requests[1].contents[0].parts[0].text)
})

test('retries a response with an invalid field type', async () => {
  const invalid = researchBrief({ executiveSummary: ['not a string'] })
  const requests = configureResearchResponses([invalid, researchBrief()])

  const result = await analyzeResearch(researchInput)

  assert.equal(typeof result.brief.executiveSummary, 'string')
  assert.equal(requests.length, 2)
  assert.match(requests[1].systemInstruction.parts[0].text, /executiveSummary/)
})

test('retries a response that has fewer than three editorial angles', async () => {
  const invalid = researchBrief({ angles: researchBrief().angles.slice(0, 2) })
  const requests = configureResearchResponses([invalid, researchBrief()])

  const result = await analyzeResearch(researchInput)

  assert.equal(result.brief.angles.length, 3)
  assert.equal(requests.length, 2)
  assert.match(requests[1].systemInstruction.parts[0].text, /angles/)
  assert.deepEqual(requests.logs[0].details.schemaValidationPaths, ['angles'])
})

test('rejects source references that do not identify a supplied source', async () => {
  const invalid = researchBrief({
    whyItMatters: [{ text: 'Unsupported source ID.', sourceIds: ['99'], kind: 'analysis' }],
  })
  configureResearchResponses([invalid])

  await assert.rejects(
    analyzeResearch(researchInput),
    (error) => error.code === 'INVALID_SOURCE_REFERENCE',
  )
})

test('retries an empty Gemini response once', async () => {
  const requests = configureResearchResponses(['', researchBrief()])

  const result = await analyzeResearch(researchInput)

  assert.equal(result.brief.angles.length, 3)
  assert.equal(requests.length, 2)
})

test('retries truncated JSON once', async () => {
  const requests = configureResearchResponses(['{"executiveSummary":"truncated"', researchBrief()])

  const result = await analyzeResearch(researchInput)

  assert.equal(result.brief.angles.length, 3)
  assert.equal(requests.length, 2)
})

test('reports required-field paths after both research responses fail validation', async () => {
  const incomplete = researchBrief()
  delete incomplete.questions
  const requests = configureResearchResponses([incomplete, incomplete])

  await assert.rejects(analyzeResearch(researchInput), (error) => {
    assert.equal(error.code, 'INVALID_RESEARCH_OUTPUT')
    assert.equal(error.details.failureType, 'schema_mismatch')
    assert.equal(error.details.attempts, 2)
    assert.equal(error.details.validationIssues[0].path, 'questions')
    return true
  })
  assert.equal(requests.length, 2)
})

test('preserves Anthropic study groups, denominators, and reported-finding attribution', async () => {
  const requests = configureResearchResponses([anthropicBrief()])
  const result = await analyzeResearch({
    question: 'How did agent use relate to the analysts’ decisions and errors?',
    sources: [anthropicSource],
  })
  const system = requests[0].systemInstruction.parts[0].text

  assert.match(system, /agent-assisted group and the comparison\/non-agent group/)
  assert.match(system, /sample size, numerator, denominator/)
  assert.match(system, /explicitly name the group beside every percentage/)
  assert.match(system, /not independent verification/)
  assert.match(result.brief.whatHappened[0].text, /11 chose not to use.*50 who used it/)
  assert.match(result.brief.whatHappened[2].text, /38 cases.*60%.*6%/)
  assert.match(result.brief.whatHappened[3].text, /six of 11.*three of 50/i)
})

test('matches numeric counts written as words in the cited source', async () => {
  const response = anthropicBrief({
    whatHappened: [
      {
        text: '6 of the 11 non-agent participants (55%) made errors, compared with 3 of 50 agent users (6%).',
        sourceIds: ['1'],
        kind: 'reported_fact',
      },
    ],
  })
  configureResearchResponses([response])

  const result = await analyzeResearch({
    question: 'Compare the reported error rates by group.',
    sources: [anthropicSource],
  })

  assert.match(result.brief.whatHappened[0].text, /^6 of the 11.*3 of 50/)
})

test('rejects a research percentage that is absent from its cited Anthropic source', async () => {
  const invalid = anthropicBrief({
    whyItMatters: [
      {
        text: 'The agent influenced analysts in 85% of decisions.',
        sourceIds: ['1'],
        kind: 'analysis',
      },
    ],
  })
  const requests = configureResearchResponses([invalid, invalid])

  await assert.rejects(
    analyzeResearch({ question: 'Check the reported results.', sources: [anthropicSource] }),
    (error) => {
      assert.equal(error.code, 'INVALID_RESEARCH_OUTPUT')
      assert.ok(error.details.validationIssues.some((issue) => issue.path === 'whyItMatters.0'))
      assert.ok(error.details.validationIssues.some((issue) => issue.message.includes('85%')))
      return true
    },
  )
  assert.equal(requests.length, 2)
})

test('regenerates one short editorial draft and preserves its source references', async () => {
  process.env.GEMINI_API_KEY = 'test-key'
  process.env.GEMINI_MODEL = 'test-model'
  const drafts = [
    'This synthetic draft is intentionally short. '.repeat(25).trim(),
    Array.from({ length: 310 }, () => 'fixture').join(' '),
  ]
  const requests = []
  globalThis.fetch = async (_url, options) => {
    const request = JSON.parse(options.body)
    requests.push(request)
    const user = JSON.parse(request.contents[0].parts[0].text)
    const response = {
      headline: 'A synthetic editorial test',
      draft: drafts.shift(),
      sourceReferences: [{ index: 1, title: user.sources[0].title, url: user.sources[0].url }],
    }
    return new Response(
      JSON.stringify({
        candidates: [{ content: { parts: [{ text: JSON.stringify(response) }] } }],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const result = await generateEditorial({
    brief: { executiveSummary: 'Synthetic unit-test material.' },
    sources: [{ title: 'Synthetic source fixture', url: 'https://example.com/source' }],
  })

  assert.equal(requests.length, 2)
  assert.match(
    JSON.parse(requests[1].contents[0].parts[0].text).regenerationInstruction,
    /below the 300-word minimum/,
  )
  assert.equal(result.wordCount, 310)
  assert.deepEqual(result.sourceReferences, [
    { index: 1, title: 'Synthetic source fixture', url: 'https://example.com/source' },
  ])
})

test('regenerates one overlong editorial draft without dropping its source reference', async () => {
  const requests = configureResearchResponses([
    {
      headline: 'A synthetic editorial test',
      draft: Array.from({ length: 520 }, () => 'fixture').join(' '),
      sourceReferences: [{ index: 1, title: 'Anthropic study', url: anthropicSource.url }],
    },
    {
      headline: 'A concise synthetic editorial test',
      draft: Array.from({ length: 350 }, () => 'fixture').join(' '),
      sourceReferences: [{ index: 1, title: 'Anthropic study', url: anthropicSource.url }],
    },
  ])
  const result = await generateEditorial({
    brief: { executiveSummary: 'Synthetic unit-test material.' },
    sources: [{ title: 'Anthropic study', url: anthropicSource.url }],
  })

  assert.equal(requests.length, 2)
  assert.match(
    JSON.parse(requests[1].contents[0].parts[0].text).regenerationInstruction,
    /above the 500-word maximum/,
  )
  assert.equal(result.wordCount, 350)
  assert.equal(result.sourceReferences[0].url, anthropicSource.url)
})

test('editorial retry identifies unsupported numerical findings without weakening validation', async () => {
  const requests = configureResearchResponses([
    {
      headline: 'A synthetic editorial test',
      draft: `The study achieved 999% success. ${Array.from({ length: 330 }, () => 'fixture').join(' ')}`,
      sourceReferences: [{ index: 1, title: 'Anthropic study', url: anthropicSource.url }],
    },
    {
      headline: 'A measured editorial test',
      draft: Array.from({ length: 330 }, () => 'fixture').join(' '),
      sourceReferences: [{ index: 1, title: 'Anthropic study', url: anthropicSource.url }],
    },
  ])
  const result = await generateEditorial({
    brief: { executiveSummary: 'The report describes a development.' },
    sources: [{ title: 'Anthropic study', url: anthropicSource.url }],
  })

  assert.equal(requests.length, 2)
  assert.match(requests[1].systemInstruction.parts[0].text, /999%/)
  assert.equal(result.wordCount, 330)
})

test('retries editorial output with a duplicated percentage and sensational headline', async () => {
  const requests = configureResearchResponses([
    {
      headline: 'The Silent Takeover: Shocking proof from the study',
      draft:
        'Analysts followed the agent in 86% in 86% of instances. ' +
        'The study asks how experts use an agent to make judgments when evidence leaves room for reasonable choices. '.repeat(
          19,
        ),
      sourceReferences: [{ index: 1, title: 'Anthropic study', url: anthropicSource.url }],
    },
    {
      headline: 'What the agent-influence study found',
      draft:
        'Analysts followed the agent in 86% of instances. The authors caution that this study does not establish causation. ' +
        'The study asks how experts use an agent to make judgments when evidence leaves room for reasonable choices. '.repeat(
          19,
        ),
      sourceReferences: [{ index: 1, title: 'Anthropic study', url: anthropicSource.url }],
    },
  ])
  const result = await generateEditorial({
    brief: {
      executiveSummary:
        'The study reports that analysts followed the agent lean in 86% of decisions.',
    },
    sources: [{ title: 'Anthropic study', url: anthropicSource.url }],
  })

  assert.equal(requests.length, 2)
  assert.match(requests[1].systemInstruction.parts[0].text, /duplicated percentage wording/)
  assert.match(requests[1].systemInstruction.parts[0].text, /measured headline/)
  assert.doesNotMatch(result.draft, /86%\s+in\s+86%/)
  assert.doesNotMatch(result.headline, /takeover|shocking|proof/i)
  assert.match(result.draft, /86%/)
})

test('writing feedback retries denominator and citation changes while detecting repeated sentences', async () => {
  const sentence =
    'In 38 cases, analysts switched 60% of the time when the agent disagreed [1], compared with 6% when it agreed [2].'
  const draft = `${sentence} ${sentence}`
  const requests = configureResearchResponses([
    {
      issues: [
        {
          category: 'repetitive_wording',
          excerpt: sentence,
          explanation: 'This sentence is repeated and changes the case denominator.',
          suggestion:
            'Among 50 cases, analysts switched 60% of the time when the agent disagreed, compared with 6% when it agreed.',
          severity: 'high',
        },
      ],
      overallNote: 'Check the denominators and citations.',
    },
    {
      issues: [
        {
          category: 'repetitive_wording',
          excerpt: sentence,
          explanation: 'This sentence is repeated.',
          suggestion:
            'Among the 38 cases, analysts switched 60% of the time when the agent disagreed [1], versus 6% when it agreed [2].',
          severity: 'medium',
        },
      ],
      overallNote: 'The repeated sentence has been removed without changing its findings.',
    },
  ])
  const signals = writingRuleSignals(draft, { repeatedPhrases: [], jargonTerms: [] })
  const statisticSignals = writingRuleSignals('The figure was 86% in 86% of instances.', {
    repeatedPhrases: [],
    jargonTerms: [],
  })

  assert.ok(signals.repeatedWording.some((signal) => signal.startsWith('Repeated sentence:')))
  assert.ok(
    statisticSignals.repeatedWording.some((signal) => signal === 'Redundant percentage: 86%'),
  )
  const result = await analyzeWriting({ text: draft })

  assert.equal(requests.length, 2)
  assert.match(
    requests[1].systemInstruction.parts[0].text,
    /numerical finding, percentage, and denominator/,
  )
  assert.match(result.analysis.issues[0].suggestion, /38 cases/)
  assert.match(result.analysis.issues[0].suggestion, /\[1\]/)
  assert.match(result.analysis.issues[0].suggestion, /\[2\]/)
})

test('rewrite retries numerical changes and keeps valid statistics and citations unchanged', async () => {
  const sentence =
    'In 38 cases, analysts switched 60% of the time when the agent disagreed [1], versus 6% when it agreed [2].'
  const requests = configureResearchResponses([
    {
      suggestion:
        'In 50 cases, analysts switched 65% upon disagreement [1], versus 6% when it agreed [2].',
      rationale: 'Shortened the sentence.',
    },
    {
      suggestion:
        'When the agent disagreed, analysts switched in 60% of the 38 cases [1], versus 6% when it agreed [2].',
      rationale: 'Clarified the condition while preserving every reported value and citation.',
    },
  ])

  const result = await rewriteSentence({
    sentence,
    intent: 'Make the statistical comparison clearer.',
  })

  assert.equal(requests.length, 2)
  assert.match(requests[1].systemInstruction.parts[0].text, /Preserve every numerical finding/)
  assert.match(result.suggestion, /60%/)
  assert.match(result.suggestion, /38 cases/)
  assert.match(result.suggestion, /6%/)
  assert.match(result.suggestion, /\[1\]/)
  assert.match(result.suggestion, /\[2\]/)
})
