import { Bill, VoiceParsedBillPayload } from '../types';

let activeAudio: HTMLAudioElement | null = null;
let activeObjectUrl: string | null = null;

export function stopSpeaking() {
  if (activeAudio) {
    try {
      activeAudio.pause();
      activeAudio.currentTime = 0;
    } catch {
      // ignore
    }
    activeAudio = null;
  }
  if (activeObjectUrl) {
    URL.revokeObjectURL(activeObjectUrl);
    activeObjectUrl = null;
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // ignore
    }
  }
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType || 'audio/wav' });
}

function speakWithBrowserFallback(text: string): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      resolve();
      return;
    }
    try {
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = 'hi-IN';
      utter.rate = 1.0;
      utter.onend = () => resolve();
      utter.onerror = () => resolve();
      window.speechSynthesis.speak(utter);
    } catch {
      resolve();
    }
  });
}

export async function speakText(
  text: string,
  options?: { voiceName?: string; style?: string; onEnd?: () => void }
): Promise<{ engine: string }> {
  const cleanText = text.trim();
  if (!cleanText) return { engine: 'none' };

  stopSpeaking();

  try {
    const res = await fetch('/api/ai/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: cleanText,
        voiceName: options?.voiceName || 'Kore',
        style: options?.style,
      }),
    });

    if (!res.ok) {
      throw new Error(`TTS HTTP ${res.status}`);
    }

    const data = (await res.json()) as {
      audioBase64?: string;
      mimeType?: string;
      engine?: string;
    };

    if (!data.audioBase64) {
      throw new Error('Empty TTS audio');
    }

    const blob = base64ToBlob(data.audioBase64, data.mimeType || 'audio/wav');
    const url = URL.createObjectURL(blob);
    activeObjectUrl = url;

    const audio = new Audio(url);
    activeAudio = audio;

    await new Promise<void>((resolve, reject) => {
      audio.onended = () => {
        stopSpeaking();
        options?.onEnd?.();
        resolve();
      };
      audio.onerror = () => {
        stopSpeaking();
        reject(new Error('Audio element playback error'));
      };
      const playPromise = audio.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch((err) => {
          stopSpeaking();
          reject(err);
        });
      }
    });

    return { engine: data.engine || 'gemini-3.8-flash-lite-tts' };
  } catch {
    await speakWithBrowserFallback(cleanText);
    options?.onEnd?.();
    return { engine: 'browser-speech-synthesis' };
  }
}

export function buildParsedPreviewSpeech(
  parsed: VoiceParsedBillPayload,
  txnType: string
): string {
  const party = parsed.partyName || 'Cash Customer';
  const total = Number(parsed.totalAmount) || 0;
  const due = Number(parsed.balanceDue) || 0;
  const itemsText =
    parsed.items && parsed.items.length > 0
      ? parsed.items
          .slice(0, 4)
          .map((i) => `${i.qty} ${i.unit} ${i.name}`)
          .join(', ')
      : '';
  const paymentNote =
    parsed.paymentType === 'Credit' || due > 0
      ? `Udhar baki ${due} rupaye.`
      : `${parsed.paymentType || 'Cash'} jama.`;

  return `${party} ke liye ${txnType} bill. ${itemsText ? `Items: ${itemsText}. ` : ''}Total amount ${total} rupaye. ${paymentNote}`;
}

export function buildBillSpeech(bill: Bill): string {
  const itemsText =
    bill.items && bill.items.length > 0
      ? bill.items
          .slice(0, 4)
          .map((i) => `${i.qty} ${i.unit} ${i.name}`)
          .join(', ')
      : '';
  const dueText =
    bill.balanceDue > 0
      ? `Isme ${bill.balanceDue} rupaye baki hai.`
      : `${bill.paymentMode} payment poora ho gaya hai.`;
  return `${bill.txnType} bill number ${bill.billNumber}, party ${bill.partyName}. ${
    itemsText ? `Items: ${itemsText}. ` : ''
  }Total ${bill.totalAmount} rupaye. ${dueText}`;
}
