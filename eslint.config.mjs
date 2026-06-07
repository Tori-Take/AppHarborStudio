import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import unusedImports from "eslint-plugin-unused-imports";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // 未使用 import を自動削除可能にする
  // また no-unused-vars を _ プレフィックス無視に設定
  {
    plugins: {
      "unused-imports": unusedImports,
    },
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
      "unused-imports/no-unused-imports": "warn",
      "unused-imports/no-unused-vars": [
        "warn",
        {
          vars:           "all",
          varsIgnorePattern: "^_",
          args:           "after-used",
          argsIgnorePattern: "^_",
        },
      ],
      // React Compiler の厳格ルール群を warn にダウングレード。
      // React 19 + React Compiler 移行のための "ヒント" 扱いで、blocking 対象外。
      "react-hooks/refs":                        "warn",
      "react-hooks/set-state-in-effect":         "warn",
      "react-hooks/purity":                      "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/immutability":                "warn",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Claude Code の作業用ワークツリー等。ソースではないので除外。
    ".claude/**",
    // app/org/[slug]/apps/** はカートリッジから自動コピー/マウントされるため lint 対象外。
    // [slug] の角括弧はそのままだと glob 文字クラスとして解釈されるため複数パターンで対応
    "app/org/**/apps/**",
    // cartridges/** は独立した mini-app 群で、それぞれ Studio 環境で開発される。
    // Studio プロジェクトの lint ルールを適用すると不適切な指摘が出るため除外。
    "cartridges/**",
    // Node.js CommonJS スクリプト群。TypeScript ESLint ルール対象外。
    "scripts/**",
    // @/sdk のモック実装。型は本体由来で別管理。
    "lib/sdk-mock/**",
  ]),
]);

export default eslintConfig;
