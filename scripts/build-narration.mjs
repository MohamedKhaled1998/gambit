// Content build: speaks every script line with Fish Audio's "Master Computer" voice (Drama 3), keeps a lossless
// WAV master and a manifest per file, and encodes Opus and AAC for the client. Files that are up to date are
// left alone, so a run with nothing changed needs no API key. The key comes from FISH_API_KEY, never from the repo.
//   FISH_API_KEY=... FISH_VOICE_ID=... npm run build:narration
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { buildSync } from "esbuild";

const masters = "content/narration/masters";
const served = "src/client/public/narration";
mkdirSync(masters, { recursive: true });
mkdirSync(served, { recursive: true });

const out = join(tmpdir(), `narration-script-${process.pid}.mjs`);
buildSync({ entryPoints: ["src/content/narration-script.ts"], bundle: true, format: "esm", platform: "node", outfile: out, logLevel: "silent" });
const { narrationScript, manifestFor, planBuild, NARRATION_SETTINGS } = await import(pathToFileURL(out).href);

const voiceId = process.env.FISH_VOICE_ID ?? "master-computer";
const path = (id, ext) => (ext === "wav" || ext === "json" ? join(masters, `${id}.${ext}`) : join(served, `${id}.${ext}`));
const onDisk = (id) => ({
  manifest: existsSync(path(id, "json")) ? JSON.parse(readFileSync(path(id, "json"), "utf8")) : null,
  wav: existsSync(path(id, "wav")),
  opus: existsSync(path(id, "opus")),
  aac: existsSync(path(id, "m4a")),
});

const plan = planBuild(narrationScript(), voiceId, onDisk);
const encode = (line) => {
  const wav = path(line.id, "wav");
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", wav, "-c:a", "libopus", "-b:a", "48k", path(line.id, "opus")]);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", wav, "-c:a", "aac", "-b:a", "64k", path(line.id, "m4a")]);
};

if (plan.generate.length > 0) {
  const key = process.env.FISH_API_KEY;
  if (!key) {
    console.error(`${plan.generate.length} lines need speaking and FISH_API_KEY is not set.`);
    process.exit(1);
  }
  for (const line of plan.generate) {
    const res = await fetch("https://api.fish.audio/v1/tts", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", model: NARRATION_SETTINGS.model },
      body: JSON.stringify({ text: line.text, reference_id: voiceId, format: "wav", normalize: true }),
    });
    if (!res.ok) throw new Error(`Fish Audio refused ${line.id}: ${res.status}`);
    writeFileSync(path(line.id, "wav"), Buffer.from(await res.arrayBuffer()));
    writeFileSync(path(line.id, "json"), JSON.stringify(manifestFor(line, voiceId), null, 2) + "\n");
    encode(line);
    console.log(`spoke ${line.id}`);
  }
}
for (const line of plan.encode) {
  encode(line);
  console.log(`encoded ${line.id}`);
}
console.log(`narration: ${plan.generate.length} spoken, ${plan.encode.length} encoded, ${plan.current.length} up to date`);
