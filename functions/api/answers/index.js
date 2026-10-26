import {
  send_json,
  send_error,
  read_json_body,
  clean_code,
  check_answer,
  find_person,
  count_answers,
} from '../../_shared.js';

export async function onRequestGet({ request, env }) {
  const code = clean_code(new URL(request.url).searchParams.get('code'));
  const person = await find_person(env.DB, code);
  if (!person) {
    return send_error('No one has that code. Check it for typos.', 404);
  }

  const result = await env.DB
    .prepare('SELECT pair_id, grade, why, graded_at FROM answers WHERE code = ?')
    .bind(code)
    .all();

  const answers = {};
  for (const row of result.results) {
    answers[row.pair_id] = { grade: row.grade, why: row.why, when: row.graded_at };
  }
  return send_json({ answers: answers });
}

export async function onRequestPut({ request, env }) {
  const body = await read_json_body(request);
  if (!body) {
    return send_error('The request was not valid JSON.', 400);
  }

  const code = clean_code(body.code);
  const person = await find_person(env.DB, code);
  if (!person) {
    return send_error('No one has that code. Check it for typos.', 404);
  }

  const checked = check_answer(body);
  if (checked.error) {
    return send_error(checked.error, 400);
  }
  const answer = checked.answer;

  // A save retried after an outage carries the time it was graded, which keeps
  // the pace figures honest. Anything unparseable or in the future gets server time.
  const now = Date.now();
  const sent_time = Date.parse(body.graded_at);
  const graded_at = Number.isNaN(sent_time) || sent_time > now
    ? new Date(now).toISOString()
    : new Date(sent_time).toISOString();

  await env.DB
    .prepare(
      `INSERT INTO answers (code, pair_id, grade, why, graded_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(code, pair_id) DO UPDATE SET
         grade = excluded.grade, why = excluded.why, graded_at = excluded.graded_at`
    )
    .bind(code, answer.pair_id, answer.grade, answer.why, graded_at)
    .run();

  const graded = await count_answers(env.DB, code);
  return send_json({ ok: true, graded: graded });
}

export function onRequest() {
  return send_error('Method not allowed.', 405);
}
