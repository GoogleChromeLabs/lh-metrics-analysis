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

import {strict as assert} from 'assert';
import {assertAlmostEqual} from '../../test-utils/floating-point-checks.js';

import {getHarrellDavisDecileWeights} from
  '../../../js/estimators/harrell-davis-estimator-weights.js';

describe('Harrel-Davis Estimator Weights', () => {
  describe('#getHarrellDavisDecileWeights', () => {
    it('throws for small lengths;', () => {
      assert.throws(() => getHarrellDavisDecileWeights(1), /^Error: Not supported with n < 6$/);
    });

    it('throws for lengths that have not been tested yet', () => {
      assert.throws(() => getHarrellDavisDecileWeights(100_000_000),
        /^Error: Error bounds untested above a limit of \w+$/);
    });

    it('returns an array of Harrell-Davis decile weights', () => {
      const length = 7;
      const weightsPerDecile = getHarrellDavisDecileWeights(length);

      assert.strictEqual(weightsPerDecile.length, 9);
      for (const weights of weightsPerDecile) {
        assert.strictEqual(weights.length, length);
      }

      // eslint-disable-next-line max-len
      const expected = [0.18042766529013304, 0.3322740967548868, 0.2713533093790969, 0.15001759385306992, 0.055041848335457964, 0.010458104336858245, 0.00042738205049716485];
      assert.deepStrictEqual([...weightsPerDecile[2]], expected);
    });

    describe('general function coverage', () => {
      // The following is generated to get good general coverage. Expected values
      // are from the `c++/hd-weight-generator` utility, using the native Boost
      // `ibeta` function at `boost::multiprecision::cpp_bin_float_100` internal
      // precision.

      // Pick a length, and then for each decile is asserted a value at the
      // peak (~decile * length) and its mirror point.
      /** @type {Array<{length: number, expected: Array<[number, number]>, maxAbsDiff: number}>} */
      const tests = [{
        length: 11,
        maxAbsDiff: 0,
        expected: [
          [0.27261646697683151, 6.10509889989776e-08],
          [0.25588373535600545, 0.00010630511875169798],
          [0.24232211283956911, 0.0092757330601586831],
          [0.23471016074422371, 0.10648840241731954],
          [0.23228248279880873, 0.23228248279880873],
        ],
      }, {
        length: 33,
        maxAbsDiff: 3.1e-16,
        expected: [
          [0.21173410251586486, 4.6679160346868041e-25],
          [0.17200098751756832, 2.3099351119103421e-13],
          [0.15110424407692533, 1.1247569392862327e-06],
          [0.13818256644848786, 0.012490377031757196],
          [0.13719439030935518, 0.13719439030935518],
        ],
      }, {
        length: 40,
        maxAbsDiff: 7e-17,
        expected: [
          [0.17911044120140224, 1.9079604156742081e-29],
          [0.14571320658158907, 4.9733478592751976e-15],
          [0.13102936519439407, 4.9129688437487083e-07],
          [0.12456912908697731, 0.0075272141376043307],
          [0.12341218064288895, 0.12341218064288895],
        ],
      }, {
        length: 353,
        maxAbsDiff: 2.1e-16,
        expected: [
          [0.07012627032162827, 0],
          [0.053031282000158574, 0],
          [0.046318647202777591, 2.7541749177517729e-54],
          [0.043235887805247501, 2.1115332123474538e-14],
          [0.042417130507469203, 0.042417130507469203],
        ],
      }, {
        length: 999,
        maxAbsDiff: 2.6e-16,
        expected: [
          [0.042130945207947877, 0],
          [0.031559597830451813, 0],
          [0.02753719137974223, 0],
          [0.025754839990628269, 1.5999340107877044e-37],
          [0.025233432413943629, 0.025233432413943629],
        ],
      }, {
        length: 10_001,
        maxAbsDiff: 2.9e-15,
        expected: [
          [0.01328977145743592, 0],
          [0.0099709607453804631, 0],
          [0.0087043391151624787, 0],
          [0.0081425270817933049, 0],
          [0.0079781143280261545, 0.0079781143280261545],
        ],
      }, {
        length: 251_473,
        maxAbsDiff: 1.4e-14,
        expected: [
          [0.0026517795743141084, 0],
          [0.0019888580222665584, 0],
          [0.0017360191473193328, 0],
          [0.0016238924118254861, 0],
          [0.0015910860223433024, 0.0015910860223433024],
        ],
      }];

      for (const {length, expected, maxAbsDiff} of tests) {
        it(`getHarrellDavisDecileWeights(${length})`, () => {
          const weightsPerDecile = getHarrellDavisDecileWeights(length);

          assert.strictEqual(weightsPerDecile.length, 9);
          for (let decile = 1; decile < 6; decile++) {
            const weights = weightsPerDecile[decile - 1];
            assert.strictEqual(weights.length, length);

            const decileExpected = expected[decile - 1];
            const peakIndex = Math.floor(length * decile / 10);
            assertAlmostEqual(weights[peakIndex], decileExpected[0], {maxAbsDiff});

            const peakMirrorIndex = length - peakIndex - 1;
            assertAlmostEqual(weights[peakMirrorIndex], decileExpected[1], {maxAbsDiff});

            // Since the function is regularized, should sum to 1.
            const sum = weights.reduce((sum, next) => sum + next);
            assertAlmostEqual(sum, 1, {maxAbsDiff: 3e-14}); // Close enough.
          }

          // The upper deciles (including the 50th), should be mirror images of
          // the lower ones.
          for (let decile = 5; decile < 10; decile++) {
            const weights = weightsPerDecile[decile - 1];
            const mirrorWeights = weightsPerDecile[10 - decile - 1];

            // Loosen to `assertAlmostEqual()` since 50th percentile is computed
            // without mirroring.
            if (decile === 5) {
              for (let i = 0; i < weights.length; i++) {
                assertAlmostEqual(weights[i], mirrorWeights[length - 1 - i],
                    {maxAbsDiff, message: `Error on 5th decile, index ${i}`});
              }
              continue;
            }

            // Can do strict equality because we know the implementation reuses
            // the array, but could loosen these in the future as well.
            const expected = Float64Array.from(mirrorWeights).reverse();
            assert.deepStrictEqual(weights, expected);
          }
        });
      }
    });
  });
});
