import { extractArticle } from '../services/articleExtractor.js'
import {
  analyzeResearch,
  analyzeWriting,
  rewriteSentence,
  generateEditorial,
} from '../services/aiServices.js'
import {
  extractSchema,
  researchSchema,
  writingSchema,
  rewriteSchema,
  editorialSchema,
} from '../utils/validators.js'
const handle = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)
export const extract = handle(async (req, res) => {
  const input = extractSchema.parse(req.body)
  res.json({ ok: true, data: await extractArticle(input.url) })
})
export const research = handle(async (req, res) => {
  const input = researchSchema.parse(req.body)
  res.json({ ok: true, data: await analyzeResearch(input) })
})
export const writing = handle(async (req, res) => {
  const input = writingSchema.parse(req.body)
  res.json({ ok: true, data: await analyzeWriting(input) })
})
export const rewrite = handle(async (req, res) => {
  const input = rewriteSchema.parse(req.body)
  res.json({ ok: true, data: await rewriteSentence(input) })
})
export const editorial = handle(async (req, res) => {
  const input = editorialSchema.parse(req.body)
  res.json({ ok: true, data: await generateEditorial(input) })
})
