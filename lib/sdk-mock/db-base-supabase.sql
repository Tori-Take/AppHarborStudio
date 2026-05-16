-- Studio ベーススキーマ (Supabase 用)
--
-- 用途: ローカル Docker Supabase または Studio 専用クラウド Supabase に
-- AppHarbor のコアテーブルを用意する。Studio のローカル PGlite から
-- データを移行する前に「organizations / profiles / apps」が必要なため。
--
-- PGlite 用 db-base.sql との違い:
--   - 全テーブルを `studio` スキーマに入れる (public との衝突を避ける)
--   - auth スキーマ / auth.users は作らない (Supabase が標準で提供)
--   - storage スキーマ / storage.buckets/objects は作らない (Supabase が標準で提供)
--   - auth.uid() / auth.jwt() は作らない (Supabase が標準で提供)
--   - seed データは入れない (PGlite からの移行で投入する)
--
-- 冪等: create table if not exists / create or replace function

-- ============================================================
-- studio スキーマ (public と完全分離)
-- ============================================================

create schema if not exists studio;
set search_path to studio, public;

-- ============================================================
-- コアテーブル
-- ============================================================

create table if not exists organizations (
  id         uuid primary key default gen_random_uuid(),
  slug       text unique,
  name       text,
  status     text default 'active',
  deleted_at timestamptz
);

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

-- ============================================================
-- 共通関数
-- ============================================================

create or replace function update_updated_at() returns trigger
  language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================
-- PostgREST 経由のアクセス権限
--
-- supabase/config.toml の [api] schemas = [..., "studio"] で
-- studio スキーマを公開するだけでは権限不足になるため、
-- anon / authenticated / service_role に明示的に付与する。
-- ============================================================

grant usage on schema studio to anon, authenticated, service_role;

grant all on all tables    in schema studio to anon, authenticated, service_role;
grant all on all sequences in schema studio to anon, authenticated, service_role;
grant all on all functions in schema studio to anon, authenticated, service_role;

-- 新しく作るテーブル/シーケンスにも自動で同じ権限が付くようにする
alter default privileges in schema studio
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema studio
  grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema studio
  grant all on functions to anon, authenticated, service_role;
