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
    const { prompt } = JSON.parse(event.body);

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 200,
        messages: [
          {
            role: 'system',
            content: 'You are an expert AI image generation prompt engineer. Enhance the user\'s simple prompt into a vivid, detailed, and specific prompt for AI image generation. Add style keywords (photorealistic, cinematic, 8K, HDR, beautiful lighting, shallow depth of field, etc.), mood, composition details, and quality descriptors. Return ONLY the enhanced prompt text. No explanation, no quotes, no extra text.'
          },
          { role: 'user', content: prompt }
        ],
        temperature: 0.8
      })
    });

    const data = await response.json();
    const enhanced = data.choices?.[0]?.message?.content?.trim() || prompt;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ enhanced })
    };
  } catch (err) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ enhanced: JSON.parse(event.body).prompt })
    };
  }
};
