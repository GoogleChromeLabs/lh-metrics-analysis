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

/**
 * Find the ulps difference between doubles `a` and `b`. Based on
 * https://randomascii.wordpress.com/2012/02/25/comparing-floating-point-numbers-2012-edition/
 * adjusted for doubles instead of floats.
 * @param {number} a
 * @param {number} b
 * @return {number}
 */
function ulpsDifference(a, b) {
  if (Number.isNaN(a)) throw new Error('parameter a is NaN');
  if (Number.isNaN(b)) throw new Error('parameter b is NaN');

  if (Math.sign(a) !== Math.sign(b)) {
    // +0 === -0 but have different signs.
    if (a === b) {
      return 0;
    }

    // Opposite signs are oceans of ulps away from each other, don't deal with
    // them for now.
    throw new Error(`${a} and ${b} are of opposite signs so ulps are useless`);
  }

  // Subtract their integer representations.
  const f64 = new Float64Array([a, b]);
  const bi64 = new BigInt64Array(f64.buffer);
  const biDiff = bi64[0] - bi64[1];
  return Math.abs(Number(biDiff));
}

export {
  ulpsDifference,
};
