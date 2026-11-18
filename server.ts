import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Dedicated low-cost OpenRouter models per task
const MODELS = {
  // Paper Bill Vision Scanner (accurate GST table OCR)
  billScan: ['google/gemini-2.5-flash', 'google/gemini-3.1-flash-lite-preview'],
  // Digital Bill & Item Generator (ultra-cheap fast JSON extraction)
  billGenerate: ['google/gemini-2.5-flash-lite', 'openai/gpt-4.1-nano'],
  // Voice Speech-to-Text Transcription
  voiceTranscribe: ['google/gemini-2.5-flash-lite', 'google/gemini-2.5-flash'],
  // Voice Text-to-Speech Readout
  voiceTts: ['openai/gpt-audio-mini', 'openai/gpt-audio'],
};

function getOpenRouterKey(): string {
  const key = (process.env.OPENROUTER_API_KEY || '').trim();
  if (!key) {
    throw new Error('OPENROUTER_API_KEY is not configured. Please add it to .env or Secrets.');
  }
  return key;
}

class HttpStatusError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function isApiKeyError(err: unknown): boolean {
  if (err instanceof HttpStatusError && (err.status === 401 || err.status === 403)) {
    return true;
  }
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('OPENROUTER_API_KEY') ||
    msg.includes('No auth credentials') ||
    msg.includes('Invalid API key') ||
    msg.includes('User not found')
  );
}

function isRetryableUpstreamError(status: number, msg: string): boolean {
  return (
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    msg.includes('timed out') ||
    msg.includes('overloaded') ||
    msg.includes('ECONNRESET') ||
    msg.includes('fetch failed')
  );
}

async function callOpenRouterWithFallback(
  models: string[],
  buildBody: (model: string) => Record<string, unknown>,
  timeoutMs = 15000
): Promise<{ content: string; model: string }> {
  const apiKey = getOpenRouterKey();
  let lastError: unknown;

  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(OPENROUTER_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
            'HTTP-Referer': process.env.APP_URL || 'http://localhost:3000',
            'X-Title': 'CM Voice Khata',
          },
          signal: controller.signal,
          body: JSON.stringify(buildBody(model)),
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          let errMsg = `OpenRouter HTTP ${res.status}`;
          try {
            const parsed = JSON.parse(errText) as { error?: { message?: string } };
            if (parsed.error?.message) errMsg = parsed.error.message;
          } catch {
            if (errText) errMsg = errText.slice(0, 200);
          }

          if (res.status === 401 || res.status === 403) {
            throw new HttpStatusError(res.status, errMsg);
          }
          if (isRetryableUpstreamError(res.status, errMsg) && attempt === 0) {
            lastError = new HttpStatusError(res.status, errMsg);
            await new Promise((r) => setTimeout(r, 350));
            continue;
          }
          throw new HttpStatusError(res.status, errMsg);
        }

        const data = (await res.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const content = data.choices?.[0]?.message?.content;
        if (content && content.trim()) {
          return { content: content.trim(), model };
        }
        throw new Error(`OpenRouter model ${model} returned empty content`);
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          lastError = new Error(`OpenRouter request timed out after ${timeoutMs}ms`);
        } else {
          lastError = err;
        }
        if (isApiKeyError(lastError)) {
          throw lastError;
        }
        if (attempt === 0 && lastError instanceof Error && lastError.message.includes('timed out')) {
          continue;
        }
        break;
      } finally {
        clearTimeout(timer);
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError || 'OpenRouter request failed'));
}

function createWavFromPcm16(pcmBuffer: Buffer, sampleRate = 24000, channels = 1): Buffer {
  const byteRate = sampleRate * channels * 2;
  const blockAlign = channels * 2;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcmBuffer.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // Subchunk1Size (PCM)
  header.writeUInt16LE(1, 20); // AudioFormat = 1 (PCM)
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(16, 34); // BitsPerSample
  header.write('data', 36);
  header.writeUInt32LE(pcmBuffer.length, 40);
  return Buffer.concat([header, pcmBuffer]);
}

