// `node scripts/preview.mjs`: worker + web on their own ports and their own local storage, so a preview
// (or an agent's browser check) runs beside `npm run dev` without touching its data (CRIT-1).
// Sign in by setting an `imprint_session` cookie signed with SESSION_SECRET (see apps/web/e2e/session.ts).
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const WORKER_PORT = process.env.WORKER_PORT ?? "8790";
const WEB_PORT = process.env.WEB_PORT ?? "5176";
const SECRET = process.env.SESSION_SECRET ?? "preview-only-secret";
const origin = `http://localhost:${WEB_PORT}`;

const apps = [
  {
    name: "worker",
    cwd: join(root, "apps/worker"),
    cmd: `npx wrangler dev --port ${WORKER_PORT} --persist-to .wrangler/preview --var SESSION_SECRET:${SECRET} --var APP_ORIGIN:${origin} --var GEMINI_API_KEY:`,
    env: {},
  },
  {
    name: "web",
    cwd: join(root, "apps/web"),
    cmd: "npx vite",
    env: { IMPRINT_API: `http://localhost:${WORKER_PORT}`, IMPRINT_WEB_PORT: WEB_PORT },
  },
];

const children = apps.map(({ name, cwd, cmd, env }) => {
  const child = spawn(cmd, { cwd, shell: true, env: { ...process.env, ...env }, stdio: ["inherit", "pipe", "pipe"] });
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
    if (process.platform === "win32") spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"]);
    else child.kill("SIGTERM");
  }
  process.exitCode = code;
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
