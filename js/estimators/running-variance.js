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

/**
 * Class for online computation of mean, variance, and standard deviation
 * without storing all values.
 * @see https://www.johndcook.com/blog/standard_deviation/
 * @see Knuth TAOCP vol 2, 3rd edition, page 232.
 */
class RunningVariance {
  n = 0;
  runningMean = 0;
  runningSum = 0;

  /**
   * Add a value to the sample.
   * @param {number} x
   */
  push(x) {
    this.n++;

    const newMean = this.runningMean + (x - this.runningMean) / this.n;
    const newSum = this.runningSum + (x - this.runningMean) * (x - newMean);

    this.runningMean = newMean;
    this.runningSum = newSum;
  }

  /**
   * Get the current sample mean.
   * @return {number}
   */
  getMean() {
    return this.runningMean;
  }

  /**
   * Get the current sample variance.
   * @return {number}
   */
  getVariance() {
    if (this.n < 2) {
      return 0;
    }

    return this.runningSum / (this.n - 1);
  }

  /**
   * Get the current sample standard deviation.
   * @return {number}
   */
  getStdDev() {
    return Math.sqrt(this.getVariance());
  }
}

export {
  RunningVariance,
};
