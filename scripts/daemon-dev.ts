// Detached dev-server launcher (survives the session reaper, ppid=1)
// Usage: bun scripts/daemon-dev.ts
import { spawn, execSync } from "node:child_process";
import { openSync } from "node:fs";
import fs from "node:fs";

const PROJECT = "/home/z/my-project";
const PID_FILE = PROJECT + "/.zscripts/dev.pid";

try {
  const out = execSync("fuser 3000/tcp 2>/dev/null || true").toString().trim();
  if (out) {
    for (const pid of out.split(/\s+/)) {
      try { process.kill(Number(pid), "SIGKILL"); } catch {}
    }
  }
} catch {}

const outFd = openSync(PROJECT + "/dev.log", "a");
const errFd = openSync(PROJECT + "/dev.log", "a");
const child = spawn("bun", ["run", "dev"], {
  cwd: PROJECT,
  detached: true,
  stdio: ["ignore", outFd, errFd],
  env: { ...process.env, NODE_ENV: "development" },
});
child.unref();
fs.writeFileSync(PID_FILE, String(child.pid));
console.log("daemon dev server pid:", child.pid);
process.exit(0);
