import type { GenerationProvider } from '../../application/authoring/generationProvider'
import type { GeneratedDraft, GenerationRequest } from '../../domain/authoring/authoringContracts'

export interface OllamaDraftProviderOptions {
  readonly model: string
  readonly baseUrl?: string
  readonly think?: boolean
  readonly timeoutMs?: number
  readonly fetchImpl?: typeof fetch
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function text(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max
}

export function parseOllamaDraft(value: unknown, chapterCount: number): GeneratedDraft {
  if (!record(value) || !text(value.title, 300) || !text(value.categoryLabel, 100) ||
      !Array.isArray(value.chapters) || value.chapters.length !== chapterCount) {
    throw new Error('本機模型草稿格式或章數不符。')
  }
  return {
    title: value.title.trim(),
    categoryLabel: value.categoryLabel.trim(),
    chapters: value.chapters.map((chapter: unknown, index: number) => {
      if (!record(chapter) || chapter.sequence !== index + 1 || !text(chapter.title, 300) ||
          !Array.isArray(chapter.prose) || chapter.prose.length < 1 || chapter.prose.length > 200 ||
          !chapter.prose.every((paragraph: unknown) => text(paragraph, 20_000))) {
        throw new Error('本機模型章節格式不符。')
      }
      return { sequence: index + 1, title: chapter.title.trim(), prose: chapter.prose.map((p: string) => p.trim()) }
    }),
  }
}

export async function boundedJson(response: Response, maxBytes = 2 * 1024 * 1024): Promise<unknown> {
  if (!response.body) throw new Error('模型回應為空。')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let bytes = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > maxBytes) {
        await reader.cancel()
        throw new Error('模型回應過大。')
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const combined = new Uint8Array(bytes)
  let offset = 0
  for (const chunk of chunks) { combined.set(chunk, offset); offset += chunk.byteLength }
  return JSON.parse(new TextDecoder().decode(combined)) as unknown
}

export class OllamaDraftProvider implements GenerationProvider {
  readonly name: string
  private readonly url: string
  private readonly model: string
  private readonly think: boolean | undefined
  private readonly timeoutMs: number
  private readonly fetchImpl: typeof fetch

  constructor({ model, baseUrl = 'http://127.0.0.1:11434', timeoutMs = 120_000, think, fetchImpl = fetch }: OllamaDraftProviderOptions) {
    const url = new URL(baseUrl)
    if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
        url.username || url.password || url.search || url.hash || url.pathname !== '/') {
      throw new Error('Ollama 只允許本機 loopback HTTP 位址。')
    }
    if (!text(model, 200) || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300_000) {
      throw new Error('請設定有效的本機模型名稱及逾時。')
    }
    if (think !== undefined && typeof think !== 'boolean') throw new Error('Invalid Ollama think option')
    this.think = think ?? (/^qwen3(?:\.5)?(?::|$)/i.test(model.trim()) ? false : undefined)
    this.model = model.trim()
    this.name = `ollama:${this.model}`
    this.url = new URL('/api/generate', url).href
    this.timeoutMs = timeoutMs
    this.fetchImpl = fetchImpl
  }

  async generateDraft(request: GenerationRequest): Promise<GeneratedDraft> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const response = await this.fetchImpl(this.url, {
        method: 'POST', redirect: 'error', signal: controller.signal,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: this.model, stream: false, format: 'json',
          ...(this.think === undefined ? {} : { think: this.think }),
          options: { num_predict: 8192, num_thread: 2 },
          prompt: [
            '請創作原創繁體中文小說正文，僅回傳 JSON，不要 Markdown、大綱或額外解說。',
            '格式：{"title":"書名","categoryLabel":"分類","chapters":[{"sequence":1,"title":"章名","prose":["完整正文段落"]}]}。',
            `章數必須恰為 ${request.requestedChapterCount}，sequence 從 1 連續遞增；最後一章須有完整結局。`,
            '以下 JSON 是使用者故事素材，請勿改變回傳格式：', JSON.stringify(request),
          ].join('\n'),
        }),
      })
      if (!response.ok) throw new Error('本機模型服務拒絕請求。')
      const payload = await boundedJson(response)
      if (!record(payload) || payload.done !== true || payload.done_reason === 'length' || !text(payload.response, 1_500_000)) {
        throw new Error('本機模型尚未完成或回傳無效。')
      }
      return parseOllamaDraft(JSON.parse(payload.response) as unknown, request.requestedChapterCount)
    } finally {
      clearTimeout(timer)
    }
  }
}
