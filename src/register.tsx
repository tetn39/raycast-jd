import { Toast, closeMainWindow, environment, showHUD, showToast } from "@raycast/api";
import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";

const execute = promisify(execFile);

export default async function RegisterDictionary() {
  await closeMainWindow();
  try {
    // The user types into the native dialog; allow time for them to finish.
    const { stdout } = await execute("/usr/bin/osascript", [
      "-l", "JavaScript", join(environment.assetsPath, "register.js"),
    ], { maxBuffer: 128 * 1024 });
    const result = stdout.trim();
    if (result === "REGISTERED") {
      await showHUD("ユーザ辞書に登録しました");
    } else if (result !== "CANCELLED") {
      throw new Error("登録結果を確認できません。ユーザ辞書を確認してください。");
    }
  } catch (error) {
    const failure = error as Error & { stderr?: string };
    await showToast({
      style: Toast.Style.Failure,
      title: "辞書操作を完了できませんでした",
      message: failure.stderr?.trim() || failure.message,
    });
  }
}
