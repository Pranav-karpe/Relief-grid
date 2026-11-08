import { Router } from 'express'
import { isMongoDBConnected } from '../config/mongodb.js'
import { verifyEmailTransport } from '../services/email.service.js'

const healthRouter = Router()

healthRouter.get('/health', (_request, response) => {
  response.status(200).json({
    status: 'ok',
    service: 'reliefgrid-api',
  })
})

healthRouter.get('/readiness', (_request, response) => {
  const ready = isMongoDBConnected()

  response.status(ready ? 200 : 503).json({
    status: ready ? 'ready' : 'not_ready',
    service: 'reliefgrid-api',
  })
})

healthRouter.get('/email-status', async (_request, response) => {
  const emailStatus = await verifyEmailTransport()
  response.status(200).json({
    service: 'reliefgrid-email-brevo',
    ...emailStatus,
  })
})

export default healthRouter
