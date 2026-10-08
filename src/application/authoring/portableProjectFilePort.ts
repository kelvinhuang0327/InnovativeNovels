import type { TextFileExportResult } from '../export/textFileExportPort'

export const MAX_PORTABLE_PROJECT_FILE_BYTES = 15 * 1024 * 1024

export interface PortableProjectFile {
  readonly name?: string
  readonly size: number
  text(): Promise<string>
}

export type PortableProjectFileReadResult =
  | { readonly ok: true; readonly text: string }
  | {
      readonly ok: false
      readonly code: 'OVERSIZED_FILE' | 'UNREADABLE_FILE'
      readonly message: string
    }

export interface PortableProjectFilePort {
  download(filename: string, content: string): void | Promise<TextFileExportResult>
  read(file: PortableProjectFile): Promise<PortableProjectFileReadResult>
}

export function getPortableProjectByteLength(content: string): number {
  return new TextEncoder().encode(content).byteLength
}

export function buildPortableProjectFileName(
  projectName: string,
  projectId: string,
): string {
  const source = projectName.trim() || projectId.trim() || 'authoring-project'
  const cleanedName = Array.from(source, (character) =>
    character.charCodeAt(0) < 0x20 ? '-' : character,
  )
    .join('')
    .replace(/[<>:"/\\|?*]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
  // Keep CJK/emoji names within native filesystem limits, including prefix/extension.
  let safeName = ''
  for (const character of Array.from(cleanedName).slice(0, 80)) {
    if (getPortableProjectByteLength(safeName + character) > 180) break
    safeName += character
  }
  return `innovative-novels-project-${safeName || 'authoring-project'}.json`
}
