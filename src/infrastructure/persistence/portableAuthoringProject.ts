import type { AuthoringProjectV1 } from '../../application/authoring/authoringProjectRepository'
import type { AuthoringSession } from '../../application/authoring/authoringSessionRepository'
import {
  parseAuthoringSession,
  serializeAuthoringSession,
} from './localStorageAuthoringSessionRepository'

export const PORTABLE_AUTHORING_PROJECT_FORMAT =
  'innovative-novels-authoring-project' as const
export const PORTABLE_AUTHORING_PROJECT_VERSION = 1 as const

export interface PortableAuthoringProjectV1 {
  readonly format: typeof PORTABLE_AUTHORING_PROJECT_FORMAT
  readonly version: typeof PORTABLE_AUTHORING_PROJECT_VERSION
  readonly project: {
    readonly projectId: string
    readonly name: string
    readonly session: AuthoringSession
  }
}

export type PortableAuthoringProjectParseErrorCode =
  | 'INVALID_JSON'
  | 'ROOT_NOT_OBJECT'
  | 'PORTABLE_FIELDS_INVALID'
  | 'WRONG_FORMAT'
  | 'UNSUPPORTED_VERSION'
  | 'PROJECT_FIELDS_INVALID'
  | 'MALFORMED_SESSION'
  | 'DUPLICATE_FIELDS'

export type PortableAuthoringProjectParseResult =
  | { readonly ok: true; readonly project: PortableAuthoringProjectV1 }
  | {
      readonly ok: false
      readonly code: PortableAuthoringProjectParseErrorCode
      readonly message: string
    }

const TOP_LEVEL_FIELDS = ['format', 'version', 'project'] as const
const PROJECT_FIELDS = ['projectId', 'name', 'session'] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasExactFields(
  value: Record<string, unknown>,
  fields: readonly string[],
): boolean {
  const keys = Object.keys(value)
  return keys.length === fields.length && keys.every((field) => fields.includes(field))
}

function skipWhitespace(value: string, index: number): number {
  while (index < value.length && /\s/.test(value[index] ?? '')) {
    index += 1
  }
  return index
}

function skipString(value: string, start: number): number | undefined {
  if (value[start] !== '"') return undefined
  let index = start + 1
  while (index < value.length) {
    const character = value[index]
    if (character === '\\') {
      index += 2
      continue
    }
    if (character === '"') return index + 1
    index += 1
  }
  return undefined
}

function hasDuplicateJsonObjectKeys(serialized: string): boolean {
  let index = 0
  let duplicateFound = false

  const parseValue = (): boolean => {
    index = skipWhitespace(serialized, index)
    const character = serialized[index]

    if (character === '"') {
      const end = skipString(serialized, index)
      if (end === undefined) return false
      index = end
      return true
    }

    if (character === '[') {
      index += 1
      index = skipWhitespace(serialized, index)
      if (serialized[index] === ']') {
        index += 1
        return true
      }
      while (index < serialized.length) {
        if (!parseValue()) return false
        index = skipWhitespace(serialized, index)
        if (serialized[index] === ']') {
          index += 1
          return true
        }
        if (serialized[index] !== ',') return false
        index += 1
      }
      return false
    }

    if (character === '{') {
      index += 1
      const keys = new Set<string>()
      index = skipWhitespace(serialized, index)
      if (serialized[index] === '}') {
        index += 1
        return true
      }
      while (index < serialized.length) {
        index = skipWhitespace(serialized, index)
        const keyStart = index
        const keyEnd = skipString(serialized, keyStart)
        if (keyEnd === undefined) return false
        let key: string
        try {
          key = JSON.parse(serialized.slice(keyStart, keyEnd)) as string
        } catch {
          return false
        }
        if (keys.has(key)) {
          duplicateFound = true
          return false
        }
        keys.add(key)
        index = skipWhitespace(serialized, keyEnd)
        if (serialized[index] !== ':') return false
        index += 1
        if (!parseValue()) return false
        index = skipWhitespace(serialized, index)
        if (serialized[index] === '}') {
          index += 1
          return true
        }
        if (serialized[index] !== ',') return false
        index += 1
      }
      return false
    }

    if (
      serialized.startsWith('true', index) ||
      serialized.startsWith('false', index) ||
      serialized.startsWith('null', index)
    ) {
      index += serialized.startsWith('false', index) ? 5 : 4
      return true
    }

    const numberStart = index
    while (
      index < serialized.length &&
      !',]} \t\r\n'.includes(serialized[index] ?? '')
    ) {
      index += 1
    }
    return index > numberStart
  }

  parseValue()
  return duplicateFound
}

