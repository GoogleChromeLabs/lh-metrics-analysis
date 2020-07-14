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
 * @fileoverview
 * Calculate the weights for the Harrell-Davis quantile estimator, defined for
 * an array `v` of length `l` and quantile `q`:
 *   v[i] = I_x1(a, b) - I_x0(a, b)
 * where
 *   x0 = i / l
 *   x1 = (i + 1) / l
 *   a = l * q
 *   b = l * (1 - q)
 *   and I_x() is the regularized beta function.
 *
 * Evaluation of the integral can be expensive, numerically tricky to get right,
 * and longer arrays make I_x1 and I_x0 very close in value, increasing the risk
 * of catastrophic cancellation. As the array gets longer and each interval
 * shrinks, however, numerical integration becomes simpler and more accurate.
 *
 * These methods take that approach, using a JS port of Boost's
 * `ibeta_derivative` (considerably simpler to port than `ibeta`) and using
 * Gaussian-Legendre quadrature to approximate the integral. The number of
 * quadrature sample points decreases as array length increases.
 *
 * @see Harrell, F., & Davis, C. (1982). A New Distribution-Free Quantile Estimator. Biometrika, 69(3), 635-640. doi:10.2307/2335999
 */

import {ibetaDerivative} from '../../third_party/boost/math/special-functions.js';
import {minLookupLength, minLookupDecile, lookupTableWeights} from
  './harrell-davis-lookup-table.js';

/**
 * Calculate the weights for the Harrell-Davis quantile estimator. Uses a
 * different number of quadrature samples based on the requested array length,
 * attempting to keep better than 14-decimal-digit worst-case accuracy until
 * somewhere around a length of 100k, when other numeric issues start to arise.
 * Verified accurate to greater than 13 decimal digits in the worst case out to
 * a length of 7m (99.99th percentile error is < 1e-16).
 * @param {number} length
 * @return {Array<Float64Array>}
 */
function getHarrellDavisDecileWeights(length) {
  // Doing this with Float64Array only saves like 3% of execution time, but
  // helpful regardless if we use workers.
  // TODO(bckenny): allocate single arraybuffer and use views?
  /** @type {Array<Float64Array>} */
  const weightsByDecile = [];

  // TODO(bckenny): maybe move function selection out of decile loop if no perf hit.
  // 10th, 20th, 30th, 40th, 50th percentiles.
  for (let decile = 1; decile <= 5; decile++) {
    let weights;

    // TODO(bckenny): get more aggressive with higher order methods. Doesn't
    // cost (relatively) much even when length gets pretty long.
    if (length < 30) {
      // Under 30 the subdivisions needed to get a decent approximation get
      // increasingly ridiculous (e.g. 3834 iterations of five-point for each
      // entry of length 27), so just use a lookup table. Values should be more
      // or less exact.
      weights = getLookupTableWeights(length, decile);
    } else if (length < 149) {
      if (length % 10 === 0) {
        // Through a numeric quirk, multiples of 10 need little subdividing.
        weights = getSubdividedGaussianFiveWeights(length, decile / 10, 3);
      } else {
        // Need to subdivide to achieve reasonable precision. This forumla for
        // subdivisions somewhat exceeds the subdivisions needed (especially for
        // length 31), but ensures a max error <1e-15.
        // TODO(bckenny): try 6- and 7-point approximations too.
        const subdivisions = Math.floor(10_810_000_000 / Math.pow(length - 11, 5.5) + 2.85);
        weights = getSubdividedGaussianFiveWeights(length, decile / 10, subdivisions);
      }
    } else if (length < 628) {
      // Five-point max error is <1e-15 starting at 149 until 628.
      weights = getGaussianFiveWeights(length, decile / 10);
    } else if (length < 4999) {
      // Four-point max error is <3e-15 until at least 4999, often <1e-15.
      // emerges to ~2e-15 at the same places as five-point, so it's fine.
      weights = getGaussianFourWeights(length, decile / 10);
    } else if (length < 200_000) {
      // Three-point max error is <5e15 until ~10k and relatively
      // indistinguishable from four-point starting at around 5k.
      weights = getGaussianThreeWeights(length, decile / 10);
    } else if (length < 7_000_000) {
      // Above ~200k, other errors start to dominate around the function peak
      // and all the Gaussian quadratures have about the same max error, ~5e-14,
      // so go with the two-point version. Still 3-6 orders-of-magnitude smaller
      // error than Trapezoid or a Riemann sum.
      weights = getGaussianTwoWeights(length, decile / 10);
    } else {
      throw new Error('Error bounds untested above a limit of 7m');
    }

    weightsByDecile.push(weights);
  }

  // I_x(a, b) === 1 - I_(1-x)(b, a), so these deciles are just their
  // complementary decile, reversed.
  for (let decile = 6; decile < 10; decile++) {
    const complementaryWeights = weightsByDecile[10 - decile - 1];
    const weights = new Float64Array(complementaryWeights).reverse();
    weightsByDecile.push(weights);
  }

  // TODO(bckenny): 0.5 decile is similarly symmetric if we want to save time there.

  return weightsByDecile;
}

