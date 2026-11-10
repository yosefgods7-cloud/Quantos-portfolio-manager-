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

function formatGeminiError(err: any): { status: number; message: string } {
  const raw = err?.message || String(err || 'Unknown error');
  let status = err?.status || err?.code || 500;
  let detailMessage = raw;

  try {
    const parsed = typeof raw === 'string' && raw.trim().startsWith('{') ? JSON.parse(raw) : null;
    if (parsed?.error) {
      if (parsed.error.code) status = parsed.error.code;
      if (parsed.error.message) detailMessage = parsed.error.message;
      if (parsed.error.status === 'PERMISSION_DENIED' || status === 403 || detailMessage.includes('Permission denied') || detailMessage.includes('suspended')) {
        return {
          status: 403,
          message: 'Gemini API permission denied. Please verify or update your Gemini API key in the Settings > Secrets panel (or enter a valid key in the app Settings).',
        };
      }
      if (parsed.error.status === 'RESOURCE_EXHAUSTED' || status === 429) {
        return {
          status: 429,
          message: 'Gemini API rate limit or quota exceeded. Please wait a moment or update your API key in Settings > Secrets.',
        };
      }
      if (parsed.error.status === 'INVALID_ARGUMENT' && (detailMessage.includes('API key not valid') || detailMessage.includes('API_KEY_INVALID'))) {
        return {
          status: 400,
          message: 'Gemini API key is invalid. Please check your API key in Settings > Secrets.',
        };
      }
    }
  } catch {
    // raw was not json
  }

  if (raw.includes('PERMISSION_DENIED') || raw.includes('Permission denied') || raw.includes('suspended') || status === 403) {
    return {
      status: 403,
      message: 'Gemini API permission denied. Please verify or update your Gemini API key in the Settings > Secrets panel (or enter a valid key in the app Settings).',
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
    const { status, message } = formatGeminiError(err);
    res.status(status).json({ error: message });
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
