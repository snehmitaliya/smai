const fetch = require('node-fetch');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  };

  try {
    const { messages, mode } = JSON.parse(event.body);

    const GEMINI_KEY = process.env.GEMINI_API_KEY;

    // System prompt
    let systemPrompt = '';
    if (mode === 'vision') {
      systemPrompt = `You are sm.ai Vision — an expert image analysis and editing AI.
When user sends an image:
- Carefully analyze the image and understand everything in it.
- If user asks to change background, add text, change colors, remove objects, or any edit: give EXACT numbered step-by-step instructions using Canva, Photoshop, or Remove.bg.
- Do ONLY what user asked. Nothing extra.
- Be precise and direct.
Answer in the same language the user writes in (Gujarati, Hindi, English).`;
    } else {
      systemPrompt = `You are sm.ai — a brilliant AI assistant created by SM AI Lab. Free for everyone, no limits.

CRITICAL RULES:
1. Always give COMPLETE, FULL responses — never truncate, never say "rest of code here"
2. For code requests: write EVERY SINGLE LINE of code — complete and working
3. For ZIP/file requests: provide ALL files with COMPLETE code, then tell user to use the download button
4. Use proper markdown: **bold**, ## headings, bullet points, numbered lists
5. Use fenced code blocks with language tags for all code
6. Be thorough — if user asks for a full project, give the FULL project
7. Answer in the same language user writes in (Gujarati, Hindi, English, etc.)

FOR FILE/ZIP REQUESTS:
- Write complete code for every single file
- After providing all code, add this exact line: [DOWNLOAD_READY]
- User can then use browser to save the files`;
    }

    // Convert messages to Gemini format
    // Gemini uses 'parts' instead of 'content'
    const geminiMessages = [];

    for (const msg of messages) {
      if (typeof msg.content === 'string') {
        geminiMessages.push({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }]
        });
      } else if (Array.isArray(msg.content)) {
        // Has image
        const parts = [];
        for (const part of msg.content) {
          if (part.type === 'text') {
            parts.push({ text: part.text });
          } else if (part.type === 'image_url') {
            // Extract base64 data from data URL
            const dataUrl = part.image_url.url;
            if (dataUrl.startsWith('data:')) {
              const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
              if (matches) {
                parts.push({
                  inlineData: {
                    mimeType: matches[1],
                    data: matches[2]
                  }
                });
              }
            }
          }
        }
        geminiMessages.push({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts
        });
      }
    }

    // Use Gemini 2.0 Flash — fast, free, powerful
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`;

    const requestBody = {
      system_instruction: {
        parts: [{ text: systemPrompt }]
      },
      contents: geminiMessages,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 8192,
        topP: 0.9
      },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }
      ]
    };

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    const data = await response.json();

    if (data.error) {
      console.error('Gemini error:', data.error);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: data.error.message || 'Gemini API error' })
      };
    }

    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response received.';

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ reply })
    };

  } catch (err) {
    console.error('Function error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Server error: ' + err.message })
    };
  }
};
