import { randomBytes, scryptSync } from "node:crypto";
import { stdin, stdout } from "node:process";

if (!stdin.isTTY || typeof stdin.setRawMode !== "function") {
  console.error("Run this command in an interactive terminal so the password is not echoed or recorded in shell history.");
  process.exit(1);
}

stdout.write("Enter a new admin password (input hidden): ");
stdin.setRawMode(true);
stdin.resume();
stdin.setEncoding("utf8");

let password = "";
stdin.on("data", (key) => {
  if (key === "\u0003") {
    stdout.write("\nCancelled.\n");
    process.exit(130);
  }
  if (key === "\r" || key === "\n") {
    stdin.setRawMode(false);
    stdin.pause();
    stdout.write("\n");
    if (password.length < 12 || password.length > 128) {
      password = "";
      console.error("Use a password between 12 and 128 characters.");
      process.exit(1);
    }
    const salt = randomBytes(16);
    const digest = scryptSync(password, salt, 64);
    password = "";
    console.log(`scrypt:${salt.toString("hex")}:${digest.toString("hex")}`);
    return;
  }
  if (key === "\u007f" || key === "\b") {
    password = password.slice(0, -1);
    return;
  }
  if (key.length === 1) password += key;
});
