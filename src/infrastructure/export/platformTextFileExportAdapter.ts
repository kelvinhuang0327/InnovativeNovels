import { Capacitor, registerPlugin } from '@capacitor/core'
import type {
  TextFileExport,
  TextFileExportPort,
  TextFileExportResult,
} from '../../application/export/textFileExportPort'

interface NativeExportPlugin {
  exportFile(file: TextFileExport): Promise<TextFileExportResult>
}

const nativeExport = registerPlugin<NativeExportPlugin>('LocalFileExport')

export class PlatformTextFileExportAdapter implements TextFileExportPort {
  private readonly native: NativeExportPlugin
  private readonly platform: () => string

  constructor(
    native: NativeExportPlugin = nativeExport,
    platform: () => string = () => Capacitor.getPlatform(),
  ) {
    this.native = native
    this.platform = platform
  }

  async exportFile(file: TextFileExport): Promise<TextFileExportResult> {
    if (this.platform() === 'ios') return this.native.exportFile(file)
    // Android has no local export bridge yet; never claim a WebView download succeeded.
    if (this.platform() !== 'web') throw new Error('Native file export unavailable')
    const blob = new Blob([file.content], { type: `${file.mimeType};charset=utf-8` })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = file.filename
    anchor.rel = 'noopener'
    anchor.hidden = true
    try {
      document.body.appendChild(anchor)
      anchor.click()
      return { status: 'downloaded', filename: file.filename }
    } finally {
      anchor.remove()
      URL.revokeObjectURL(url)
    }
  }
}

export const defaultTextFileExportPort = new PlatformTextFileExportAdapter()
