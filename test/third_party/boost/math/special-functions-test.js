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
import {ulpsDifference, assertAlmostEqual} from '../../../test-utils/floating-point-checks.js';

import {ibetaDerivative} from '../../../../third_party/boost/math/special-functions.js';

import idData from '../../../../third_party/boost/math/test/ibeta_derivative_data.js';
import idIntData from '../../../../third_party/boost/math/test/ibeta_derivative_int_data.js';
import idLargeData from '../../../../third_party/boost/math/test/ibeta_derivative_large_data.js';
import idSmallData from '../../../../third_party/boost/math/test/ibeta_derivative_small_data.js';

describe('Boost ibetaDerivative', () => {
  describe('invalid arguments', () => {
    it('throws for non-positive a', () => {
      assert.throws(() => ibetaDerivative(-1, 10, 1), /^Error: The argument a.+\(got a=-1\)\.$/);
      assert.throws(() => ibetaDerivative(0, 10, 1), /^Error: The argument a.+\(got a=0\)\.$/);
    });

    it('throws for non-positive b', () => {
      assert.throws(() => ibetaDerivative(1, -100, 1), /^Error: The argument b.+\(got b=-100\)\.$/);
      assert.throws(() => ibetaDerivative(10, 0, 1), /^Error: The argument b.+\(got b=0\)\.$/);
    });

    it('throws for x outside of [0,1]', () => {
      assert.throws(() => ibetaDerivative(1, 10, -0.5), /^Error: Parameter x.+\(got x=-0.5\)\.$/);
      assert.throws(() => ibetaDerivative(1, 10, 22), /^Error: Parameter x.+\(got x=22\)\.$/);
    });

    it('throws for x === 0 when a < 1', () => {
      assert.throws(() => ibetaDerivative(0.5, 10, 0), /^Error: An x value of 0.+\(got a=0.5\)\.$/);
    });

    it('throws for x === 1 when b < 1', () => {
      assert.throws(() => ibetaDerivative(1, 0.5, 1), /^Error: An x value of 1.+\(got b=0.5\)\.$/);
    });
  });

  describe('exact endpoints', () => {
    it('x === 0', () => {
      assert.strictEqual(ibetaDerivative(10, 10, 0), 0);
      assert.strictEqual(ibetaDerivative(1, 10, 0), 1);
    });

    it('x === 1', () => {
      assert.strictEqual(ibetaDerivative(10, 10, 1), 0);
      assert.strictEqual(ibetaDerivative(10, 1, 1), 1);
    });
  });

  describe('general function coverage', () => {
    it('symmetry looks good', () => {
      const val1 = ibetaDerivative(2, 10, 0.1);
      const val2 = ibetaDerivative(10, 2, 0.9);
      assertAlmostEqual(val1, val2);
    });

    // The following is generated to get general coverage of the many branches
    // of the port. Expected values are from the `c++/ibeta-derivative-check`
    // utility, which uses the native Boost `ibeta_derivative` function.

    /** @type {Array<{params: [number, number, number], expected: number}>} */
    const tests = [
      {params: [2, 8, 0.1], expected: 3.4437376799999995},
      {params: [2, 8, 0.2], expected: 3.01989888},
      {params: [2, 8, 0.3], expected: 1.7788528800000005},
      {params: [2, 8, 0.4], expected: 0.80621567999999977},
      {params: [2, 8, 0.5], expected: 0.28124999999999983},
      {params: [30000, 70000, 0.26997], expected: 1.9126639275615129e-95},
      {params: [40000, 60000, 0.39998], expected: 257.49828822828169},
      {params: [450, 50, 0.79], expected: 6.933693650179127e-09},
      {params: [450, 50, 0.9], expected: 29.685335135225831},
      {params: [450, 50, 0.98], expected: 6.7395824623616758e-17},
      {params: [14, 6, 0.5], expected: 0.62100219726562622},
      {params: [10, 40, 0.36], expected: 0.23040836954356425},
      {params: [40, 10, 0.36], expected: 7.3480830167800774e-09},
      {params: [160, 640, 0.36], expected: 1.2971421231764629e-20},
      {params: [792, 88, 0.7125], expected: 1.7543382832555953e-39},

      // These are incredibly small values, but hit the very tiny "tricky" and general cases.
      {params: [59999940, 60, 0.99998455], expected: 1.2593117383009658e-300},
      {params: [500, 9500, 0.0051], expected: 1.1594807717964733e-302},
      {params: [400, 1600, 0.015], expected: 1.8296058039085163e-303},
      {params: [190, 10, 0.02], expected: 1.3952860115869907e-304},
    ];

    for (const test of tests) {
      const actual = ibetaDerivative(...test.params);
      const ulpsDiff = ulpsDifference(actual, test.expected);

      it(`ibetaDerivative(${test.params.join(', ')}) - ${ulpsDiff} ulps`, () => {
        assertAlmostEqual(actual, test.expected);
      });
    }
  });

  describe('imported boost ibeta_derivative tests', () => {
    /**
     * @param {Array<[number, number, number, number]>} tests
     * @param {{maxAbsDiff?: number, maxUlpsDiff?: number}} assertionOptions
     */
    function runImportedTests(tests, assertionOptions) {
      for (const [a, b, x, expected] of tests) {
        const actual = ibetaDerivative(a, b, x);

        assertAlmostEqual(actual, expected,
            {...assertionOptions, message: `ibetaDerivative(${a}, ${b}, ${x})`});
      }
    }

    // Since these are tested against the values calculated with very high
    // precision, loosen `maxAbsDiff` error bounds per suite.
    const suites = {
      ibeta_derivative_data: {
        tests: idData,
        options: {maxAbsDiff: 1.9e-14},
      },
      ibeta_derivative_int_data: {
        tests: idIntData,
        options: {maxAbsDiff: 1.34e-14},
      },
      ibeta_derivative_large_data: {
        tests: idLargeData,
        options: {maxAbsDiff: 1.8e-14},
      },
      ibeta_derivative_small_data: {
        tests: idSmallData,
        options: {maxAbsDiff: 4e-15},
      },
    };
    for (const [suiteId, {tests, options}] of Object.entries(suites)) {
      it(`passes ${tests.length} ${suiteId} tests`, () => {
        runImportedTests(tests, options);
      });
    }
  });
});
