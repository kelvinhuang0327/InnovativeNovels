import { createAuthoringGatewayHandler } from './authoringGateway'
import { OllamaDraftProvider } from './ollamaDraftProvider'

export interface LocalAuthoringEnvironment {
  readonly AUTHORING_PROVIDER?: string
  readonly OLLAMA_MODEL?: string
  readonly OLLAMA_BASE_URL?: string
  readonly OLLAMA_TIMEOUT_MS?: string
  readonly OLLAMA_THINK?: string
}

export function createLocalAuthoringRuntime(environment: LocalAuthoringEnvironment, fetchImpl: typeof fetch = fetch) {
  if (environment.AUTHORING_PROVIDER && environment.AUTHORING_PROVIDER !== 'ollama') {
    throw new Error('只支援明確設定的本機 ollama provider。')
  }
  if (environment.OLLAMA_THINK !== undefined && !['true', 'false'].includes(environment.OLLAMA_THINK)) {
    throw new Error('OLLAMA_THINK must be true or false')
  }
  const provider = environment.AUTHORING_PROVIDER === 'ollama'
    ? new OllamaDraftProvider({
        model: environment.OLLAMA_MODEL ?? '', baseUrl: environment.OLLAMA_BASE_URL,
        timeoutMs: environment.OLLAMA_TIMEOUT_MS === undefined ? undefined : Number(environment.OLLAMA_TIMEOUT_MS),
        fetchImpl,
        think: environment.OLLAMA_THINK === undefined ? undefined : environment.OLLAMA_THINK === 'true',
      })
    : undefined
  const handler = provider ? createAuthoringGatewayHandler({ provider }) : undefined
  return {
    status: { configured: provider !== undefined, providerName: provider?.name ?? null },
    generate: handler ?? (async () => ({
      status: 503,
      body: { ok: false as const, error: { code: 'GENERATION_FAILED' as const, message: '尚未設定本機模型，請繼續使用匯入及編輯功能。' } },
    })),
  }
}

export type LocalAuthoringRuntime = ReturnType<typeof createLocalAuthoringRuntime>
