import { Router } from 'express'
import { writing, rewrite } from '../controllers/controllers.js'
const router = Router()
router.post('/analyze', writing)
router.post('/rewrite', rewrite)
export default router
