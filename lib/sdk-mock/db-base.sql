-- Studio ベーススキーマ
-- AppHarbor 本体のコアテーブル / Supabase 提供スキーマのスタブを作成し、
-- カートリッジの schema.sql が参照する次を提供する:
--   - organizations / profiles / auth.users / apps
--   - auth.uid() / auth.jwt()
--   - storage.buckets / storage.objects
--   - update_updated_at() トリガ関数
--
-- 注意: SQL 言語の関数は CREATE 時に本体の依存解決を行うため、
--       「先にテーブル → 後で関数」の順序で書く必要がある。

-- Studio は既定で superuser 接続のため、この設定自体は素通り（bypass）に
-- 影響しない（superuser は row_security の値によらず常に RLS を bypass する）。
-- 厳格モード（authenticated ロールへ切り替える。db-base.sql 末尾の GRANT 節と
-- lib/sdk-mock/supabase-mock.ts の runQuery を参照）では、この設定のままだと
-- 「row_security is off」エラーになるため、対象トランザクション内で明示的に
-- `set local row_security = on;` して上書きする。
set row_security = off;

-- PGlite は pgcrypto 不要（PG13+ の標準 gen_random_uuid を使う）

-- ============================================================
-- スキーマ
-- ============================================================
create schema if not exists auth;
create schema if not exists storage;

-- ============================================================
-- Supabase 互換ロール（RLS の `TO authenticated` 等が通るため）
-- Studio では RLS は無効化しているので、ロールは「存在するだけで OK」。
-- ============================================================
do $$ begin
  if not exists (select from pg_roles where rolname = 'authenticated') then
    create role authenticated;
  end if;
  if not exists (select from pg_roles where rolname = 'anon') then
    create role anon;
  end if;
  if not exists (select from pg_roles where rolname = 'service_role') then
    create role service_role;
  end if;
end $$;

-- ============================================================
-- テーブル（先に全部作成。関数 / RLS の依存解決のため）
-- ============================================================
create table if not exists auth.users (
  id    uuid primary key default gen_random_uuid(),
  email text
);

create table if not exists organizations (
  id         uuid primary key default gen_random_uuid(),
  slug       text unique,
  name       text,
  status     text default 'active',
  deleted_at timestamptz
);

-- 部署スタブ（カートリッジから FK で参照される）
create table if not exists departments (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  parent_id       uuid,
  name            text,
  display_order   int default 0,
  deleted_at      timestamptz
);

create table if not exists profiles (
  id              uuid primary key,
  organization_id uuid references organizations(id) on delete cascade,
  org_role        text default 'member',
  department_id   uuid references departments(id) on delete set null,
  display_name    text,
  status          text default 'active'
);

create table if not exists apps (
  id                 uuid primary key default gen_random_uuid(),
  app_id             text unique,
  display_name       text,
  description        text,
  version            text,
  icon               text,
  permissions        text[] default '{}',
  default_permission text,
  status             text default 'active',
  deleted_at         timestamptz,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);

-- 通知（SDK notify() の保存先。本体の announcements に相当する Studio 版）
create table if not exists notifications (
  id              uuid primary key default gen_random_uuid(),
  source_app_id   text not null,
  organization_id uuid references organizations(id) on delete cascade,
  scope           text not null default 'org',
  target_dept_id  uuid,
  target_user_id  uuid,
  title           text not null,
  body            text not null default '',
  link            text,
  created_by      uuid,
  created_at      timestamptz not null default now()
);

-- 通知の既読管理（ユーザーごと。Studio はユーザー切替があるため通知本体と分離）
create table if not exists notification_reads (
  notification_id uuid references notifications(id) on delete cascade,
  user_id         uuid not null,
  read_at         timestamptz not null default now(),
  primary key (notification_id, user_id)
);

create table if not exists storage.buckets (
  id                 text primary key,
  name               text,
  public             boolean default false,
  file_size_limit    bigint,
  allowed_mime_types text[]
);

