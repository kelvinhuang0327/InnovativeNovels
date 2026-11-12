import { fileURLToPath } from 'node:url'
import { createLocalAuthoringRuntime } from '../src/infrastructure/authoring/localAuthoringRuntime.ts'
import { createLocalAuthoringServer } from '../src/infrastructure/authoring/localAuthoringServer.ts'

const port = Number(process.env.AUTHORING_PORT ?? 4192)
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid AUTHORING_PORT')
const runtime = createLocalAuthoringRuntime({
  AUTHORING_PROVIDER: process.env.AUTHORING_PROVIDER,
  OLLAMA_MODEL: process.env.OLLAMA_MODEL,
    OLLAMA_THINK: process.env.OLLAMA_THINK,
  OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL,
  OLLAMA_TIMEOUT_MS: process.env.OLLAMA_TIMEOUT_MS,
})
const server = createLocalAuthoringServer({ distDirectory: fileURLToPath(new URL('../dist/', import.meta.url)), runtime })
server.on('error', (error) => { console.error(error.message); process.exitCode = 1 })
server.listen(port, '127.0.0.1', () => console.log(`Local authoring: http://127.0.0.1:${port} (${runtime.status.configured ? runtime.status.providerName : 'manual authoring; model not configured'})`))
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close(() => process.exit(0)))
