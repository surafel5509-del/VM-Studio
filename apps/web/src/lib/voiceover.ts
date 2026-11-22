'use client';

/**
 * Browser text-to-speech via the Web Speech API — honest, free, in-browser.
 *
 * Limits (deliberately not faked):
 *  - Preview only. No WAV/MP3/file export is produced here — cloud TTS is the
 *    file-export path and requires a provider key (Settings → AI providers).
 *  - Quality depends on the user's installed voices; Amharic may not be available.
 */
export function speechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
}

export interface SpeakOptions {
  language?: string; // BCP-47, e.g. 'en-US', 'am-ET'
  rate?: number; // 0.5..2, default 1
  volume?: number; // 0..1, default 1
  onStart?: () => void;
  onEnd?: () => void;
  onError?: () => void;
}

export function speak(text: string, opts: SpeakOptions = {}): Promise<void> {
  return new Promise((resolve) => {
    if (!speechSupported() || !text.trim()) return resolve();
    const synth = window.speechSynthesis;
    synth.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = opts.language ?? 'en-US';
    utter.rate = opts.rate ?? 1;
    utter.volume = opts.volume ?? 1;
    const finish = () => resolve();
    utter.onstart = () => { opts.onStart?.(); };
    utter.onend = () => { opts.onEnd?.(); finish(); };
    utter.onerror = () => { opts.onError?.(); finish(); };
    synth.speak(utter);
  });
}

export function stopSpeaking(): void {
  if (speechSupported()) window.speechSynthesis.cancel();
}

/** Is a voice available whose language starts with the given prefix? */
export function hasVoiceFor(languagePrefix: string): boolean {
  if (!speechSupported()) return false;
  const voices = window.speechSynthesis.getVoices();
  return voices.some((v) => v.lang.toLowerCase().startsWith(languagePrefix.toLowerCase()));
}
