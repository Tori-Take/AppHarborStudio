'use client'

import { PermissionPanel } from '@/components/PermissionPanel'
import { useFullscreenMode } from '@/lib/use-fullscreen-mode'

/**
 * /org/[slug]/* のレイアウト。
 *
 * 設計:
 *   親 <main> は overflow-hidden として「フレーム」化し、
 *   中身（コンテンツ列 / PermissionPanel）が個別に縦スクロールする。
 *
 * 全画面表示モード:
 *   sessionStorage 経由で全画面状態を保持。PermissionPanel を非表示にし、
 *   PreviewNav も無くなるのでカートリッジだけが全画面表示される。
 *   ページ遷移後も状態を維持する。
 *
 * 自動レスポンシブ:
 *   ビューポート幅 768px 未満では PermissionPanel を非表示にする
 *   （Tailwind の `hidden md:flex` で制御）。
 */
export default function OrgLayout({ children }: { children: React.ReactNode }) {
  const [fullscreenMode] = useFullscreenMode()

  return (
    <div
      style={{
        display:  'flex',
        height:   fullscreenMode ? '100dvh' : 'calc(100dvh - 50px)',
        overflow: 'hidden',
      }}
    >
      <div style={{ flex: 1, minWidth: 0, overflowY: 'auto' }}>
        {children}
      </div>
      {!fullscreenMode && (
        <div className="hidden md:flex">
          <PermissionPanel />
        </div>
      )}
    </div>
  )
}