/**
 * For small values of `length`, it's difficult to numerically integrate to
 * calculate the weights. Instead we keep a small lookup table.
 * Note that with small sample sizes the extreme quantiles should be treated
 * as very unreliable.
 * @param {number} length Integer in [6, 29].
 * @param {number} decile Integer in [1, 5].
 * @return {Float64Array}
 */
function getLookupTableWeights(length, decile) {
  if (length < minLookupLength) throw new Error(`Not supported with n < ${minLookupLength}`);
  const maxLookupLength = minLookupLength + lookupTableWeights.length - 1;
  if (length > maxLookupLength) throw new Error('Try a different method of approximation');

  if (!Number.isInteger(decile) || decile < minLookupDecile || decile > 5) {
    throw new Error('lookup table weights only supported for deciles');
  }

  return Float64Array.from(lookupTableWeights[length - minLookupLength][decile - minLookupDecile]);
}

/**
 * Use two-point Gaussian-Legendre quadrature to approximate the regularized
 * incomplete beta function integral from index to index + 1 for each entry in
 * an array of length `length`. Shape parameters are determined from the given
 * `quantile` as described for the Harrell-Davis estimator.
 * @param {number} length
 * @param {number} quantile
 * @return {Float64Array}
 */
function getGaussianTwoWeights(length, quantile) {
  const a = length * quantile;
  const b = length * (1 - quantile);

  // x* are sample points relative to baseX, and are (x+1)/2 compared to usual
  // point values. Weights are just 1 for two point, so no need for them here.
  const x0 = 0.211324865405187118 / length; // (-1 / sqrt(3) + 1) / 2
  const x1 = 0.7886751345948128823 / length; // (1 / sqrt(3) + 1) / 2

  const weights = new Float64Array(length);
  for (let i = 0; i < length; i++) {
    const baseX = i / length;
    const p0 = ibetaDerivative(a, b, baseX + x0);
    const p1 = ibetaDerivative(a, b, baseX + x1);

    weights[i] = (p0 + p1) / (2 * length);
  }

  return weights;
}

/**
 * Use three-point Gaussian-Legendre quadrature to approximate the regularized
 * incomplete beta function integral from index to index + 1 for each entry in
 * an array of length `length`. Shape parameters are determined from the given
 * `quantile` as described for the Harrell-Davis estimator.
 * @param {number} length
 * @param {number} quantile
 * @return {Float64Array}
 */
function getGaussianThreeWeights(length, quantile) {
  const a = length * quantile;
  const b = length * (1 - quantile);

  // x* are sample points relative to baseX. Note they are (x+1)/2 compared to
  // usual point values.
  const x0 = 0.112701665379258311482 / length; // (-sqrt(3/5) + 1) / 2
  const w0 = 5 / 9;
  const x1 = 0.5 / length; // (0 + 1) / 2
  const w1 = 8 / 9;
  const x2 = 0.88729833462074168852 / length; // (sqrt(3/5) + 1) / 2
  const w2 = 5 / 9;

  const weights = new Float64Array(length);
  for (let i = 0; i < length; i++) {
    const baseX = i / length;
    const p0 = ibetaDerivative(a, b, baseX + x0);
    const p1 = ibetaDerivative(a, b, baseX + x1);
    const p2 = ibetaDerivative(a, b, baseX + x2);

    weights[i] = (w0 * p0 + w1 * p1 + w2 * p2) / (2 * length);
  }

  return weights;
}

/**
 * Use four-point Gaussian-Legendre quadrature to approximate the regularized
 * incomplete beta function integral from index to index + 1 for each entry in
 * an array of length `length`. Shape parameters are determined from the given
 * `quantile` as described for the Harrell-Davis estimator.
 * @param {number} length
 * @param {number} quantile
 * @return {Float64Array}
 */
function getGaussianFourWeights(length, quantile) {
  const a = length * quantile;
  const b = length * (1 - quantile);

  // x* are sample points relative to baseX. Note they are (x+1)/2 compared to
  // usual point values.
  const x0 = 0.0694318442029737124 / length; // (-sqrt(3/7 + 2/7sqrt(6/5)) + 1) / 2
  const w0 = 0.3478548451374538574; // (18 - sqrt(30)) / 36
  const x1 = 0.3300094782075718676 / length; // (-sqrt(3/7 - 2/7sqrt(6/5)) + 1) / 2
  const w1 = 0.652145154862546143; // (18 + sqrt(30)) / 36
  const x2 = 0.6699905217924281324 / length; // (sqrt(3/7 - 2/7sqrt(6/5)) + 1) / 2
  const w2 = 0.652145154862546143; // (18 + sqrt(30)) / 36
  const x3 = 0.9305681557970262876 / length; // (sqrt(3/7 + 2/7sqrt(6/5)) + 1) / 2
  const w3 = 0.3478548451374538574; // (18 - sqrt(30)) / 36

  const weights = new Float64Array(length);
  for (let i = 0; i < length; i++) {
    const baseX = i / length;
    const p0 = ibetaDerivative(a, b, baseX + x0);
    const p1 = ibetaDerivative(a, b, baseX + x1);
    const p2 = ibetaDerivative(a, b, baseX + x2);
    const p3 = ibetaDerivative(a, b, baseX + x3);

    weights[i] = (w0 * p0 + w1 * p1 + w2 * p2 + w3 * p3) / (2 * length);
  }

  return weights;
}

