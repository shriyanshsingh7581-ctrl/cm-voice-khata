/**
 * Central OpenRouter AI Model Configuration for CM Voice Khata.
 * Set `OPENROUTER_API_KEY` in Vercel Project Settings -> Environment Variables.
 * No API keys are stored in this repository.
 */

export const OPENROUTER_CONFIG = {
  endpoint: 'https://openrouter.ai/api/v1/chat/completions',
  appTitle: 'CM Voice Khata',
  envVarName: 'OPENROUTER_API_KEY',
  timeoutsMs: {
    billScan: 22000,
    billGenerate: 14000,
    itemParse: 12000,
    voiceTranscribe: 18000,
    voiceTts: 18000,
  },
} as const;

export function getOpenRouterModels() {
  return {
    // 1. Paper Bill Photo Scanner (accurate GST & receipt OCR)
    billScan: [
      process.env.OPENROUTER_SCAN_MODEL || 'google/gemini-2.5-flash',
      'google/gemini-3.1-flash-lite-preview',
    ],
    // 2. Digital Bill & Catalog Item Generator (ultra-low-cost JSON extraction)
    billGenerate: [
      process.env.OPENROUTER_BILL_MODEL || 'google/gemini-2.5-flash-lite',
      'openai/gpt-4.1-nano',
    ],
    // 3. Voice Speech-to-Text Transcription (Hindi / Hinglish / English)
    voiceTranscribe: [
      process.env.OPENROUTER_VOICE_MODEL || 'google/gemini-2.5-flash-lite',
      'google/gemini-2.5-flash',
    ],
    // 4. Voice Text-to-Speech Readout ("सुनें" button)
    voiceTts: [
      process.env.OPENROUTER_TTS_MODEL || 'openai/gpt-audio-mini',
      'openai/gpt-audio',
    ],
  };
}

export function getOpenRouterApiKey(): string {
  const key = (process.env.OPENROUTER_API_KEY || '').trim();
  if (!key) {
    throw new Error(
      'OPENROUTER_API_KEY is not set. Add OPENROUTER_API_KEY in Vercel Settings > Environment Variables and Redeploy.'
    );
  }
  return key;
}
