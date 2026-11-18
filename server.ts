import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, ThinkingLevel, Type, type GenerateContentParameters } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getGroqKey(): string {
  return process.env.GROQ_API_KEY || '';
}

function getGeminiClient(apiVersion?: string) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured. Please check Settings > Secrets.');
  }
  return new GoogleGenAI({
    apiKey,
    ...(apiVersion ? { apiVersion } : {}),
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function isRetryableUpstreamError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('503') ||
    msg.includes('429') ||
    msg.includes('UNAVAILABLE') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('high demand') ||
    msg.includes('overloaded') ||
    msg.includes('ECONNRESET') ||
    msg.includes('ETIMEDOUT') ||
    msg.includes('fetch failed') ||
    msg.includes('timed out') ||
    msg.includes('500')
  );
}

function isApiKeyError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('API_KEY_INVALID') ||
    msg.includes('PERMISSION_DENIED') ||
    msg.includes('API key not valid') ||
    msg.includes('not configured')
  );
}

async function withTimeout<T>(promise: Promise<T>, ms = 9000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Gemini request timed out after ${ms}ms`)), ms)
    ),
  ]);
}

async function generateContentWithFallback(
  models: string[],
  buildParams: (model: string) => GenerateContentParameters,
  options?: { apiVersion?: string; timeoutMs?: number }
) {
  const ai = getGeminiClient(options?.apiVersion);
  let lastError: unknown;
  const timeoutMs = options?.timeoutMs ?? 9000;

  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await withTimeout(
          ai.models.generateContent(buildParams(model)),
          timeoutMs
        );
        return { response, model };
      } catch (err) {
        lastError = err;
        if (isApiKeyError(err)) {
          throw err;
        }
        if (isRetryableUpstreamError(err) && attempt === 0) {
          await new Promise((r) => setTimeout(r, 350));
          continue;
        }
        break;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError || 'Gemini request failed'));
}

function extractJsonText(raw: string | undefined): string {
  const trimmed = (raw ?? '{}').trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return fenceMatch ? fenceMatch[1].trim() : trimmed;
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

  const discount = Number(raw.discount) || 0;
  const deliveryCharge = Number(raw.deliveryCharge) || 0;
  const gst = Number(raw.gst) || 0;

  const itemsSum = items.reduce((s, i) => s + i.total, 0);
  let totalAmount = Number(raw.totalAmount) || 0;
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
  const balanceDue =
    typeof raw.balanceDue === 'number'
      ? raw.balanceDue
      : Math.max(0, Math.round((totalAmount - receivedAmount) * 100) / 100);

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

  const firstWordMatch = clean.match(/^([a-zA-Z\u0900-\u097F][a-zA-Z0-9\u0900-\u097F\s]{1,28}?)(?=\s+(?:\d|sale|purchase|stock|gst|kg|pcs|pkt|ltr|bag|box|$))/i);
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

  // 1. Universal Audio Transcription (Groq Whisper optional + Gemini 3.5 Transcribe + Gemini 4 Hydrogen / 3.1 Flash Lite fallback)
  app.post('/api/ai/transcribe', async (req, res) => {
    try {
      const { audioBase64, mimeType = 'audio/webm', language = 'hi' } = req.body;
      if (!audioBase64) {
        res.status(400).json({ error: 'Missing audioBase64 payload' });
        return;
      }

      const audioBuffer = Buffer.from(audioBase64, 'base64');

      // Layer 1A: Try Groq Whisper-large-v3-turbo if GROQ_API_KEY is configured
      const groqKey = getGroqKey();
      if (groqKey) {
        try {
          const formData = new FormData();
          const ext = mimeType.includes('mp4') ? 'm4a' : mimeType.includes('ogg') ? 'ogg' : 'webm';
          const blob = new Blob([audioBuffer], { type: mimeType });
          formData.append('file', blob, `voice.${ext}`);
          formData.append('model', 'whisper-large-v3-turbo');
          if (language) {
            formData.append('language', language);
          }
          formData.append(
            'prompt',
            'Billing, Khata, Hindi, Hinglish, Rupees, kg, packet, udhar, nagad, jama, baki, GST, invoice, customer, supplier'
          );

          const groqRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${groqKey}`,
            },
            body: formData,
          });

          if (groqRes.ok) {
            const data = (await groqRes.json()) as { text?: string };
            if (data.text && data.text.trim()) {
              res.json({ transcript: data.text.trim(), engine: 'groq-whisper-large-v3-turbo' });
              return;
            }
          }
        } catch (groqErr) {
          console.warn('Groq Whisper fallback to Gemini:', groqErr);
        }
      }

      // Layer 1B: Gemini Audio Transcription with retry & model failover
      const cleanMime = (mimeType.split(';')[0] || 'audio/webm').trim();
      const { response: geminiResp, model } = await generateContentWithFallback(
        ['gemini-3.5-transcribe', 'gemini-4-hydrogen', 'gemini-3.1-flash-lite'],
        (m) => ({
          model: m,
          contents: {
            parts: [
              {
                inlineData: {
                  mimeType: cleanMime,
                  data: audioBase64,
                },
              },
              {
                text: 'Transcribe this Indian shopkeeper voice recording accurately in Hinglish / Hindi / English exactly as spoken, preserving numbers, item names, quantities, rates, and party names. Return only the transcription text.',
              },
            ],
          },
        })
      );

      res.json({
        transcript: (geminiResp.text ?? '').trim(),
        engine: model,
      });
    } catch (error) {
      console.error('Transcription error:', error);
      res.status(isApiKeyError(error) ? 401 : 500).json({
        error: error instanceof Error ? error.message : 'Audio transcription failed',
      });
    }
  });

  // 2. Smart Voice / Text-to-Bill Parser (Groq optional + Gemini 4 Hydrogen -> Gemini 3.1 Flash Lite + smart normalizer)
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

