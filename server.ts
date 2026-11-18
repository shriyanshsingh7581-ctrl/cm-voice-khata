import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getGroqKey(): string {
  return process.env.GROQ_API_KEY || '';
}

function getGeminiClient() {
  return new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
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

  // Match party patterns like "Ramesh ko", "to Ramesh", "from Sharma Traders", "party Rahul"
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
  // Match patterns like "5 kg chini 45 ke bhav se" or "2 bag cement 380 rupaye" or "sugar 3 kg 50 rs"
  const itemRegex = /(\d+(?:\.\d+)?)\s*(kg|kilo|gram|gm|ltr|litre|pcs|piece|packet|pkt|bag|box|dozen|ton)?\s*([a-zA-Z\u0900-\u097F]+(?:\s+[a-zA-Z\u0900-\u097F]+)?)\s*(?:@|rate|bhav|ke\s+bhav|rupaye|rs|₹)?\s*(\d+(?:\.\d+)?)/gi;
  let match: RegExpExecArray | null;
  while ((match = itemRegex.exec(clean)) !== null) {
    const qty = parseFloat(match[1]) || 1;
    const unit = (match[2] || 'pcs').toLowerCase();
    const rawName = (match[3] || 'Item').replace(/\b(ko|se|ka|ke|bhav|rate|rupaye|rs)\b/gi, '').trim();
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
    const amtMatch = clean.match(/(?:total|amount|rupaye|rs|₹)\s*(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s*(?:rupaye|rs|₹)/i);
    if (amtMatch) {
      totalAmount = parseFloat(amtMatch[1] || amtMatch[2]) || 0;
    }
  }

  const isUdhari = /\b(udhar|udhari|baki|baaki|due|credit)\b/i.test(clean);
  const isUpi = /\b(upi|online|gpay|phonepe|paytm|bank)\b/i.test(clean);
  let receivedAmount = isUdhari ? 0 : totalAmount;
  const JamaMatch = clean.match(/(?:jama|paid|received|diya|mila)\s*(\d+(?:\.\d+)?)/i);
  if (JamaMatch) {
    receivedAmount = parseFloat(JamaMatch[1]) || 0;
  }

  return {
    partyName: partyName || (txnType === 'Expense' ? 'Shop Expense' : 'Cash Customer'),
    phone,
    gstin: '',
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
    supplierBillNo: '',
  };
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '25mb' }));

  // 1. Universal Audio Transcription (Groq Whisper large-v3-turbo + Gemini 3.5 Transcribe fallback)
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

      // Layer 1B: Fallback to Gemini Audio Transcription (gemini-3.5-transcribe / gemini-4-hydrogen)
      const ai = getGeminiClient();
      const geminiResp = await ai.models.generateContent({
        model: 'gemini-3.5-transcribe',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: mimeType.split(';')[0] || 'audio/webm',
                data: audioBase64,
              },
            },
            {
              text: 'Transcribe this Indian shopkeeper voice recording accurately in Hinglish / Hindi / English exactly as spoken, preserving numbers, item names, quantities, rates, and party names.',
            },
          ],
        },
      });

      res.json({
        transcript: (geminiResp.text ?? '').trim(),
        engine: 'gemini-3.5-transcribe',
      });
    } catch (error) {
      console.error('Transcription error:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Audio transcription failed',
      });
    }
  });

  // 2. Smart Voice-to-Bill Parser (Groq llama-3.3-70b-versatile + Gemini 4 Hydrogen)
  app.post('/api/ai/parse-voice', async (req, res) => {
    try {
      const { transcript, txnType = 'Sale', existingParties = [], existingItems = [] } = req.body;
      if (!transcript || !String(transcript).trim()) {
        res.status(400).json({ error: 'Transcript is required' });
        return;
      }

      const systemPrompt = `You are the AI Accounting Parser for "CM Voice Khata", an Indian business & billing app.
Convert the shopkeeper's spoken Hindi/Hinglish/English voice transcript into a structured transaction JSON for transaction type: "${txnType}".
Known parties: ${JSON.stringify(existingParties.slice(0, 30))}
Known catalog items: ${JSON.stringify(existingItems.slice(0, 40))}

Rules:
- Extract partyName (default to "Cash Customer" for Sale or "Cash Supplier" for Purchase if not spoken).
- Extract phone (10 digits if spoken, else "").
- Extract gstin (if spoken, else "").
- Extract items array: each item has { name (string, in English/Hinglish), qty (number), unit (string like pcs, kg, bag, pkt, ltr, box), rate (number, unit price in INR), total (number = qty * rate) }.
- If the user only states a single amount (e.g. for Payment In, Payment Out, or Expense), set totalAmount to that number.
- Calculate totalAmount = sum of item totals - discount + deliveryCharge + gst amount.
- If user says "udhar", "baki", "credit", set receivedAmount = 0 and balanceDue = totalAmount, paymentType = "Credit".
- If user mentions partial payment (e.g. "500 jama kiya", "paid 500"), set receivedAmount = 500 and balanceDue = totalAmount - 500.
- Otherwise set receivedAmount = totalAmount, balanceDue = 0, paymentType = "Cash" (or "Online" if UPI/GPay/PhonePe/Online mentioned).
- Return ONLY valid JSON.`;

      // Try Groq llama-3.3-70b-versatile first if GROQ_API_KEY is configured
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
              const parsed = JSON.parse(content);
              res.json({ parsed, engine: 'llama-3.3-70b-versatile' });
              return;
            }
          }
        } catch (groqErr) {
          console.warn('Groq Llama parse fallback to Gemini:', groqErr);
        }
      }

      // Fallback to Gemini (gemini-4-hydrogen) with structured JSON schema
      try {
        const ai = getGeminiClient();
        const response = await ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: `${systemPrompt}\n\nSpoken Transcript: "${transcript}"`,
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                partyName: { type: Type.STRING },
                phone: { type: Type.STRING },
                gstin: { type: Type.STRING },
                supplierBillNo: { type: Type.STRING },
                items: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
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
        });

        const parsed = JSON.parse((response.text ?? '{}').trim());
        res.json({ parsed, engine: 'gemini-4-hydrogen' });
        return;
      } catch (geminiErr) {
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
- txnType ("Sale" or "Purchase" or "Expense")
- items: array of line items [{ name, qty, unit, rate, total }]
- discount (numeric discount in INR, default 0)
- deliveryCharge (numeric delivery/freight charge in INR, default 0)
- gst (GST percentage like 0, 5, 12, 18, 28, default 0)
- totalAmount (final bill total in INR)
- receivedAmount (amount paid, default equal to totalAmount unless marked due/unpaid)
- balanceDue (balance unpaid, default 0)
- paymentType ("Cash", "Online", or "Credit")
- note (summary note)`;

      // Try Gemini Vision (gemini-4-hydrogen)
      try {
        const ai = getGeminiClient();
        const response = await ai.models.generateContent({
          model: 'gemini-4-hydrogen',
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
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
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
        });

        const parsed = JSON.parse((response.text ?? '{}').trim());
        res.json({ parsed, engine: 'gemini-4-hydrogen-vision' });
        return;
      } catch (visionErr) {
        console.warn('Gemini vision fallback to Groq vision:', visionErr);
      }

      // Fallback to Groq Llama 4 Scout / Vision model if GROQ_API_KEY is configured
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
            res.json({ parsed: JSON.parse(content), engine: 'groq-vision' });
            return;
          }
        }
      }

      throw new Error('Could not extract bill fields from image. Please check image clarity or save as Normal Bill Photo.');
    } catch (error) {
      console.error('AI Bill Scan Error:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to scan bill with AI',
      });
    }
  });

  // 4. Smart Voice-to-Item Parser for Inventory Catalog
  app.post('/api/ai/parse-item', async (req, res) => {
    try {
      const { transcript } = req.body;
      if (!transcript) {
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
              res.json({ parsed: JSON.parse(content) });
              return;
            }
          }
        } catch (e) {
          console.warn('Groq item parse fallback:', e);
        }
      }

      const ai = getGeminiClient();
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Extract product inventory details from speech: "${transcript}"`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
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
      });
      res.json({ parsed: JSON.parse((response.text ?? '{}').trim()) });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to parse item voice input',
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