/**
 * Use five-point Gaussian-Legendre quadrature to approximate the regularized
 * incomplete beta function integral from index to index + 1 for each entry in
 * an array of length `length`. Shape parameters are determined from the given
 * `quantile` as described for the Harrell-Davis estimator.
 * @param {number} length
 * @param {number} quantile
 * @return {Float64Array}
 */
function getGaussianFiveWeights(length, quantile) {
  const a = length * quantile;
  const b = length * (1 - quantile);

  // x* are sample points relative to baseX. Note they are (x+1)/2 compared to
  // usual point values to correct for the interval.
  const x0 = 0.0469100770306680036 / length; // (-1/3 sqrt(5 + 2 sqrt(10/7)) + 1) / 2
  const w0 = 0.2369268850561890875; // (322 - 13 sqrt(70)) / 900
  const x1 = 0.2307653449471584545 / length; // (-1/3 sqrt(5 - 2 sqrt(10/7)) + 1) / 2
  const w1 = 0.47862867049936646804; // (322 + 13 sqrt(70)) / 900

  const x2 = 0.5 / length; // (0 + 1) / 2
  const w2 = 128 / 225; // (18 + sqrt(30)) / 36

  const x3 = 0.7692346550528415455 / length; // (1/3 sqrt(5 - 2 sqrt(10/7)) + 1) / 2
  const w3 = 0.47862867049936646804; // (322 + 13 sqrt(70)) / 900
  const x4 = 0.9530899229693319964 / length; // (1/3 sqrt(5 + 2 sqrt(10/7)) + 1) / 2
  const w4 = 0.2369268850561890875; // (322 - 13 sqrt(70)) / 900

  const weights = new Float64Array(length);
  for (let i = 0; i < length; i++) {
    const baseX = i / length;
    const p0 = ibetaDerivative(a, b, baseX + x0);
    const p1 = ibetaDerivative(a, b, baseX + x1);
    const p2 = ibetaDerivative(a, b, baseX + x2);
    const p3 = ibetaDerivative(a, b, baseX + x3);
    const p4 = ibetaDerivative(a, b, baseX + x4);

    weights[i] = (w0 * p0 + w1 * p1 + w2 * p2 + w3 * p3 + w4 * p4) / (2 * length);
  }

  return weights;
}

/**
 * Same as `getGaussianFiveWeights`, but subdivides each array entry, runs the
 * five-point Gaussian-Legendre quadrature on each subdivision, then sums the
 * results.
 * @param {number} length
 * @param {number} quantile
 * @param {number} subdivisions
 * @return {Float64Array}
 */
function getSubdividedGaussianFiveWeights(length, quantile, subdivisions) {
  const a = length * quantile;
  const b = length * (1 - quantile);

  // x* are sample points relative to baseX. Note they are (x+1)/2 compared to
  // usual point values.
  const x0 = 0.0469100770306680036 / (length * subdivisions); // (-1/3 sqrt(5 + 2 sqrt(10/7)) + 1) / 2
  const w0 = 0.2369268850561890875; // (322 - 13 sqrt(70)) / 900
  const x1 = 0.2307653449471584545 / (length * subdivisions); // (-1/3 sqrt(5 - 2 sqrt(10/7)) + 1) / 2
  const w1 = 0.47862867049936646804; // (322 + 13 sqrt(70)) / 900

  const x2 = 0.5 / (length * subdivisions); // (0 + 1) / 2
  const w2 = 128 / 225; // (18 + sqrt(30)) / 36

  const x3 = 0.7692346550528415455 / (length * subdivisions); // (1/3 sqrt(5 - 2 sqrt(10/7)) + 1) / 2
  const w3 = 0.47862867049936646804; // (322 + 13 sqrt(70)) / 900
  const x4 = 0.9530899229693319964 / (length * subdivisions); // (1/3 sqrt(5 + 2 sqrt(10/7)) + 1) / 2
  const w4 = 0.2369268850561890875; // (322 - 13 sqrt(70)) / 900

  const weights = new Float64Array(length);
  for (let i = 0; i < length; i++) {
    let total = 0;
    for (let j = 0; j < subdivisions; j++) {
      const baseX = (i + j / subdivisions) / length;
      const p0 = ibetaDerivative(a, b, baseX + x0);
      const p1 = ibetaDerivative(a, b, baseX + x1);
      const p2 = ibetaDerivative(a, b, baseX + x2);
      const p3 = ibetaDerivative(a, b, baseX + x3);
      const p4 = ibetaDerivative(a, b, baseX + x4);
      total += (w0 * p0 + w1 * p1 + w2 * p2 + w3 * p3 + w4 * p4) / (2 * length * subdivisions);
    }

    weights[i] = total;
  }

  return weights;
}

export {
  getHarrellDavisDecileWeights,
};
