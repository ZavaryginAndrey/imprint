// `npm run dev`: worker (:8787) and web (:5173, proxies /api to the worker) side by side.
// Plain child processes, no extra deps; Ctrl+C or either process exiting stops both.
import { spawn } from "node:child_process";

const apps = [
  { name: "worker", workspace: "@imprint/worker" },
  { name: "web", workspace: "@imprint/web" },
];

const children = apps.map(({ name, workspace }) => {
  const child = spawn(`npm run dev -w ${workspace}`, { shell: true, stdio: ["inherit", "pipe", "pipe"] });
  const prefix = (stream, out) =>
    stream.on("data", (chunk) => {
      for (const line of chunk.toString().split(/\r?\n/)) if (line) out.write(`[${name}] ${line}\n`);
    });
  prefix(child.stdout, process.stdout);
  prefix(child.stderr, process.stderr);
  child.on("exit", (code) => shutdown(code ?? 0));
  return child;
});

let stopping = false;
function shutdown(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode !== null) continue;
    // shell: true wraps npm in cmd.exe on Windows; kill the whole tree, not just the shell.
    if (process.platform === "win32") spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"]);
    else child.kill("SIGTERM");
  }
  process.exitCode = code;
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
