-- ============================================================
-- PatrolNavi v2.0.0 — 統合スキーマ（cartridge canonical）
--
-- このファイルは「カートリッジ install 時 / db reset 時に流される
-- 単一の冪等スキーマ」。同じテーブル / インデックス / RLS が既に
-- 存在する場合でもエラーにならないよう、すべて IF NOT EXISTS /
-- DROP IF EXISTS の冪等パターンで書く。
--
-- 詳細な変更履歴は db/CHANGELOG.md を参照。
-- ============================================================

-- ─── チェックリストテンプレート ───────────────────────────────
CREATE TABLE IF NOT EXISTS patrol_checklist_templates (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            TEXT        NOT NULL,
  description     TEXT,
  is_active       BOOLEAN     NOT NULL DEFAULT true,
  sort_order      INTEGER     NOT NULL DEFAULT 0,
  version         INTEGER     NOT NULL DEFAULT 1,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);
DROP TRIGGER IF EXISTS set_updated_at ON patrol_checklist_templates;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON patrol_checklist_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── チェック項目 ─────────────────────────────────────────────
-- v2.4.0: チェック項目に 3 階層カテゴリ + display_style + weight +
--         regulation_ref + input_type（拡張用）を追加
CREATE TABLE IF NOT EXISTS patrol_items (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  checklist_template_id UUID        NOT NULL REFERENCES patrol_checklist_templates(id) ON DELETE CASCADE,
  category1             TEXT        NOT NULL DEFAULT '',
  category2             TEXT        NOT NULL DEFAULT '',
  category3             TEXT        NOT NULL DEFAULT '',
  item_text             TEXT        NOT NULL,
  sort_order            INTEGER     NOT NULL DEFAULT 0,
  is_important          BOOLEAN     NOT NULL DEFAULT false,
  display_style         TEXT        NOT NULL DEFAULT 'normal'
                                    CHECK (display_style IN ('normal','important_red','important_bold','critical')),
  weight                NUMERIC     NOT NULL DEFAULT 1.0,
  regulation_ref        TEXT,
  input_type            TEXT        NOT NULL DEFAULT 'result_only'
                                    CHECK (input_type IN ('result_only','result_with_number','result_with_text','result_with_choices')),
  is_active             BOOLEAN     NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- 既存環境向け: 列追加（冪等）
ALTER TABLE patrol_items
  ADD COLUMN IF NOT EXISTS category3      TEXT    NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS display_style  TEXT    NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS weight         NUMERIC NOT NULL DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS regulation_ref TEXT,
  ADD COLUMN IF NOT EXISTS input_type     TEXT    NOT NULL DEFAULT 'result_only';
ALTER TABLE patrol_items DROP CONSTRAINT IF EXISTS patrol_items_display_style_check;
ALTER TABLE patrol_items
  ADD CONSTRAINT patrol_items_display_style_check
  CHECK (display_style IN ('normal','important_red','important_bold','critical'));
ALTER TABLE patrol_items DROP CONSTRAINT IF EXISTS patrol_items_input_type_check;
ALTER TABLE patrol_items
  ADD CONSTRAINT patrol_items_input_type_check
  CHECK (input_type IN ('result_only','result_with_number','result_with_text','result_with_choices'));
DROP TRIGGER IF EXISTS set_updated_at ON patrol_items;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON patrol_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── ワークフローテンプレート ─────────────────────────────────
CREATE TABLE IF NOT EXISTS patrol_workflow_templates (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            TEXT        NOT NULL,
  description     TEXT,
  is_active       BOOLEAN     NOT NULL DEFAULT true,
  sort_order      INTEGER     NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);
DROP TRIGGER IF EXISTS set_updated_at ON patrol_workflow_templates;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON patrol_workflow_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── ワークフローステップ定義 ─────────────────────────────────
-- v2.2.0:
--   step_type に 'notify' / 'final_approve' を追加（並列内で承認＝完了 / 閲覧記録のみ）
--   assignee_role_label / assignee_user_name はテキスト保存（テンプレが組織内で
--   人事異動・退職に強くなる。シート提出時に display_name 一致で resolve）
--   UNIQUE (template_id, step_order) は外す。同 step_order が並列ステップを表現。
CREATE TABLE IF NOT EXISTS patrol_workflow_steps (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id           UUID        NOT NULL REFERENCES patrol_workflow_templates(id) ON DELETE CASCADE,
  step_order            INTEGER     NOT NULL,
  step_name             TEXT        NOT NULL,
  step_type             TEXT        NOT NULL DEFAULT 'review'
                                    CHECK (step_type IN ('review', 'comment', 'notify', 'final_approve')),
  assignee_role_label   TEXT,                    -- 例: "現場責任者"（テキスト）
  assignee_user_name    TEXT,                    -- 既定担当者の表示名（任意）
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- 既存環境向け: 列追加 + UNIQUE / CHECK の入れ替え（冪等）
ALTER TABLE patrol_workflow_steps
  ADD COLUMN IF NOT EXISTS assignee_role_label  TEXT,
  ADD COLUMN IF NOT EXISTS assignee_user_name   TEXT;
ALTER TABLE patrol_workflow_steps
  DROP CONSTRAINT IF EXISTS patrol_workflow_steps_template_id_step_order_key;
ALTER TABLE patrol_workflow_steps
  DROP CONSTRAINT IF EXISTS patrol_workflow_steps_step_type_check;
ALTER TABLE patrol_workflow_steps
  ADD CONSTRAINT patrol_workflow_steps_step_type_check
  CHECK (step_type IN ('review', 'comment', 'notify', 'final_approve'));
DROP TRIGGER IF EXISTS set_updated_at ON patrol_workflow_steps;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON patrol_workflow_steps
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── パトロール実績（チェックシート） ────────────────────────
CREATE TABLE IF NOT EXISTS patrol_check_sheets (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  checklist_template_id UUID        NOT NULL REFERENCES patrol_checklist_templates(id),
  template_version      INTEGER,
  workflow_template_id  UUID        NOT NULL REFERENCES patrol_workflow_templates(id),
  patrol_date           DATE        NOT NULL,
  site_name             TEXT        NOT NULL,
  crew_name             TEXT,
  patroller_id          UUID        NOT NULL REFERENCES profiles(id),
  status                TEXT        NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','in_progress','completed','remanded')),
  current_step          INTEGER     NOT NULL DEFAULT 0,
  feedback              TEXT,
  feedback_photo_urls   TEXT[]      NOT NULL DEFAULT '{}',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at            TIMESTAMPTZ
);
-- v2.6.0: 既存テーブルへの追加
ALTER TABLE patrol_check_sheets
  ADD COLUMN IF NOT EXISTS feedback_photo_urls TEXT[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS idx_patrol_check_sheets_template_version
  ON patrol_check_sheets(checklist_template_id, template_version);
DROP TRIGGER IF EXISTS set_updated_at ON patrol_check_sheets;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON patrol_check_sheets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── 検査結果（シート × 項目） ────────────────────────────────
-- v2.4.0: 項目スナップショット (category3 / display_style / weight /
--         regulation_ref / input_type) を追加
CREATE TABLE IF NOT EXISTS patrol_sheet_items (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  sheet_id        UUID        NOT NULL REFERENCES patrol_check_sheets(id) ON DELETE CASCADE,
  item_id         UUID        REFERENCES patrol_items(id) ON DELETE SET NULL,
  category1       TEXT        NOT NULL DEFAULT '',
  category2       TEXT        NOT NULL DEFAULT '',
  category3       TEXT        NOT NULL DEFAULT '',
  item_text       TEXT        NOT NULL,
  is_important    BOOLEAN     NOT NULL DEFAULT false,
  display_style   TEXT        NOT NULL DEFAULT 'normal',
  weight          NUMERIC     NOT NULL DEFAULT 1.0,
  regulation_ref  TEXT,
  input_type      TEXT        NOT NULL DEFAULT 'result_only',
  sort_order      INTEGER     NOT NULL DEFAULT 0,
  result          TEXT        CHECK (result IN ('ok','ng','none')),
  photo_urls      TEXT[]      NOT NULL DEFAULT '{}',
  comment         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE patrol_sheet_items
  ADD COLUMN IF NOT EXISTS category3      TEXT    NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS display_style  TEXT    NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS weight         NUMERIC NOT NULL DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS regulation_ref TEXT,
  ADD COLUMN IF NOT EXISTS input_type     TEXT    NOT NULL DEFAULT 'result_only';
DROP TRIGGER IF EXISTS set_updated_at ON patrol_sheet_items;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON patrol_sheet_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── ワークフロー実行状態（シート × ステップ） ───────────────
-- v2.2.0: テンプレ列の snapshot を保持して「半年後でも当時の役割が分かる」
--         状態を担保。resolved_assignee_id で実 user へリンク（user 退職時 NULL）
CREATE TABLE IF NOT EXISTS patrol_sheet_steps (
  id                              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  sheet_id                        UUID        NOT NULL REFERENCES patrol_check_sheets(id) ON DELETE CASCADE,
  step_order                      INTEGER     NOT NULL,
  step_name                       TEXT        NOT NULL,
  step_type                       TEXT        NOT NULL DEFAULT 'review'
                                              CHECK (step_type IN ('review', 'comment', 'notify', 'final_approve')),
  assignee_id                     UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  assignee_role_label_snapshot    TEXT,
  assignee_user_name_snapshot     TEXT,
  resolved_assignee_id            UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  status                          TEXT        NOT NULL DEFAULT 'pending'
                                              CHECK (status IN ('pending','approved','remanded')),
  comment                         TEXT,
  acted_at                        TIMESTAMPTZ,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- 既存環境向け
ALTER TABLE patrol_sheet_steps
  ADD COLUMN IF NOT EXISTS assignee_role_label_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS assignee_user_name_snapshot  TEXT,
  ADD COLUMN IF NOT EXISTS resolved_assignee_id         UUID REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE patrol_sheet_steps
  DROP CONSTRAINT IF EXISTS patrol_sheet_steps_sheet_id_step_order_key;
ALTER TABLE patrol_sheet_steps
  DROP CONSTRAINT IF EXISTS patrol_sheet_steps_step_type_check;
ALTER TABLE patrol_sheet_steps
  ADD CONSTRAINT patrol_sheet_steps_step_type_check
  CHECK (step_type IN ('review', 'comment', 'notify', 'final_approve'));
DROP TRIGGER IF EXISTS set_updated_at ON patrol_sheet_steps;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON patrol_sheet_steps
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── 是正アクション ──────────────────────────────────────────
-- NG 項目の「いつ・誰が・何をやり直したか」追跡。
-- 1 sheet_item に複数アクションを紐付け可（再点検→再 NG→再是正）。
-- 状態遷移: open → in_progress → completed / cancelled
CREATE TABLE IF NOT EXISTS patrol_corrective_actions (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  sheet_item_id     uuid        NOT NULL REFERENCES patrol_sheet_items(id) ON DELETE CASCADE,
  assignee_id       uuid        NOT NULL REFERENCES profiles(id),
  due_date          date,
  status            text        NOT NULL DEFAULT 'open'
                                CHECK (status IN ('open', 'in_progress', 'completed', 'cancelled')),
  comment           text,
  before_photo_urls text[]      NOT NULL DEFAULT '{}',
  after_photo_urls  text[]      NOT NULL DEFAULT '{}',
  created_by        uuid        NOT NULL REFERENCES profiles(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  completed_at      timestamptz,
  completion_note   text
);
CREATE INDEX IF NOT EXISTS idx_corrective_org_status
  ON patrol_corrective_actions(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_corrective_assignee_status
  ON patrol_corrective_actions(assignee_id, status);
CREATE INDEX IF NOT EXISTS idx_corrective_sheet_item
  ON patrol_corrective_actions(sheet_item_id);

CREATE OR REPLACE FUNCTION set_corrective_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_corrective_updated_at ON patrol_corrective_actions;
CREATE TRIGGER trg_corrective_updated_at
  BEFORE UPDATE ON patrol_corrective_actions
  FOR EACH ROW EXECUTE FUNCTION set_corrective_updated_at();

-- ─── ワークフローコメントスレッド（v2.3.0）───────────────────
-- 仕様: docs/v2-spec.md §4.4
-- フロー進行と独立した dialogue。@mention で通知 (実装は通知 phase)。
-- requires_response=true のコメントは「返答待ち」、誰か mentioned_user が
-- 返信投稿すると resolved_at が立ち「返答済」化。
CREATE TABLE IF NOT EXISTS patrol_sheet_comments (
  id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       UUID         NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  sheet_id              UUID         NOT NULL REFERENCES patrol_check_sheets(id) ON DELETE CASCADE,
  author_user_id        UUID         REFERENCES profiles(id) ON DELETE SET NULL,
  author_name_snapshot  TEXT         NOT NULL,
  body                  TEXT         NOT NULL,
  mentioned_user_ids    UUID[]       NOT NULL DEFAULT '{}',
  mentioned_user_names  TEXT[]       NOT NULL DEFAULT '{}',
  requires_response     BOOLEAN      NOT NULL DEFAULT false,
  resolved_at           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_patrol_sheet_comments_sheet
  ON patrol_sheet_comments(sheet_id, created_at);
CREATE INDEX IF NOT EXISTS idx_patrol_sheet_comments_org
  ON patrol_sheet_comments(organization_id);

-- ─── 設定 ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS patrol_configs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS set_updated_at ON patrol_configs;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON patrol_configs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE patrol_checklist_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE patrol_items               ENABLE ROW LEVEL SECURITY;
ALTER TABLE patrol_workflow_templates  ENABLE ROW LEVEL SECURITY;
ALTER TABLE patrol_workflow_steps      ENABLE ROW LEVEL SECURITY;
ALTER TABLE patrol_check_sheets        ENABLE ROW LEVEL SECURITY;
ALTER TABLE patrol_sheet_items         ENABLE ROW LEVEL SECURITY;
ALTER TABLE patrol_sheet_steps         ENABLE ROW LEVEL SECURITY;
ALTER TABLE patrol_corrective_actions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE patrol_sheet_comments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE patrol_configs             ENABLE ROW LEVEL SECURITY;

-- 組織境界ポリシー（organization_id を直接持つテーブル）
DROP POLICY IF EXISTS "org_isolation" ON patrol_checklist_templates;
CREATE POLICY "org_isolation" ON patrol_checklist_templates
  FOR ALL TO authenticated
  USING (organization_id = (auth.jwt() ->> 'organization_id')::uuid);

DROP POLICY IF EXISTS "org_isolation" ON patrol_items;
CREATE POLICY "org_isolation" ON patrol_items
  FOR ALL TO authenticated
  USING (organization_id = (auth.jwt() ->> 'organization_id')::uuid);

DROP POLICY IF EXISTS "org_isolation" ON patrol_workflow_templates;
CREATE POLICY "org_isolation" ON patrol_workflow_templates
  FOR ALL TO authenticated
  USING (organization_id = (auth.jwt() ->> 'organization_id')::uuid);

DROP POLICY IF EXISTS "org_isolation" ON patrol_check_sheets;
CREATE POLICY "org_isolation" ON patrol_check_sheets
  FOR ALL TO authenticated
  USING (organization_id = (auth.jwt() ->> 'organization_id')::uuid);

DROP POLICY IF EXISTS "org_isolation" ON patrol_configs;
CREATE POLICY "org_isolation" ON patrol_configs
  FOR ALL TO authenticated
  USING (organization_id = (auth.jwt() ->> 'organization_id')::uuid);

DROP POLICY IF EXISTS "corrective_actions_org_boundary" ON patrol_corrective_actions;
CREATE POLICY "corrective_actions_org_boundary" ON patrol_corrective_actions
  FOR ALL TO authenticated
  USING (organization_id = (auth.jwt() ->> 'organization_id')::uuid);

DROP POLICY IF EXISTS "org_isolation" ON patrol_sheet_comments;
CREATE POLICY "org_isolation" ON patrol_sheet_comments
  FOR ALL TO authenticated
  USING (organization_id = (auth.jwt() ->> 'organization_id')::uuid);

-- サブテーブル（親テーブルの組織で判定）
DROP POLICY IF EXISTS "org_isolation" ON patrol_workflow_steps;
CREATE POLICY "org_isolation" ON patrol_workflow_steps
  FOR ALL TO authenticated
  USING (
    template_id IN (
      SELECT id FROM patrol_workflow_templates
      WHERE organization_id = (auth.jwt() ->> 'organization_id')::uuid
    )
  );

DROP POLICY IF EXISTS "org_isolation" ON patrol_sheet_items;
CREATE POLICY "org_isolation" ON patrol_sheet_items
  FOR ALL TO authenticated
  USING (
    sheet_id IN (
      SELECT id FROM patrol_check_sheets
      WHERE organization_id = (auth.jwt() ->> 'organization_id')::uuid
    )
  );

DROP POLICY IF EXISTS "org_isolation" ON patrol_sheet_steps;
CREATE POLICY "org_isolation" ON patrol_sheet_steps
  FOR ALL TO authenticated
  USING (
    sheet_id IN (
      SELECT id FROM patrol_check_sheets
      WHERE organization_id = (auth.jwt() ->> 'organization_id')::uuid
    )
  );

-- ============================================================
-- Storage
-- 写真添付バケット: パトロール項目ごとの現場写真
-- パス規約: {organization_id}/{sheet_id}/{item_id}/{uuid}.{ext}
-- 制約: private / 10MB / 画像のみ
-- UPDATE/DELETE は service_role 経由のみ（authenticated には付与しない）
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'patrol-attachments',
  'patrol-attachments',
  false,
  10485760,
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif'
  ]
) ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "patrol_attachments_insert" ON storage.objects;
CREATE POLICY "patrol_attachments_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'patrol-attachments');

DROP POLICY IF EXISTS "patrol_attachments_select" ON storage.objects;
CREATE POLICY "patrol_attachments_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'patrol-attachments');

-- ============================================================
-- v2.1.0: ロール定義 / バインディング / 部署管理者スコープ
-- 詳細は cartridges/patrol-navi/docs/v2-spec.md §2 を参照
-- ============================================================

-- アプリ内ロール定義（組織管理者が自由に追加・削除可能）
CREATE TABLE IF NOT EXISTS patrol_workflow_roles (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID         NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  key             TEXT         NOT NULL,                       -- slug 例: 'site_manager'
  label           TEXT         NOT NULL,                       -- 表示名 例: '現場責任者'
  description     TEXT,
  sort_order      INTEGER      NOT NULL DEFAULT 0,
  is_system       BOOLEAN      NOT NULL DEFAULT false,         -- パトロール者は true（削除不可）
  deleted_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (organization_id, key)
);
DROP TRIGGER IF EXISTS set_updated_at ON patrol_workflow_roles;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON patrol_workflow_roles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE INDEX IF NOT EXISTS idx_patrol_workflow_roles_org_sort
  ON patrol_workflow_roles(organization_id, sort_order, deleted_at);

-- ロール → ユーザー紐付け（組織既定の解決元）
CREATE TABLE IF NOT EXISTS patrol_workflow_role_bindings (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID         NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role_id         UUID         NOT NULL REFERENCES patrol_workflow_roles(id) ON DELETE CASCADE,
  user_id         UUID         NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (role_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_patrol_workflow_role_bindings_role
  ON patrol_workflow_role_bindings(role_id);
CREATE INDEX IF NOT EXISTS idx_patrol_workflow_role_bindings_user
  ON patrol_workflow_role_bindings(user_id);

-- 部署管理者の追加スコープ部署
-- デフォルトは自部署+配下、組織管理者がここで追加部署を指定可
CREATE TABLE IF NOT EXISTS patrol_dept_admin_scopes (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID         NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  dept_admin_user_id  UUID         NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  dept_id             UUID         NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (dept_admin_user_id, dept_id)
);
CREATE INDEX IF NOT EXISTS idx_patrol_dept_admin_scopes_user
  ON patrol_dept_admin_scopes(dept_admin_user_id);

-- RLS
ALTER TABLE patrol_workflow_roles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE patrol_workflow_role_bindings  ENABLE ROW LEVEL SECURITY;
ALTER TABLE patrol_dept_admin_scopes       ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_isolation" ON patrol_workflow_roles;
CREATE POLICY "org_isolation" ON patrol_workflow_roles
  FOR ALL TO authenticated
  USING (organization_id = (auth.jwt() ->> 'organization_id')::uuid);

DROP POLICY IF EXISTS "org_isolation" ON patrol_workflow_role_bindings;
CREATE POLICY "org_isolation" ON patrol_workflow_role_bindings
  FOR ALL TO authenticated
  USING (organization_id = (auth.jwt() ->> 'organization_id')::uuid);

DROP POLICY IF EXISTS "org_isolation" ON patrol_dept_admin_scopes;
CREATE POLICY "org_isolation" ON patrol_dept_admin_scopes
  FOR ALL TO authenticated
  USING (organization_id = (auth.jwt() ->> 'organization_id')::uuid);

-- ============================================================
-- アプリ登録（v2.1.0 で permissions 簡略化: viewer / admin の 2 段階）
-- viewer (default) : アプリへのアクセス。組織メンバー全員が既定で持つ
-- admin            : テンプレート管理・役割管理・組織内全シート操作
-- 「業務操作権限」は workflow_roles + bindings で動的解決（v2.2.0+）
-- ============================================================
INSERT INTO apps (app_id, display_name, description, version, permissions, default_permission, status)
VALUES (
  'patrol-navi',
  'PatrolNavi',
  '安全パトロール管理アプリ。チェックリストと承認ワークフローをカスタマイズして現場の安全確認を効率化します。',
  '2.4.0',
  ARRAY['viewer', 'admin'],
  'viewer',
  'active'
)
ON CONFLICT (app_id) DO UPDATE SET
  display_name       = EXCLUDED.display_name,
  description        = EXCLUDED.description,
  version            = EXCLUDED.version,
  permissions        = EXCLUDED.permissions,
  default_permission = EXCLUDED.default_permission,
  status             = EXCLUDED.status;
