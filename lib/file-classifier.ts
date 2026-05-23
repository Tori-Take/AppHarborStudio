/**
 * 変更ファイルパス → 影響を受けるステージ の分類ロジック。
 *
 * Studio がカートリッジの新コミットを検出した時に、
 * 「どのステージを再検証すべきか」を機械的に判定する。
 */

export type StageNum = 1 | 2 | 3 | 4 | 5

export type FileClassification = {
  /** 影響を受けるステージ番号 (昇順) */
  affectedStages: StageNum[]
  /** 人間向けの説明 (UI 表示用) */
  description: string
  /**
   * カテゴリ:
   *   - code:   routes/ や lib/ などのアプリコード
   *   - schema: db/schema.sql など DB 構造
   *   - data:   db/sample-data.sql などサンプルデータ
   *   - meta:   manifest.json など (権限変更等の影響あり)
   *   - docs:   ドキュメント (.md, .appharbor/)
   *   - released: db/schema.released.sql など Plan B baseline
   *   - other:  その他 (デフォルト)
   */
  category: 'code' | 'schema' | 'data' | 'meta' | 'docs' | 'released' | 'other'
}

/**
 * 1 ファイルの分類を返す。
 *
 * @param filepath カートリッジリポルートからの相対パス (例: "routes/page.tsx")
 */
export function classifyFile(filepath: string): FileClassification {
  const p = filepath.replace(/\\/g, '/')

  // Plan B baseline → 再検証不要 (自分で更新するファイル)
  if (p === 'db/schema.released.sql') {
    return {
      affectedStages: [],
      description: 'Plan B baseline (検証対象外)',
      category: 'released',
    }
  }

  // スキーマ変更 → migration が必要。Stage 1 で動作確認 + 5 で本番反映
  // Stage 2/3 は Docker / Studio Supabase での動作確認なので Postgres 固有のバグを潰したい場合に再検証
  if (p === 'db/schema.sql') {
    return {
      affectedStages: [1, 2, 3, 5],
      description: 'スキーマ変更 (要 migration)',
      category: 'schema',
    }
  }

  // サンプルデータ → 本番には流れない。PGlite だけ
  if (p === 'db/sample-data.sql' || p.startsWith('db/seeds/')) {
    return {
      affectedStages: [1],
      description: 'サンプルデータ',
      category: 'data',
    }
  }

  // routes/ 配下 → コードのみ。push すれば本番自動反映 (fetch-cartridges)
  if (p.startsWith('routes/')) {
    return {
      affectedStages: [1],
      description: 'アプリコード (push で本番自動反映)',
      category: 'code',
    }
  }

  // manifest.json → 権限 / メタ。Stage 1 で再確認 + Stage 4 で registry 再登録の可能性
  if (p === 'manifest.json') {
    return {
      affectedStages: [1, 4],
      description: 'メタ情報 (権限変更の可能性)',
      category: 'meta',
    }
  }

  // ドキュメント類 → 再検証不要
  if (p === 'CLAUDE.md' || p === 'AGENTS.md' || p === 'README.md' || p.startsWith('.appharbor/')) {
    return {
      affectedStages: [],
      description: 'ドキュメント (再検証不要)',
      category: 'docs',
    }
  }

  // icon.svg / images など
  if (p === 'icon.svg' || p.startsWith('assets/') || p.startsWith('public/')) {
    return {
      affectedStages: [1],
      description: 'アセット',
      category: 'code',
    }
  }

  // .gitignore / .editorconfig など隠しファイル
  if (p.startsWith('.')) {
    return {
      affectedStages: [],
      description: '設定ファイル (再検証不要)',
      category: 'docs',
    }
  }

  // 不明 → 念のため Stage 1 再検証
  return {
    affectedStages: [1],
    description: 'その他',
    category: 'other',
  }
}

/**
 * 複数ファイルの分類を集約し、再検証すべきステージの和集合を返す。
 *
 * @param filepaths 変更ファイル一覧
 * @returns 再検証推奨ステージ、最も浅い (= 最初に戻るべき) ステージ番号、ファイル別分類
 */
export function classifyFiles(filepaths: string[]): {
  affectedStages: StageNum[]
  rollbackTo: StageNum | null
  byFile: Array<{ file: string; classification: FileClassification }>
  needsReVerification: boolean
} {
  const byFile = filepaths.map(f => ({ file: f, classification: classifyFile(f) }))
  const stageSet = new Set<StageNum>()
  for (const { classification } of byFile) {
    for (const s of classification.affectedStages) stageSet.add(s)
  }
  const affectedStages = [...stageSet].sort((a, b) => a - b) as StageNum[]
  const rollbackTo = affectedStages.length > 0 ? affectedStages[0] : null

  return {
    affectedStages,
    rollbackTo,
    byFile,
    needsReVerification: affectedStages.length > 0,
  }
}
