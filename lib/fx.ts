"use client";
// Tiny WebAudio + vibration feedback. No assets needed.

let ctx: AudioContext | null = null;
let muted = false;

export function setMuted(m: boolean) {
  muted = m;
  try {
    localStorage.setItem("bcchunt-muted", m ? "1" : "0");
  } catch {}
}
export function isMuted() {
  try {
    muted = localStorage.getItem("bcchunt-muted") === "1";
  } catch {}
  return muted;
}

/** Call from a user gesture once so iOS allows audio later. */
export function unlockAudio() {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
  } catch {}
}

function tone(freq: number, dur: number, when = 0, type: OscillatorType = "sine", gain = 0.18) {
  if (muted || !ctx) return;
  const t = ctx.currentTime + when;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function buzz(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {}
}

export const fx = {
  tick() {
    tone(880, 0.08, 0, "square", 0.06);
    buzz(30);
  },
  warn() {
    tone(660, 0.12);
    tone(880, 0.12, 0.15);
    buzz([60, 60, 60]);
  },
  reveal() {
    tone(520, 0.18, 0, "sawtooth", 0.12);
    tone(780, 0.25, 0.18, "sawtooth", 0.12);
    buzz([120, 80, 220]);
  },
  tag() {
    tone(300, 0.2, 0, "square", 0.12);
    tone(200, 0.35, 0.2, "square", 0.12);
    buzz([300, 100, 300]);
  },
  request() {
    tone(988, 0.1);
    tone(988, 0.1, 0.15);
    tone(1318, 0.2, 0.3);
    buzz([80, 60, 80, 60, 200]);
  },
  zone() {
    tone(240, 0.4, 0, "triangle", 0.15);
    buzz([400]);
  },
  win() {
    [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.25, i * 0.12, "triangle", 0.14));
    buzz([100, 50, 100, 50, 300]);
  },
  pop() {
    tone(1200, 0.05, 0, "sine", 0.05);
  },
};
