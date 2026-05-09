# PatrolNavi 🛡️

安全パトロール管理アプリ。

## 主な機能

- パトロール記録（写真添付・コメント）
- 承認ワークフロー（テンプレ可変、step type 拡張）
- 是正アクション管理（担当者・期限・進捗）
- NG ダッシュボード（月次推移・ランキング）
- PDF 出力
- チェックリストテンプレートのバージョン管理

## 権限ロール

| ロール | 内容 |
|---|---|
| `viewer` | 閲覧のみ |
| `patroller` | viewer + 新規パトロール・編集・自分が assignee の step 操作 |
| `admin` | patroller + テンプレ管理・組織内すべての是正操作 |

## 利用テーブル

`patrol_*` prefix のテーブル群（既存 migration 0023, 0040, 0041, 0043 で作成済み）:
patrol_check_sheets / patrol_sheet_items / patrol_sheet_steps /
patrol_workflow_templates / patrol_workflow_steps /
patrol_checklist_templates / patrol_items /
patrol_corrective_actions / patrol_configs

## ストレージ

`patrol-attachments` バケット（migration 0039 で作成済み）

## インストール

```bash
npm run cartridge:install ./cartridges/patrol-navi
```

## アンインストール

```bash
npm run cartridge:uninstall patrol-navi
```

DB データは保護のため自動削除されません。
