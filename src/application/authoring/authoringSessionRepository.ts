import type { AuthoringSpec, Draft } from '../../domain/authoring/authoringContracts'

export interface AuthoringSession {
  readonly spec: AuthoringSpec
  readonly agentPrompt?: string
  readonly draft?: Draft
}

export interface AuthoringSessionRepository {
  load(): AuthoringSession | undefined
  save(session: AuthoringSession): void
  clear(): void
}
