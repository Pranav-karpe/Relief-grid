import type { RequestHandler } from 'express'
import { randomUUID } from 'node:crypto'

const notFound: RequestHandler = (request, response) => {
  response.status(404).json({
    status: 'error',
    code: 'not_found',
    message: `Route ${request.method} ${request.originalUrl} not found.`,
    requestId: randomUUID(),
  })
}

export default notFound