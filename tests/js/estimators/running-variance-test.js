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

import {RunningVariance} from '../../../js/estimators/running-variance.js';

describe('Running Variance', () => {
  it('initializes to zero', () => {
    const runningVariance = new RunningVariance();
    assert.strictEqual(runningVariance.getMean(), 0);
    assert.strictEqual(runningVariance.getVariance(), 0);
    assert.strictEqual(runningVariance.getStdDev(), 0);
  });

  it('returns a variance of zero until there are at least two values', () => {
    const runningVariance = new RunningVariance();
    assert.strictEqual(runningVariance.getVariance(), 0);

    // After single pushed value, non-zero mean, but still zero variance.
    runningVariance.push(2);
    assert.strictEqual(runningVariance.getMean(), 2);
    assert.strictEqual(runningVariance.getVariance(), 0);
    assert.strictEqual(runningVariance.getStdDev(), 0);

    runningVariance.push(4);
    assert.strictEqual(runningVariance.getMean(), 3);
    assert.strictEqual(runningVariance.getVariance(), 2);
    assertAlmostEqual(runningVariance.getStdDev(), Math.sqrt(2));
  });

  it('tracks the running mean and variance of a sequence of values', () => {
    /** @type {Array<{value: number, mean: number, variance: number, stdDev: number}>} */
    const sequence = [
      {value: 2, mean: 2, variance: 0, stdDev: 0},
      {value: 3, mean: 2.5, variance: 0.5, stdDev: Math.sqrt(0.5)},
      {value: 5, mean: 10 / 3, variance: 7 / 3, stdDev: Math.sqrt(7 / 3)},
      {value: 7, mean: 17 / 4, variance: 59 / 12, stdDev: Math.sqrt(59 / 12)},
      {value: 11, mean: 28 / 5, variance: 64 / 5, stdDev: Math.sqrt(64 / 5)},
      {value: 13, mean: 41 / 6, variance: 581 / 30, stdDev: Math.sqrt(581 / 30)},
      {value: 17, mean: 58 / 7, variance: 649 / 21, stdDev: Math.sqrt(649 / 21)},
    ];

    const runningVariance = new RunningVariance();
    for (const entry of sequence) {
      runningVariance.push(entry.value);
      assertAlmostEqual(runningVariance.getMean(), entry.mean,
          {message: `means not equal after value ${entry.value}`});
      assertAlmostEqual(runningVariance.getVariance(), entry.variance,
          {message: `variance not equal after value ${entry.value}`});
      assertAlmostEqual(runningVariance.getStdDev(), entry.stdDev,
          {message: `stdDev not equal after value ${entry.value}`});
    }
  });
});
