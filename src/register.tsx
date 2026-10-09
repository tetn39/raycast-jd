import { Action, ActionPanel, Form, Toast, closeMainWindow, environment, showHUD, showToast } from "@raycast/api";
import { useRef, useState } from "react";
import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";

const execute = promisify(execFile);

type Values = { reading: string; word: string };

export default function RegisterDictionary() {
  const submitting = useRef(false);
  const [loading, setLoading] = useState(false);
  const [readingError, setReadingError] = useState<string>();
  const [wordError, setWordError] = useState<string>();

  async function submit(values: Values) {
    if (submitting.current) return;
    const reading = values.reading.trim();
    const word = values.word;
    setReadingError(reading ? undefined : "読みを入力してください");
    setWordError(word.trim() ? undefined : "単語を入力してください");
    if (!reading || !word.trim()) return;

    submitting.current = true;
    setLoading(true);
    try {
      await closeMainWindow();
      const { stdout } = await execute("/usr/bin/osascript", [
        "-l", "JavaScript", join(environment.assetsPath, "register.js"), reading, word,
      ], { maxBuffer: 128 * 1024 });
      const result = stdout.trim();
      if (result === "REGISTERED") {
        await showHUD("ユーザ辞書に登録しました");
      } else if (result === "EXISTS") {
        await showHUD("この読み・単語は登録済みです");
      } else {
        throw new Error("登録結果を確認できません。ユーザ辞書を確認してください。");
      }
    } catch (error) {
      const failure = error as Error & { stderr?: string };
      await showToast({
        style: Toast.Style.Failure,
        title: "辞書操作を完了できませんでした",
        message: failure.stderr?.trim() || failure.message,
      });
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  }

  return (
    <Form
      isLoading={loading}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="辞書に登録" onSubmit={submit} />
        </ActionPanel>
      }
    >
      <Form.Description text="設定の追加画面を開いた後、非表示で登録します。最初だけ設定画面が表示されます。" />
      <Form.TextField id="reading" title="読み" error={readingError} onChange={() => setReadingError(undefined)} />
      <Form.TextField id="word" title="単語" error={wordError} onChange={() => setWordError(undefined)} />
    </Form>
  );
}
