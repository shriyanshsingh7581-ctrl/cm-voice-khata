import React, { useEffect, useRef, useState } from 'react';
import {
  Mic,
  Square,
  X,
  Check,
  Sparkles,
  Loader2,
  Volume2,
  VolumeX,
  Edit3,
} from 'lucide-react';
import { TransactionType, VoiceParsedBillPayload, Party, CatalogItem } from '../types';
import { fileToBase64 } from '../services/cloudinary';
import { apiUrl } from '../services/apiBase';
import { buildParsedPreviewSpeech, speakText, stopSpeaking } from '../services/ttsService';

interface VoiceListeningModalProps {
  isOpen: boolean;
  txnType: TransactionType;
  parties: Party[];
  items: CatalogItem[];
  onClose: () => void;
  onParsedResult: (parsed: VoiceParsedBillPayload, transcript: string) => void;
}

interface SpeechRecognitionAlternative {
  transcript: string;
}
interface SpeechRecognitionResult {
  0: SpeechRecognitionAlternative;
  isFinal: boolean;
}
interface SpeechRecognitionEventLike {
  results: ArrayLike<SpeechRecognitionResult>;
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: ((ev: { error: string }) => void) | null;
  start: () => void;
  stop: () => void;
}

export const VoiceListeningModal: React.FC<VoiceListeningModalProps> = ({
  isOpen,
  txnType,
  parties,
  items,
  onClose,
  onParsedResult,
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [bars, setBars] = useState<number[]>(Array(16).fill(12));
  const [parsedPreview, setParsedPreview] = useState<VoiceParsedBillPayload | null>(null);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const cleanupAudio = () => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
  };

  useEffect(() => {
    if (isOpen) {
      setLiveTranscript('');
      setErrorMsg('');
      setParsedPreview(null);
      setIsSpeaking(false);
      startListening();
    } else {
      cleanupAudio();
      stopSpeaking();
      setIsRecording(false);
      setIsSpeaking(false);
    }
    return () => {
      cleanupAudio();
      stopSpeaking();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const handleToggleSpeakPreview = async (preview: VoiceParsedBillPayload) => {
    if (isSpeaking) {
      stopSpeaking();
      setIsSpeaking(false);
      return;
    }
    const text = buildParsedPreviewSpeech(preview, txnType);
    setIsSpeaking(true);
    try {
      await speakText(text, {
        onEnd: () => setIsSpeaking(false),
      });
    } finally {
      setIsSpeaking(false);
    }
  };

  const startListening = async () => {
    stopSpeaking();
    setIsSpeaking(false);
    setErrorMsg('');
    setIsRecording(true);
    audioChunksRef.current = [];

    // Layer A1: Start webkitSpeechRecognition if available for real-time Hinglish preview
    const win = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const SpeechRec = win.SpeechRecognition || win.webkitSpeechRecognition;
    if (SpeechRec) {
      try {
        const rec = new SpeechRec();
        rec.lang = 'hi-IN';
        rec.continuous = true;
        rec.interimResults = true;
        rec.onresult = (event: SpeechRecognitionEventLike) => {
          let text = '';
          for (let i = 0; i < event.results.length; i++) {
            text += event.results[i][0].transcript + ' ';
          }
          setLiveTranscript(text.trim());
        };
        rec.onerror = () => {
          // Audio MediaRecorder fallback will handle OpenRouter Audio transcription
        };
        rec.start();
        recognitionRef.current = rec;
      } catch {
        // ignore
      }
    }

    // Layer A2: Start MediaRecorder + AudioContext AnalyserNode
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioCtx = new AudioCtx();
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const animateBars = () => {
        analyser.getByteFrequencyData(dataArray);
        const nextBars = Array.from({ length: 16 }, (_, i) => {
          const val = dataArray[i % dataArray.length] || 0;
          return Math.max(10, Math.min(54, Math.round((val / 255) * 54) + 8));
        });
        setBars(nextBars);
        rafRef.current = requestAnimationFrame(animateBars);
      };
      animateBars();

      const supportedMime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg'].find(
        (m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)
      );

      const recorder = supportedMime
        ? new MediaRecorder(stream, { mimeType: supportedMime })
        : new MediaRecorder(stream);

      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };
      recorder.start(250);
    } catch {
      setIsRecording(false);
      setErrorMsg(
        'Microphone permission is unavailable in this browser frame. You can type or edit your bill command below and tap Extract Bill from Text.'
      );
    }
  };

  const stopAndParse = async () => {
    setIsRecording(false);
    setIsProcessing(true);
    setErrorMsg('');

    let finalTranscript = liveTranscript.trim();

    try {
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== 'inactive') {
        const audioBlob: Blob = await new Promise((resolve) => {
          recorder.onstop = () => {
            resolve(new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' }));
          };
          recorder.stop();
        });

        cleanupAudio();

        if (audioBlob.size > 800) {
          try {
            const { base64, mimeType } = await fileToBase64(audioBlob);
            const transcribeRes = await fetch(apiUrl('/api/ai/transcribe'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ audioBase64: base64, mimeType, language: 'hi' }),
            });
            if (transcribeRes.ok) {
              const tData = (await transcribeRes.json()) as { transcript?: string };
              if (tData.transcript && tData.transcript.trim()) {
                finalTranscript = tData.transcript.trim();
                setLiveTranscript(finalTranscript);
              }
            }
          } catch {
            // Keep liveTranscript if available
          }
        }
      } else {
        cleanupAudio();
      }

      if (!finalTranscript) {
        setErrorMsg('No speech detected. Speak clearly or type your entry below.');
        setIsProcessing(false);
        return;
      }

      const parseRes = await fetch(apiUrl('/api/ai/parse-voice'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript: finalTranscript,
          txnType,
          existingParties: parties.map((p) => p.name),
          existingItems: items.map((i) => ({ name: i.name, unit: i.unit, rate: i.salePrice })),
        }),
      });

      if (!parseRes.ok) {
        const errData = (await parseRes.json().catch(() => ({}))) as { error?: string };
        throw new Error(errData.error || 'Voice/Text parsing failed');
      }

      const data = (await parseRes.json()) as { parsed: VoiceParsedBillPayload };
      setParsedPreview(data.parsed);

      if (autoSpeak && data.parsed) {
        handleToggleSpeakPreview(data.parsed);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to process voice/text command');
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-[#120F24]/95 backdrop-blur-md flex flex-col justify-between text-white p-5 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between max-w-lg w-full mx-auto">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[#A78BFA]" />
          <span className="text-sm font-bold tracking-wide">
            CM Voice AI · {txnType}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              const next = !autoSpeak;
              setAutoSpeak(next);
              if (!next) {
                stopSpeaking();
                setIsSpeaking(false);
              }
            }}
            className={`px-2.5 py-1.5 rounded-full text-[11px] font-bold flex items-center gap-1 transition ${
              autoSpeak ? 'bg-[#1B9B62] text-white' : 'bg-white/10 text-slate-300'
            }`}
            title="Toggle automatic voice readout (Text-to-Speech)"
          >
            {autoSpeak ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
            <span>{autoSpeak ? 'TTS On' : 'TTS Off'}</span>
          </button>
          <button
            onClick={() => {
              cleanupAudio();
              stopSpeaking();
              onClose();
            }}
            className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition"
            aria-label="Close voice listening"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Center Stage: Live Serrated Receipt Preview or Listening Soundwaves */}
      <div className="max-w-lg w-full mx-auto my-4 flex-1 flex flex-col items-center justify-center">
        {parsedPreview ? (
          <div className="w-full max-w-sm mx-auto">
            <div className="h-4 serrated-top w-full" />
            <div className="bg-white text-slate-900 px-5 py-4 shadow-2xl">
              <div className="flex items-center justify-between border-b border-dashed border-slate-200 pb-3">
                <div>
                  <p className="text-[11px] font-bold text-[#6A4CFF] uppercase tracking-wider">
                    AI Extracted {txnType}
                  </p>
                  <h3 className="text-base font-extrabold text-slate-900">
                    {parsedPreview.partyName || 'Cash Customer'}
                  </h3>
                  {parsedPreview.phone && (
                    <p className="text-xs text-slate-500 font-mono-num">{parsedPreview.phone}</p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-[#1B9B62]/10 text-[#1B9B62]">
                    {parsedPreview.paymentType || 'Cash'}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleToggleSpeakPreview(parsedPreview)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 transition ${
                      isSpeaking
                        ? 'bg-rose-100 text-rose-700'
                        : 'bg-purple-100 text-[#6A4CFF] hover:bg-purple-200'
                    }`}
                  >
                    <Volume2 className="w-3 h-3" />
                    <span>{isSpeaking ? 'Stop' : 'सुनें (Speak)'}</span>
                  </button>
                </div>
              </div>

              {parsedPreview.items && parsedPreview.items.length > 0 && (
                <div className="py-3 space-y-2 border-b border-dashed border-slate-200">
                  {parsedPreview.items.map((it, idx) => (
                    <div key={idx} className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-800">
                        {it.name} ({it.qty} {it.unit} × ₹{it.rate})
                      </span>
                      <span className="font-mono-num font-bold text-slate-900">
                        ₹{(Number(it.total) || 0).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div className="pt-3 flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500">Total Amount</span>
                <span className="text-xl font-extrabold font-mono-num text-[#1B9B62]">
                  ₹{(Number(parsedPreview.totalAmount) || 0).toFixed(2)}
                </span>
              </div>
              {(Number(parsedPreview.balanceDue) || 0) > 0 && (
                <div className="mt-1 flex items-center justify-between text-xs text-rose-600 font-semibold">
                  <span>Balance Due</span>
                  <span className="font-mono-num">
                    ₹{(Number(parsedPreview.balanceDue) || 0).toFixed(2)}
                  </span>
                </div>
              )}
            </div>
            <div className="h-4 serrated-bottom w-full" />

            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => {
                  stopSpeaking();
                  setParsedPreview(null);
                  startListening();
                }}
                className="flex-1 py-3.5 rounded-2xl bg-white/10 text-white font-bold text-sm hover:bg-white/20 transition"
              >
                Speak Again
              </button>
              <button
                type="button"
                onClick={() => {
                  stopSpeaking();
                  onParsedResult(parsedPreview, liveTranscript);
                }}
                className="flex-1 py-3.5 rounded-2xl bg-[#1B9B62] text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-[#1B9B62]/30 hover:bg-[#168452] transition"
              >
                <Check className="w-4 h-4" />
                Fill Receipt
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="text-center mb-6">
              <p className="text-xs font-bold uppercase tracking-widest text-[#A78BFA] mb-2">
                {isProcessing
                  ? 'AI Extracting Bill...'
                  : isRecording
                  ? 'Listening (Hindi / Hinglish / English)'
                  : 'Ready to Listen'}
              </p>
              <h2 className="text-xl font-bold text-white">
                {isRecording
                  ? 'Boliye, main bill likh raha hoon...'
                  : 'Tap Mic or type below'}
              </h2>
              <p className="text-xs text-slate-300 mt-1.5">
                Example: &ldquo;Ramesh ko 5 kg chini 45 rupaye kilo udhar diya&rdquo;
              </p>
            </div>

            {/* Real-time Audio Waveform Bars */}
            <div className="flex items-center justify-center gap-1.5 h-16 mb-6">
              {bars.map((h, i) => (
                <div
                  key={i}
                  className="w-1.5 rounded-full bg-gradient-to-t from-[#6A4CFF] to-[#34D399] transition-all duration-75"
                  style={{ height: `${isRecording ? h : 10}px` }}
                />
              ))}
            </div>

            {/* Live Transcript Input/Preview */}
            <div className="w-full bg-white/10 border border-white/15 rounded-2xl p-4 mb-4">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
                  <Volume2 className="w-3.5 h-3.5 text-[#34D399]" />
                  Live Transcript / Text Input
                </span>
                <span className="text-[11px] text-slate-400 flex items-center gap-1">
                  <Edit3 className="w-3 h-3" /> Editable
                </span>
              </div>
              <textarea
                rows={3}
                value={liveTranscript}
                onChange={(e) => setLiveTranscript(e.target.value)}
                placeholder="Your spoken words appear here... (or type Hinglish command directly)"
                className="w-full bg-transparent text-white placeholder:text-slate-400 text-sm font-medium focus:outline-none resize-none"
              />
            </div>

            {errorMsg && (
              <div className="w-full mb-4 p-3 rounded-2xl bg-amber-500/20 border border-amber-400/30 text-amber-200 text-xs">
                {errorMsg}
              </div>
            )}
          </>
        )}
      </div>

      {/* Bottom Glowing 3D Voice Orb & Controls */}
      {!parsedPreview && (
        <div className="max-w-lg w-full mx-auto flex flex-col items-center gap-4 pb-2">
          <div className="flex items-center justify-center gap-5">
            {isRecording ? (
              <button
                type="button"
                onClick={stopAndParse}
                disabled={isProcessing}
                className="w-20 h-20 rounded-full voice-orb-active flex items-center justify-center text-white transition active:scale-95"
                aria-label="Done speaking"
              >
                <Check className="w-9 h-9" />
              </button>
            ) : (
              <button
                type="button"
                onClick={startListening}
                disabled={isProcessing}
                className="w-20 h-20 rounded-full voice-orb-glow flex items-center justify-center text-white transition active:scale-95"
                aria-label="Start microphone"
              >
                {isProcessing ? (
                  <Loader2 className="w-8 h-8 animate-spin" />
                ) : (
                  <Mic className="w-8 h-8" />
                )}
              </button>
            )}
          </div>

          <div className="flex items-center gap-3 w-full">
            {isRecording ? (
              <button
                type="button"
                onClick={stopAndParse}
                className="w-full py-3.5 rounded-2xl bg-[#1B9B62] text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg"
              >
                <Square className="w-4 h-4 fill-current" />
                Done &amp; Extract Bill
              </button>
            ) : (
              <button
                type="button"
                onClick={stopAndParse}
                disabled={isProcessing || !liveTranscript.trim()}
                className="w-full py-3.5 rounded-2xl bg-[#6A4CFF] text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-40"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Processing with AI...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Extract Bill from Text
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
