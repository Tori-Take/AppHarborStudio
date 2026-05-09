#!/bin/bash
# macOS / Linux 用の Studio 起動スクリプト
# macOS では Finder からダブルクリックで実行可能（初回のみ右クリック→「開く」が必要な場合あり）

cd "$(dirname "$0")"

echo "========================================"
echo "  AppHarbor Studio"
echo "========================================"
echo ""

# Node.js の存在確認
if ! command -v node &> /dev/null; then
  echo "[ERROR] Node.js がインストールされていません"
  echo "https://nodejs.org/ja からダウンロード・インストールしてください"
  echo ""
  read -p "Enter キーで閉じる..."
  exit 1
fi

# 依存パッケージのインストール（初回のみ）
if [ ! -d node_modules ]; then
  echo "[Setup] 初回起動のため依存パッケージをインストールします"
  echo "        数分かかる場合があります..."
  echo ""
  npm install
  if [ $? -ne 0 ]; then
    echo ""
    echo "[ERROR] npm install に失敗しました"
    read -p "Enter キーで閉じる..."
    exit 1
  fi
  echo ""
  echo "[Setup] インストール完了"
  echo ""
fi

# ブラウザを少し遅らせて自動で開く
echo "[Studio] dev サーバーを起動中..."
echo "[Studio] 数秒後にブラウザで http://localhost:3100 を自動で開きます"
echo ""
echo "[INFO] このターミナルを閉じるか Ctrl+C で停止します"
echo ""

(
  sleep 6
  if command -v open &> /dev/null; then
    open http://localhost:3100
  elif command -v xdg-open &> /dev/null; then
    xdg-open http://localhost:3100
  fi
) &

npm run dev

echo ""
echo "[Studio] サーバーが停止しました"
read -p "Enter キーで閉じる..."
