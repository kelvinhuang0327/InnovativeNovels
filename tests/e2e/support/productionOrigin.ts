import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'

const contentTypes: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript',
  '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2',
}

/** Serves only this candidate's production build, with an owned origin we can stop. */
export async function startProductionOrigin() {
  const root = resolve('dist')
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname)
      const file = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname))
      if (!file.startsWith(root + sep)) { response.writeHead(403).end(); return }
      const data = await readFile(file)
      response.writeHead(200, { 'Content-Type': contentTypes[extname(file)] ?? 'application/octet-stream' })
      response.end(data)
    } catch { response.writeHead(404).end() }
  })
  await new Promise<void>((resolveStarted, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolveStarted)
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Expected owned loopback port')
  return {
    url: `http://127.0.0.1:${address.port}`,
    stop: async () => {
      if (!server.listening) return
      await new Promise<void>((resolveStopped, reject) => {
        server.close(error => error ? reject(error) : resolveStopped())
        server.closeAllConnections()
      })
    },
  }
}
