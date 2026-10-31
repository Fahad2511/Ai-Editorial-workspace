import { z } from 'zod'

const source = z
  .object({
    title: z.string().trim().max(240).optional().default(''),
    url: z.string().trim().url().max(2048).optional().or(z.literal('')),
    content: z.string().trim().max(60_000).optional().default(''),
    publishedAt: z.string().trim().max(120).optional().default(''),
  })
  .refine((value) => value.url || value.content, {
    message: 'Add a source URL or paste source text.',
  })

export const extractSchema = z.object({ url: z.string().trim().url().max(2048) })
export const researchSchema = z
  .object({
    sources: z
      .array(source)
      .min(1, 'Add at least one source before analyzing.')
      .max(12, 'A maximum of 12 sources is supported.'),
    question: z.string().trim().max(1000).optional().default(''),
  })
  .superRefine(({ sources }, ctx) => {
    const urls = sources
      .map((item) => item.url)
      .filter(Boolean)
      .map((item) => item.toLowerCase())
    if (new Set(urls).size !== urls.length)
      ctx.addIssue({
        code: 'custom',
        path: ['sources'],
        message: 'Remove duplicate source URLs before analyzing.',
      })
    sources.forEach((item, index) => {
      if (item.content.trim().length < 80)
        ctx.addIssue({
          code: 'custom',
          path: ['sources', index, 'content'],
          message:
            'Each source needs at least 80 characters of content. Extract the URL or paste source text.',
        })
    })
  })
export const writingSchema = z.object({
  text: z
    .string()
    .trim()
    .min(1, 'Paste or write a draft to analyze.')
    .max(40_000, 'Drafts must be 40,000 characters or fewer.'),
})
export const rewriteSchema = z.object({
  sentence: z.string().trim().min(1).max(4000),
  context: z.string().trim().max(12000).optional().default(''),
  intent: z.string().trim().max(500).optional().default(''),
})
export const editorialSchema = z
  .object({
    brief: z.record(z.unknown()),
    sources: z
      .array(
        z.object({
          title: z.string().max(240),
          url: z.string().url().max(2048).optional().or(z.literal('')),
        }),
      )
      .min(1)
      .max(12),
    audience: z
      .string()
      .trim()
      .max(500)
      .optional()
      .default('Founders, builders, and business operators'),
  })
  .refine(({ brief }) => Object.keys(brief).length > 0, {
    message: 'A completed research brief is required.',
  })
