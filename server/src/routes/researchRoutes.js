import { Router } from 'express'
import { extract, research } from '../controllers/controllers.js'
const router = Router()
router.post('/extract', extract)
router.post('/analyze', research)
export default router
