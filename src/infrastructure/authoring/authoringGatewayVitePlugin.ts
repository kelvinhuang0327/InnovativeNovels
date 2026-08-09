import { Buffer } from 'node:buffer'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import {
  AUTHORING_GATEWAY_PATH,
  createAuthoringGatewayHandler,
} from './authoringGateway.js'

const INTERNAL_GATEWAY_RESPONSE = JSON.stringify({
  ok: false,
  error: {
    code: 'INTERNAL_ERROR',
    message: '創作預覽暫時無法處理。',
  },
})

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []

    request.on('data', (chunk: Buffer | string) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    })
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    request.on('error', reject)
  })
}

function writeJson(response: ServerResponse, status: number, body: string) {
  response.statusCode = status
  response.setHeader('content-type', 'application/json; charset=utf-8')
  response.end(body)
}

export function authoringGatewayVitePlugin(): Plugin {
  const handler = createAuthoringGatewayHandler()

  return {
    name: 'innovative-novels-authoring-gateway',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const requestPath = request.url?.split('?')[0]
        if (requestPath !== AUTHORING_GATEWAY_PATH) {
          next()
          return
        }

        void (async () => {
          try {
            const result = await handler({
              method: request.method ?? '',
              body: await readBody(request),
            })
            writeJson(response, result.status, JSON.stringify(result.body))
          } catch {
            writeJson(response, 500, INTERNAL_GATEWAY_RESPONSE)
          }
        })()
      })
    },
  }
}
