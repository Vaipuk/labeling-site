// Mirrors computeAgreement in public/progress.html. The last test fails if the
// two copies drift apart, so edit both together.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Fleiss' kappa generalised to a varying number of raters per pair.
// Kept identical to the copy in tests/agreement.test.mjs.
function computeAgreement(pairs) {
  const gradeKeys = ["critical", "worth_knowing", "background", "not_relevant"];
  const categoryTotals = { critical: 0, worth_knowing: 0, background: 0, not_relevant: 0 };
  let sumOfPairAgreement = 0;
  let pairsUsed = 0;
  let totalGrades = 0;

  for (const pair of pairs) {
    let raters = 0;
    let agreeingRaterPairs = 0;
    for (const key of gradeKeys) {
      const count = pair.grades[key] || 0;
      raters += count;
      agreeingRaterPairs += count * (count - 1);
    }
    if (raters < 2) {
      continue;
    }
    for (const key of gradeKeys) {
      categoryTotals[key] += pair.grades[key] || 0;
    }
    sumOfPairAgreement += agreeingRaterPairs / (raters * (raters - 1));
    pairsUsed += 1;
    totalGrades += raters;
  }

  if (pairsUsed === 0) {
    return { pairsUsed: 0, percentAgreement: null, kappa: null };
  }

  const meanAgreement = sumOfPairAgreement / pairsUsed;
  let chanceAgreement = 0;
  for (const key of gradeKeys) {
    const share = categoryTotals[key] / totalGrades;
    chanceAgreement += share * share;
  }

  // Everyone used one single grade: kappa is undefined, not perfect.
  let kappa = null;
  if (chanceAgreement < 1) {
    kappa = (meanAgreement - chanceAgreement) / (1 - chanceAgreement);
  }

  return { pairsUsed: pairsUsed, percentAgreement: meanAgreement * 100, kappa: kappa };
}

test("hand-computed three pair example", () => {
  // Pair 1: two raters, both critical            -> P = 2*1 / (2*1) = 1
  // Pair 2: two raters, critical and worth       -> P = 0
  // Pair 3: three raters, 2 critical, 1 worth    -> P = 2*1 / (3*2) = 1/3
  // P_bar = (1 + 0 + 1/3) / 3 = 4/9
  // Totals: critical 5, worth 2, of 7 -> P_e = 25/49 + 4/49 = 29/49
  // kappa = (4/9 - 29/49) / (20/49) = -13/36
  const result = computeAgreement([
    { grades: { critical: 2 } },
    { grades: { critical: 1, worth_knowing: 1 } },
    { grades: { critical: 2, worth_knowing: 1 } },
  ]);
  assert.equal(result.pairsUsed, 3);
  assert.ok(Math.abs(result.percentAgreement - 400 / 9) < 1e-9);
  assert.ok(Math.abs(result.kappa - (-13 / 36)) < 1e-9);
});

test("perfect agreement across different grades gives kappa 1", () => {
  const result = computeAgreement([
    { grades: { critical: 3 } },
    { grades: { background: 2 } },
  ]);
  assert.equal(result.percentAgreement, 100);
  assert.ok(Math.abs(result.kappa - 1) < 1e-9);
});

test("single grades are ignored and nothing double graded gives n/a", () => {
  const result = computeAgreement([{ grades: { critical: 1 } }]);
  assert.deepEqual(result, { pairsUsed: 0, percentAgreement: null, kappa: null });
});

test("everyone using one grade leaves kappa undefined", () => {
  const result = computeAgreement([
    { grades: { not_relevant: 2 } },
    { grades: { not_relevant: 4 } },
  ]);
  assert.equal(result.percentAgreement, 100);
  assert.equal(result.kappa, null);
});

test("copy here matches the one in public/progress.html", () => {
  const page = readFileSync(new URL("../public/progress.html", import.meta.url), "utf8");
  const here = computeAgreement.toString();
  const start = page.indexOf("function computeAgreement(");
  const there = page.slice(start, start + here.length);
  assert.equal(there, here);
});
