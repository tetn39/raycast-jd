# 日本語ユーザ辞書 — Raycast拡張機能

RaycastからMac標準の日本語ユーザ辞書に単語を登録する拡張機能です。

## 導入

Raycastがインストール済みのMacで利用できます。[Node.js（LTS）](https://nodejs.org/) とGitも必要です。

1. ターミナルで次を実行します。

   ```sh
   git clone https://github.com/tetn39/raycast-jd.git
   cd raycast-jd
   npm ci
   npm run setup
   ```

   「セットアップが完了しました」と表示されたら導入完了です。

2. Raycast Settings → Extensions → 日本語ユーザ辞書 → 辞書登録を開き、**Alias** に `jd` を設定します。
3. システム設定 → プライバシーとセキュリティ → アクセシビリティで **Raycastを許可**します。システム設定への操作許可を求められた場合も許可してください。

## 使い方

1. Raycastを開き、`jd` → Enter
2. 「読み」と「単語」を入力
3. Command + Enterで登録

登録中はシステム設定が開きます。完了するまでは別のアプリへの切り替えやキー入力を控えてください。通常の利用時にターミナルを開く必要はありません。

## 更新

このフォルダで次を実行します。更新が完了するとコマンドは自動で終了します。

```sh
git pull
npm ci
npm run setup
```

