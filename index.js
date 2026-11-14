
import { spawn } from "node:child_process";

const server = spawn(
  process.execPath,
  ["--import", "tsx", "server.ts"],
  {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: "production"
    },
    stdio: "inherit"
  }
);

server.on("error", (error) => {
  console.error("CROX startup error:", error);
  process.exit(1);
});

server.on("exit", (code) => {
  process.exit(code ?? 1);
});
