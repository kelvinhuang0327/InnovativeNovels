import type { PwaController } from '../../application/pwa/usePwaController'

type PwaControlsProps = PwaController

export function PwaControls({
  installAvailable,
  manualInstallGuidanceVisible,
  online,
  updateAvailable,
  requestInstall,
  applyUpdate,
  dismissManualInstallGuidance,
}: PwaControlsProps) {
  if (
    online &&
    !installAvailable &&
    !updateAvailable &&
    !manualInstallGuidanceVisible
  ) {
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

      {manualInstallGuidanceVisible && (
        <section
          aria-labelledby="ios-install-guidance-heading"
          className="pwa-ios-guidance"
        >
          <h2 id="ios-install-guidance-heading">將應用程式加入主畫面</h2>
          <ol>
            <li>開啟瀏覽器的「分享」或「動作」選單。</li>
            <li>選擇「加入主畫面」。</li>
            <li>確認名稱後點選「加入」。</li>
          </ol>
          <button
            aria-label="關閉加入主畫面說明"
            type="button"
            onClick={dismissManualInstallGuidance}
          >
            知道了
          </button>
        </section>
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
