import {
  send_json,
  send_error,
  read_json_body,
  make_name_key,
  make_code_prefix,
  random_hex,
} from '../../_shared.js';

const MAX_NAME_LENGTH = 80;
const CODE_ATTEMPTS = 5;

export async function onRequestPost({ request, env }) {
  const body = await read_json_body(request);
  const name = body && typeof body.name === 'string' ? body.name.trim() : '';

  if (name === '') {
    return send_error('Please type your name.', 400);
  }
  if (name.length > MAX_NAME_LENGTH) {
    return send_error('That name is too long. Please keep it under 80 characters.', 400);
  }

  const name_key = make_name_key(name);
  const prefix = make_code_prefix(name_key);
  const created_at = new Date().toISOString();

  for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt++) {
    const code = prefix + '-' + random_hex(4);
    const result = await env.DB
      .prepare('INSERT INTO people (code, name, name_key, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(code) DO NOTHING')
      .bind(code, name, name_key, created_at)
      .run();

    if (result.meta.changes === 1) {
      return send_json({ code: code, name: name }, 201);
    }
  }

  return send_error('Could not make a new code just now. Please try again.', 500);
}

export function onRequest() {
  return send_error('Method not allowed.', 405);
}
