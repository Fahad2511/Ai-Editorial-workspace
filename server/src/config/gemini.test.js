import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { AppError, askGemini } from './gemini.js'

const originalFetch = globalThis.fetch
const originalApiKey = process.env.GEMINI_API_KEY
const originalModel = process.env.GEMINI_MODEL

afterEach(() => {
  globalThis.fetch = originalFetch
  if (originalApiKey === undefined) delete process.env.GEMINI_API_KEY
  else process.env.GEMINI_API_KEY = originalApiKey
  if (originalModel === undefined) delete process.env.GEMINI_MODEL
  else process.env.GEMINI_MODEL = originalModel
})

function configureGemini(responses) {
  process.env.GEMINI_API_KEY = 'test-key'
  process.env.GEMINI_MODEL = 'test-model'
  const requests = []
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options: JSON.parse(options.body) })
    const text = responses.shift()
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  return requests
}

test('parses fenced JSON and sends the structured response schema', async () => {
  const requests = configureGemini(['```json\n{"headline":"A test"}\n```'])
  const responseSchema = { type: 'OBJECT', properties: { headline: { type: 'STRING' } } }
  const validateResponse = (value) => ({
    success: typeof value.headline === 'string',
    data: value,
    error: { issues: [] },
  })

  const result = await askGemini({
    system: 'Return a headline.',
    user: 'Test',
    responseSchema,
    validateResponse,
  })

  assert.deepEqual(result, { headline: 'A test' })
  assert.equal(requests.length, 1)
  assert.equal(requests[0].options.generationConfig.responseMimeType, 'application/json')
  assert.deepEqual(requests[0].options.generationConfig.responseSchema, responseSchema)
})

test('retries malformed JSON once and accepts a valid second response', async () => {
  const requests = configureGemini(['not valid JSON', '{"ok":true}'])

  const result = await askGemini({ system: 'Return JSON.', user: 'Test' })

  assert.deepEqual(result, { ok: true })
  assert.equal(requests.length, 2)
  assert.match(requests[1].options.systemInstruction.parts[0].text, /previous response/)
})

test('retries schema-invalid JSON once and returns validated data', async () => {
  const requests = configureGemini(['{"count":"wrong"}', '{"count":2}'])
  const validateResponse = (value) => ({
    success: Number.isInteger(value.count),
    data: value,
    error: { issues: [{ path: ['count'], message: 'Expected integer' }] },
  })

  const result = await askGemini({
    system: 'Return a count.',
    user: 'Test',
    validateResponse,
    invalidOutput: { code: 'INVALID_TEST_OUTPUT', message: 'Invalid test output.' },
  })

  assert.deepEqual(result, { count: 2 })
  assert.equal(requests.length, 2)
})

test('does not make more than one retry when JSON remains malformed', async () => {
  const requests = configureGemini(['still invalid A', 'still invalid B'])
  const originalWarn = console.warn
  let diagnostics
  console.warn = (_message, details) => {
    diagnostics = details
  }

  try {
    await assert.rejects(
      askGemini({ system: 'Return JSON.', user: 'Test' }),
      (error) => error instanceof AppError && error.code === 'AI_INVALID_JSON',
    )
  } finally {
    console.warn = originalWarn
  }
  assert.equal(requests.length, 2)
  assert.equal(diagnostics.attempts, 2)
  assert.equal(JSON.stringify(diagnostics).includes('still invalid'), false)
})

test('preserves the empty-response error contract after one retry', async () => {
  const requests = configureGemini(['', ''])

  await assert.rejects(
    askGemini({ system: 'Return JSON.', user: 'Test' }),
    (error) => error instanceof AppError && error.code === 'AI_EMPTY_RESPONSE',
  )
  assert.equal(requests.length, 2)
})
