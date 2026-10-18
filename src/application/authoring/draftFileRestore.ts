import type { Draft } from '../../domain/authoring/authoringContracts'
import { hasDuplicateJsonObjectKeys } from '../../infrastructure/persistence/portableAuthoringProject'
import { importAgentDraft } from './agentDraftImport'
import { getPortableProjectByteLength, MAX_PORTABLE_PROJECT_FILE_BYTES } from './portableProjectFilePort'

export type DraftFileRestorePreparation =
  | { readonly kind: 'draft'; readonly draft: Draft }
  | { readonly kind: 'portable' }
  | { readonly kind: 'error'; readonly message: string }

/** Recognize the app's draft export while retaining the existing portable-project path. */
export function prepareDraftFileRestore(raw: string): DraftFileRestorePreparation {
  if (getPortableProjectByteLength(raw) > MAX_PORTABLE_PROJECT_FILE_BYTES) {
    return { kind: 'error', message: 'JSON 檔案超過 15 MB，未匯入；原有作品保留。' }
  }
  if (hasDuplicateJsonObjectKeys(raw)) {
    return { kind: 'error', message: 'JSON 含重複欄位，未匯入；原有作品保留。' }
  }
  let document: unknown
  try {
    document = JSON.parse(raw)
  } catch {
    return { kind: 'error', message: 'The selected file is not valid JSON.' }
  }
  if (typeof document !== 'object' || document === null || Array.isArray(document)) {
    return { kind: 'portable' }
  }
  const keys = Object.keys(document)
  if (keys.some((key) => ['format', 'version', 'project'].includes(key)) ||
      !keys.some((key) => ['title', 'genre', 'chapters'].includes(key))) {
    return { kind: 'portable' }
  }
  const imported = importAgentDraft(raw)
  return imported.ok
    ? { kind: 'draft', draft: imported.draft }
    : { kind: 'error', message: imported.errors.map(({ message }) => message).join(' ') }
}
