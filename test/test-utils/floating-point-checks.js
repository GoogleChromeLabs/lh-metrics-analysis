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

// Needed for eslint for now:
/* global BigInt64Array */

import {AssertionError} from 'assert';

/**
 * Find the ulps difference between doubles `a` and `b`. Based on
 * https://randomascii.wordpress.com/2012/02/25/comparing-floating-point-numbers-2012-edition/
 * adjusted for JS and doubles instead of floats.
 * @param {number} a
 * @param {number} b
 * @return {number}
 */
function ulpsDifference(a, b) {
  if (Number.isNaN(a)) throw new Error('parameter a is NaN');
  if (Number.isNaN(b)) throw new Error('parameter b is NaN');

  if (Math.sign(a) !== Math.sign(b)) {
    // +0 === -0, but they have different signs.
    if (a === b) {
      return 0;
    }

    // Opposite signs are oceans of ulps away from each other; don't deal with
    // them for now.
    throw new Error(`${a} and ${b} are of opposite signs so ulps are useless`);
  }

  // Subtract their integer representations.
  const f64 = new Float64Array([a, b]);
  const bi64 = new BigInt64Array(f64.buffer);
  const biDiff = bi64[0] - bi64[1];
  return Math.abs(Number(biDiff));
}

/**
 * Assert floating point closeness with nice assertion error.
 * Adopted from https://randomascii.wordpress.com/2012/02/25/comparing-floating-point-numbers-2012-edition/
 * Defaults to testing with a `maxAbsDiff` of `1e-16` and a `maxUlpsDiff` of 4.
 * @param {number} actual
 * @param {number} expected
 * @param {{maxAbsDiff?: number, maxUlpsDiff?: number}} [options]
 * @return {void}
 */
function assertAlmostEqual(actual, expected,
    {maxAbsDiff = 1e-16, maxUlpsDiff = 4} = {}) {
  // Less than this difference is fine enough.
  const absDiff = Math.abs(actual - expected);
  if (absDiff <= maxAbsDiff) return;

  // Small ulps difference is fine, too.
  const ulpsDiff = ulpsDifference(actual, expected);
  if (ulpsDiff <= maxUlpsDiff) return;

  if (actual !== 0) {
    throw new AssertionError({
      actual,
      expected,
      message: `actual and expected differed by ${absDiff} (${ulpsDiff} ulps)`,
    });
  }
}

export {
  ulpsDifference,
  assertAlmostEqual,
};
