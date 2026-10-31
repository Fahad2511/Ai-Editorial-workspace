import { ZodError } from 'zod'
import { AppError } from '../config/gemini.js'
export function notFound(req, res) {
  res.status(404).json({
    ok: false,
    error: { code: 'NOT_FOUND', message: `No endpoint exists at ${req.method} ${req.path}.` },
  })
}
export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error)
  if (error instanceof ZodError)
    return res.status(400).json({
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: error.issues[0]?.message || 'Request validation failed.',
        details: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
    })
  if (error instanceof AppError || (error.status && error.code))
    return res.status(error.status).json({
      ok: false,
      error: {
        code: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
      },
    })
  if (error instanceof SyntaxError && error.status === 400 && error.type === 'entity.parse.failed')
    return res.status(400).json({
      ok: false,
      error: { code: 'INVALID_JSON', message: 'Request body must contain valid JSON.' },
    })
  if (error.type === 'entity.too.large')
    return res.status(413).json({
      ok: false,
      error: { code: 'BODY_TOO_LARGE', message: 'Keep request bodies below 1 MB.' },
    })
  console.error('Request failed:', error.message)
  return res.status(500).json({
    ok: false,
    error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' },
  })
}