async function callOpenRouterTtsStream(
  models: string[],
  text: string,
  voice: string,
  stylePrompt: string,
  timeoutMs = 15000
): Promise<{ audioBase64: string; mimeType: string; model: string }> {
  const apiKey = getOpenRouterKey();
  let lastError: unknown;

  for (const model of models) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'HTTP-Referer': process.env.APP_URL || 'http://localhost:3000',
          'X-Title': 'CM Voice Khata',
        },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          stream: true,
          modalities: ['text', 'audio'],
          audio: { voice, format: 'pcm16' },
          messages: [
            {
              role: 'system',
              content: `You are a text-to-speech voice assistant. ${stylePrompt}. Read the user's text aloud verbatim without adding extra commentary.`,
            },
            {
              role: 'user',
              content: text,
            },
          ],
        }),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new HttpStatusError(res.status, errText.slice(0, 200) || `OpenRouter TTS HTTP ${res.status}`);
      }

      const rawSse = await res.text();
      const b64Chunks: string[] = [];
      for (const line of rawSse.split('\n')) {
        if (!line.startsWith('data: ') || line.includes('[DONE]')) continue;
        try {
          const parsed = JSON.parse(line.slice(6)) as {
            choices?: Array<{ delta?: { audio?: { data?: string } } }>;
          };
          const chunk = parsed.choices?.[0]?.delta?.audio?.data;
          if (chunk) b64Chunks.push(chunk);
        } catch {
          // skip partial SSE line
        }
      }

      if (b64Chunks.length > 0) {
        const pcmBuf = Buffer.concat(b64Chunks.map((c) => Buffer.from(c, 'base64')));
        const wavBuf = createWavFromPcm16(pcmBuf, 24000, 1);
        return {
          audioBase64: wavBuf.toString('base64'),
          mimeType: 'audio/wav',
          model,
        };
      }
      throw new Error(`OpenRouter model ${model} returned empty audio stream`);
    } catch (err) {
      lastError = err;
      if (isApiKeyError(err)) throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('OpenRouter TTS audio generation failed');
}

function extractJsonText(raw: string | undefined): string {
  const trimmed = (raw ?? '{}').trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return fenceMatch ? fenceMatch[1].trim() : trimmed;
}

function getAudioFormatFromMime(mimeType: string): string {
  const m = (mimeType || '').toLowerCase();
  if (m.includes('wav')) return 'wav';
  if (m.includes('mp3') || m.includes('mpeg')) return 'mp3';
  if (m.includes('mp4') || m.includes('m4a') || m.includes('aac')) return 'mp4';
  if (m.includes('ogg')) return 'ogg';
  if (m.includes('flac')) return 'flac';
  return 'webm';
}

