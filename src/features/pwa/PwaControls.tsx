import type { PwaController } from '../../application/pwa/usePwaController'

type PwaControlsProps = PwaController

export function PwaControls({
  installAvailable,
  installRequesting,
  manualInstallGuidanceVisible,
  online,
  updatePromptVisible,
  updateApplying,
  pwaActionError,
  requestInstall,
  applyUpdate,
  dismissManualInstallGuidance,
  dismissUpdatePrompt,
}: PwaControlsProps) {
  const handleInstall = () => {
    void requestInstall().catch(() => undefined)
  }
  const handleUpdate = () => {
    void applyUpdate().catch(() => undefined)
  }

  if (
    online &&
    !installAvailable &&
    !updatePromptVisible &&
    !manualInstallGuidanceVisible &&
    !pwaActionError
  ) {
    return null
  }

  return (
    <aside aria-label="應用程式狀態" className="pwa-controls">
      {pwaActionError && (
        <p aria-live="assertive" className="pwa-action-error" role="alert">
          {pwaActionError === 'install'
            ? '安裝失敗，請再試一次。'
            : '更新失敗，請再試一次。'}
        </p>
      )}

      {!online && (
        <p aria-live="polite" className="pwa-status" role="status">
          目前為離線模式，已載入的書籍仍可繼續閱讀。
        </p>
      )}

      {installAvailable && (
        <button
          disabled={installRequesting}
          type="button"
          onClick={handleInstall}
        >
          {installRequesting ? '安裝中…' : '安裝應用程式'}
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

      {updatePromptVisible && (
        <div
          aria-busy={updateApplying}
          className="pwa-update"
          role="status"
        >
          <span>有新版內容可用，閱讀告一段落後再更新。</span>
          <button
            disabled={updateApplying}
            type="button"
            onClick={handleUpdate}
          >
            {updateApplying ? '更新中…' : '更新應用程式'}
          </button>
          <button
            disabled={updateApplying}
            type="button"
            onClick={dismissUpdatePrompt}
          >
            稍後
          </button>
        </div>
      )}
    </aside>
  )
}