Strict Rules:
- Always populate ALL fields. Never omit "items", "paymentType", "receivedAmount", or "balanceDue".
- Extract partyName (default to "Cash Customer" for Sale or "Cash Supplier" for Purchase if not mentioned).
- Extract phone (10 digits if mentioned, else "") and gstin (if mentioned, else "").
- Extract items array: EVERY item mentioned must be included with { name (English/Hinglish), qty (number), unit (pcs, kg, bag, pkt, ltr, box), rate (unit price in INR), total (qty * rate) }.
- Example: "Ramesh ko 5 kg chini 45 rupaye kilo udhar diya" => partyName: "Ramesh", items: [{ name: "Chini", qty: 5, unit: "kg", rate: 45, total: 225 }], totalAmount: 225, receivedAmount: 0, balanceDue: 225, paymentType: "Credit".
- For Payment In, Payment Out, or Expense, items can be [] and totalAmount = spoken amount.
- If user says "udhar", "udhari", "baki", "credit", set receivedAmount = 0, balanceDue = totalAmount, paymentType = "Credit".
- If user says "500 jama kiya" or partial payment, set receivedAmount = 500, balanceDue = totalAmount - 500.
- Otherwise receivedAmount = totalAmount, balanceDue = 0, paymentType = "Cash" (or "Online" if UPI/GPay/PhonePe/Paytm/Online mentioned).`;

      const groqKey = getGroqKey();
      if (groqKey) {
        try {
          const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${groqKey}`,
            },
            body: JSON.stringify({
              model: 'llama-3.3-70b-versatile',
              response_format: { type: 'json_object' },
              messages: [
                { role: 'system', content: systemPrompt },
                {
                  role: 'user',
                  content: `Transcript: "${transcript}"\nReturn JSON with exact keys: { "partyName": string, "phone": string, "gstin": string, "supplierBillNo": string, "items": [{ "name": string, "qty": number, "unit": string, "rate": number, "total": number }], "discount": number, "deliveryCharge": number, "gst": number, "totalAmount": number, "receivedAmount": number, "balanceDue": number, "paymentType": "Cash" | "Online" | "Credit", "note": string, "category": string }`,
                },
              ],
            }),
          });

          if (groqRes.ok) {
            const groqData = (await groqRes.json()) as {
              choices?: Array<{ message?: { content?: string } }>;
            };
            const content = groqData.choices?.[0]?.message?.content;
            if (content) {
              const rawParsed = JSON.parse(extractJsonText(content)) as Record<string, unknown>;
              res.json({
                parsed: normalizeParsedBill(rawParsed, String(transcript), String(txnType)),
                engine: 'llama-3.3-70b-versatile',
              });
              return;
            }
          }
        } catch (groqErr) {
          console.warn('Groq Llama parse fallback to Gemini:', groqErr);
        }
      }

      try {
        const { response, model } = await generateContentWithFallback(
          ['gemini-3.1-flash-lite', 'gemini-4-hydrogen'],
          (m) => ({
            model: m,
            contents: `Billing command: "${transcript}"`,
            config: {
              systemInstruction: systemPrompt,
              thinkingConfig: {
                thinkingLevel: m === 'gemini-3.1-flash-lite' ? ThinkingLevel.MINIMAL : ThinkingLevel.LOW,
              },
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                required: [
                  'partyName',
                  'items',
                  'totalAmount',
                  'receivedAmount',
                  'balanceDue',
                  'paymentType',
                ],
                properties: {
                  partyName: { type: Type.STRING },
                  phone: { type: Type.STRING },
                  gstin: { type: Type.STRING },
                  supplierBillNo: { type: Type.STRING },
                  items: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      required: ['name', 'qty', 'unit', 'rate', 'total'],
                      properties: {
                        name: { type: Type.STRING },
                        qty: { type: Type.NUMBER },
                        unit: { type: Type.STRING },
                        rate: { type: Type.NUMBER },
                        total: { type: Type.NUMBER },
                      },
                    },
                  },
                  discount: { type: Type.NUMBER },
                  deliveryCharge: { type: Type.NUMBER },
                  gst: { type: Type.NUMBER },
                  totalAmount: { type: Type.NUMBER },
                  receivedAmount: { type: Type.NUMBER },
                  balanceDue: { type: Type.NUMBER },
                  paymentType: { type: Type.STRING },
                  note: { type: Type.STRING },
                  category: { type: Type.STRING },
                },
              },
            },
          })
        );

        const rawParsed = JSON.parse(extractJsonText(response.text)) as Record<string, unknown>;
        res.json({
          parsed: normalizeParsedBill(rawParsed, String(transcript), String(txnType)),
          engine: model,
        });
        return;
      } catch (geminiErr) {
        if (isApiKeyError(geminiErr)) {
          res.status(401).json({
            error: 'Invalid or missing Gemini API Key. Please check Settings > Secrets.',
          });
          return;
        }
        console.warn('Gemini parse fallback to deterministic parser:', geminiErr);
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

  // 3. AI Vision Paper Bill Scanner (Option 2: Scan with AI & Create Digital Bill)
  app.post('/api/ai/scan-bill', async (req, res) => {
    try {
      const { imageBase64, mimeType = 'image/jpeg' } = req.body;
      if (!imageBase64) {
        res.status(400).json({ error: 'Missing imageBase64' });
        return;
      }

      const prompt = `Read this paper invoice/receipt image carefully and extract all billing details into JSON:
- partyName (customer or supplier/shop name on the bill)
- phone (phone number if visible, else "")
- gstin (GSTIN if visible, else "")
- supplierBillNo (invoice/bill number on the paper bill, else "")
- txnType ("Sale" or "Purchase Invoice" or "Expense")
- items: array of line items [{ name, qty, unit, rate, total }]
- discount (numeric discount in INR, default 0)
- deliveryCharge (numeric delivery/freight charge in INR, default 0)
- gst (GST percentage like 0, 5, 12, 18, 28, default 0)
- totalAmount (final bill total in INR)
- receivedAmount (amount paid, default equal to totalAmount unless marked due/unpaid)
- balanceDue (balance unpaid, default 0)
- paymentType ("Cash", "Online", or "Credit")
- note (summary note)`;

      try {
        const { response, model } = await generateContentWithFallback(
          ['gemini-4-hydrogen', 'gemini-3.1-flash-lite'],
          (m) => ({
            model: m,
            contents: {
              parts: [
                {
                  inlineData: {
                    mimeType,
                    data: imageBase64,
                  },
                },
                { text: prompt },
              ],
            },
            config: {
              thinkingConfig: {
                thinkingLevel: m === 'gemini-3.1-flash-lite' ? ThinkingLevel.MINIMAL : ThinkingLevel.LOW,
              },
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                required: ['partyName', 'txnType', 'items', 'totalAmount', 'paymentType'],
                properties: {
                  partyName: { type: Type.STRING },
                  phone: { type: Type.STRING },
                  gstin: { type: Type.STRING },
                  supplierBillNo: { type: Type.STRING },
                  txnType: { type: Type.STRING },
                  items: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      required: ['name', 'qty', 'unit', 'rate', 'total'],
                      properties: {
                        name: { type: Type.STRING },
                        qty: { type: Type.NUMBER },
                        unit: { type: Type.STRING },
                        rate: { type: Type.NUMBER },
                        total: { type: Type.NUMBER },
                      },
                    },
                  },
                  discount: { type: Type.NUMBER },
                  deliveryCharge: { type: Type.NUMBER },
                  gst: { type: Type.NUMBER },
                  totalAmount: { type: Type.NUMBER },
                  receivedAmount: { type: Type.NUMBER },
                  balanceDue: { type: Type.NUMBER },
                  paymentType: { type: Type.STRING },
                  note: { type: Type.STRING },
                },
              },
            },
          })
        );

        const rawParsed = JSON.parse(extractJsonText(response.text)) as Record<string, unknown>;
        const txn = String(rawParsed.txnType || 'Sale');
        res.json({
          parsed: {
            ...normalizeParsedBill(rawParsed, '', txn),
            txnType: txn,
          },
          engine: `${model}-vision`,
        });
        return;
      } catch (visionErr) {
        if (isApiKeyError(visionErr)) {
          res.status(401).json({
            error: 'Invalid or missing Gemini API Key. Please check Settings > Secrets.',
          });
          return;
        }
        console.warn('Gemini vision fallback to Groq vision:', visionErr);
      }

      const groqKey = getGroqKey();
      if (groqKey) {
        const groqVisionRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${groqKey}`,
          },
          body: JSON.stringify({
            model: 'meta-llama/llama-4-scout-17b-16e-instruct',
            response_format: { type: 'json_object' },
            messages: [
              {
                role: 'user',
                content: [
                  { type: 'text', text: prompt },
                  {
                    type: 'image_url',
                    image_url: { url: `data:${mimeType};base64,${imageBase64}` },
                  },
                ],
              },
            ],
          }),
        });

        if (groqVisionRes.ok) {
          const data = (await groqVisionRes.json()) as {
            choices?: Array<{ message?: { content?: string } }>;
          };
          const content = data.choices?.[0]?.message?.content;
          if (content) {
            const rawParsed = JSON.parse(extractJsonText(content)) as Record<string, unknown>;
            res.json({ parsed: rawParsed, engine: 'groq-vision' });
            return;
          }
        }
      }

      throw new Error(
        'Could not extract bill fields from image. Please check image clarity or save as Normal Bill Photo.'
      );
    } catch (error) {
      console.error('AI Bill Scan Error:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to scan bill with AI',
      });
    }
  });

  // 4. Smart Voice / Text-to-Item Parser for Inventory Catalog
  app.post('/api/ai/parse-item', async (req, res) => {
    try {
      const { transcript } = req.body;
      if (!transcript || !String(transcript).trim()) {
        res.status(400).json({ error: 'Missing transcript' });
        return;
      }

      const groqKey = getGroqKey();
      if (groqKey) {
        try {
          const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${groqKey}`,
            },
            body: JSON.stringify({
              model: 'llama-3.3-70b-versatile',
              response_format: { type: 'json_object' },
              messages: [
                {
                  role: 'system',
                  content:
                    'Extract product inventory item details from Hindi/Hinglish speech into JSON: { "name": string, "unit": string (pcs/kg/bag/pkt/ltr/box), "salePrice": number, "purchasePrice": number, "stockQty": number, "gstPercent": number, "hsn": string, "barcode": string }.',
                },
                { role: 'user', content: String(transcript) },
              ],
            }),
          });

          if (groqRes.ok) {
            const data = (await groqRes.json()) as {
              choices?: Array<{ message?: { content?: string } }>;
            };
            const content = data.choices?.[0]?.message?.content;
            if (content) {
              res.json({ parsed: JSON.parse(extractJsonText(content)), engine: 'llama-3.3-70b-versatile' });
              return;
            }
          }
        } catch (e) {
          console.warn('Groq item parse fallback:', e);
        }
      }

      try {
        const { response, model } = await generateContentWithFallback(
          ['gemini-3.1-flash-lite', 'gemini-4-hydrogen'],
          (m) => ({
            model: m,
            contents: `Extract product inventory item details from Hindi/Hinglish text: "${transcript}"`,
            config: {
              systemInstruction:
                'Extract product inventory fields cleanly. For example "Chini 1 kg sale 48 purchase 42 stock 50" => { name: "Chini", unit: "kg", salePrice: 48, purchasePrice: 42, stockQty: 50, gstPercent: 0, hsn: "", barcode: "" }.',
              thinkingConfig: {
                thinkingLevel: m === 'gemini-3.1-flash-lite' ? ThinkingLevel.MINIMAL : ThinkingLevel.LOW,
              },
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                required: ['name', 'unit', 'salePrice', 'purchasePrice', 'stockQty', 'gstPercent'],
                properties: {
                  name: { type: Type.STRING },
                  unit: { type: Type.STRING },
                  salePrice: { type: Type.NUMBER },
                  purchasePrice: { type: Type.NUMBER },
                  stockQty: { type: Type.NUMBER },
                  gstPercent: { type: Type.NUMBER },
                  hsn: { type: Type.STRING },
                  barcode: { type: Type.STRING },
                },
              },
            },
          })
        );

        const parsed = JSON.parse(extractJsonText(response.text));
        res.json({ parsed, engine: model });
        return;
      } catch (geminiErr) {
        if (isApiKeyError(geminiErr)) {
          res.status(401).json({
            error: 'Invalid or missing Gemini API Key. Please check Settings > Secrets.',
          });
          return;
        }
        console.warn('Gemini item parse fallback to deterministic parser:', geminiErr);
      }

      res.json({ parsed: fallbackParseItem(String(transcript)), engine: 'smart-local-parser' });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to parse item voice input',
      });
    }
  });

  // 5. Text-to-Speech (TTS) with multi-strategy Gemini 3.8 TTS & v1beta/v1alpha compatibility
  app.post('/api/ai/tts', async (req, res) => {
    try {
      const { text, voiceName = 'Kore', style } = req.body;
      const cleanText = String(text || '').trim().slice(0, 1200);
      if (!cleanText) {
        res.status(400).json({ error: 'Text is required for speech generation' });
        return;
      }

      const stylePrompt =
        String(style || '').trim() ||
        'Clear, warm, polite Indian shopkeeper assistant speaking Hinglish and Hindi numbers naturally';

      const strategies: Array<{
        label: string;
        apiVersion?: string;
        model: string;
        withSpeechMetadata: boolean;
        withSpeechConfig: boolean;
      }> = [
        {
          label: 'v1beta-3.8-lite-full',
          apiVersion: 'v1beta',
          model: 'gemini-3.8-flash-lite-tts',
          withSpeechMetadata: true,
          withSpeechConfig: true,
        },
        {
          label: 'v1alpha-3.8-lite-full',
          apiVersion: 'v1alpha',
          model: 'gemini-3.8-flash-lite-tts',
          withSpeechMetadata: true,
          withSpeechConfig: true,
        },
        {
          label: 'v1beta-3.8-lite-basic-speechConfig',
          apiVersion: 'v1beta',
          model: 'gemini-3.8-flash-lite-tts',
          withSpeechMetadata: false,
          withSpeechConfig: true,
        },
        {
          label: 'v1beta-2.5-preview-tts',
          apiVersion: 'v1beta',
          model: 'gemini-2.5-flash-preview-tts',
          withSpeechMetadata: false,
          withSpeechConfig: true,
        },
        {
          label: 'default-3.8-lite-audio-only',
          model: 'gemini-3.8-flash-lite-tts',
          withSpeechMetadata: false,
          withSpeechConfig: false,
        },
      ];

      let lastErr: unknown;
      for (const strat of strategies) {
        try {
          const ai = getGeminiClient(strat.apiVersion);
          const part: Record<string, unknown> = {
            text: strat.withSpeechMetadata ? cleanText : `Speak clearly in natural Hinglish: ${cleanText}`,
          };
          if (strat.withSpeechMetadata) {
            part.speechMetadata = { style: stylePrompt };
          }
          const config: Record<string, unknown> = {
            responseModalities: ['AUDIO'],
          };
          if (strat.withSpeechConfig) {
            config.speechConfig = {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: String(voiceName || 'Kore'),
                },
              },
            };
          }

          const response = await withTimeout(
            ai.models.generateContent({
              model: strat.model,
              contents: [{ role: 'user', parts: [part as never] }],
              config: config as never,
            }),
            10000
          );

          const inlineData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData;
          const base64Audio = inlineData?.data;
          if (base64Audio) {
            res.json({
              audioBase64: base64Audio,
              mimeType: inlineData?.mimeType || 'audio/wav',
              engine: `${strat.model} (${strat.label})`,
            });
            return;
          }
        } catch (err) {
          lastErr = err;
          if (isApiKeyError(err)) {
            throw err;
          }
        }
      }

      throw lastErr instanceof Error ? lastErr : new Error('TTS model returned no audio');
    } catch (error) {
      console.error('TTS error:', error);
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
    console.log(`CM Voice Khata server running on http://localhost:${PORT}`);
  });
}

startServer();
