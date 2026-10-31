import 'dotenv/config'

const API_URL = 'https://generativelanguage.googleapis.com/v1beta/models'
const REQUEST_TIMEOUT_MS = 120_000
const MAX_OUTPUT_ATTEMPTS = 2

export class AppError extends Error {
  constructor(status, message, code = 'REQUEST_FAILED', details) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
}

function parseJsonResponse(content) {
  const trimmed = content.trim()
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  return JSON.parse(fenced ? fenced[1] : trimmed)
}

// Keep Gemini credentials on the server and normalize provider failures for the API layer.
export async function askGemini({
  system,
  user,
  temperature = 0.2,
  maxTokens = 3500,
  responseSchema,
  validateResponse,
  invalidOutput,
  diagnosticContext = {},
}) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey)
    throw new AppError(
      503,
      'Gemini is not configured. Add GEMINI_API_KEY to server/.env.',
      'AI_NOT_CONFIGURED',
    )

  const model = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite'
  let failureType = 'invalid_json'
  let validationIssues = []
  let responseLength = 0
  let finishReason = null
  const diagnosticBase = {
    operation: diagnosticContext.operation || 'generation',
    model,
    sourceCount: diagnosticContext.sourceCount ?? null,
    sourceIds: diagnosticContext.sourceIds || [],
  }

  for (let attempt = 0; attempt < MAX_OUTPUT_ATTEMPTS; attempt++) {
    const retrySystem =
      attempt === 0
        ? system
        : [
            system,
            'Your previous response did not pass validation. Regenerate the complete response from the original request, including every required field and the correct type for each field. Return only one valid JSON object, with no prose or Markdown fences.',
            validationIssues.length
              ? `Validation errors to correct: ${validationIssues.map((issue) => `${issue.path || '(root)'}: ${issue.message}`).join('; ')}.`
              : 'The previous output was not a complete valid JSON object. Ensure the entire response is valid JSON.',
          ].join('\n\n')
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    let response
    try {
      response = await fetch(`${API_URL}/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: retrySystem }] },
          contents: [{ role: 'user', parts: [{ text: user }] }],
          generationConfig: {
            temperature,
            maxOutputTokens: maxTokens,
            responseMimeType: 'application/json',
            ...(responseSchema ? { responseSchema } : {}),
          },
        }),
      })
    } catch (error) {
      const cause = error?.cause
      const nestedErrors = Array.isArray(cause?.errors)
        ? cause.errors.map((item) => ({
            name: item?.name,
            message: item?.message,
            code: item?.code,
          }))
        : undefined
      const timedOut = error?.name === 'AbortError' || controller.signal.aborted
      console.error('[Gemini] Request failed', {
        ...diagnosticBase,
        attempt: attempt + 1,
        httpStatus: null,
        finishReason: null,
        responseTextEmpty: null,
        jsonParseSuccess: null,
        schemaValidationPaths: [],
        errorName: error?.name || 'Error',
        errorMessage: error?.message || 'Unknown network error',
        errorCode: error?.code || cause?.code || null,
        causeName: cause?.name || null,
        causeMessage: cause?.message || null,
        causeCode: cause?.code || null,
        ...(nestedErrors ? { nestedErrors } : {}),
        requestTimeoutMs: REQUEST_TIMEOUT_MS,
        timedOut,
      })
      if (timedOut)
        throw new AppError(
          504,
          'The Gemini request timed out. Try again with less source material.',
          'AI_TIMEOUT',
        )
      throw new AppError(
        502,
        'Could not reach the Gemini API. Check the backend network connection and try again.',
        'AI_UNAVAILABLE',
      )
    } finally {
      clearTimeout(timeout)
    }

    const payload = await response.json().catch(() => null)
    finishReason = payload?.candidates?.[0]?.finishReason || null
    if (!response.ok) {
      const status = response.status === 429 ? 429 : 502
      const code =
        response.status === 429
          ? 'AI_RATE_LIMITED'
          : response.status === 401 || response.status === 403
            ? 'AI_AUTH_ERROR'
            : 'AI_ERROR'
      const providerMessage = payload?.error?.message || 'No provider error message'
      console.error('[Gemini] API returned an error', {
        ...diagnosticBase,
        attempt: attempt + 1,
        finishReason,
        responseTextEmpty: null,
        jsonParseSuccess: null,
        schemaValidationPaths: [],
        errorName: 'GeminiHttpError',
        errorMessage: providerMessage.slice(0, 500),
        errorCode: code,
        httpStatus: response.status,
        requestTimeoutMs: REQUEST_TIMEOUT_MS,
        timedOut: false,
      })
      const message =
        response.status === 429
          ? 'The Gemini API is rate limited. Please wait a moment and try again.'
          : code === 'AI_AUTH_ERROR'
            ? 'Gemini rejected the API key or the key does not have access to this model. Check GEMINI_API_KEY and GEMINI_MODEL.'
            : providerMessage !== 'No provider error message'
              ? providerMessage
              : 'The Gemini API could not complete this request.'
      throw new AppError(status, message, code)
    }

    const content = payload?.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || '')
      .join('')
    responseLength = content?.length || 0
    const attemptDiagnostics = {
      ...diagnosticBase,
      attempt: attempt + 1,
      httpStatus: response.status,
      finishReason,
      responseTextEmpty: !content,
      jsonParseSuccess: null,
      schemaValidationPaths: [],
    }
    let value
    if (!content) {
      failureType = 'empty_response'
      validationIssues = []
      console.info('[Gemini] Generation attempt', attemptDiagnostics)
      continue
    }
    try {
      value = parseJsonResponse(content)
      attemptDiagnostics.jsonParseSuccess = true
    } catch {
      failureType = 'invalid_json'
      validationIssues = []
      attemptDiagnostics.jsonParseSuccess = false
      console.info('[Gemini] Generation attempt', attemptDiagnostics)
      continue
    }

    if (validateResponse) {
      const validation = validateResponse(value)
      if (!validation.success) {
        failureType = 'schema_mismatch'
        validationIssues = validation.error.issues
          .slice(0, 20)
          .map((issue) => ({ path: issue.path.join('.'), message: issue.message }))
        attemptDiagnostics.schemaValidationPaths = validationIssues.map((issue) => issue.path)
        console.info('[Gemini] Generation attempt', attemptDiagnostics)
        continue
      }
      console.info('[Gemini] Generation attempt', attemptDiagnostics)
      return validation.data
    }
    console.info('[Gemini] Generation attempt', attemptDiagnostics)
    return value
  }

  console.warn('[Gemini] Generated output failed validation', {
    ...diagnosticBase,
    attempts: MAX_OUTPUT_ATTEMPTS,
    failureType,
    finishReason,
    responseTextEmpty: responseLength === 0,
    responseLength,
    issuePaths: validationIssues.map((issue) => issue.path),
  })
  const failureMessage =
    invalidOutput?.message ||
    (failureType === 'empty_response'
      ? 'Gemini returned an empty response. Please try again.'
      : 'Gemini returned an unreadable response. Please retry.')
  throw new AppError(
    502,
    failureMessage,
    invalidOutput?.code ||
      (failureType === 'empty_response'
        ? 'AI_EMPTY_RESPONSE'
        : failureType === 'invalid_json'
          ? 'AI_INVALID_JSON'
          : 'AI_INVALID_OUTPUT'),
    {
      failureType,
      attempts: MAX_OUTPUT_ATTEMPTS,
      finishReason,
      validationIssues,
    },
  )
}
