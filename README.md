# 日本語ユーザ辞書 — Raycast拡張機能

Raycastで簡単にMacの辞書登録をしたい

## できること

Raycastで「読み」と「単語」を入力するとMac標準の日本語ユーザ辞書に登録できる

aliasで`jd` (Japanese Dictionary)を設定すると、Raycastで`jd`と入れるだけですぐ開き、単語登録可能

マウス操作は無し

## 導入

1. Macに [Raycast](https://www.raycast.com/) と [Node.js（LTS）](https://nodejs.org/) をインストール
2. ターミナルで次を実行

   ```sh
   git clone https://github.com/tetn39/raycast-jd.git
   cd raycast-jd
   npm ci
   npm run dev
   ```

   `built extension successfully` が表示されたら、OK
3. Raycast Settings → Extensions → 日本語ユーザ辞書 → 辞書登録を開き、**Alias** に `jd` を設定
4. システム設定 → プライバシーとセキュリティ → アクセシビリティで **Raycastを許可**。System Eventsへの操作許可を求められた場合も許可。

## 使い方

1. Raycastを開き、`jd` → Enter
2. 「読み」と「単語」を入力
3. Command + Enterで登録可能

