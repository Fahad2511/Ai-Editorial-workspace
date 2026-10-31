import express from 'express'
import cors from 'cors'
import researchRoutes from './routes/researchRoutes.js'
import writingRoutes from './routes/writingRoutes.js'
import editorialRoutes from './routes/editorialRoutes.js'
import { errorHandler, notFound } from './middleware/errorHandler.js'
const app = express()
const allowed = (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((s) => s.trim())
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowed.includes(origin)) return callback(null, true)
      return callback(new Error('Origin not allowed by CORS.'))
    },
    methods: ['GET', 'POST'],
  }),
)
app.use(express.json({ limit: '1mb' }))
app.get('/api/health', (req, res) =>
  res.json({ ok: true, data: { status: 'ok', service: 'editorial-ai-api' } }),
)
app.use('/api/research', researchRoutes)
app.use('/api/writing', writingRoutes)
app.use('/api/editorial', editorialRoutes)
app.use(notFound)
app.use(errorHandler)
export default app
