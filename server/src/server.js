import 'dotenv/config'
import app from './app.js'
const port = Number(process.env.PORT) || 3001
const server = app.listen(port, () => console.log(`Editorial AI API listening on port ${port}`))
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${port} is already in use. Set PORT in server/.env to an available port.`)
    process.exitCode = 1
    return
  }
  throw error
})
