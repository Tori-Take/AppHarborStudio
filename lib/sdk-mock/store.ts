import { create } from 'zustand'
import type { MockOrg, MockUser, MockDepartment } from './types'

export const STUDIO_USER_COOKIE = 'studio_user_id'

export const DEFAULT_ORG: MockOrg = {
  id:   '11111111-1111-1111-1111-111111111111',
  slug: 'studio-sandbox',
  name: 'Studio Sandbox 組織',
}

/**
 * 組織内の部署ツリー（3 階層・全 10 部署）
 *
 *   営業本部
 *     ├─ 国内営業部
 *     └─ 海外営業部
 *   開発本部
 *     ├─ プロダクト開発部
 *     │   ├─ フロント班
 *     │   └─ バック班
 *     └─ 技術研究部
 *   管理本部
 *     └─ 総務部
 *
 * dept ID は UUID (db-base.sql の seed と一致)。
 */
export const DEPT_ID = {
  sales:          '22222222-2222-2222-2222-000000000001',
  salesDomestic:  '22222222-2222-2222-2222-000000000002',
  salesOverseas:  '22222222-2222-2222-2222-000000000003',
  dev:            '22222222-2222-2222-2222-000000000010',
  devProduct:     '22222222-2222-2222-2222-000000000011',
  devFrontend:    '22222222-2222-2222-2222-000000000012',
  devBackend:     '22222222-2222-2222-2222-000000000013',
  devResearch:    '22222222-2222-2222-2222-000000000014',
  admin:          '22222222-2222-2222-2222-000000000020',
  adminGeneral:   '22222222-2222-2222-2222-000000000021',
} as const

export const DEFAULT_DEPARTMENTS: MockDepartment[] = [
  // Level 1 (本部)
  { id: DEPT_ID.sales,         name: '営業本部',         parentId: null },
  { id: DEPT_ID.dev,           name: '開発本部',         parentId: null },
  { id: DEPT_ID.admin,         name: '管理本部',         parentId: null },
  // Level 2 (部)
  { id: DEPT_ID.salesDomestic, name: '国内営業部',       parentId: DEPT_ID.sales },
  { id: DEPT_ID.salesOverseas, name: '海外営業部',       parentId: DEPT_ID.sales },
  { id: DEPT_ID.devProduct,    name: 'プロダクト開発部', parentId: DEPT_ID.dev },
  { id: DEPT_ID.devResearch,   name: '技術研究部',       parentId: DEPT_ID.dev },
  { id: DEPT_ID.adminGeneral,  name: '総務部',           parentId: DEPT_ID.admin },
  // Level 3 (班)
  { id: DEPT_ID.devFrontend,   name: 'フロント班',       parentId: DEPT_ID.devProduct },
  { id: DEPT_ID.devBackend,    name: 'バック班',         parentId: DEPT_ID.devProduct },
]

/**
 * 仮ユーザー（30 名 — 多人数シナリオ検証用）
 *
 * id は db-base.sql の seed UUID と完全一致させる。
 * org-admin × 2、各本部・部に dept-admin、班・部に member を配置。
 *
 * UUID 規則:
 *   - aaaa..., dddd..., eeee...        : 既存 (互換維持)
 *   - 33333333-3333-3333-3333-NNNNNN... : 追加メンバー
 */
const U = (n: number) => `33333333-3333-3333-3333-${String(n).padStart(12, '0')}`

