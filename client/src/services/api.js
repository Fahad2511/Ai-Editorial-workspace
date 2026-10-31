import axios from 'axios'
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 60000,
  headers: { 'Content-Type': 'application/json' },
})
api.interceptors.response.use(
  (r) => r.data,
  (error) => {
    const apiError = error.response?.data?.error
    const message =
      apiError?.message ||
      'Could not connect to Editorial AI. Check that the API server is running.'
    const diagnostics = apiError?.code === 'INVALID_RESEARCH_OUTPUT' ? apiError.details : null
    const validationIssues = diagnostics?.validationIssues
    const details = []
    if (diagnostics?.failureType) details.push(`Gemini failure: ${diagnostics.failureType}.`)
    if (Array.isArray(validationIssues) && validationIssues.length)
      details.push(
        `Validation: ${validationIssues
          .slice(0, 3)
          .map(({ path, message: issue }) => `${path || '(root)'}: ${issue}`)
          .join('; ')}.`,
      )
    return Promise.reject(new Error([message, ...details].join(' ')))
  },
)
export const getHealth = () => api.get('/health')
export const extractSource = (url) => api.post('/research/extract', { url })
export const analyzeResearch = (payload) => api.post('/research/analyze', payload)
export const analyzeWriting = (text) => api.post('/writing/analyze', { text })
export const rewriteSentence = (payload) => api.post('/writing/rewrite', payload)
export const generateEditorial = (payload) => api.post('/editorial/generate', payload)
