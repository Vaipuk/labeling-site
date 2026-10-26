import { send_json, send_error, clean_code, find_person, count_answers } from '../../_shared.js';

export async function onRequestGet({ params, env }) {
  // Route params arrive still percent-encoded, so a pasted code with spaces would never match.
  let code = '';
  try {
    code = clean_code(decodeURIComponent(params.code));
  } catch (error) {
    return send_error('No one has that code. Check it for typos.', 404);
  }
  const person = await find_person(env.DB, code);
  if (!person) {
    return send_error('No one has that code. Check it for typos.', 404);
  }

  const graded = await count_answers(env.DB, code);
  return send_json({ code: person.code, name: person.name, graded: graded });
}

export function onRequest() {
  return send_error('Method not allowed.', 405);
}