// Smart deterministic Hinglish/Hindi fallback parser if network/rate-limits occur
function fallbackParseTranscript(transcript: string, txnType = 'Sale') {
  const clean = transcript.trim();
  let partyName = '';
  let phone = '';
  const phoneMatch = clean.match(/\b(\d{10})\b/);
  if (phoneMatch) {
    phone = phoneMatch[1];
  }

  const partyPatterns = [
    /(?:party|customer|supplier|naam|name)\s+([a-zA-Z\u0900-\u097F\s]{2,25}?)(?=\s+(?:ko|se|ka|ki|ke|phone|mobile|\d|rupaye|rs|₹|$))/i,
    /^([a-zA-Z\u0900-\u097F]{2,20}(?:\s+[a-zA-Z\u0900-\u097F]{2,20})?)\s+(?:ko|se|ka|ke|ki)\b/i,
  ];
  for (const pat of partyPatterns) {
    const m = clean.match(pat);
    if (m && m[1]) {
      partyName = m[1].trim();
      break;
    }
  }

  const items: Array<{ name: string; qty: number; unit: string; rate: number; total: number }> = [];
  const itemRegex =
    /(\d+(?:\.\d+)?)\s*(kg|kilo|gram|gm|ltr|litre|pcs|piece|packet|pkt|bag|box|dozen|ton)?\s*([a-zA-Z\u0900-\u097F]+(?:\s+[a-zA-Z\u0900-\u097F]+)?)\s*(?:@|rate|bhav|ke\s+bhav|rupaye|rs|₹)?\s*(\d+(?:\.\d+)?)/gi;
  let match: RegExpExecArray | null;
  while ((match = itemRegex.exec(clean)) !== null) {
    const qty = parseFloat(match[1]) || 1;
    const unit = (match[2] || 'pcs').toLowerCase() === 'kilo' ? 'kg' : (match[2] || 'pcs').toLowerCase();
    const rawName = (match[3] || 'Item')
      .replace(/\b(ko|se|ka|ke|bhav|rate|rupaye|rs|kilo)\b/gi, '')
      .trim();
    const rate = parseFloat(match[4]) || 0;
    if (rawName && rate > 0) {
      items.push({
        name: rawName.charAt(0).toUpperCase() + rawName.slice(1),
        qty,
        unit,
        rate,
        total: Math.round(qty * rate * 100) / 100,
      });
    }
  }

  let totalAmount = items.reduce((sum, it) => sum + it.total, 0);
  if (totalAmount === 0) {
    const amtMatch = clean.match(
      /(?:total|amount|rupaye|rs|₹)\s*(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s*(?:rupaye|rs|₹)/i
    );
    if (amtMatch) {
      totalAmount = parseFloat(amtMatch[1] || amtMatch[2]) || 0;
    }
  }

  const isUdhari = /\b(udhar|udhari|baki|baaki|due|credit)\b/i.test(clean);
  const isUpi = /\b(upi|online|gpay|phonepe|paytm|bank)\b/i.test(clean);
  let receivedAmount = isUdhari ? 0 : totalAmount;
  const jamaMatch = clean.match(/(?:jama|paid|received|diya|mila)\s*(\d+(?:\.\d+)?)/i);
  if (jamaMatch && !isUdhari) {
    receivedAmount = parseFloat(jamaMatch[1]) || 0;
  }

  return {
    partyName: partyName || (txnType === 'Expense' ? 'Shop Expense' : 'Cash Customer'),
    phone,
    gstin: '',
    supplierBillNo: '',
    items:
      items.length > 0
        ? items
        : totalAmount > 0 && txnType !== 'Payment In' && txnType !== 'Payment Out' && txnType !== 'Expense'
        ? [{ name: clean.slice(0, 32) || 'General Item', qty: 1, unit: 'pcs', rate: totalAmount, total: totalAmount }]
        : [],
    discount: 0,
    deliveryCharge: 0,
    gst: 0,
    totalAmount,
    receivedAmount,
    balanceDue: Math.max(0, totalAmount - receivedAmount),
    paymentType: isUpi ? 'Online' : isUdhari ? 'Credit' : 'Cash',
    note: clean,
    category: txnType === 'Expense' ? 'Shop Expense' : 'General',
  };
}

function normalizeParsedBill(
  raw: Record<string, unknown>,
  transcript: string,
  txnType: string
) {
  const local = fallbackParseTranscript(transcript, txnType);
  const rawItems = Array.isArray(raw.items) ? raw.items : [];
  let items = rawItems
    .map((it) => {
      const obj = (it || {}) as Record<string, unknown>;
      const qty = Number(obj.qty) > 0 ? Number(obj.qty) : 1;
      const rate = Number(obj.rate) >= 0 ? Number(obj.rate) : 0;
      const total =
        Number(obj.total) > 0 ? Number(obj.total) : Math.round(qty * rate * 100) / 100;
      const computedRate = rate > 0 ? rate : qty > 0 ? Math.round((total / qty) * 100) / 100 : 0;
      return {
        name: String(obj.name || '').trim(),
        qty,
        unit: String(obj.unit || 'pcs').trim() || 'pcs',
        rate: computedRate,
        total,
      };
    })
    .filter((i) => i.name.length > 0);

  const isPaymentOrExpense =
    txnType === 'Payment In' || txnType === 'Payment Out' || txnType === 'Expense';

  if (items.length === 0 && !isPaymentOrExpense) {
    if (local.items.length > 0) {
      items = local.items;
    } else if (Number(raw.totalAmount) > 0) {
      const amt = Number(raw.totalAmount);
      items = [{ name: 'General Item', qty: 1, unit: 'pcs', rate: amt, total: amt }];
    }
  }

  let discount = Number(raw.discount) || 0;
  const deliveryCharge = Number(raw.deliveryCharge) || 0;
  const gst = Number(raw.gst) || 0;

  const itemsSum = items.reduce((s, i) => s + i.total, 0);
  let totalAmount = Number(raw.totalAmount) || 0;

  // Prevent double-subtracting per-item discounts when item line totals are already net of item discount
  if (discount > 0 && itemsSum > 0 && totalAmount > 0) {
    const taxableNoDisc = Math.max(0, itemsSum + deliveryCharge);
    const estNoDisc = taxableNoDisc + taxableNoDisc * (gst / 100);
    const taxableWithDisc = Math.max(0, itemsSum - discount + deliveryCharge);
    const estWithDisc = taxableWithDisc + taxableWithDisc * (gst / 100);
    if (Math.abs(estNoDisc - totalAmount) + 5 < Math.abs(estWithDisc - totalAmount)) {
      discount = 0;
    }
  }

  if (totalAmount <= 0 && itemsSum > 0) {
    const taxable = Math.max(0, itemsSum - discount + deliveryCharge);
    totalAmount = Math.round((taxable + taxable * (gst / 100)) * 100) / 100;
  }

  let paymentType = String(raw.paymentType || '').trim();
  if (!['Cash', 'Online', 'Credit'].includes(paymentType)) {
    paymentType = local.paymentType;
  }
  if (/\b(udhar|udhari|baki|baaki|due|credit)\b/i.test(transcript) && !raw.paymentType) {
    paymentType = 'Credit';
  }

  let receivedAmount =
    typeof raw.receivedAmount === 'number'
      ? raw.receivedAmount
      : paymentType === 'Credit'
      ? 0
      : totalAmount;
  if (paymentType === 'Credit' && typeof raw.receivedAmount !== 'number') {
    receivedAmount = 0;
  }
  let balanceDue =
    typeof raw.balanceDue === 'number'
      ? raw.balanceDue
      : Math.max(0, Math.round((totalAmount - receivedAmount) * 100) / 100);
  if (paymentType === 'Credit' && receivedAmount < totalAmount && balanceDue <= 0) {
    balanceDue = Math.max(0, Math.round((totalAmount - receivedAmount) * 100) / 100);
  }

  return {
    partyName: String(raw.partyName || local.partyName || 'Cash Customer').trim(),
    phone: String(raw.phone || local.phone || '').trim(),
    gstin: String(raw.gstin || '').trim(),
    supplierBillNo: String(raw.supplierBillNo || '').trim(),
    items: isPaymentOrExpense ? [] : items,
    discount,
    deliveryCharge,
    gst,
    totalAmount,
    receivedAmount,
    balanceDue,
    paymentType: paymentType as 'Cash' | 'Online' | 'Credit',
    note: String(raw.note || transcript).trim(),
    category: String(raw.category || (txnType === 'Expense' ? 'Shop Expense' : 'General')).trim(),
  };
}

function fallbackParseItem(transcript: string) {
  const clean = transcript.trim();
  const saleMatch = clean.match(/(?:sale|sell|bechna|mrp|rate|price)\s*(?:rs|₹)?\s*(\d+(?:\.\d+)?)/i);
  const purchaseMatch = clean.match(/(?:purchase|buy|cost|kharid)\s*(?:rs|₹)?\s*(\d+(?:\.\d+)?)/i);
  const stockMatch = clean.match(/(?:stock|qty|quantity)\s*(\d+(?:\.\d+)?)/i);
  const gstMatch = clean.match(/(?:gst|tax)\s*(\d+(?:\.\d+)?)/i);
  const unitMatch = clean.match(/\b(kg|kilo|gm|gram|ltr|litre|pcs|piece|pkt|packet|bag|box|dozen)\b/i);

  const firstWordMatch = clean.match(
    /^([a-zA-Z\u0900-\u097F][a-zA-Z0-9\u0900-\u097F\s]{1,28}?)(?=\s+(?:\d|sale|purchase|stock|gst|kg|pcs|pkt|ltr|bag|box|$))/i
  );
  const name = (firstWordMatch?.[1] || clean.split(/\s+/).slice(0, 2).join(' ') || 'New Item').trim();

  const nums = [...clean.matchAll(/\b(\d+(?:\.\d+)?)\b/g)].map((m) => parseFloat(m[1]));

  return {
    name: name.charAt(0).toUpperCase() + name.slice(1),
    unit: unitMatch ? (unitMatch[1].toLowerCase() === 'kilo' ? 'kg' : unitMatch[1].toLowerCase()) : 'pcs',
    salePrice: saleMatch ? parseFloat(saleMatch[1]) : nums[0] || 0,
    purchasePrice: purchaseMatch ? parseFloat(purchaseMatch[1]) : nums[1] || 0,
    stockQty: stockMatch ? parseFloat(stockMatch[1]) : 0,
    gstPercent: gstMatch ? parseFloat(gstMatch[1]) : 0,
    hsn: '',
    barcode: '',
  };
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '25mb' }));

  // 1. Voice Speech-to-Text Transcription via OpenRouter (google/gemini-2.5-flash-lite)
  app.post('/api/ai/transcribe', async (req, res) => {
    try {
      const { audioBase64, mimeType = 'audio/webm' } = req.body;
      if (!audioBase64) {
        res.status(400).json({ error: 'Missing audioBase64 payload' });
        return;
      }

      const audioFormat = getAudioFormatFromMime(String(mimeType));
      const { content, model } = await callOpenRouterWithFallback(
        MODELS.voiceTranscribe,
        (m) => ({
          model: m,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: 'Transcribe this Indian shopkeeper voice recording verbatim in Hinglish / Hindi / English. Preserve numbers, item names, quantities, rates, and party names. Do NOT add timestamps like 00:00. Return ONLY the transcription text.',
                },
                {
                  type: 'input_audio',
                  input_audio: {
                    data: String(audioBase64),
                    format: audioFormat,
                  },
                },
              ],
            },
          ],
        }),
        15000
      );

      res.json({
        transcript: content.replace(/^\d{1,2}:\d{2}\s*/, '').trim(),
        engine: model,
      });
    } catch (error) {
      console.error('OpenRouter transcription error:', error);
      res.status(isApiKeyError(error) ? 401 : 500).json({
        error: error instanceof Error ? error.message : 'Audio transcription failed',
      });
    }
  });

  // 2. Digital Bill Generation (Voice/Text -> Structured Bill JSON via google/gemini-2.5-flash-lite)
  app.post('/api/ai/parse-voice', async (req, res) => {
    try {
      const { transcript, txnType = 'Sale', existingParties = [], existingItems = [] } = req.body;
      if (!transcript || !String(transcript).trim()) {
        res.status(400).json({ error: 'Transcript is required' });
        return;
      }

      const systemPrompt = `You are the AI Accounting Parser for "CM Voice Khata", an Indian business & billing app.
Convert the shopkeeper's Hindi/Hinglish/English billing command into a COMPLETE structured transaction JSON for transaction type: "${txnType}".
Known parties: ${JSON.stringify(existingParties.slice(0, 30))}
Known catalog items: ${JSON.stringify(existingItems.slice(0, 40))}

Return ONLY a valid JSON object with exact keys:
{
  "partyName": string,
  "phone": string,
  "gstin": string,
  "supplierBillNo": string,
  "items": [{ "name": string, "qty": number, "unit": string, "rate": number, "total": number }],
  "discount": number,
  "deliveryCharge": number,
  "gst": number,
  "totalAmount": number,
  "receivedAmount": number,
  "balanceDue": number,
  "paymentType": "Cash" | "Online" | "Credit",
  "note": string,
  "category": string
}

Strict Rules:
- Always populate ALL keys. Default phone/gstin/supplierBillNo to "" and discount/deliveryCharge/gst to 0.
- Extract partyName (default "Cash Customer" for Sale or "Cash Supplier" for Purchase if not spoken).
- Extract every item into items array with qty, unit (pcs/kg/bag/pkt/ltr/box), rate, total = qty * rate.
- Example: "Ramesh ko 5 kg chini 45 rupaye kilo udhar diya" => partyName: "Ramesh", items: [{ name: "Chini", qty: 5, unit: "kg", rate: 45, total: 225 }], totalAmount: 225, receivedAmount: 0, balanceDue: 225, paymentType: "Credit".
- For Payment In, Payment Out, or Expense, items can be [] and totalAmount = spoken amount.
- If user says "udhar", "udhari", "baki", "credit", set receivedAmount = 0, balanceDue = totalAmount, paymentType = "Credit".
- If user says "500 jama kiya" or partial payment, set receivedAmount = 500, balanceDue = totalAmount - 500.
- Otherwise receivedAmount = totalAmount, balanceDue = 0, paymentType = "Cash" (or "Online" if UPI/GPay/PhonePe/Paytm/Online mentioned).`;

      try {
        const { content, model } = await callOpenRouterWithFallback(
          MODELS.billGenerate,
          (m) => ({
            model: m,
            response_format: { type: 'json_object' },
            temperature: 0.1,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: `Billing command: "${transcript}"` },
            ],
          }),
          12000
        );

        const rawParsed = JSON.parse(extractJsonText(content)) as Record<string, unknown>;
        res.json({
          parsed: normalizeParsedBill(rawParsed, String(transcript), String(txnType)),
          engine: model,
        });
        return;
      } catch (openRouterErr) {
        if (isApiKeyError(openRouterErr)) {
          res.status(401).json({
            error: 'Invalid or missing OpenRouter API Key. Please check .env / Secrets.',
          });
          return;
        }
        console.warn('OpenRouter parse fallback to deterministic parser:', openRouterErr);
      }

      const fallback = fallbackParseTranscript(String(transcript), String(txnType));
      res.json({ parsed: fallback, engine: 'smart-local-parser' });
    } catch (error) {
      console.error('Voice parse error:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to parse voice transcript',
      });
    }
  });

  // 3. AI Vision Paper Bill Scanner via OpenRouter (google/gemini-2.5-flash)
  app.post('/api/ai/scan-bill', async (req, res) => {
    try {
      const { imageBase64, mimeType = 'image/jpeg' } = req.body;
      if (!imageBase64) {
        res.status(400).json({ error: 'Missing imageBase64' });
        return;
      }

      const prompt = `Read this paper invoice/receipt image carefully and extract all billing details into a single JSON object with these exact keys:
{
  "txnType": "Purchase Invoice" | "Sale" | "Expense",
  "partyName": string,
  "phone": string,
  "gstin": string,
  "supplierBillNo": string,
  "items": [{ "name": string, "qty": number, "unit": string, "rate": number, "total": number }],
  "discount": number,
  "deliveryCharge": number,
  "gst": number,
  "totalAmount": number,
  "receivedAmount": number,
  "balanceDue": number,
  "paymentType": "Cash" | "Online" | "Credit",
  "note": string
}

Rules:
- txnType: Use "Purchase Invoice" if this is a supplier tax invoice billed TO a buyer/shop, "Sale" if this is a customer receipt/bill, or "Expense".
- partyName: For Purchase Invoice, extract the Supplier/Seller company name at the top; for Sale, extract the Customer/Buyer name.
- gstin: Counterparty GSTIN if visible, else "".
- items: Extract every line item. Set "total" to the net pre-tax line amount (after any per-item % discount) and "rate" to total/qty or net unit rate.
- discount: ONLY extra bill-level discount deducted AFTER item subtotal (default 0 — do NOT copy per-item % discounts here).
- gst: Combined GST percentage as a number (e.g. CGST 9% + SGST 9% = 18, IGST 18% = 18, or 0/5/12/18/28).
- totalAmount: Final printed Grand Total in INR (numeric).
- paymentType: "Cash", "Online", or "Credit".`;

      const dataUrl = `data:${mimeType};base64,${imageBase64}`;
      const { content, model } = await callOpenRouterWithFallback(
        MODELS.billScan,
        (m) => ({
          model: m,
          response_format: { type: 'json_object' },
          temperature: 0.1,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: prompt },
                { type: 'image_url', image_url: { url: dataUrl } },
              ],
            },
          ],
        }),
        18000
      );

      const rawParsed = JSON.parse(extractJsonText(content)) as Record<string, unknown>;
      const txn = String(rawParsed.txnType || 'Sale');
      res.json({
        parsed: {
          ...normalizeParsedBill(rawParsed, '', txn),
          txnType: txn,
        },
        engine: `${model}-vision`,
      });
    } catch (error) {
      console.error('AI Bill Scan Error:', error);
      res.status(isApiKeyError(error) ? 401 : 500).json({
        error: error instanceof Error ? error.message : 'Failed to scan bill with AI',
      });
    }
  });

  // 4. Smart Inventory Item Parser via OpenRouter (google/gemini-2.5-flash-lite)
  app.post('/api/ai/parse-item', async (req, res) => {
    try {
      const { transcript } = req.body;
      if (!transcript || !String(transcript).trim()) {
        res.status(400).json({ error: 'Missing transcript' });
        return;
      }

      try {
        const { content, model } = await callOpenRouterWithFallback(
          MODELS.billGenerate,
          (m) => ({
            model: m,
            response_format: { type: 'json_object' },
            temperature: 0.1,
            messages: [
              {
                role: 'system',
                content:
                  'Extract product inventory item details from Hindi/Hinglish text into JSON: { "name": string, "unit": string (pcs/kg/bag/pkt/ltr/box), "salePrice": number, "purchasePrice": number, "stockQty": number, "gstPercent": number, "hsn": string, "barcode": string }.',
              },
              {
                role: 'user',
                content: `Item text: "${transcript}"`,
              },
            ],
          }),
          10000
        );

        const parsed = JSON.parse(extractJsonText(content));
        res.json({ parsed, engine: model });
        return;
      } catch (openRouterErr) {
        if (isApiKeyError(openRouterErr)) {
          res.status(401).json({
            error: 'Invalid or missing OpenRouter API Key. Please check .env / Secrets.',
          });
          return;
        }
        console.warn('OpenRouter item parse fallback to deterministic parser:', openRouterErr);
      }

      res.json({ parsed: fallbackParseItem(String(transcript)), engine: 'smart-local-parser' });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to parse item voice input',
      });
    }
  });

  // 5. Voice Text-to-Speech via OpenRouter (openai/gpt-audio-mini streaming PCM16 -> WAV)
  app.post('/api/ai/tts', async (req, res) => {
    try {
      const { text, voiceName = 'alloy', style } = req.body;
      const cleanText = String(text || '').trim().slice(0, 1200);
      if (!cleanText) {
        res.status(400).json({ error: 'Text is required for speech generation' });
        return;
      }

      const validVoices = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];
      const mappedVoice = validVoices.includes(String(voiceName).toLowerCase())
        ? String(voiceName).toLowerCase()
        : 'alloy';
      const stylePrompt =
        String(style || '').trim() ||
        'Speak in a clear, warm, polite Indian shopkeeper assistant voice with natural Hinglish and Hindi numbers';

      const { audioBase64, mimeType, model } = await callOpenRouterTtsStream(
        MODELS.voiceTts,
        cleanText,
        mappedVoice,
        stylePrompt,
        15000
      );

      res.json({
        audioBase64,
        mimeType,
        engine: model,
      });
    } catch (error) {
      console.error('OpenRouter TTS error:', error);
      res.status(isApiKeyError(error) ? 401 : 500).json({
        error: error instanceof Error ? error.message : 'Text-to-speech generation failed',
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`CM Voice Khata server running on http://localhost:${PORT} (OpenRouter AI)`);
  });
}

startServer();
