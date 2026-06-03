const fetch = require('node-fetch');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
const JWT_SECRET = process.env.JWT_SECRET || 'smai-secret-2024';

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS'
};

async function supabase(endpoint, method, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${endpoint}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Prefer': method === 'POST' ? 'return=representation' : ''
    },
    body: body ? JSON.stringify(body) : undefined
  });
  return res.json();
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const { action, email, password, name } = JSON.parse(event.body);

    if (action === 'register') {
      // Check if user exists
      const existing = await supabase(`users?email=eq.${encodeURIComponent(email)}&select=id`, 'GET');
      if (existing && existing.length > 0) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Email already registered' }) };
      }

      // Hash password
      const hashed = await bcrypt.hash(password, 10);

      // Create user
      const users = await supabase('users', 'POST', { email, password: hashed, name: name || email.split('@')[0] });
      const user = Array.isArray(users) ? users[0] : users;

      if (!user || !user.id) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to create user' }) };
      }

      const token = jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '30d' });
      return { statusCode: 200, headers, body: JSON.stringify({ token, user: { id: user.id, email: user.email, name: user.name } }) };
    }

    if (action === 'login') {
      const users = await supabase(`users?email=eq.${encodeURIComponent(email)}&select=*`, 'GET');
      const user = Array.isArray(users) ? users[0] : null;

      if (!user) {
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid email or password' }) };
      }

      const valid = await bcrypt.compare(password, user.password);
      if (!valid) {
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid email or password' }) };
      }

      const token = jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '30d' });
      return { statusCode: 200, headers, body: JSON.stringify({ token, user: { id: user.id, email: user.email, name: user.name } }) };
    }

    if (action === 'verify') {
      const authHeader = event.headers.authorization || '';
      const token = authHeader.replace('Bearer ', '');
      const decoded = jwt.verify(token, JWT_SECRET);
      return { statusCode: 200, headers, body: JSON.stringify({ user: decoded }) };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid action' }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
