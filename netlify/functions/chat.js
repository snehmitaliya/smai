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

    // Build system prompt based on mode
    let system = '';

    if (mode === 'vision') {
      system = `You are sm.ai Vision — an expert image analysis and editing AI assistant.
When the user sends an image:
- Analyze it thoroughly: describe content, colors, composition, objects, text, mood, style, quality.
- If the user asks for edits or changes (background change, add text, color adjustment, remove objects, crop, filter effects, resize, etc.) — give SPECIFIC, clear, step-by-step actionable instructions for tools like Canva, Photoshop, or GIMP.
- Do ONLY what the user asked. No extra unrequested info.
- Be precise, helpful, and direct.
Answer in the same language the user writes in (Gujarati, Hindi, English — whatever they use).`;
    } else {
      system = `You are sm.ai — a brilliant, helpful AI assistant created by SM AI Lab.
You are completely free for everyone with no limits or subscriptions.

RESPONSE FORMATTING — follow these rules strictly:
- Use clear markdown formatting in every response
- Use **bold** for important terms, key points, and headings within text
- Use ## and ### headings to organize longer answers
- Use bullet points (- item) and numbered lists (1. item) where helpful
- Write all code in proper fenced code blocks with language tag, e.g. \`\`\`python
- Use > blockquotes for tips, warnings, or highlights
- Keep responses well-structured, clear, and easy to read
- Be thorough but concise — no unnecessary filler
- Sound natural and helpful, like a brilliant knowledgeable friend
- Answer in the same language the user writes in (Gujarati, Hindi, English, etc.)`;
    }

    // Groq API — llama-3.3-70b for text, llama-3.2-11b-vision for images
    const hasImage = messages.some(m =>
      Array.isArray(m.content) && m.content.some(c => c.type === 'image_url')
    );

    const model = hasImage ? 'meta-llama/llama-4-scout-17b-16e-instruct' : 'llama-3.3-70b-versatile';

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model,
        max_tokens: 2048,
        messages: [
          { role: 'system', content: system },
          ...messages
        ],
        temperature: 0.7
      })
    });

    const data = await response.json();

    if (data.error) {
      console.error('Groq error:', data.error);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: data.error.message || 'Groq API error' })
      };
    }

    const reply = data.choices?.[0]?.message?.content || 'No response received.';

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
