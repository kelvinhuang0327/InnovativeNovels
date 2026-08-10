import {
  MAX_PORTABLE_PROJECT_FILE_BYTES,
  type PortableProjectFile,
  type PortableProjectFilePort,
  type PortableProjectFileReadResult,
} from '../../application/authoring/portableProjectFilePort'

export class BrowserPortableProjectFileAdapter implements PortableProjectFilePort {
  download(filename: string, content: string): void {
    const blob = new Blob([content], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    anchor.rel = 'noopener'
    document.body.appendChild(anchor)
    try {
      anchor.click()
    } finally {
      anchor.remove()
      URL.revokeObjectURL(url)
    }
  }

  async read(file: PortableProjectFile): Promise<PortableProjectFileReadResult> {
    if (file.size > MAX_PORTABLE_PROJECT_FILE_BYTES) {
      return {
        ok: false,
        code: 'OVERSIZED_FILE',
        message: 'The selected project file is too large to import safely (maximum 15 MB).',
      }
    }

    try {
      return { ok: true, text: await file.text() }
    } catch {
      return {
        ok: false,
        code: 'UNREADABLE_FILE',
        message: 'The selected project file could not be read.',
      }
    }
  }
}
