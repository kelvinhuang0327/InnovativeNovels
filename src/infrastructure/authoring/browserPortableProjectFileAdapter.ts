import {
  MAX_PORTABLE_PROJECT_FILE_BYTES,
  type PortableProjectFile,
  type PortableProjectFilePort,
  type PortableProjectFileReadResult,
} from '../../application/authoring/portableProjectFilePort'
import type { TextFileExportPort } from '../../application/export/textFileExportPort'
import { defaultTextFileExportPort } from '../export/platformTextFileExportAdapter'

export class BrowserPortableProjectFileAdapter implements PortableProjectFilePort {
  private readonly exporter: TextFileExportPort

  constructor(exporter: TextFileExportPort = defaultTextFileExportPort) {
    this.exporter = exporter
  }

  download(filename: string, content: string) {
    return this.exporter.exportFile({ filename, content, mimeType: 'application/json' })
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