create table if not exists storage.objects (
  id         uuid primary key default gen_random_uuid(),
  bucket_id  text references storage.buckets(id) on delete cascade,
  name       text,
  owner      uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  metadata   jsonb
);

-- ============================================================
-- 関数（テーブル作成後）
-- ============================================================

-- auth.uid() スタブ — Studio の現在ユーザー id を保持する
-- 設定変数 (`request.user_id`) を読む。preview ユーザー切替で書き換える。
-- 設定が無い時は org-admin (aaaa...) を返す（service-role 相当）。
create or replace function auth.uid() returns uuid
  language sql stable as $$
  select coalesce(
    nullif(current_setting('request.user_id', true), '')::uuid,
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid
  )
$$;

-- auth.jwt() スタブ — JWT クレームに相当する jsonb を返す。
-- AppHarbor では organization_id クレームを RLS で参照するため、
-- 現在ユーザーの所属組織を埋め込む。
create or replace function auth.jwt() returns jsonb
  language sql stable as $$
  select jsonb_build_object(
    'sub', auth.uid()::text,
    'organization_id', (select organization_id::text from profiles where id = auth.uid()),
    'email', (select email from auth.users where id = auth.uid())
  )
$$;

-- updated_at を自動更新する典型的な関数。本体側の名前と揃える。
create or replace function update_updated_at() returns trigger
  language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================
-- 権限（RLS 厳格モード用）
--
-- Studio は既定で superuser 相当で接続するため、上の `row_security = off`
-- とは無関係に RLS ポリシーは常に素通りする（superuser は row_security の
-- 設定によらず RLS を bypass する）。
--
-- 厳格モード（lib/sdk-mock/rls-mode.ts）では、対象クエリだけ一時的に
-- `SET LOCAL ROLE authenticated` して実行し、schema.sql の RLS ポリシーを
-- 実際に評価させる（lib/sdk-mock/supabase-mock.ts の runQuery 参照）。
-- authenticated は superuser ではないため、その間だけ RLS が効く。
-- そのために全テーブルへの通常権限を用意しておく（テーブルの可視性・行の
-- 絞り込みはロール権限ではなく RLS ポリシーが最終的に担う）。
-- ============================================================
grant usage on schema public, auth, storage to authenticated;
grant all on all tables in schema public to authenticated;
grant all on all tables in schema storage to authenticated;
-- 後から適用されるカートリッジの schema.sql が作るテーブルにも自動で及ぶように
alter default privileges in schema public grant all on tables to authenticated;

-- ============================================================
-- seed: 仮組織・仮ユーザー
-- ============================================================
insert into organizations (id, slug, name)
  values ('11111111-1111-1111-1111-111111111111'::uuid, 'studio-sandbox', 'Studio Sandbox 組織')
  on conflict (id) do nothing;

-- 部署ツリー（3 階層・10 部署）
insert into departments (id, organization_id, parent_id, name, display_order)
  values
    ('22222222-2222-2222-2222-000000000001'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, null,                                          '営業本部',         10),
    ('22222222-2222-2222-2222-000000000010'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, null,                                          '開発本部',         20),
    ('22222222-2222-2222-2222-000000000020'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, null,                                          '管理本部',         30),
    ('22222222-2222-2222-2222-000000000002'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, '22222222-2222-2222-2222-000000000001'::uuid, '国内営業部',       11),
    ('22222222-2222-2222-2222-000000000003'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, '22222222-2222-2222-2222-000000000001'::uuid, '海外営業部',       12),
    ('22222222-2222-2222-2222-000000000011'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, '22222222-2222-2222-2222-000000000010'::uuid, 'プロダクト開発部', 21),
    ('22222222-2222-2222-2222-000000000014'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, '22222222-2222-2222-2222-000000000010'::uuid, '技術研究部',       22),
    ('22222222-2222-2222-2222-000000000021'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, '22222222-2222-2222-2222-000000000020'::uuid, '総務部',           31),
    ('22222222-2222-2222-2222-000000000012'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, '22222222-2222-2222-2222-000000000011'::uuid, 'フロント班',       211),
    ('22222222-2222-2222-2222-000000000013'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, '22222222-2222-2222-2222-000000000011'::uuid, 'バック班',         212)
  on conflict (id) do nothing;

