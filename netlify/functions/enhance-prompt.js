const fetch = require('node-fetch');

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  try {
    const { prompt } = JSON.parse(event.body);
    const GEMINI_KEY = process.env.GEMINI_API_KEY;

    if (GEMINI_KEY) {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: `Enhance this image generation prompt to be more vivid, detailed and specific. Add style keywords, lighting, mood, composition, quality descriptors. Return ONLY the enhanced prompt, nothing else: ${prompt}` }] }],
          generationConfig: { maxOutputTokens: 200 }
        })
      });
      const d = await res.json();
      const enhanced = d.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (enhanced) return { statusCode: 200, headers, body: JSON.stringify({ enhanced }) };
    }

    // Fallback — pollinations
    const res2 = await fetch('https://text.pollinations.ai/openai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'openai',
        messages: [
          { role: 'system', content: 'Enhance image generation prompts. Return ONLY the enhanced prompt, nothing else.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 200
      })
    });
    const d2 = await res2.json();
    const enhanced2 = d2.choices?.[0]?.message?.content?.trim() || prompt;
    return { statusCode: 200, headers, body: JSON.stringify({ enhanced: enhanced2 }) };
  } catch (e) {
    return { statusCode: 200, headers, body: JSON.stringify({ enhanced: JSON.parse(event.body).prompt }) };
  }
};
