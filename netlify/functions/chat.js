const fetch = require('node-fetch');

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

// All free AI providers — no cost
const PROVIDERS = [
  {
    name: 'pollinations-claude',
    call: async (messages, system, hasImage) => {
      if (hasImage) return null; // pollinations text doesn't support vision
      const res = await fetch('https://text.pollinations.ai/openai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4.5',
          messages: [{ role: 'system', content: system }, ...messages],
          max_tokens: 8192
        })
      });
      const d = await res.json();
      return d.choices?.[0]?.message?.content || null;
    }
  },
  {
    name: 'pollinations-gpt4o',
    call: async (messages, system, hasImage) => {
      if (hasImage) return null;
      const res = await fetch('https://text.pollinations.ai/openai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'openai-large',
          messages: [{ role: 'system', content: system }, ...messages],
          max_tokens: 8192
        })
      });
      const d = await res.json();
      return d.choices?.[0]?.message?.content || null;
    }
  },
  {
    name: 'gemini',
    call: async (messages, system, hasImage) => {
      const GEMINI_KEY = process.env.GEMINI_API_KEY;
      if (!GEMINI_KEY) return null;

      const geminiMessages = [];
      for (const msg of messages) {
        if (typeof msg.content === 'string') {
          geminiMessages.push({ role: msg.role === 'assistant' ? 'model' : 'user', parts: [{ text: msg.content }] });
        } else if (Array.isArray(msg.content)) {
          const parts = [];
          for (const part of msg.content) {
            if (part.type === 'text') parts.push({ text: part.text });
            else if (part.type === 'image_url') {
              const dataUrl = part.image_url.url;
              if (dataUrl.startsWith('data:')) {
                const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
                if (matches) parts.push({ inlineData: { mimeType: matches[1], data: matches[2] } });
              }
            }
          }
          geminiMessages.push({ role: msg.role === 'assistant' ? 'model' : 'user', parts });
        }
      }

      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: system }] },
          contents: geminiMessages,
          generationConfig: { temperature: 0.7, maxOutputTokens: 8192 }
        })
      });
      const d = await res.json();
      if (d.error) return null;
      return d.candidates?.[0]?.content?.parts?.[0]?.text || null;
    }
  },
  {
    name: 'groq',
    call: async (messages, system, hasImage) => {
      const GROQ_KEY = process.env.GROQ_API_KEY;
      if (!GROQ_KEY) return null;

      const model = hasImage ? 'meta-llama/llama-4-scout-17b-16e-instruct' : 'llama-3.3-70b-versatile';
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_KEY}` },
        body: JSON.stringify({
          model,
          max_tokens: 8192,
          messages: [{ role: 'system', content: system }, ...messages],
          temperature: 0.7
        })
      });
      const d = await res.json();
      if (d.error) return null;
      return d.choices?.[0]?.message?.content || null;
    }
  },
  {
    name: 'llm7',
    call: async (messages, system, hasImage) => {
      if (hasImage) return null;
      const res = await fetch('https://llm7.io/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer no-key-needed' },
        body: JSON.stringify({
          model: 'gpt-4.1-nano-2025-04-14',
          messages: [{ role: 'system', content: system }, ...messages],
          max_tokens: 8192
        })
      });
      const d = await res.json();
      return d.choices?.[0]?.message?.content || null;
    }
  }
];

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: 'Method Not Allowed' };

  try {
    const { messages, mode, provider: preferredProvider } = JSON.parse(event.body);

    const hasImage = messages.some(m => Array.isArray(m.content) && m.content.some(c => c.type === 'image_url'));

    let system = '';
    if (mode === 'vision') {
      system = `You are sm.ai Vision — an expert image analysis and editing AI.
Carefully analyze every image sent. Give SPECIFIC, numbered, step-by-step editing instructions.
Do ONLY what user asks. Be precise and direct.
Answer in the same language the user writes in (Gujarati, Hindi, English).`;
    } else {
      system = `You are sm.ai — a brilliant AI assistant created by SM AI Lab. Free for everyone, no limits.

CRITICAL RULES:
1. Always give COMPLETE, FULL responses — never truncate
2. For code: write EVERY SINGLE LINE — complete and working, no placeholders
3. For ZIP/project requests: provide ALL files with complete code
4. Use proper markdown: **bold**, ## headings, bullet lists, numbered lists
5. Use fenced code blocks with language tags
6. Answer in the same language user writes in (Gujarati, Hindi, English)
7. If asked to create files or ZIP: write complete code for every file`;
    }

    // Try providers in order — fallback if one fails
    const order = hasImage
      ? ['gemini', 'groq', 'pollinations-claude', 'pollinations-gpt4o', 'llm7']
      : ['gemini', 'pollinations-claude', 'pollinations-gpt4o', 'groq', 'llm7'];

    let reply = null;
    let usedProvider = '';

    for (const name of order) {
      const provider = PROVIDERS.find(p => p.name === name);
      if (!provider) continue;
      try {
        const result = await provider.call(messages, system, hasImage);
        if (result && result.trim()) {
          reply = result;
          usedProvider = name;
          break;
        }
      } catch (e) {
        console.error(`Provider ${name} failed:`, e.message);
        continue;
      }
    }

    if (!reply) {
      reply = 'Sorry, all AI providers are temporarily unavailable. Please try again.';
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ reply, provider: usedProvider })
    };

  } catch (err) {
    console.error('Chat error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
