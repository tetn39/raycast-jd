# 日本語ユーザ辞書 — Raycast拡張機能

## できること

Raycastで「読み」と「単語」を入力し、EnterでMac標準の日本語ユーザ辞書に登録できます。
`jd`を設定すると、Raycastを開く → `jd` → Enterですぐに登録画面を開けます。

## セットアップ

1. Macに [Raycast](https://www.raycast.com/) と [Node.js（LTS）](https://nodejs.org/) をインストールします。
2. ターミナルで次を実行します（初回のみ）。

   ```sh
   git clone https://github.com/tetn39/raycast-jd.git
   cd raycast-jd
   npm ci
   npm run dev
   ```

   `built extension successfully` が表示されたら、ターミナルは開いたままにします。

3. Raycast Settings → Extensions → 日本語ユーザ辞書 → 辞書登録を開き、**Alias** に `jd` を設定します。
4. システム設定 → プライバシーとセキュリティ → アクセシビリティで **Raycastを許可**します。System Eventsへの操作許可を求められた場合も許可します。

## 使い方

1. Mac標準の日本語入力に切り替えます。Google日本語入力・ATOKは対象外です。
2. Raycastを開き、`jd` → Enterを押します。
3. 「読み」をひらがなで入力します（32文字以内）。
4. Tabを押し、「単語」を入力します（64文字以内）。
5. 日本語変換を確定してから、Enterを押して登録します。登録中はシステム設定が前面に出ます。
6. 登録した読みを入力し、日本語変換の候補に単語が出ることを確認します。

登録後にエラーが出た場合は、再実行する前にユーザ辞書に登録済みか確認してください。
