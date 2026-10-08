export interface TextFileExport {
  readonly filename: string
  readonly content: string
  readonly mimeType: 'text/plain' | 'application/json'
}

export type TextFileExportResult =
  | { readonly status: 'downloaded' | 'saved'; readonly filename: string }
  | { readonly status: 'cancelled' }

export interface TextFileExportPort {
  exportFile(file: TextFileExport): Promise<TextFileExportResult>
}

export function describeFileExport(result: TextFileExportResult): string {
  if (result.status === 'cancelled') return '已取消匯出，原有資料保留。'
  if (result.status === 'saved') return `已儲存 ${result.filename}。可在「檔案」App 的匯出資料夾查看。`
  return `已開始下載 ${result.filename}。`
}

export const FILE_EXPORT_ERROR = '無法匯出檔案，原有資料保留。請重試。'
