import { spawn } from "node:child_process";

const children = [
  spawn(process.execPath, ["server.js"], { stdio: "inherit", env: process.env }),
  spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "0.0.0.0"], {
    stdio: "inherit",
    env: process.env
  })
];

let shuttingDown = false;
const stopChildren = (exitCode = 0) => {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (child.exitCode === null && !child.killed) child.kill();
  }
  process.exitCode = exitCode;
};

for (const child of children) {
  child.on("error", (error) => {
    console.error("Development process failed to start.", error);
    stopChildren(1);
  });
  child.on("exit", (code, signal) => {
    if (!shuttingDown) stopChildren(code ?? (signal ? 1 : 0));
  });
}

process.on("SIGINT", () => stopChildren(0));
process.on("SIGTERM", () => stopChildren(0));
