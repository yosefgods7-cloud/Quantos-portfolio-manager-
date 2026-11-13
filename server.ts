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

// Shared server Gemini client utility (server-side only via process.env.GEMINI_API_KEY)
let cachedAiClient: GoogleGenAI | null = null;
let cachedAiKey = '';

function getAiClient(): GoogleGenAI {
  const key = process.env.GEMINI_API_KEY || '';
  if (!key) {
    throw new Error('GEMINI_API_KEY is not configured on the server. Please check your API key in Settings > Secrets.');
  }
  if (!cachedAiClient || cachedAiKey !== key) {
    cachedAiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
    cachedAiKey = key;
  }
  return cachedAiClient;
}

const FREE_GEMINI_MODELS = new Set([
  'gemini-4-hydrogen',
  'gemini-3.1-flash-lite',
]);
const DEFAULT_FREE_GEMINI_MODEL = 'gemini-4-hydrogen';

function resolveGeminiModel(requestedModel?: string): string {
  const normalized = typeof requestedModel === 'string' ? requestedModel.trim() : '';
  if (normalized && FREE_GEMINI_MODELS.has(normalized)) {
    return normalized;
  }
  return DEFAULT_FREE_GEMINI_MODEL;
}

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  let lastError: any;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      const status = err?.status || err?.code;
      const msg = String(err?.message || '');
      const isNonRetryable =
        status === 400 ||
        status === 401 ||
        status === 403 ||
        status === 404 ||
        msg.includes('PERMISSION_DENIED') ||
        msg.includes('API_KEY_INVALID') ||
        msg.includes('GEMINI_API_KEY is not configured');
      if (isNonRetryable || attempt === maxRetries) {
        throw err;
      }
      const delayMs = 400 * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
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
            message: 'Gemini API permission denied. Please check your API key in Settings > Secrets.',
          };
        }
        if (parsed.error.status === 'RESOURCE_EXHAUSTED' || status === 429) {
          return {
            status: 429,
            code: 'RESOURCE_EXHAUSTED',
            message: 'Gemini API rate limit or quota exceeded. Please wait a moment or check your API key quota in Settings > Secrets.',
          };
        }
        if (parsed.error.status === 'NOT_FOUND' || status === 404) {
          return {
            status: 404,
            code: 'NOT_FOUND',
            message: 'Requested Gemini model was not found or is unsupported.',
          };
        }
        if (parsed.error.status === 'INVALID_ARGUMENT' && (detailMessage.includes('API key not valid') || detailMessage.includes('API_KEY_INVALID'))) {
          return {
            status: 400,
            code: 'API_KEY_INVALID',
            message: 'Gemini API key is invalid. Please check your API key in Settings > Secrets.',
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
      message: 'Gemini API permission denied. Please check your API key in Settings > Secrets.',
    };
  }
  if (raw.includes('API_KEY_INVALID') || raw.includes('API key not valid')) {
    return {
      status: 400,
      code: 'API_KEY_INVALID',
      message: 'Gemini API key is invalid. Please check your API key in Settings > Secrets.',
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
    const { prompt, contents, systemInstruction, model, responseMimeType, responseSchema, thinkingConfig } = req.body || {};
    const inputContents = contents || prompt;
    if (!inputContents) {
      return res.status(400).json({ error: 'Prompt or contents is required' });
    }

    const aiClient = getAiClient();
    const selectedModel = resolveGeminiModel(model);
    const config: Record<string, any> = {};
    if (systemInstruction) config.systemInstruction = systemInstruction;
    if (responseMimeType) config.responseMimeType = responseMimeType;
    if (responseSchema) config.responseSchema = responseSchema;
    if (thinkingConfig) config.thinkingConfig = thinkingConfig;

    const response = await withRetry(() =>
      aiClient.models.generateContent({
        model: selectedModel,
        contents: inputContents,
        config: Object.keys(config).length > 0 ? config : undefined,
      }),
    );

    res.json({ text: response?.text || '', model: selectedModel });
  } catch (err: any) {
    console.error('Server Gemini Generation Error:', err);
    const { status, message, code } = formatGeminiError(err);
    res.status(status).json({ error: message, code: code || 'GEMINI_ERROR' });
  }
});

