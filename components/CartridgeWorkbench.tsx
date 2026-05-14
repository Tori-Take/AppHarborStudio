'use client'

import { useState, type ReactNode } from 'react'
import { ModeTabs, type Mode } from '@/components/ModeTabs'

type Props = {
  appId:          string
  developSection: ReactNode
  previewSection: ReactNode
  releaseSection: ReactNode
}

/**
 * カートリッジ詳細の「現在のモード」に応じてセクションを出し分けるクライアントラッパー。
 *
 * - 上部: ModeTabs (開発 / プレビュー / リリース)
 * - 下部: 選択中モードの slot だけ描画
 *
 * localStorage 復元は ModeTabs 側で行い、onChange 経由でこちらの mode を更新する。
 * SSR では develop モードでレンダリングされ、hydration 後に保存モードへ即切替する。
 */
export function CartridgeWorkbench({ appId, developSection, previewSection, releaseSection }: Props) {
  const [mode, setMode] = useState<Mode>('develop')

  return (
    <>
      <ModeTabs appId={appId} onChange={setMode} />

      {mode === 'develop' && developSection}
      {mode === 'preview' && previewSection}
      {mode === 'release' && releaseSection}
    </>
  )
}
