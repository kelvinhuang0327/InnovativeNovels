import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { readFile, realpath } from 'node:fs/promises'
import { extname, relative, resolve, sep } from 'node:path'
import type { LocalAuthoringRuntime } from './localAuthoringRuntime'

const MIME: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' }

function json(response: ServerResponse, status: number, value: unknown) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  response.end(JSON.stringify(value))
}

export function readAuthoringBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolveBody, reject) => {
    const chunks: Buffer[] = []
    let bytes = 0
    let exceeded = false
    request.on('data', (data: Buffer) => {
      bytes += data.length
      if (bytes > 64 * 1024) { exceeded = true; reject(new Error('BODY_TOO_LARGE')); return }
      if (!exceeded) chunks.push(data)
    })
    request.on('end', () => { if (!exceeded) resolveBody(Buffer.concat(chunks).toString('utf8')) })
    request.on('error', reject)
    request.on('aborted', () => reject(new Error('ABORTED')))
  })
}

export function createLocalAuthoringServer({ distDirectory, runtime }: { readonly distDirectory: string; readonly runtime: LocalAuthoringRuntime }) {
  let generating = false
  const server = createServer((request, response) => {
    void (async () => {
      const address = server.address()
      const port = address && typeof address === 'object' ? address.port : 0
      const allowedHosts = [`127.0.0.1:${port}`, `localhost:${port}`]
      const host = request.headers.host ?? ''
      if (!allowedHosts.includes(host)) { json(response, 403, { error: 'Localhost only.' }); return }
      if (request.headers.origin && request.headers.origin !== `http://${host}` || request.headers['sec-fetch-site'] === 'cross-site') {
        json(response, 403, { error: 'Same origin only.' }); return
      }
      const url = new URL(request.url ?? '/', `http://${host}`)
      if (url.pathname === '/api/authoring/status' && request.method === 'GET') { json(response, 200, runtime.status); return }
      if (url.pathname === '/api/authoring/generate') {
        if (request.method !== 'POST') { json(response, 405, { error: 'POST required.' }); return }
        if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] ?? '')) { json(response, 415, { error: 'JSON required.' }); return }
        if (generating) { json(response, 429, { error: 'Generation already running.' }); return }
        generating = true
        try {
          const body = await readAuthoringBody(request)
          const result = await runtime.generate({ method: 'POST', body })
          json(response, result.status, result.body)
        } catch (error) {
          json(response, error instanceof Error && error.message === 'BODY_TOO_LARGE' ? 413 : 500, { ok: false, error: { code: 'INTERNAL_ERROR', message: '創作預覽暫時無法處理。' } })
        } finally { generating = false }
        return
      }
      if (url.pathname.startsWith('/api/')) { json(response, 404, { error: 'Unknown API.' }); return }
      if (request.method !== 'GET' && request.method !== 'HEAD') { json(response, 405, { error: 'GET required.' }); return }
      const root = await realpath(distDirectory)
      let pathname: string
      try { pathname = decodeURIComponent(url.pathname) } catch { json(response, 400, { error: 'Invalid path.' }); return }
      if (pathname.split('/').some((segment) => segment.startsWith('.') && segment !== '')) { json(response, 404, { error: 'Not found.' }); return }
      let file = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`)
      try { file = await realpath(file) } catch {
        if (extname(pathname)) { json(response, 404, { error: 'Not found.' }); return }
        file = await realpath(resolve(root, 'index.html'))
      }
      const rel = relative(root, file)
      if (rel.startsWith(`..${sep}`) || rel === '..' || resolve(root, rel) !== file) { json(response, 403, { error: 'Invalid path.' }); return }
      const bytes = await readFile(file)
      response.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream', 'x-content-type-options': 'nosniff', 'cache-control': 'no-cache' })
      response.end(request.method === 'HEAD' ? undefined : bytes)
    })().catch(() => { if (!response.headersSent) json(response, 500, { error: 'Local server unavailable.' }); else response.end() })
  })
  server.requestTimeout = 310_000
  server.headersTimeout = 10_000
  return server
}
