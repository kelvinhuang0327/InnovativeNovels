import type { PwaController } from '../../application/pwa/usePwaController'

type PwaControlsProps = PwaController

export function PwaControls({
  installAvailable,
  online,
  updateAvailable,
  requestInstall,
  applyUpdate,
}: PwaControlsProps) {
  if (online && !installAvailable && !updateAvailable) {
    return null
  }

  return (
    <aside aria-label="應用程式狀態" className="pwa-controls">
      {!online && (
        <p aria-live="polite" className="pwa-status" role="status">
          目前為離線模式，已載入的書籍仍可繼續閱讀。
        </p>
      )}

      {installAvailable && (
        <button type="button" onClick={() => void requestInstall()}>
          安裝應用程式
        </button>
      )}

      {updateAvailable && (
        <div className="pwa-update" role="status">
          <span>有新版內容可用，閱讀告一段落後再更新。</span>
          <button type="button" onClick={() => void applyUpdate()}>
            更新應用程式
          </button>
        </div>
      )}
    </aside>
  )
}
