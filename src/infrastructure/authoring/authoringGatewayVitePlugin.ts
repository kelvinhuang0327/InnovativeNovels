import type { ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import {
  AUTHORING_GATEWAY_PATH,
  createAuthoringGatewayHandler,
} from './authoringGateway.js'
import { createLocalAuthoringRuntime } from './localAuthoringRuntime'
import { readAuthoringBody } from './localAuthoringServer'

const STATUS_PATH = '/api/authoring/status'
const INTERNAL_GATEWAY_RESPONSE = JSON.stringify({
  ok: false,
  error: {
    code: 'INTERNAL_ERROR',
    message: '創作預覽暫時無法處理。',
  },
})

function isLoopbackHost(host: string): boolean {
  const match = /^(localhost|127\.0\.0\.1|\[::1\])(?::(\d{1,5}))?$/i.exec(host)
  if (!match) return false
  if (match[2] === undefined) return true
  const port = Number(match[2])
  return port > 0 && port <= 65_535
}

function hasSameLoopbackOrigin(origin: string | undefined, host: string): boolean {
  if (!origin) return true
  try {
    const parsed = new URL(origin)
    return (
      (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
      !parsed.username &&
      !parsed.password &&
      parsed.host.toLowerCase() === host.toLowerCase() &&
      isLoopbackHost(parsed.host)
    )
  } catch {
    return false
  }
}

function writeJson(response: ServerResponse, status: number, body: string) {
  response.statusCode = status
  response.setHeader('content-type', 'application/json; charset=utf-8')
  response.setHeader('cache-control', 'no-store')
  response.end(body)
}

export function authoringGatewayVitePlugin(): Plugin {
  const runtime = createLocalAuthoringRuntime({
    AUTHORING_PROVIDER: process.env.AUTHORING_PROVIDER,
    OLLAMA_MODEL: process.env.OLLAMA_MODEL,
    OLLAMA_THINK: process.env.OLLAMA_THINK,
    OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL,
    OLLAMA_TIMEOUT_MS: process.env.OLLAMA_TIMEOUT_MS,
  })
  const demoHandler = createAuthoringGatewayHandler()

  return {
    name: 'innovative-novels-authoring-gateway',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const requestPath = request.url?.split('?')[0]
        if (requestPath !== STATUS_PATH && requestPath !== AUTHORING_GATEWAY_PATH) {
          next()
          return
        }

        const host = request.headers.host ?? ''
        if (!isLoopbackHost(host)) {
          writeJson(response, 403, JSON.stringify({ error: 'Localhost only.' }))
          return
        }
        if (
          !hasSameLoopbackOrigin(request.headers.origin, host) ||
          request.headers['sec-fetch-site'] === 'cross-site'
        ) {
          writeJson(response, 403, JSON.stringify({ error: 'Same origin only.' }))
          return
        }

        if (requestPath === STATUS_PATH) {
          if (request.method !== 'GET') {
            writeJson(response, 405, JSON.stringify({ error: 'GET required.' }))
            return
          }
          writeJson(response, 200, JSON.stringify(runtime.status))
          return
        }

        if (request.method !== 'POST') {
          writeJson(response, 405, JSON.stringify({ error: 'POST required.' }))
          return
        }
        if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] ?? '')) {
          writeJson(response, 415, JSON.stringify({ error: 'JSON required.' }))
          return
        }

        void (async () => {
          try {
            const body = await readAuthoringBody(request)
            const result = runtime.status.configured
              ? await runtime.generate({ method: 'POST', body })
              : await demoHandler({ method: 'POST', body })
            writeJson(response, result.status, JSON.stringify(result.body))
          } catch {
            writeJson(response, 500, INTERNAL_GATEWAY_RESPONSE)
          }
        })()
      })
    },
  }
}
