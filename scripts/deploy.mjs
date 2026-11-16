// One command to deploy: builds the client with a fresh build id and ships the Worker with the same id.
import { execFileSync } from "node:child_process";
const build = process.env.BUILD_ID ?? `${Date.now().toString(36)}`;
const env = { ...process.env, BUILD_ID: build };
execFileSync("npx", ["vite", "build"], { stdio: "inherit", env });
execFileSync("npx", ["wrangler", "deploy", "--var", `BUILD_ID:${build}`], { stdio: "inherit", env });