// Endpoint: Streaming Generate Content (Server-Sent Events)
app.post('/api/gemini/generate-stream', async (req, res) => {
  try {
    const { prompt, contents, systemInstruction, model, responseMimeType, thinkingConfig } = req.body || {};
    const inputContents = contents || prompt;
    if (!inputContents) {
      return res.status(400).json({ error: 'Prompt or contents is required' });
    }

    const aiClient = getAiClient();

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const selectedModel = resolveGeminiModel(model);
    const config: Record<string, any> = {};
    if (systemInstruction) config.systemInstruction = systemInstruction;
    if (responseMimeType) config.responseMimeType = responseMimeType;
    if (thinkingConfig) config.thinkingConfig = thinkingConfig;

    const streamResponse = await withRetry(() =>
      aiClient.models.generateContentStream({
        model: selectedModel,
        contents: inputContents,
        config: Object.keys(config).length > 0 ? config : undefined,
      }),
    );

    for await (const chunk of streamResponse) {
      res.write(`data: ${JSON.stringify({ text: chunk.text || '' })}\n\n`);
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err: any) {
    console.error('Server Gemini Streaming Error:', err);
    const { status, message, code } = formatGeminiError(err);
    if (!res.headersSent) {
      return res.status(status).json({ error: message, code: code || 'GEMINI_ERROR' });
    }
    res.write(`data: ${JSON.stringify({ error: message, code: code || 'GEMINI_ERROR' })}\n\n`);
    res.end();
  }
});

// Live Market Ticker Cache & Endpoint (Live CFD + FX Basket + Crypto)
let tickerCache: { timestamp: number; data: any } | null = null;
let prevCloseCache: { timestamp: number; data: Record<string, { price?: number; prevClose?: number }> } = {
  timestamp: 0,
  data: {},
};
let lastKnownPrices: Record<string, any> = {};
const TICKER_CACHE_TTL = 4000; // 4 seconds max server dedupe (fresh for 10s client polling)
const PREV_CLOSE_CACHE_TTL = 180000; // 3 minutes cache for daily previous closes

async function fetchJsonWithTimeout(url: string, timeoutMs = 3500, headers: Record<string, string> = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, headers });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchSwissquoteMid(pair: string): Promise<{ bid: number; ask: number; mid: number; ts: number } | null> {
  const data = await fetchJsonWithTimeout(
    `https://forex-data-feed.swissquote.com/public-quotes/bboquotes/instrument/${pair}`,
    3500,
    { 'Cache-Control': 'no-cache' }
  );
  if (!Array.isArray(data) || data.length === 0) return null;
  const profiles = data[0]?.spreadProfilePrices;
  if (!Array.isArray(profiles) || profiles.length === 0) return null;
  const best =
    profiles.find((p: any) => p.spreadProfile === 'prime') ||
    profiles.find((p: any) => p.spreadProfile === 'elite') ||
    profiles[0];
  const bid = Number(best?.bid);
  const ask = Number(best?.ask);
  if (!Number.isFinite(bid) || !Number.isFinite(ask) || bid <= 0 || ask <= 0) return null;
  return {
    bid,
    ask,
    mid: (bid + ask) / 2,
    ts: Number(data[0]?.ts) || Date.now(),
  };
}

