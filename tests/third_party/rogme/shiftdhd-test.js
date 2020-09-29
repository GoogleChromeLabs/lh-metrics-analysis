/**
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/* eslint-env mocha */

import fs from 'fs';
import {strict as assert} from 'assert';

import {PROJECT_ROOT} from '../../../js/module-utils.js';
import {assertAlmostEqual} from '../../test-utils/floating-point-checks.js';
import {CsvParser} from '../../../js/csv-parser.js';
import {shiftdhd} from '../../../third_party/rogme/shiftdhd.js';

const testFixtureTxt = fs.readFileSync(PROJECT_ROOT +
    '/tests/fixtures/paired-fcp-data.csv', 'utf-8');
/** @type {[number, number, number, number]} */
const xorshiftSeed = [1041628356, 1081053425, 395050667, 1356391169];

/** @typedef {import('../../../third_party/rogme/shiftdhd.js').ShiftQuantile} ShiftQuantile */

// TODO(bckenny): replace when we have a ready-made column-producing parser.
/**
 * @param {string} text
 * @return {{base: Array<number>, compare: Array<number>}}
 */
function csvColumns(text) {
  const rows = CsvParser.parseRows(text);

  assert.strictEqual(rows[0][0], 'base');
  assert.strictEqual(rows[0][1], 'compare');

  const base = [];
  const compare = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    base.push(Number(row[0]));
    compare.push(Number(row[1]));
  }

  return {base, compare};
}

/**
 * @param {Array<ShiftQuantile>} actual
 * @param {Array<ShiftQuantile>} expected
 * @param {Record<keyof ShiftQuantile, number>} maxAbsDiffByKey
 */
function assertDeciles(actual, expected, maxAbsDiffByKey) {
  assert.strictEqual(actual.length, 9);
  assert.strictEqual(expected.length, 9);

  for (let i = 0; i < expected.length; i++) {
    const actualDecile = actual[i];
    const expectedDecile = expected[i];
    assert.strictEqual(Object.keys(actualDecile).length, Object.keys(expectedDecile).length,
      `unequal number of properties between actual and expected in decile ${expectedDecile.q}`);

    for (const key of Object.keys(expectedDecile)) {
      const k = /** @type {keyof ShiftQuantile} */ (key); // Make tsc happy.
      const assertOptions = {
        maxAbsDiff: maxAbsDiffByKey[k],
        message: `difference at decile ${expectedDecile.q}, key '${key}'`,
      };
      assertAlmostEqual(actualDecile[k], expectedDecile[k], assertOptions);
    }
  }
}

describe('shiftdhd', () => {
  it('finds the shift function for two arrays', async () => {
    const base = Array(100).fill(0);
    // 0.5...99.5
    const compare = Array(100).fill(0.5).map((x, y) => x + y);

    const options = {nboot: 200, quiet: true, randomSeed: xorshiftSeed};
    const shiftResults = await shiftdhd({base, compare}, options);

    // Simple-ish by construction.
    const expected = [
      {q: 0.1, compare: 10, base: 0, difference: 10, ciLower: 2, ciUpper: 18},
      {q: 0.2, compare: 20, base: 0, difference: 20, ciLower: 9, ciUpper: 31},
      {q: 0.3, compare: 30, base: 0, difference: 30, ciLower: 17, ciUpper: 43},
      {q: 0.4, compare: 40, base: 0, difference: 40, ciLower: 26, ciUpper: 53},
      {q: 0.5, compare: 50, base: 0, difference: 50, ciLower: 36, ciUpper: 64},
      {q: 0.6, compare: 60, base: 0, difference: 60, ciLower: 46, ciUpper: 73},
      {q: 0.7, compare: 70, base: 0, difference: 70, ciLower: 57, ciUpper: 83},
      {q: 0.8, compare: 80, base: 0, difference: 80, ciLower: 69, ciUpper: 91},
      {q: 0.9, compare: 90, base: 0, difference: 90, ciLower: 82, ciUpper: 98},
    ];

    const maxAbsDiffByKey = {
      // Exact comparison for 'q'.
      q: 0,
      compare: 0.01,
      base: 0,
      difference: 0.01,
      // CI bounds are much more dependent on nboot and rng. Set to appropriate
      // for difference magnitudes.
      ciLower: 3,
      ciUpper: 3,
    };

    assertDeciles(shiftResults, expected, maxAbsDiffByKey);
  });

  it('throws if columns do not have the same length', async () => {
    const base = [0, 1, 2, 3];
    const compare = [0, 1];

    await assert.rejects(async () => {
      return shiftdhd({base, compare}, {nboot: 200});
    }, /^Error: dependent `base` and `compare` must have the same length$/);
  });

  it('matches rogme shiftdhd output', async () => {
    const data = csvColumns(testFixtureTxt);
    const options = {nboot: 10_000, quiet: true, randomSeed: xorshiftSeed};
    const shiftResults = await shiftdhd(data, options);

    // Expectations generated by R/rogme-shift-function-bin.R with `nboot` of 10_000.
    /* eslint-disable max-len */
    const expected = [
      {q: 0.1, compare: 1164.21, base: 1736.96, difference: -572.75, ciLower: -783.27, ciUpper: -362.23},
      {q: 0.2, compare: 1568.47, base: 2223.48, difference: -655.00, ciLower: -934.01, ciUpper: -375.99},
      {q: 0.3, compare: 1970.55, base: 2754.77, difference: -784.22, ciLower: -1121.71, ciUpper: -446.74},
      {q: 0.4, compare: 2248.71, base: 3187.78, difference: -939.07, ciLower: -1217.85, ciUpper: -660.28},
      {q: 0.5, compare: 2584.89, base: 3587.93, difference: -1003.05, ciLower: -1294.03, ciUpper: -712.06},
      {q: 0.6, compare: 3030.38, base: 3935.66, difference: -905.28, ciLower: -1289.46, ciUpper: -521.10},
      {q: 0.7, compare: 3431.99, base: 4429.42, difference: -997.43, ciLower: -1445.08, ciUpper: -549.78},
      {q: 0.8, compare: 4164.07, base: 5089.67, difference: -925.60, ciLower: -1533.96, ciUpper: -317.23},
      {q: 0.9, compare: 5457.53, base: 6148.64, difference: -691.11, ciLower: -1752.32, ciUpper: 370.09},
    ];
    /* eslint-enable max-len */

    // Since R uses a different RNG, so allow enough difference in precision,
    // especially for the variable CI bounds.
    const maxAbsDiffByKey = {
      // Exact comparison for 'q'.
      q: 0,
      compare: 0.5,
      base: 0.5,
      difference: 0.75,
      // CI bounds are much more dependent on nboot and rng. Set to appropriate
      // for difference magnitudes.
      ciLower: 6,
      ciUpper: 6,
    };

    assertDeciles(shiftResults, expected, maxAbsDiffByKey);
  });
});