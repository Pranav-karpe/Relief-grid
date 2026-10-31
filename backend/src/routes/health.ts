import { Router } from 'express'
import { isMongoDBConnected } from '../config/mongodb.js'

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

export default healthRouter