import type { ClipboardPort } from '../../application/authoring/clipboardPort'

export class BrowserClipboardAdapter implements ClipboardPort {
  private readonly clipboard: Pick<Clipboard, 'writeText'> | undefined

  constructor(clipboard: Pick<Clipboard, 'writeText'> | undefined) {
    this.clipboard = clipboard
  }

  async writeText(text: string): Promise<void> {
    if (!this.clipboard) {
      throw new Error('Clipboard API unavailable.')
    }

    await this.clipboard.writeText(text)
  }
}