async function getYahooRefQuotes(): Promise<Record<string, { price?: number; prevClose?: number }>> {
  const now = Date.now();
  if (prevCloseCache.timestamp && now - prevCloseCache.timestamp < PREV_CLOSE_CACHE_TTL && Object.keys(prevCloseCache.data).length > 0) {
    return prevCloseCache.data;
  }
  const symbols = ['DX-Y.NYB', 'EURUSD=X', 'GBPUSD=X', 'USDJPY=X', 'USDCAD=X', 'USDSEK=X', 'USDCHF=X', 'GC=F'];
  const results = await Promise.all(
    symbols.map(async (sym) => {
      const json = await fetchJsonWithTimeout(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1m&range=1d`,
        3500,
        { 'User-Agent': 'Mozilla/5.0' }
      );
      const meta = json?.chart?.result?.[0]?.meta;
      return [
        sym,
        {
          price: Number.isFinite(Number(meta?.regularMarketPrice)) ? Number(meta.regularMarketPrice) : undefined,
          prevClose: Number.isFinite(Number(meta?.chartPreviousClose)) ? Number(meta.chartPreviousClose) : undefined,
        },
      ] as const;
    })
  );
  const out: Record<string, { price?: number; prevClose?: number }> = {};
  for (const [sym, val] of results) {
    if (val.price || val.prevClose) out[sym] = val;
  }
  if (Object.keys(out).length > 0) {
    prevCloseCache = { timestamp: now, data: out };
  }
  return Object.keys(out).length > 0 ? out : prevCloseCache.data;
}

function calcPctChange(current: number, prevClose?: number): number {
  if (!Number.isFinite(current) || !prevClose || !Number.isFinite(prevClose) || prevClose <= 0) return 0;
  return +(((current - prevClose) / prevClose) * 100).toFixed(2);
}

app.get('/api/market/ticker', async (_req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  const now = Date.now();
  if (tickerCache && now - tickerCache.timestamp < TICKER_CACHE_TTL) {
    return res.json(tickerCache.data);
  }

  try {
    const [
      sqXau,
      sqEur,
      sqGbp,
      sqJpy,
      sqCad,
      sqSek,
      sqChf,
      binanceData,
      yahooRef,
    ] = await Promise.all([
      fetchSwissquoteMid('XAU/USD'),
      fetchSwissquoteMid('EUR/USD'),
      fetchSwissquoteMid('GBP/USD'),
      fetchSwissquoteMid('USD/JPY'),
      fetchSwissquoteMid('USD/CAD'),
      fetchSwissquoteMid('USD/SEK'),
      fetchSwissquoteMid('USD/CHF'),
      fetchJsonWithTimeout(
        'https://api.binance.com/api/v3/ticker/24hr?symbols=' +
          encodeURIComponent('["BTCUSDT","ETHUSDT","SOLUSDT"]'),
        3500
      ),
      getYahooRefQuotes(),
    ]);

    const prices: Record<string, any> = {};

    // Crypto live prices (Binance Spot)
    if (Array.isArray(binanceData)) {
      for (const item of binanceData) {
        const last = parseFloat(item.lastPrice) || 0;
        const change = parseFloat(item.priceChangePercent) || 0;
        if (last <= 0) continue;

        if (item.symbol === 'BTCUSDT') {
          prices['BTC'] = { symbol: 'BTC/USD', price: last, change24h: +change.toFixed(2), type: 'crypto', source: 'binance' };
        } else if (item.symbol === 'ETHUSDT') {
          prices['ETH'] = { symbol: 'ETH/USD', price: last, change24h: +change.toFixed(2), type: 'crypto', source: 'binance' };
        } else if (item.symbol === 'SOLUSDT') {
          prices['SOL'] = { symbol: 'SOL/USD', price: last, change24h: +change.toFixed(2), type: 'crypto', source: 'binance' };
        }
      }
    }

    // Gold Spot CFD (XAU/USD) - Live Swissquote CFD BBO -> Gold-API fallback -> Yahoo Futures fallback
    if (sqXau) {
      const xauPrice = +sqXau.mid.toFixed(2);
      const gcPrev = yahooRef['GC=F']?.prevClose;
      prices['XAUUSD'] = {
        symbol: 'XAU/USD',
        price: xauPrice,
        bid: +sqXau.bid.toFixed(2),
        ask: +sqXau.ask.toFixed(2),
        change24h: calcPctChange(xauPrice, gcPrev),
        type: 'metal',
        source: 'swissquote-cfd',
      };
    } else {
      const goldApi = await fetchJsonWithTimeout('https://api.gold-api.com/price/XAU', 3000);
      const goldPrice = Number(goldApi?.price) || yahooRef['GC=F']?.price;
      if (goldPrice && Number.isFinite(goldPrice)) {
        const roundedGold = +goldPrice.toFixed(2);
        prices['XAUUSD'] = {
          symbol: 'XAU/USD',
          price: roundedGold,
          change24h: calcPctChange(roundedGold, yahooRef['GC=F']?.prevClose),
          type: 'metal',
          source: goldApi?.price ? 'gold-api' : 'yahoo-gc',
        };
      }
    }

    // EUR/USD CFD
    const eurVal = sqEur ? sqEur.mid : yahooRef['EURUSD=X']?.price;
    if (eurVal && Number.isFinite(eurVal)) {
      const eurPrice = +eurVal.toFixed(5);
      prices['EURUSD'] = {
        symbol: 'EUR/USD',
        price: eurPrice,
        bid: sqEur ? +sqEur.bid.toFixed(5) : undefined,
        ask: sqEur ? +sqEur.ask.toFixed(5) : undefined,
        change24h: calcPctChange(eurPrice, yahooRef['EURUSD=X']?.prevClose),
        type: 'forex',
        source: sqEur ? 'swissquote-cfd' : 'yahoo-fx',
      };
    }

    // GBP/USD CFD
    const gbpVal = sqGbp ? sqGbp.mid : yahooRef['GBPUSD=X']?.price;
    if (gbpVal && Number.isFinite(gbpVal)) {
      const gbpPrice = +gbpVal.toFixed(5);
      prices['GBPUSD'] = {
        symbol: 'GBP/USD',
        price: gbpPrice,
        bid: sqGbp ? +sqGbp.bid.toFixed(5) : undefined,
        ask: sqGbp ? +sqGbp.ask.toFixed(5) : undefined,
        change24h: calcPctChange(gbpPrice, yahooRef['GBPUSD=X']?.prevClose),
        type: 'forex',
        source: sqGbp ? 'swissquote-cfd' : 'yahoo-fx',
      };
    }

    // USD/JPY CFD
    const jpyVal = sqJpy ? sqJpy.mid : yahooRef['USDJPY=X']?.price;
    if (jpyVal && Number.isFinite(jpyVal)) {
      const jpyPrice = +jpyVal.toFixed(3);
      prices['USDJPY'] = {
        symbol: 'USD/JPY',
        price: jpyPrice,
        bid: sqJpy ? +sqJpy.bid.toFixed(3) : undefined,
        ask: sqJpy ? +sqJpy.ask.toFixed(3) : undefined,
        change24h: calcPctChange(jpyPrice, yahooRef['USDJPY=X']?.prevClose),
        type: 'forex',
        source: sqJpy ? 'swissquote-cfd' : 'yahoo-fx',
      };
    }

    // Live ICE DXY Spot computed from all 6 live FX CFD basket pairs (EUR, JPY, GBP, CAD, SEK, CHF)
    const cadVal = sqCad ? sqCad.mid : yahooRef['USDCAD=X']?.price;
    const sekVal = sqSek ? sqSek.mid : yahooRef['USDSEK=X']?.price;
    const chfVal = sqChf ? sqChf.mid : yahooRef['USDCHF=X']?.price;

    if (eurVal && jpyVal && gbpVal && cadVal && sekVal && chfVal) {
      const dxyPrice = +(
        50.14348112 *
        Math.pow(eurVal, -0.576) *
        Math.pow(jpyVal, 0.136) *
        Math.pow(gbpVal, -0.119) *
        Math.pow(cadVal, 0.091) *
        Math.pow(sekVal, 0.042) *
        Math.pow(chfVal, 0.036)
      ).toFixed(3);

      prices['DXY'] = {
        symbol: 'DXY',
        price: dxyPrice,
        change24h: calcPctChange(dxyPrice, yahooRef['DX-Y.NYB']?.prevClose),
        type: 'index',
        source: sqEur && sqJpy && sqGbp && sqCad && sqSek && sqChf ? 'ice-basket-cfd' : 'yahoo-basket',
      };
    } else if (yahooRef['DX-Y.NYB']?.price) {
      const dxyPrice = +yahooRef['DX-Y.NYB'].price.toFixed(3);
      prices['DXY'] = {
        symbol: 'DXY',
        price: dxyPrice,
        change24h: calcPctChange(dxyPrice, yahooRef['DX-Y.NYB']?.prevClose),
        type: 'index',
        source: 'yahoo-dxy',
      };
    }

    // Preserve most recent live prices if any single upstream feed experiences a transient timeout
    for (const [k, v] of Object.entries(prices)) {
      lastKnownPrices[k] = v;
    }
    for (const [k, v] of Object.entries(lastKnownPrices)) {
      if (!prices[k]) prices[k] = v;
    }

    const payload = { updatedAt: now, feed: 'cfd-live', prices };
    tickerCache = { timestamp: now, data: payload };
    res.json(payload);
  } catch (err) {
    console.error('Error fetching ticker prices:', err);
    if (Object.keys(lastKnownPrices).length > 0) {
      return res.json({ updatedAt: now, feed: 'cfd-cached', prices: lastKnownPrices });
    }
    res.status(500).json({ error: 'Failed to fetch market ticker data' });
  }
});

// Telegram Alert Relay Endpoint (Bypasses Browser CORS & provides detailed error diagnostics)
app.post('/api/telegram/send', async (req, res) => {
  try {
    const { token, chatId, text, parse_mode = 'HTML' } = req.body;
    if (!token || !chatId || !text) {
      return res.status(400).json({ ok: false, error: 'Bot Token, Chat ID, and message text are required.' });
    }

    let cleanToken = String(token).trim().replace(/\s+/g, '');
    if (cleanToken.toLowerCase().startsWith('bot')) {
      cleanToken = cleanToken.substring(3);
    }
    const cleanChatId = String(chatId).trim();

    const telegramUrl = `https://api.telegram.org/bot${cleanToken}/sendMessage`;

    // Attempt 1: with parse_mode
    let response = await fetch(telegramUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: cleanChatId,
        text: text,
        parse_mode: parse_mode,
      }),
    });

    let data: any = await response.json().catch(() => ({}));

    // If failed due to HTML parse error, try standard blockquote or plain text
    if (!response.ok && data?.description && (data.description.includes("can't parse entities") || data.description.includes('Character') || data.description.includes('tag'))) {
      console.warn('Telegram HTML parse warning, attempting fallback:', data.description);
      
      // Step A: if contains expandable blockquote, try standard blockquote first
      if (text.includes('<blockquote expandable>')) {
        const standardHtml = text.replace(/<blockquote expandable>/g, '<blockquote>');
        response = await fetch(telegramUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: cleanChatId,
            text: standardHtml,
            parse_mode: parse_mode,
          }),
        });
        data = await response.json().catch(() => ({}));
      }

      // Step B: if still failing, retry cleanly as plain text
      if (!response.ok && data?.description && (data.description.includes("can't parse entities") || data.description.includes('Character') || data.description.includes('tag'))) {
        const plainText = text.replace(/<[^>]*>/g, '');
        response = await fetch(telegramUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: cleanChatId,
            text: plainText,
          }),
        });
        data = await response.json().catch(() => ({}));
      }
    }

    if (!response.ok || !data.ok) {
      let friendlyError = data?.description || `Telegram API error (${response.status})`;
      if (friendlyError.includes('chat not found')) {
        friendlyError += '. Tip: Make sure you opened your bot in Telegram and clicked /start, and that your Chat ID is correct.';
      } else if (friendlyError.includes('Unauthorized')) {
        friendlyError += '. Tip: Double check your Bot Token from @BotFather.';
      } else if (friendlyError.includes('Not Found') || response.status === 404) {
        friendlyError = 'Invalid Bot Token. Ensure your Bot Token has the full format (e.g. 123456789:ABC-DEF...) from @BotFather.';
      } else if (friendlyError.includes('bot was blocked')) {
        friendlyError += '. Tip: You have blocked this bot on Telegram. Unblock it to receive alerts.';
      }
      return res.status(response.status >= 400 && response.status < 600 ? response.status : 400).json({
        ok: false,
        error: friendlyError,
      });
    }

    res.json({ ok: true, result: data.result });
  } catch (err: any) {
    console.error('Telegram Server Relay Error:', err);
    res.status(500).json({ ok: false, error: err?.message || 'Failed to relay telegram alert' });
  }
});

// Health check endpoint
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
    defaultModel: DEFAULT_FREE_GEMINI_MODEL,
    supportedFreeModels: Array.from(FREE_GEMINI_MODELS),
  });
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
