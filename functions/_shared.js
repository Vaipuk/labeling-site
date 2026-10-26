// Helpers shared by the API routes. Files starting with "_" are not routed.

export const GRADES = ['critical', 'worth_knowing', 'background', 'not_relevant'];

export const MAX_WHY_LENGTH = 2000;
export const MAX_PAIR_ID_LENGTH = 200;

// Gaps longer than this between two answers are treated as a break, not grading time.
export const LONGEST_GAP_SECONDS = 600;

export function send_json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status: status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

export function send_error(message, status) {
  return send_json({ error: message }, status);
}

export async function read_json_body(request) {
  try {
    return await request.json();
  } catch (error) {
    return null;
  }
}

export function clean_code(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim().toLowerCase();
}

export function make_name_key(name) {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function make_code_prefix(name_key) {
  const first_word = name_key.split(' ')[0] || '';
  const letters_only = first_word.replace(/[^a-z0-9]/g, '').slice(0, 10);
  if (letters_only === '') {
    return 'reviewer';
  }
  return letters_only;
}

export function random_hex(length) {
  const bytes = new Uint8Array(Math.ceil(length / 2));
  crypto.getRandomValues(bytes);
  let hex = '';
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, '0');
  }
  return hex.slice(0, length);
}

// Returns { answer } when the row is usable, or { error } explaining why not.
export function check_answer(row) {
  if (row === null || typeof row !== 'object') {
    return { error: 'Each answer must be an object.' };
  }

  const pair_id = row.pair_id;
  if (typeof pair_id !== 'string' || !pair_id.includes('__')) {
    return { error: 'pair_id must look like flight_id__SOURCE_notamid.' };
  }
  if (pair_id.length > MAX_PAIR_ID_LENGTH) {
    return { error: 'pair_id is too long.' };
  }

  if (!GRADES.includes(row.grade)) {
    return { error: 'grade must be one of: ' + GRADES.join(', ') + '.' };
  }

  let why = null;
  if (row.why !== undefined && row.why !== null) {
    if (typeof row.why !== 'string') {
      return { error: 'why must be text.' };
    }
    // Truncate rather than reject so a long note never costs someone their grade.
    why = row.why.slice(0, MAX_WHY_LENGTH);
  }

  return { answer: { pair_id: pair_id, grade: row.grade, why: why } };
}

export function find_person(db, code) {
  return db.prepare('SELECT code, name FROM people WHERE code = ?').bind(code).first();
}

export async function count_answers(db, code) {
  const row = await db.prepare('SELECT COUNT(*) AS graded FROM answers WHERE code = ?').bind(code).first();
  return row.graded;
}

// Median of the gaps between consecutive answers, ignoring breaks. Null when there is nothing to measure.
export function median_seconds_between(timestamps) {
  const times = timestamps
    .map((value) => Date.parse(value))
    .filter((value) => !Number.isNaN(value))
    .sort((a, b) => a - b);

  const gaps = [];
  for (let i = 1; i < times.length; i++) {
    const seconds = (times[i] - times[i - 1]) / 1000;
    if (seconds <= LONGEST_GAP_SECONDS) {
      gaps.push(seconds);
    }
  }

  if (gaps.length === 0) {
    return null;
  }

  gaps.sort((a, b) => a - b);
  const middle = Math.floor(gaps.length / 2);
  if (gaps.length % 2 === 1) {
    return gaps[middle];
  }
  return (gaps[middle - 1] + gaps[middle]) / 2;
}
