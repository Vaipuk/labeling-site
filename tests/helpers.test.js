import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  median_seconds_between,
  make_name_key,
  make_code_prefix,
  clean_code,
  check_answer,
} from '../functions/_shared.js';

test('median ignores breaks and handles empty input', () => {
  assert.equal(median_seconds_between([]), null);
  assert.equal(median_seconds_between(['2026-10-25T10:00:00Z']), null);

  // Out of order on purpose; the hour-long gap is a break and is dropped.
  const with_break = [
    '2026-10-25T10:00:30Z',
    '2026-10-25T10:00:00Z',
    '2026-10-25T10:00:10Z',
    '2026-10-25T11:00:00Z',
  ];
  assert.equal(median_seconds_between(with_break), 15);

  const even_count = [
    '2026-10-25T10:00:00Z',
    '2026-10-25T10:00:04Z',
    '2026-10-25T10:00:10Z',
    '2026-10-25T10:00:20Z',
  ];
  assert.equal(median_seconds_between(even_count), 6);
});

test('names and codes are normalised', () => {
  assert.equal(make_name_key('  Sam   Tembe '), 'sam tembe');
  assert.equal(make_code_prefix('samukelisiwe tembe'), 'samukelisi');
  assert.equal(make_code_prefix('o.brien'), 'obrien');
  assert.equal(make_code_prefix('!!!'), 'reviewer');
  assert.equal(clean_code('  SAM-4F7A '), 'sam-4f7a');
  assert.equal(clean_code(undefined), '');
});

test('answers are checked', () => {
  assert.ok(check_answer({ pair_id: 'f1__USA_123', grade: 'critical' }).answer);
  assert.ok(check_answer({ pair_id: 'f1__USA_123', grade: 'urgent' }).error);
  assert.ok(check_answer({ pair_id: 'no-separator', grade: 'critical' }).error);

  const long_note = check_answer({ pair_id: 'f1__USA_1', grade: 'background', why: 'x'.repeat(3000) });
  assert.equal(long_note.answer.why.length, 2000);
});