export const DEFAULT_USERS: MockUser[] = [
  // ── 組織管理者 ──
  { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', email: 'admin@studio.local',     actorName: '田中（org-admin）',     orgRole: 'org-admin',  departmentId: null,                   appRoles: {} },
  { id: U(101),                                  email: 'yamada@studio.local',    actorName: '山田（org-admin）',     orgRole: 'org-admin',  departmentId: null,                   appRoles: {} },

  // ── 営業本部 ──
  { id: 'dddddddd-dddd-dddd-dddd-dddddddddddd', email: 'sato@studio.local',      actorName: '佐藤（営業本部長）',     orgRole: 'dept-admin', departmentId: DEPT_ID.sales,          appRoles: {} },
  // 国内営業部
  { id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', email: 'suzuki@studio.local',    actorName: '鈴木（国内営業部長）',   orgRole: 'dept-admin', departmentId: DEPT_ID.salesDomestic,  appRoles: {} },
  { id: U(201),                                  email: 'takahashi@studio.local', actorName: '高橋（国内営業）',       orgRole: 'member',     departmentId: DEPT_ID.salesDomestic,  appRoles: {} },
  { id: U(202),                                  email: 'ito@studio.local',       actorName: '伊藤（国内営業）',       orgRole: 'member',     departmentId: DEPT_ID.salesDomestic,  appRoles: {} },
  { id: U(203),                                  email: 'watanabe@studio.local',  actorName: '渡辺（国内営業）',       orgRole: 'member',     departmentId: DEPT_ID.salesDomestic,  appRoles: {} },
  // 海外営業部
  { id: U(210),                                  email: 'nakamura@studio.local',  actorName: '中村（海外営業部長）',   orgRole: 'dept-admin', departmentId: DEPT_ID.salesOverseas,  appRoles: {} },
  { id: U(211),                                  email: 'kobayashi@studio.local', actorName: '小林（海外営業）',       orgRole: 'member',     departmentId: DEPT_ID.salesOverseas,  appRoles: {} },
  { id: U(212),                                  email: 'kato@studio.local',      actorName: '加藤（海外営業）',       orgRole: 'member',     departmentId: DEPT_ID.salesOverseas,  appRoles: {} },

  // ── 開発本部 ──
  { id: U(300),                                  email: 'yoshida@studio.local',   actorName: '吉田（開発本部長）',     orgRole: 'dept-admin', departmentId: DEPT_ID.dev,            appRoles: {} },
  // プロダクト開発部
  { id: U(310),                                  email: 'yamamoto@studio.local',  actorName: '山本（プロダクト開発部長）', orgRole: 'dept-admin', departmentId: DEPT_ID.devProduct,     appRoles: {} },
  // フロント班
  { id: U(311),                                  email: 'matsumoto@studio.local', actorName: '松本（フロント班）',     orgRole: 'member',     departmentId: DEPT_ID.devFrontend,    appRoles: {} },
  { id: U(312),                                  email: 'inoue@studio.local',     actorName: '井上（フロント班）',     orgRole: 'member',     departmentId: DEPT_ID.devFrontend,    appRoles: {} },
  { id: U(313),                                  email: 'kimura@studio.local',    actorName: '木村（フロント班）',     orgRole: 'member',     departmentId: DEPT_ID.devFrontend,    appRoles: {} },
  { id: U(314),                                  email: 'fukuda@studio.local',    actorName: '福田（フロント班）',     orgRole: 'member',     departmentId: DEPT_ID.devFrontend,    appRoles: {} },
  // バック班
  { id: U(320),                                  email: 'hayashi@studio.local',   actorName: '林（バック班）',         orgRole: 'member',     departmentId: DEPT_ID.devBackend,     appRoles: {} },
  { id: U(321),                                  email: 'saito@studio.local',     actorName: '斎藤（バック班）',       orgRole: 'member',     departmentId: DEPT_ID.devBackend,     appRoles: {} },
  { id: U(322),                                  email: 'shimizu@studio.local',   actorName: '清水（バック班）',       orgRole: 'member',     departmentId: DEPT_ID.devBackend,     appRoles: {} },
  { id: U(323),                                  email: 'ota@studio.local',       actorName: '太田（バック班）',       orgRole: 'member',     departmentId: DEPT_ID.devBackend,     appRoles: {} },
  // 技術研究部
  { id: U(330),                                  email: 'yamaguchi@studio.local', actorName: '山口（技術研究部長）',   orgRole: 'dept-admin', departmentId: DEPT_ID.devResearch,    appRoles: {} },
  { id: U(331),                                  email: 'mori@studio.local',      actorName: '森（技術研究）',         orgRole: 'member',     departmentId: DEPT_ID.devResearch,    appRoles: {} },
  { id: U(332),                                  email: 'ikeda@studio.local',     actorName: '池田（技術研究）',       orgRole: 'member',     departmentId: DEPT_ID.devResearch,    appRoles: {} },
  { id: U(333),                                  email: 'hashimoto@studio.local', actorName: '橋本（技術研究）',       orgRole: 'member',     departmentId: DEPT_ID.devResearch,    appRoles: {} },

  // ── 管理本部 ──
  { id: U(400),                                  email: 'abe@studio.local',       actorName: '阿部（管理本部長）',     orgRole: 'dept-admin', departmentId: DEPT_ID.admin,          appRoles: {} },
  // 総務部
  { id: U(410),                                  email: 'ishikawa@studio.local',  actorName: '石川（総務部長）',       orgRole: 'dept-admin', departmentId: DEPT_ID.adminGeneral,   appRoles: {} },
  { id: U(411),                                  email: 'maeda@studio.local',     actorName: '前田（総務）',           orgRole: 'member',     departmentId: DEPT_ID.adminGeneral,   appRoles: {} },
  { id: U(412),                                  email: 'fujita@studio.local',    actorName: '藤田（総務）',           orgRole: 'member',     departmentId: DEPT_ID.adminGeneral,   appRoles: {} },
  { id: U(413),                                  email: 'goto@studio.local',      actorName: '後藤（総務）',           orgRole: 'member',     departmentId: DEPT_ID.adminGeneral,   appRoles: {} },
  { id: U(414),                                  email: 'okada@studio.local',     actorName: '岡田（総務）',           orgRole: 'member',     departmentId: DEPT_ID.adminGeneral,   appRoles: {} },
]

type State = {
  org:           MockOrg
  departments:   MockDepartment[]
  users:         MockUser[]
  currentUserId: string
}

type Actions = {
  setCurrentUser: (id: string) => void
  setUserAppRole: (userId: string, appId: string, role: string) => void
  addUser:        (user: MockUser) => void
  reset:          () => void
}

// 初期 currentUserId を cookie から読み取り（クライアント側のみ）
function getInitialUserId(): string {
  if (typeof document === 'undefined') return DEFAULT_USERS[0].id
  const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${STUDIO_USER_COOKIE}=([^;]+)`))
  if (m) {
    const id = decodeURIComponent(m[1])
    // DEFAULT_USERS にあるかチェック
    if (DEFAULT_USERS.some((u) => u.id === id)) return id
  }
  return DEFAULT_USERS[0].id
}

export const useStudioStore = create<State & Actions>((set) => ({
  org:           DEFAULT_ORG,
  departments:   DEFAULT_DEPARTMENTS,
  users:         DEFAULT_USERS,
  currentUserId: getInitialUserId(),

  setCurrentUser: (id) => set({ currentUserId: id }),

  setUserAppRole: (userId, appId, role) =>
    set((s) => ({
      users: s.users.map((u) =>
        u.id === userId ? { ...u, appRoles: { ...u.appRoles, [appId]: role } } : u,
      ),
    })),

  addUser: (user) => set((s) => ({ users: [...s.users, user] })),

  reset: () => set({
    org:           DEFAULT_ORG,
    departments:   DEFAULT_DEPARTMENTS,
    users:         DEFAULT_USERS,
    currentUserId: DEFAULT_USERS[0].id,
  }),
}))

export const getCurrentMockUser = (): MockUser => {
  const s = useStudioStore.getState()
  return s.users.find((u) => u.id === s.currentUserId) ?? s.users[0]
}

export const getMockOrg = (): MockOrg => useStudioStore.getState().org

/** 部署 ID から名前を取得（存在しなければ null） */
export const getDepartmentName = (id: string | null): string | null => {
  if (!id) return null
  const d = useStudioStore.getState().departments.find((x) => x.id === id)
  return d?.name ?? null
}

/** 部署 ID から「営業本部 / 国内営業部」のようなパス文字列を取得 */
export const getDepartmentPath = (id: string | null): string | null => {
  if (!id) return null
  const all = useStudioStore.getState().departments
  const parts: string[] = []
  let cur: typeof all[0] | undefined = all.find((d) => d.id === id)
  while (cur) {
    parts.unshift(cur.name)
    cur = cur.parentId ? all.find((d) => d.id === cur!.parentId) : undefined
  }
  return parts.length ? parts.join(' / ') : null
}
