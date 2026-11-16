import { useEffect, useRef, useState } from "react";
import { beatAt } from "./prelude";
import { OVERTURE } from "../content/narrator";
import { cueVolume, cuesBetween, musicAudible, narrationAudible, soundRole, type CueId, type SoundRole } from "../shared/sound";
import type { Announcement, GuestView } from "../shared/types";

/**
 * Sound on this phone: Web Audio for the temporary music (a synthesised pad with loop points) and the cues, and
 * the Narrator's generated speech. What plays where is decided by `shared/sound.ts`; this only plays it.
 */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let unlocked = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((f) => f());
const buffers = new Map<string, Promise<AudioBuffer | null>>();

/** Unlocks audio on the first tap, and keeps playing with the iOS silent switch on. */
export function unlockOnFirstTap(): void {
  const unlock = () => {
    if (unlocked) return;
    unlocked = true;
    ctx = new AudioContext();
    master = ctx.createGain();
    master.connect(ctx.destination);
    ctx.onstatechange = notify;
    void ctx.resume();
    notify();
    // A silent media element moves iOS from the ringer channel to the media channel, which the silent switch spares.
    const silent = new Audio("data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=");
    silent.loop = true;
    void silent.play().catch(() => {});
    for (const e of ["pointerdown", "keydown"]) window.removeEventListener(e, unlock, true);
  };
  for (const e of ["pointerdown", "keydown"]) window.addEventListener(e, unlock, true);
  // iOS suspends the context when the page is backgrounded or the phone locks; wake it when the page returns.
  document.addEventListener("visibilitychange", () => { if (!document.hidden) void ctx?.resume(); });
}

/** True once audio is unlocked and running; changes when it unlocks or the context is suspended and resumed. */
export function useAudioRunning(): boolean {
  const [running, setRunning] = useState(false);
  useEffect(() => {
    const update = () => setRunning(ctx?.state === "running");
    listeners.add(update);
    update();
    return () => { listeners.delete(update); };
  }, []);
  return running;
}

/** Wakes a suspended context before playing. */
function awake(): AudioContext | null {
  if (ctx && ctx.state !== "running") void ctx.resume();
  return ctx;
}

const canOpus = (): boolean => new Audio().canPlayType('audio/ogg; codecs="opus"') !== "";
const narrationUrl = (id: string): string => `/narration/${id}.${canOpus() ? "opus" : "m4a"}`;

function load(id: string): Promise<AudioBuffer | null> {
  if (!ctx) return Promise.resolve(null);
  const have = buffers.get(id);
  if (have) return have;
  const c = ctx;
  const p = fetch(narrationUrl(id))
    .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error("missing"))))
    .then((b) => c.decodeAudioData(b))
    .catch(() => { buffers.delete(id); return null; });
  buffers.set(id, p);
  return p;
}

const speaking = new Set<AudioBufferSourceNode>();
/** Schedules a narration file after `delayMs`, alongside any line already playing; false when it could not be (not unlocked, or the file failed to load). */
export async function speak(id: string, delayMs = 0): Promise<boolean> {
  const c = awake();
  if (!c || !master) return false;
  const buf = await load(id);
  if (!buf) return false;
  const src = c.createBufferSource();
  src.buffer = buf;
  src.connect(master);
  src.onended = () => speaking.delete(src);
  src.start(c.currentTime + Math.max(0, delayMs) / 1000);
  speaking.add(src);
  return true;
}
/** Cuts off every line: on a skip to the Rules card or a change of phase. */
export function stopSpeaking(): void {
  for (const s of speaking) { try { s.stop(); } catch { /* already over */ } }
  speaking.clear();
}

const TONES: Record<CueId, number[]> = {
  danceStart: [392, 523, 659],
  lightsOut: [330, 247, 196],
  sentDown: [294, 233, 175],
  vote: [440, 440, 587],
  unmasking: [523, 392, 262],
  rightAnswer: [660, 880],
  favoursReceived: [523, 659, 784],
  gift: [],
  musicStop: [],
};

/** Plays a cue at this role's volume; a cue the role mutes, or a visual one, makes no sound. */
export function playCue(cue: CueId, role: SoundRole): void {
  const volume = cueVolume(role, cue);
  const c = awake();
  if (!c || !master || volume === 0) return;
  TONES[cue].forEach((hz, i) => {
    const osc = c.createOscillator();
    const g = c.createGain();
    const t = c.currentTime + i * 0.12;
    osc.type = "triangle";
    osc.frequency.value = hz;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.3 * volume, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    osc.connect(g).connect(master!);
    osc.start(t);
    osc.stop(t + 0.45);
  });
}

