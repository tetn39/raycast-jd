import { Action, ActionPanel, Form, Toast, environment, showHUD, showToast } from "@raycast/api";
import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";
import { useRef, useState } from "react";

const execute = promisify(execFile);

export default function RegisterDictionary() {
  const [reading, setReading] = useState("");
  const [word, setWord] = useState("");
  const [errors, setErrors] = useState<{ reading?: string; word?: string }>({});
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);

  async function submit(values: { reading: string; word: string }) {
    if (submitting.current) return;
    const r = values.reading.trim();
    const w = values.word.trim();
    const next: typeof errors = {};
    if (!r) next.reading = "読みを入力してください";
    else if (!/^[ぁ-ゖー]+$/.test(r) || Array.from(r).length > 32)
      next.reading = "ひらがなで32文字以内にしてください";
    if (!w) next.word = "単語を入力してください";
    else if (Array.from(w).length > 64 || /[\r\n\t]/.test(w))
      next.word = "改行・タブなしで64文字以内にしてください";
    setErrors(next);
    if (next.reading || next.word) return;

    submitting.current = true;
    setBusy(true);
    const toast = await showToast({ style: Toast.Style.Animated, title: "ユーザ辞書に登録中" });
    try {
      // Arguments are passed separately, never interpolated into executable code.
      const { stdout } = await execute("/usr/bin/osascript", [
        "-l", "JavaScript", join(environment.assetsPath, "register.js"), r, w,
      ], { timeout: 60_000, maxBuffer: 128 * 1024 });
      const result = stdout.trim();
      if (result !== "REGISTERED" && result !== "EXISTS")
        throw new Error("登録結果を確認できません。ユーザ辞書を確認してください。");
      toast.hide();
      await showHUD(result === "EXISTS" ? "同じ読み・単語は登録済みです" : `登録しました：${r} → ${w}`);
    } catch (error) {
      toast.style = Toast.Style.Failure;
      toast.title = "登録を完了できませんでした";
      const failure = error as Error & { stderr?: string; killed?: boolean };
      toast.message = failure.killed
        ? "処理がタイムアウトしました。登録済みの可能性があるためユーザ辞書を確認してください。"
        : failure.stderr?.trim() || failure.message;
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <Form navigationTitle="辞書登録" isLoading={busy} actions={
      <ActionPanel><Action.SubmitForm title="登録" onSubmit={submit} /></ActionPanel>
    }>
      <Form.TextField id="reading" title="読み" placeholder="おんぷ" value={reading}
        error={errors.reading} onChange={(value) => { setReading(value); setErrors((old) => ({ ...old, reading: undefined })); }} autoFocus />
      <Form.TextField id="word" title="単語" placeholder="omp" value={word}
        error={errors.word} onChange={(value) => { setWord(value); setErrors((old) => ({ ...old, word: undefined })); }} />
    </Form>
  );
}
