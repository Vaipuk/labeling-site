import { send_json, send_error, GRADES, median_seconds_between } from '../_shared.js';

function empty_mix() {
  return { critical: 0, worth_knowing: 0, background: 0, not_relevant: 0 };
}

// Loaded on demand only: D1 bills rows scanned, so this must never sit on a refresh timer.
export async function onRequestGet({ request, env }) {
  const key = new URL(request.url).searchParams.get('key');
  if (!env.PROGRESS_KEY || key !== env.PROGRESS_KEY) {
    return send_error('That progress link is not valid.', 403);
  }

  const people_result = await env.DB.prepare('SELECT code, name FROM people ORDER BY created_at').all();
  const answers_result = await env.DB.prepare('SELECT code, pair_id, grade, graded_at FROM answers').all();

  const people_by_code = {};
  const times_by_code = {};
  for (const person of people_result.results) {
    people_by_code[person.code] = {
      name: person.name,
      code: person.code,
      graded: 0,
      last_graded: null,
      mix: empty_mix(),
      median_seconds: null,
    };
    times_by_code[person.code] = [];
  }

  const grades_by_pair = {};
  for (const answer of answers_result.results) {
    const person = people_by_code[answer.code];
    if (person) {
      person.graded += 1;
      person.mix[answer.grade] += 1;
      if (person.last_graded === null || answer.graded_at > person.last_graded) {
        person.last_graded = answer.graded_at;
      }
      times_by_code[answer.code].push(answer.graded_at);
    }

    if (!grades_by_pair[answer.pair_id]) {
      grades_by_pair[answer.pair_id] = empty_mix();
    }
    grades_by_pair[answer.pair_id][answer.grade] += 1;
  }

  const people = Object.values(people_by_code);
  for (const person of people) {
    person.median_seconds = median_seconds_between(times_by_code[person.code]);
  }

  const pairs = [];
  for (const pair_id of Object.keys(grades_by_pair)) {
    const grades = grades_by_pair[pair_id];
    let total = 0;
    for (const grade of GRADES) {
      total += grades[grade];
    }
    if (total >= 2) {
      pairs.push({ pair_id: pair_id, grades: grades });
    }
  }

  return send_json({ people: people, pairs: pairs });
}

export function onRequest() {
  return send_error('Method not allowed.', 405);
}
