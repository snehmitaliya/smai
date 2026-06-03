const fetch = require('node-fetch');
const jwt = require('jsonwebtoken');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
const JWT_SECRET = process.env.JWT_SECRET || 'smai-secret-2024';

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, DELETE'
};

async function sb(endpoint, method, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${endpoint}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Prefer': (method === 'POST') ? 'return=representation' : ''
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  try { return JSON.parse(text); } catch { return text; }
}

function getUser(event) {
  const authHeader = event.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '');
  if (!token) return null;
  try { return jwt.verify(token, JWT_SECRET); } catch { return null; }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  const user = getUser(event);
  if (!user) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };

  const { action, conversationId, title, mode, messages, role, content } = JSON.parse(event.body || '{}');

  try {
    // Get all conversations for user
    if (action === 'getConversations') {
      const convs = await sb(`conversations?user_id=eq.${user.id}&order=created_at.desc&select=*`, 'GET');
      return { statusCode: 200, headers, body: JSON.stringify({ conversations: convs }) };
    }

    // Create new conversation
    if (action === 'createConversation') {
      const conv = await sb('conversations', 'POST', { user_id: user.id, title: title || 'New Chat', mode: mode || 'chat' });
      const c = Array.isArray(conv) ? conv[0] : conv;
      return { statusCode: 200, headers, body: JSON.stringify({ conversation: c }) };
    }

    // Get messages for conversation
    if (action === 'getMessages') {
      const msgs = await sb(`messages?conversation_id=eq.${conversationId}&order=created_at.asc&select=*`, 'GET');
      return { statusCode: 200, headers, body: JSON.stringify({ messages: msgs }) };
    }

    // Save message
    if (action === 'saveMessage') {
      const msg = await sb('messages', 'POST', { conversation_id: conversationId, role, content });
      const m = Array.isArray(msg) ? msg[0] : msg;
      return { statusCode: 200, headers, body: JSON.stringify({ message: m }) };
    }

    // Update conversation title
    if (action === 'updateTitle') {
      await sb(`conversations?id=eq.${conversationId}`, 'PATCH', { title });
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    // Delete conversation
    if (action === 'deleteConversation') {
      await sb(`messages?conversation_id=eq.${conversationId}`, 'DELETE');
      await sb(`conversations?id=eq.${conversationId}`, 'DELETE');
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid action' }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
