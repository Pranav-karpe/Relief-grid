import type { ErrorRequestHandler } from 'express'
import { randomUUID } from 'node:crypto'
import { isApiError } from './api-error.js'

const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  if (isApiError(error)) {
    response.status(error.statusCode).json({
      status: 'error',
      code: error.code,
      message: error.message,
      requestId: randomUUID(),
    })
    return
  }

  console.error('[Unhandled Internal Error]:', error)

  response.status(500).json({
    status: 'error',
    code: 'internal_error',
    message: 'Internal server error.',
    requestId: randomUUID(),
  })
}

export default errorHandler
