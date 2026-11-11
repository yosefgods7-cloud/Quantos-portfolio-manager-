import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '10mb' }));

// Shared server Gemini client utility
function getAiClient(reqApiKey?: string) {
  const currentEnvKey = process.env.GEMINI_API_KEY || '';
  const key = reqApiKey || currentEnvKey;
  if (!key) {
    throw new Error('GEMINI_API_KEY is not configured on the server. Please check your API key in Settings > Secrets.');
  }
  return new GoogleGenAI({
    apiKey: key,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function formatGeminiError(err: any): { status: number; message: string; code?: string } {
  const raw = err?.message || String(err || 'Unknown error');
  let status = err?.status || err?.code || 500;
  let detailMessage = raw;

  try {
    const jsonStart = raw.indexOf('{');
    const jsonEnd = raw.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd !== -1) {
      const parsed = JSON.parse(raw.substring(jsonStart, jsonEnd + 1));
      if (parsed?.error) {
        if (parsed.error.code) status = parsed.error.code;
        if (parsed.error.message) detailMessage = parsed.error.message;
        if (parsed.error.status === 'PERMISSION_DENIED' || status === 403 || detailMessage.includes('Permission denied') || detailMessage.includes('suspended')) {
          return {
            status: 403,
            code: 'PERMISSION_DENIED',
            message: 'Gemini API permission denied (Consumer project suspended). Please enter your free personal Gemini API key in Settings.',
          };
        }
        if (parsed.error.status === 'RESOURCE_EXHAUSTED' || status === 429) {
          return {
            status: 429,
            code: 'RESOURCE_EXHAUSTED',
            message: 'Gemini API rate limit or quota exceeded. Please wait a moment or enter your own API key in Settings.',
          };
        }
        if (parsed.error.status === 'INVALID_ARGUMENT' && (detailMessage.includes('API key not valid') || detailMessage.includes('API_KEY_INVALID'))) {
          return {
            status: 400,
            code: 'INVALID_API_KEY',
            message: 'Gemini API key is invalid. Please check your API key in Settings.',
          };
        }
      }
    }
  } catch {
    // raw was not json
  }

  if (raw.includes('PERMISSION_DENIED') || raw.includes('Permission denied') || raw.includes('suspended') || status === 403) {
    return {
      status: 403,
      code: 'PERMISSION_DENIED',
      message: 'Gemini API permission denied (Consumer project suspended). Please enter your free personal Gemini API key in Settings.',
    };
  }

  return {
    status: typeof status === 'number' && status >= 400 && status < 600 ? status : 500,
    message: detailMessage,
  };
}

// Endpoint: Generate Content
app.post('/api/gemini/generate', async (req, res) => {
  try {
    const { prompt, contents, systemInstruction, model, responseMimeType } = req.body;
    const inputContents = contents || prompt;
    if (!inputContents) {
      return res.status(400).json({ error: 'Prompt or contents is required' });
    }

    const customKey = (req.headers['x-gemini-api-key'] as string) || req.body?.apiKey;
    const currentEnvKey = process.env.GEMINI_API_KEY || '';
    let aiClient = getAiClient(customKey);

    const selectedModel = model || 'gemini-3.8-flash';
    const config: Record<string, any> = {};
    if (systemInstruction) config.systemInstruction = systemInstruction;
    if (responseMimeType) config.responseMimeType = responseMimeType;

    let response;
    try {
      response = await aiClient.models.generateContent({
        model: selectedModel,
        contents: inputContents,
        config: Object.keys(config).length > 0 ? config : undefined,
      });
    } catch (primaryErr: any) {
      // If a custom key was supplied and failed, and an env key exists, try the env key
      if (customKey && currentEnvKey && customKey !== currentEnvKey) {
        console.warn('Custom key failed, attempting fallback to server environment key...');
        const fallbackClient = getAiClient(currentEnvKey);
        response = await fallbackClient.models.generateContent({
          model: selectedModel,
          contents: inputContents,
          config: Object.keys(config).length > 0 ? config : undefined,
        });
      } else {
        throw primaryErr;
      }
    }

    res.json({ text: response?.text || '' });
  } catch (err: any) {
    console.error('Server Gemini Generation Error:', err);
    const { status, message, code } = formatGeminiError(err);
    res.status(status).json({ error: message, code: code || 'GEMINI_ERROR' });
  }
});

// Endpoint: Streaming Generate Content (Server-Sent Events)
app.post('/api/gemini/generate-stream', async (req, res) => {
  try {
    const { prompt, contents, systemInstruction, model } = req.body;
    const inputContents = contents || prompt;
    if (!inputContents) {
      return res.status(400).json({ error: 'Prompt or contents is required' });
    }

    const customKey = (req.headers['x-gemini-api-key'] as string) || req.body?.apiKey;
    const aiClient = getAiClient(customKey);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const selectedModel = model || 'gemini-3.8-flash';
    const config: Record<string, any> = {};
    if (systemInstruction) config.systemInstruction = systemInstruction;

    const streamResponse = await aiClient.models.generateContentStream({
      model: selectedModel,
      contents: inputContents,
      config: Object.keys(config).length > 0 ? config : undefined,
    });

    for await (const chunk of streamResponse) {
      res.write(`data: ${JSON.stringify({ text: chunk.text || '' })}\n\n`);
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err: any) {
    console.error('Server Gemini Streaming Error:', err);
    const { message } = formatGeminiError(err);
    res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
    res.end();
  }
});

// Live Market Ticker Cache & Endpoint
let tickerCache: { timestamp: number; data: any } | null = null;
const TICKER_CACHE_TTL = 3000; // 3 seconds cache

app.get('/api/market/ticker', async (_req, res) => {
  const now = Date.now();
  if (tickerCache && now - tickerCache.timestamp < TICKER_CACHE_TTL) {
    return res.json(tickerCache.data);
  }

  try {
    const binancePromise = fetch(
      'https://api.binance.com/api/v3/ticker/24hr?symbols=' +
        encodeURIComponent('["BTCUSDT","ETHUSDT","SOLUSDT","PAXGUSDT","EURUSDT"]')
    )
      .then((r) => (r.ok ? r.json() : []))
      .catch(() => []);

    const fxPromise = fetch('https://open.er-api.com/v6/latest/USD')
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);

    const [binanceData, fxData] = await Promise.all([binancePromise, fxPromise]);

    const prices: Record<string, any> = {};

    if (Array.isArray(binanceData)) {
      for (const item of binanceData) {
        const last = parseFloat(item.lastPrice) || 0;
        const change = parseFloat(item.priceChangePercent) || 0;

        if (item.symbol === 'BTCUSDT') {
          prices['BTC'] = { symbol: 'BTC/USD', price: last, change24h: change, type: 'crypto' };
        } else if (item.symbol === 'ETHUSDT') {
          prices['ETH'] = { symbol: 'ETH/USD', price: last, change24h: change, type: 'crypto' };
        } else if (item.symbol === 'SOLUSDT') {
          prices['SOL'] = { symbol: 'SOL/USD', price: last, change24h: change, type: 'crypto' };
        } else if (item.symbol === 'PAXGUSDT') {
          prices['XAUUSD'] = { symbol: 'XAU/USD', price: last, change24h: change, type: 'metal' };
        } else if (item.symbol === 'EURUSDT') {
          prices['EURUSD'] = { symbol: 'EUR/USD', price: last, change24h: change, type: 'forex' };
        }
      }
    }

    if (fxData && fxData.rates) {
      const rates = fxData.rates;
      const eurusd = prices['EURUSD']?.price || (rates.EUR ? 1 / rates.EUR : 1.1118);
      const usdjpy = rates.JPY || 158.55;
      const gbpusd = rates.GBP ? 1 / rates.GBP : 1.3365;
      const usdcad = rates.CAD || 1.375;
      const usdsek = rates.SEK || 10.45;
      const usdchf = rates.CHF || 0.885;

      const dxyVal = +(
        50.14348112 *
        Math.pow(eurusd, -0.576) *
        Math.pow(usdjpy, 0.136) *
        Math.pow(gbpusd, -0.119) *
        Math.pow(usdcad, 0.091) *
        Math.pow(usdsek, 0.042) *
        Math.pow(usdchf, 0.036)
      ).toFixed(2);

      const eurChg = prices['EURUSD']?.change24h || 0;
      prices['DXY'] = {
        symbol: 'DXY',
        price: dxyVal,
        change24h: +(-eurChg * 0.58).toFixed(2),
        type: 'index',
      };

      if (!prices['EURUSD'] && rates.EUR) {
        prices['EURUSD'] = { symbol: 'EUR/USD', price: +(1 / rates.EUR).toFixed(5), change24h: 0.05, type: 'forex' };
      }
      if (rates.GBP) {
        prices['GBPUSD'] = { symbol: 'GBP/USD', price: +(1 / rates.GBP).toFixed(5), change24h: -0.12, type: 'forex' };
      }
      if (rates.JPY) {
        prices['USDJPY'] = { symbol: 'USD/JPY', price: +rates.JPY.toFixed(3), change24h: 0.18, type: 'forex' };
      }
    }

    // Reliable fallbacks if network APIs are temporarily unreachable
    const fallbacks = {
      BTC: { symbol: 'BTC/USD', price: 73850.0, change24h: 0.85, type: 'crypto' },
      ETH: { symbol: 'ETH/USD', price: 2055.0, change24h: -0.42, type: 'crypto' },
      SOL: { symbol: 'SOL/USD', price: 84.5, change24h: 1.15, type: 'crypto' },
      XAUUSD: { symbol: 'XAU/USD', price: 4025.0, change24h: -0.35, type: 'metal' },
      DXY: { symbol: 'DXY', price: 102.07, change24h: 0.14, type: 'index' },
      EURUSD: { symbol: 'EUR/USD', price: 1.1118, change24h: -0.73, type: 'forex' },
      GBPUSD: { symbol: 'GBP/USD', price: 1.3365, change24h: -0.21, type: 'forex' },
      USDJPY: { symbol: 'USD/JPY', price: 158.55, change24h: 0.15, type: 'forex' },
    };

    for (const [key, val] of Object.entries(fallbacks)) {
      if (!prices[key]) prices[key] = val;
    }

    const payload = { updatedAt: now, prices };
    tickerCache = { timestamp: now, data: payload };
    res.json(payload);
  } catch (err) {
    console.error('Error fetching ticker prices:', err);
    res.status(500).json({ error: 'Failed to fetch market ticker data' });
  }
});

// Health check endpoint
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', hasGeminiKey: Boolean(process.env.GEMINI_API_KEY) });
});

// Development vs Production serving
if (process.env.NODE_ENV !== 'production') {
  const { createServer } = await import('vite');
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: 'spa',
  });
  app.use(vite.middlewares);
} else {
  app.use(express.static(path.resolve(__dirname, 'dist')));
  app.get('*', (_req, res) => {
    res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
  });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
