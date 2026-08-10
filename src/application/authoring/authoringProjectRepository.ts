import type { AuthoringSession } from './authoringSessionRepository'

export interface AuthoringProjectV1 {
  readonly projectId: string
  readonly name: string
  readonly session: AuthoringSession
}
export interface AuthoringProjectStoreV1 {
  readonly schemaVersion: 1
  readonly activeProjectId: string
  readonly projects: readonly AuthoringProjectV1[]
}

export type AuthoringProjectLoadResult =
  | { readonly ok: true; readonly store: AuthoringProjectStoreV1 }
  | { readonly ok: false; readonly message: string }

export type AuthoringProjectOperationResult = AuthoringProjectLoadResult

export type AuthoringProjectImportResult =
  | {
      readonly ok: true
      readonly store: AuthoringProjectStoreV1
      readonly importedProjectId: string
    }
  | {
      readonly ok: false
      readonly code: string
      readonly message: string
    }

export interface AuthoringProjectRepository {
  load(): AuthoringProjectLoadResult
  save(store: AuthoringProjectStoreV1): boolean
  createProject(
    store: AuthoringProjectStoreV1,
    name: string,
    session: AuthoringSession,
  ): AuthoringProjectOperationResult
  exportPortableProject(project: AuthoringProjectV1): string
  importPortableProject(
    store: AuthoringProjectStoreV1,
    serialized: string,
  ): AuthoringProjectImportResult
}

export function getActiveProject(
  store: AuthoringProjectStoreV1,
): AuthoringProjectV1 {
  return (
    store.projects.find((project) => project.projectId === store.activeProjectId) ??
    store.projects[0]
  )
}

export function replaceProjectSession(
  store: AuthoringProjectStoreV1,
  projectId: string,
  session: AuthoringSession,
): AuthoringProjectStoreV1 {
  return {
    ...store,
    projects: store.projects.map((project) =>
      project.projectId === projectId ? { ...project, session } : project,
    ),
  }
}

export function withActiveProject(
  store: AuthoringProjectStoreV1,
  activeProjectId: string,
): AuthoringProjectStoreV1 {
  return { ...store, activeProjectId }
}
