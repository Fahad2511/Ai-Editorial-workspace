import { Router } from 'express'
import { editorial } from '../controllers/controllers.js'
const router = Router()
router.post('/generate', editorial)
export default router
