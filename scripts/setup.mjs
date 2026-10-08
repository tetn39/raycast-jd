import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

// The supported develop lifecycle imports new extensions as well as building them.
// Stop it gracefully after the first build so Raycast keeps the installed extension,
// but its file watcher and log stream do not stay running.
const cli = fileURLToPath(new URL("../node_modules/@raycast/api/bin/run.js", import.meta.url));
const child = spawn(process.execPath, [cli, "develop", "--non-interactive"], {
  stdio: ["ignore", "pipe", "pipe"],
});
let built = false;
let failed = false;
let interrupted = false;
let stopping = false;

function stop(signal = "SIGTERM") {
  if (stopping) return;
  stopping = true;
  child.kill(signal);
}

function relay(stream, destination) {
  let pending = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    destination.write(chunk);
    pending += chunk;
    let newline;
    while ((newline = pending.indexOf("\n")) !== -1) {
      const line = pending.slice(0, newline).replace(/\r$/, "");
      pending = pending.slice(newline + 1);
      if (/^ready\s+- built extension successfully$/.test(line)) {
        built = true;
        stop();
      } else if (/^(?:error\s+-|Error:)/.test(line)) {
        failed = true;
        stop();
      }
    }
  });
}

relay(child.stdout, process.stdout);
relay(child.stderr, process.stderr);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    interrupted = true;
    process.exitCode = signal === "SIGINT" ? 130 : 143;
    stop(signal);
  });
}

child.on("error", (error) => {
  failed = true;
  console.error(`セットアップを開始できませんでした: ${error.message}`);
  process.exitCode = 1;
});
child.on("close", (code) => {
  if (interrupted) return;
  if (built && !failed && code === 0) {
    console.log("セットアップが完了しました。ターミナルを閉じてもRaycastから使えます。");
  } else {
    console.error("セットアップを完了できませんでした。上のエラーを確認してください。");
    process.exitCode = code || 1;
  }
});
