"use client";

/**
 * صوت «بيب» قصير عند قراءة الباركود/إضافة صنف — WebAudio بلا ملفات صوت.
 */
export function beep(frequency = 1046, durationMs = 0.15): void {
  try {
    const w = window as Window & { webkitAudioContext?: typeof AudioContext }
    const Ctx = w.AudioContext ?? w.webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = "sine"
    osc.frequency.value = frequency
    gain.gain.setValueAtTime(0.12, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + durationMs)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + durationMs)
    osc.onended = () => void ctx.close()
  } catch {
    /* الصوت مكمّل لا جوهري */
  }
}