function parseError(
  code: PortableAuthoringProjectParseErrorCode,
  message: string,
): PortableAuthoringProjectParseResult {
  return { ok: false, code, message }
}

export function parsePortableAuthoringProject(
  serialized: string,
): PortableAuthoringProjectParseResult {
  if (hasDuplicateJsonObjectKeys(serialized)) {
    return parseError(
      'DUPLICATE_FIELDS',
      'Portable project JSON contains duplicate object fields and was rejected.',
    )
  }

  let candidate: unknown
  try {
    candidate = JSON.parse(serialized)
  } catch {
    return parseError('INVALID_JSON', 'The selected file is not valid JSON.')
  }

  if (!isRecord(candidate)) {
    return parseError('ROOT_NOT_OBJECT', 'Portable project JSON must have an object root.')
  }
  if (!hasExactFields(candidate, TOP_LEVEL_FIELDS)) {
    return parseError(
      'PORTABLE_FIELDS_INVALID',
      'Portable project JSON must contain exactly format, version, and project.',
    )
  }
  if (candidate.format !== PORTABLE_AUTHORING_PROJECT_FORMAT) {
    return parseError(
      'WRONG_FORMAT',
      'This file is not an InnovativeNovels portable Authoring Project.',
    )
  }
  if (candidate.version !== PORTABLE_AUTHORING_PROJECT_VERSION) {
    return parseError(
      'UNSUPPORTED_VERSION',
      `Portable Authoring Project version ${String(candidate.version)} is not supported.`,
    )
  }
  if (!isRecord(candidate.project) || !hasExactFields(candidate.project, PROJECT_FIELDS)) {
    return parseError(
      'PROJECT_FIELDS_INVALID',
      'Portable project data must contain exactly projectId, name, and session.',
    )
  }

  const projectId = candidate.project.projectId
  const name = candidate.project.name
  if (
    typeof projectId !== 'string' ||
    projectId.trim().length === 0 ||
    projectId !== projectId.trim() ||
    typeof name !== 'string' ||
    name.trim().length === 0
  ) {
    return parseError(
      'PROJECT_FIELDS_INVALID',
      'Portable project name and source project identity must be valid strings.',
    )
  }

  let serializedSession: string | undefined
  try {
    serializedSession = JSON.stringify(candidate.project.session)
  } catch {
    return parseError('MALFORMED_SESSION', 'Portable project session could not be read.')
  }
  if (!serializedSession) {
    return parseError('MALFORMED_SESSION', 'Portable project session could not be read.')
  }
  const session = parseAuthoringSession(serializedSession)
  if (!session) {
    return parseError(
      'MALFORMED_SESSION',
      'Portable project contains an invalid Authoring Session.',
    )
  }

  return {
    ok: true,
    project: {
      format: PORTABLE_AUTHORING_PROJECT_FORMAT,
      version: PORTABLE_AUTHORING_PROJECT_VERSION,
      project: {
        projectId,
        name: name.trim(),
        session,
      },
    },
  }
}

export function serializePortableAuthoringProject(
  project: AuthoringProjectV1,
): string {
  const document: PortableAuthoringProjectV1 = {
    format: PORTABLE_AUTHORING_PROJECT_FORMAT,
    version: PORTABLE_AUTHORING_PROJECT_VERSION,
    project: {
      projectId: project.projectId,
      name: project.name,
      session: JSON.parse(serializeAuthoringSession(project.session)) as AuthoringSession,
    },
  }
  return JSON.stringify(document, null, 2)
}