-- 仮ユーザー（30 名）
insert into auth.users (id, email)
  values
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,  'admin@studio.local'),
    ('33333333-3333-3333-3333-000000000101'::uuid, 'yamada@studio.local'),
    ('dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid,  'sato@studio.local'),
    ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'::uuid,  'suzuki@studio.local'),
    ('33333333-3333-3333-3333-000000000201'::uuid, 'takahashi@studio.local'),
    ('33333333-3333-3333-3333-000000000202'::uuid, 'ito@studio.local'),
    ('33333333-3333-3333-3333-000000000203'::uuid, 'watanabe@studio.local'),
    ('33333333-3333-3333-3333-000000000210'::uuid, 'nakamura@studio.local'),
    ('33333333-3333-3333-3333-000000000211'::uuid, 'kobayashi@studio.local'),
    ('33333333-3333-3333-3333-000000000212'::uuid, 'kato@studio.local'),
    ('33333333-3333-3333-3333-000000000300'::uuid, 'yoshida@studio.local'),
    ('33333333-3333-3333-3333-000000000310'::uuid, 'yamamoto@studio.local'),
    ('33333333-3333-3333-3333-000000000311'::uuid, 'matsumoto@studio.local'),
    ('33333333-3333-3333-3333-000000000312'::uuid, 'inoue@studio.local'),
    ('33333333-3333-3333-3333-000000000313'::uuid, 'kimura@studio.local'),
    ('33333333-3333-3333-3333-000000000314'::uuid, 'fukuda@studio.local'),
    ('33333333-3333-3333-3333-000000000320'::uuid, 'hayashi@studio.local'),
    ('33333333-3333-3333-3333-000000000321'::uuid, 'saito@studio.local'),
    ('33333333-3333-3333-3333-000000000322'::uuid, 'shimizu@studio.local'),
    ('33333333-3333-3333-3333-000000000323'::uuid, 'ota@studio.local'),
    ('33333333-3333-3333-3333-000000000330'::uuid, 'yamaguchi@studio.local'),
    ('33333333-3333-3333-3333-000000000331'::uuid, 'mori@studio.local'),
    ('33333333-3333-3333-3333-000000000332'::uuid, 'ikeda@studio.local'),
    ('33333333-3333-3333-3333-000000000333'::uuid, 'hashimoto@studio.local'),
    ('33333333-3333-3333-3333-000000000400'::uuid, 'abe@studio.local'),
    ('33333333-3333-3333-3333-000000000410'::uuid, 'ishikawa@studio.local'),
    ('33333333-3333-3333-3333-000000000411'::uuid, 'maeda@studio.local'),
    ('33333333-3333-3333-3333-000000000412'::uuid, 'fujita@studio.local'),
    ('33333333-3333-3333-3333-000000000413'::uuid, 'goto@studio.local'),
    ('33333333-3333-3333-3333-000000000414'::uuid, 'okada@studio.local')
  on conflict (id) do nothing;

insert into profiles (id, organization_id, org_role, department_id, display_name)
  values
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,  '11111111-1111-1111-1111-111111111111'::uuid, 'org-admin',  null,                                            '田中（org-admin）'),
    ('33333333-3333-3333-3333-000000000101'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'org-admin',  null,                                            '山田（org-admin）'),
    ('dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid,  '11111111-1111-1111-1111-111111111111'::uuid, 'dept-admin', '22222222-2222-2222-2222-000000000001'::uuid,   '佐藤（営業本部長）'),
    ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'::uuid,  '11111111-1111-1111-1111-111111111111'::uuid, 'dept-admin', '22222222-2222-2222-2222-000000000002'::uuid,   '鈴木（国内営業部長）'),
    ('33333333-3333-3333-3333-000000000201'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'member',     '22222222-2222-2222-2222-000000000002'::uuid,   '高橋（国内営業）'),
    ('33333333-3333-3333-3333-000000000202'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'member',     '22222222-2222-2222-2222-000000000002'::uuid,   '伊藤（国内営業）'),
    ('33333333-3333-3333-3333-000000000203'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'member',     '22222222-2222-2222-2222-000000000002'::uuid,   '渡辺（国内営業）'),
    ('33333333-3333-3333-3333-000000000210'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'dept-admin', '22222222-2222-2222-2222-000000000003'::uuid,   '中村（海外営業部長）'),
    ('33333333-3333-3333-3333-000000000211'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'member',     '22222222-2222-2222-2222-000000000003'::uuid,   '小林（海外営業）'),
    ('33333333-3333-3333-3333-000000000212'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'member',     '22222222-2222-2222-2222-000000000003'::uuid,   '加藤（海外営業）'),
    ('33333333-3333-3333-3333-000000000300'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'dept-admin', '22222222-2222-2222-2222-000000000010'::uuid,   '吉田（開発本部長）'),
    ('33333333-3333-3333-3333-000000000310'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'dept-admin', '22222222-2222-2222-2222-000000000011'::uuid,   '山本（プロダクト開発部長）'),
    ('33333333-3333-3333-3333-000000000311'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'member',     '22222222-2222-2222-2222-000000000012'::uuid,   '松本（フロント班）'),
    ('33333333-3333-3333-3333-000000000312'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'member',     '22222222-2222-2222-2222-000000000012'::uuid,   '井上（フロント班）'),
    ('33333333-3333-3333-3333-000000000313'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'member',     '22222222-2222-2222-2222-000000000012'::uuid,   '木村（フロント班）'),
    ('33333333-3333-3333-3333-000000000314'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'member',     '22222222-2222-2222-2222-000000000012'::uuid,   '福田（フロント班）'),
    ('33333333-3333-3333-3333-000000000320'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'member',     '22222222-2222-2222-2222-000000000013'::uuid,   '林（バック班）'),
    ('33333333-3333-3333-3333-000000000321'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'member',     '22222222-2222-2222-2222-000000000013'::uuid,   '斎藤（バック班）'),
    ('33333333-3333-3333-3333-000000000322'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'member',     '22222222-2222-2222-2222-000000000013'::uuid,   '清水（バック班）'),
    ('33333333-3333-3333-3333-000000000323'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'member',     '22222222-2222-2222-2222-000000000013'::uuid,   '太田（バック班）'),
    ('33333333-3333-3333-3333-000000000330'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'dept-admin', '22222222-2222-2222-2222-000000000014'::uuid,   '山口（技術研究部長）'),
    ('33333333-3333-3333-3333-000000000331'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'member',     '22222222-2222-2222-2222-000000000014'::uuid,   '森（技術研究）'),
    ('33333333-3333-3333-3333-000000000332'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'member',     '22222222-2222-2222-2222-000000000014'::uuid,   '池田（技術研究）'),
    ('33333333-3333-3333-3333-000000000333'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'member',     '22222222-2222-2222-2222-000000000014'::uuid,   '橋本（技術研究）'),
    ('33333333-3333-3333-3333-000000000400'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'dept-admin', '22222222-2222-2222-2222-000000000020'::uuid,   '阿部（管理本部長）'),
    ('33333333-3333-3333-3333-000000000410'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'dept-admin', '22222222-2222-2222-2222-000000000021'::uuid,   '石川（総務部長）'),
    ('33333333-3333-3333-3333-000000000411'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'member',     '22222222-2222-2222-2222-000000000021'::uuid,   '前田（総務）'),
    ('33333333-3333-3333-3333-000000000412'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'member',     '22222222-2222-2222-2222-000000000021'::uuid,   '藤田（総務）'),
    ('33333333-3333-3333-3333-000000000413'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'member',     '22222222-2222-2222-2222-000000000021'::uuid,   '後藤（総務）'),
    ('33333333-3333-3333-3333-000000000414'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'member',     '22222222-2222-2222-2222-000000000021'::uuid,   '岡田（総務）')
  on conflict (id) do nothing;
