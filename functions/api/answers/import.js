import { send_json, send_error, read_json_body, clean_code, check_answer, find_person } from '../../_shared.js';

const MAX_ROWS = 5000;
const STATEMENTS_PER_BATCH = 100;

// An import never overwrites an answer that was given more recently.
const UPSERT_IF_NEWER = `
  INSERT INTO answers (code, pair_id, grade, why, graded_at) VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(code, pair_id) DO UPDATE SET
    grade = excluded.grade, why = excluded.why, graded_at = excluded.graded_at
  WHERE excluded.graded_at > answers.graded_at`;

export async function onRequestPost({ request, env }) {
  const body = await read_json_body(request);
  if (!body || !Array.isArray(body.rows)) {
    return send_error('Expected a JSON body with a list of rows.', 400);
  }
  if (body.rows.length > MAX_ROWS) {
    return send_error('Too many rows in one import. The limit is 5000.', 400);
  }

  const code = clean_code(body.code);
  const person = await find_person(env.DB, code);
  if (!person) {
    return send_error('No one has that code. Check it for typos.', 404);
  }

  const server_now = new Date().toISOString();
  const statements = [];
  for (const row of body.rows) {
    const checked = check_answer(row);
    if (checked.error) {
      continue;
    }
    const answer = checked.answer;

    // Stored as ISO so the "newer than" text comparison in SQL is a true time comparison.
    const parsed_time = Date.parse(row.graded_at);
    const graded_at = Number.isNaN(parsed_time) ? server_now : new Date(parsed_time).toISOString();

    statements.push(
      env.DB.prepare(UPSERT_IF_NEWER).bind(code, answer.pair_id, answer.grade, answer.why, graded_at)
    );
  }

  // Rows that lost to a newer answer change nothing, so they land in skipped.
  let loaded = 0;
  for (let start = 0; start < statements.length; start += STATEMENTS_PER_BATCH) {
    const chunk = statements.slice(start, start + STATEMENTS_PER_BATCH);
    const results = await env.DB.batch(chunk);
    for (const result of results) {
      loaded += result.meta.changes;
    }
  }

  return send_json({ loaded: loaded, skipped: body.rows.length - loaded });
}

export function onRequest() {
  return send_error('Method not allowed.', 405);
}