let music: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
/** Temporary music: eight seconds of a slow chord pad, looped between its loop points. */
function padBuffer(c: AudioContext): AudioBuffer {
  const seconds = 8;
  const buf = c.createBuffer(1, c.sampleRate * seconds, c.sampleRate);
  const data = buf.getChannelData(0);
  const chord = [196, 233.1, 293.7, 392];
  for (let i = 0; i < data.length; i++) {
    const t = i / c.sampleRate;
    // Whole cycles per loop so the loop point is seamless.
    data[i] = chord.reduce((sum, hz) => sum + Math.sin(2 * Math.PI * Math.round(hz * seconds) / seconds * t), 0) * 0.04;
  }
  return buf;
}
export function startMusic(): void {
  awake();
  if (!ctx || !master || music) return;
  const src = ctx.createBufferSource();
  src.buffer = padBuffer(ctx);
  src.loop = true;
  src.loopStart = 0;
  src.loopEnd = src.buffer.duration;
  const gain = ctx.createGain();
  gain.gain.value = 0.6;
  src.connect(gain).connect(master);
  src.start();
  music = { src, gain };
}
export function stopMusic(): void {
  if (!music || !ctx) return;
  const { src, gain } = music;
  gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.3);
  src.stop(ctx.currentTime + 0.35);
  music = null;
}

/** The match a view announces, wherever its phase keeps it. */
function announcementOf(view: GuestView): Announcement | null {
  if (view.phase === "mingle" || view.phase === "dance" || view.phase === "cellar" || view.phase === "lastDance") return view.announcement;
  if (view.phase === "sentDown") return view.cellarGame;
  return null;
}

/**
 * Plays this phone's share of the sound for the views as they arrive, and returns the on-screen notice for the
 * cues that are shown as well as heard: the gift, and the moment the music stops.
 */
export function useSound(view: GuestView, now: number): string | null {
  const role = soundRole(view);
  const running = useAudioRunning();
  const prev = useRef<GuestView | null>(null);
  const [notice, setNotice] = useState<{ text: string; id: number } | null>(null);
  const noticeId = useRef(0);
  const spoken = useRef(new Set<string>());
  const announcement = announcementOf(view);
  const prelude = view.prelude;
  const key = (view.narrator && `${view.narrator.id}:${view.narrator.startedAt}`) ?? null;
  /** A line that started long ago is not replayed late, out of step with its captions. */
  const LATE_MS = 1500;

  // Cues and the notices that go with them.
  useEffect(() => {
    const cues = cuesBetween(prev.current, view);
    if (prev.current?.phase === "dance" && view.phase !== "dance") cues.push("musicStop");
    prev.current = view;
    for (const cue of cues) {
      playCue(cue, role);
      if (cue === "musicStop") setNotice({ text: "The music stops.", id: ++noticeId.current });
      if (cue === "gift") setNotice({ text: "A favour came your way.", id: ++noticeId.current });
    }
  }, [view]); // eslint-disable-line react-hooks/exhaustive-deps

  // A notice clears on its own timer, which later views don't cancel.
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Music while the party plays; never on an In-person guest's phone. Retries once audio is unlocked or resumed.
  const quiet = view.phase === "unmasking";
  const playing = view.phase !== "foyer" && view.phase !== "ended";
  useEffect(() => {
    if (playing && musicAudible(role) && !quiet && running) startMusic();
    else stopMusic();
  }, [playing, role, quiet, running]);

  // A new phase cuts off the last phase's speech before its own line starts.
  useEffect(() => { stopSpeaking(); }, [view.phase]);

  // The Narrator's line for the phase, once, at its start.
  useEffect(() => {
    if (!view.narrator || !key || !running || spoken.current.has(key)) return;
    spoken.current.add(key);
    if (!narrationAudible(role, view) || now - view.narrator.startedAt > LATE_MS) return;
    void speak(`line-${view.narrator.id}-${view.narrator.first ? "first" : "short"}`, view.narrator.startedAt - now);
  }, [key, running]); // eslint-disable-line react-hooks/exhaustive-deps

  // The Overture, as the doors close.
  const overture = view.phase === "mingle" ? view.overtureUntil : null;
  useEffect(() => {
    if (overture === null || !running || spoken.current.has("overture")) return;
    spoken.current.add("overture");
    if (role !== "inPerson" && now - (overture - OVERTURE.seconds * 1000) <= LATE_MS) void speak("overture");
  }, [overture, running]); // eslint-disable-line react-hooks/exhaustive-deps

  // Skipping to the Rules card stops the Prelude's speech.
  const skipped = prelude?.skipped === true;
  useEffect(() => { if (skipped) stopSpeaking(); }, [skipped]);

  // The Prelude's beats, each when it begins, on the phones that speak.
  useEffect(() => {
    if (!running || !announcement || !prelude || prelude.skipped || now < prelude.startsAt || now >= prelude.endsAt) return;
    const playing = beatAt(announcement.prelude, prelude.startsAt, now);
    if (!playing) return;
    const index = announcement.prelude.indexOf(playing.beat) + 1;
    const k = `prelude-${announcement.id}-${index}-${prelude.startsAt}`;
    if (spoken.current.has(k)) return;
    spoken.current.add(k);
    if (role !== "inPerson" && playing.elapsed <= LATE_MS) void speak(`prelude-${announcement.id}-${index}`);
  }, [now, announcement, prelude, role, running]);

  return notice?.text ?? null;
}
