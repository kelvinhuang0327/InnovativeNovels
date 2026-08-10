import type {
  AuthoringProjectLoadResult,
  AuthoringProjectRepository,
  AuthoringProjectStoreV1,
} from '../../application/authoring/authoringProjectRepository'
import type { AuthoringSession } from '../../application/authoring/authoringSessionRepository'
import { createEmptyAuthoringSession } from '../../application/authoring/authoringSessionDefaults'
import {
  AUTHORING_SESSION_STORAGE_KEY,
  parseAuthoringSession,
  serializeAuthoringSession,
} from './localStorageAuthoringSessionRepository'

export const AUTHORING_PROJECTS_STORAGE_KEY =
  'innovative-novels:authoring-projects:v1'

interface StoredProject {
  readonly projectId: string
  readonly name: string
  readonly session: unknown
}

interface StoredProjectStore {
  readonly schemaVersion: 1
  readonly activeProjectId: string
  readonly projects: readonly StoredProject[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeName(name: string): string | undefined {
  const normalized = name.trim()
  return normalized.length > 0 ? normalized : undefined
}

function createProjectId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

function parseProjectStore(serialized: string): AuthoringProjectStoreV1 | undefined {
  try {
    const candidate: unknown = JSON.parse(serialized)
    if (
      !isRecord(candidate) ||
      candidate.schemaVersion !== 1 ||
      typeof candidate.activeProjectId !== 'string' ||
      !Array.isArray(candidate.projects) ||
      candidate.projects.length === 0
    ) {
      return undefined
    }

    const projects = candidate.projects.map((project): StoredProject | undefined => {
      if (
        !isRecord(project) ||
        typeof project.projectId !== 'string' ||
        !normalizeName(typeof project.name === 'string' ? project.name : '') ||
        !('session' in project)
      ) {
        return undefined
      }
      return {
        projectId: project.projectId,
        name: normalizeName(project.name as string) as string,
        session: project.session,
      }
    })
    if (projects.some((project) => !project)) {
      return undefined
    }

    const parsedProjects = projects as StoredProject[]
    const ids = new Set(parsedProjects.map((project) => project.projectId))
    if (
      ids.size !== parsedProjects.length ||
      parsedProjects.some((project) => project.projectId.trim().length === 0)
    ) {
      return undefined
    }

    const parsedWithSessions = parsedProjects.map((project) => {
      const session = parseAuthoringSession(JSON.stringify(project.session))
      return session ? { projectId: project.projectId, name: project.name, session } : undefined
    })
    if (parsedWithSessions.some((project) => !project)) {
      return undefined
    }

    return {
      schemaVersion: 1,
      activeProjectId: ids.has(candidate.activeProjectId)
        ? candidate.activeProjectId
        : parsedWithSessions[0]?.projectId ?? candidate.activeProjectId,
      projects: parsedWithSessions as AuthoringProjectStoreV1['projects'],
    }
  } catch {
    return undefined
  }
}

function serializeProjectStore(store: AuthoringProjectStoreV1): string {
  const stored: StoredProjectStore = {
    schemaVersion: 1,
    activeProjectId: store.activeProjectId,
    projects: store.projects.map((project) => ({
      projectId: project.projectId,
      name: project.name,
      session: JSON.parse(serializeAuthoringSession(project.session)) as unknown,
    })),
  }
  return JSON.stringify(stored)
}

function defaultProjectName(session: AuthoringSession): string {
  return (
    session.draft?.title?.trim() ||
    session.spec.titleHint?.trim() ||
    'Untitled Project'
  )
}

export class LocalStorageAuthoringProjectRepository
  implements AuthoringProjectRepository
{
  private readonly storage: Storage
  private readonly idGenerator: () => string

  constructor(storage: Storage, idGenerator: () => string = createProjectId) {
    this.storage = storage
    this.idGenerator = idGenerator
  }

  load(): AuthoringProjectLoadResult {
    try {
      const rawStore = this.storage.getItem(AUTHORING_PROJECTS_STORAGE_KEY)
      if (rawStore !== null) {
        const store = parseProjectStore(rawStore)
        if (!store) {
          return {
            ok: false,
            message: 'Authoring project library data is malformed and was not changed.',
          }
        }
        if (serializeProjectStore(store) !== rawStore && !this.save(store)) {
          return {
            ok: false,
            message: 'Authoring project library fallback could not be saved safely.',
          }
        }
        return { ok: true, store }
      }

      const legacySession = parseAuthoringSession(
        this.storage.getItem(AUTHORING_SESSION_STORAGE_KEY),
      )
      const session = legacySession ?? createEmptyAuthoringSession()
      const projectId = this.idGenerator()
      const store: AuthoringProjectStoreV1 = {
        schemaVersion: 1,
        activeProjectId: projectId,
        projects: [
          {
            projectId,
            name: defaultProjectName(session),
            session,
          },
        ],
      }
      if (!this.save(store)) {
        return {
          ok: false,
          message: 'Authoring project library could not be saved. Existing authoring data was preserved.',
        }
      }
      const readBack = this.storage.getItem(AUTHORING_PROJECTS_STORAGE_KEY)
      const restored = readBack ? parseProjectStore(readBack) : undefined
      return restored
        ? { ok: true, store: restored }
        : {
            ok: false,
            message: 'Authoring project library could not be verified after saving.',
          }
    } catch {
      return {
        ok: false,
        message: 'Authoring project library could not be loaded safely.',
      }
    }
  }

  save(store: AuthoringProjectStoreV1): boolean {
    try {
      const serialized = serializeProjectStore(store)
      if (!parseProjectStore(serialized)) {
        return false
      }
      this.storage.setItem(AUTHORING_PROJECTS_STORAGE_KEY, serialized)
      const readBack = this.storage.getItem(AUTHORING_PROJECTS_STORAGE_KEY)
      return readBack !== null && parseProjectStore(readBack) !== undefined
    } catch {
      return false
    }
  }

  createProject(
    store: AuthoringProjectStoreV1,
    name: string,
    session: AuthoringSession,
  ): AuthoringProjectLoadResult {
    const normalizedName = normalizeName(name)
    if (!normalizedName) {
      return { ok: false, message: 'Project name cannot be empty.' }
    }

    let projectId: string | undefined
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const candidate = this.idGenerator()
      if (!store.projects.some((project) => project.projectId === candidate)) {
        projectId = candidate
        break
      }
    }
    if (!projectId) {
      return { ok: false, message: 'A unique local project identity could not be allocated.' }
    }

    const nextStore: AuthoringProjectStoreV1 = {
      schemaVersion: 1,
      activeProjectId: projectId,
      projects: [
        ...store.projects,
        { projectId, name: normalizedName, session },
      ],
    }
    return this.save(nextStore)
      ? { ok: true, store: nextStore }
      : { ok: false, message: 'The new project could not be saved.' }
  }
}
