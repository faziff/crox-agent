import { spawn } from "node:child_process";

const child = spawn(
  process.execPath,
  ["--import", "tsx", "server.ts"],
  {
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: "production" },
    stdio: "inherit",
  }
);

child.on("error", (error) => {
  console.error("[CROX] Could not start server:", error);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`[CROX] Server stopped by signal: ${signal}`);
    process.exit(1);
  }
  process.exit(code ?? 1);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}
