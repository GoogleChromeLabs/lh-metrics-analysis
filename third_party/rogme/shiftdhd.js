// Copyright (c) <2016-2018> <Guillaume Rousselet, Rand Wilcox>
// Copyright 2020 Google LLC
// MIT License

// Modified and ported from https://github.com/GRousselet/rogme/blob/6582a8af4269be3773f111b57ce787892884b912/R/shift_function_calc.R

import xorshift from 'xorshift';

import {getHarrellDavisDecileWeights} from '../../js/estimators/harrell-davis-estimator-weights.js';
import {RunningVariance} from '../../js/estimators/running-variance.js';

const MAX_32_UINT = Math.pow(2, 32) - 1;

/** @typedef {{q: number, compare: number, base: number, difference: number, ciLower: number, ciUpper: number}} ShiftQuantile */

/**
 * Returns an unbiased value from a uniform distribution of integers in
 * [0, max).
 * @param {xorshift} rng
 * @param {number} max
 * @return {number}
 */
function getRandomInt(rng, max) {
  // Discard values outside range that will modulo evenly into max.
  // A second iteration is almost never taken.
  const modLimit = MAX_32_UINT - (MAX_32_UINT % max);
  for (;;) {
    const ints = rng.randomint();
    if (ints[0] < modLimit) return ints[0] % max;
    if (ints[1] < modLimit) return ints[1] % max;
  }
}

/**
 * `nboot` is the number of bootstrap samples to take. According to Wilcox,
 * 200 is usually sufficient for `shiftdhd`.
 * `randomSeed` can be provided to deterministically sample during
 * bootstrapping. Otherwise, a random seed is chosen on every run.
 * @param {{compare: Array<number>, base: Array<number>}} data
 * @param {{nboot: number, quiet?: boolean, randomSeed?: [number, number, number, number]}} options
 * @return {Promise<Array<ShiftQuantile>>}
 */
async function shiftdhd({compare: compareInput, base: baseInput}, {nboot, quiet, randomSeed}) {
  if (compareInput.length !== baseInput.length) {
    throw new Error('dependent `base` and `compare` must have the same length');
  }
  const length = compareInput.length;
  if (!quiet) {
    /* c8 ignore next 2 */
    console.warn(`calculating dependent shift function on length ${length.toLocaleString()}`);
  }

  // Copy so that we're not modifying the originals.
  const compare = Float64Array.from(compareInput);
  const base = Float64Array.from(baseInput);

  // Harrell-Davis weights don't change for a given length and decile, so can
  // pregenerate them. Indexed 0-8 for 10th through 90th deciles.
  const hdWeightsByDecile = getHarrellDavisDecileWeights(length);

  // factor to correct for multiple comparisons
  const crit = 37 / Math.pow(length, 1.4) + 2.75;

  const rng = randomSeed ? new xorshift.constructor(randomSeed) : xorshift;
  const standardErrors = await bootstrapDependentDiffStdDevPerQuantile(compare, base,
      hdWeightsByDecile, nboot, rng, quiet);

  compare.sort((a, b) => a - b);
  base.sort((a, b) => a - b);

  const results = [];
  for (let decile = 1; decile < 10; decile++) {
    const weights = hdWeightsByDecile[decile - 1];
    let compareAtDecile = 0;
    let baseAtDecile = 0;
    // better to invert these loops so shared weights[i] across deciles
    for (let i = 0; i < length; i++) {
      compareAtDecile += weights[i] * compare[i];
      baseAtDecile += weights[i] * base[i];
    }

    const se = standardErrors[decile - 1];
    const difference = compareAtDecile - baseAtDecile;

    results.push({
      q: decile / 10,
      compare: compareAtDecile,
      base: baseAtDecile,
      difference,
      ciLower: difference - crit * se, // difference - corrected SE
      ciUpper: difference + crit * se, // difference + corrected SE
    });
  }

  return results;
}

/**
 * @param {Float64Array} compare
 * @param {Float64Array} base
 * @param {Array<Float64Array>} hdWeightsByQuantile
 * @param {number} nboot
 * @param {xorshift} rng
 * @param {boolean} [quiet]
 * @return {Promise<Array<number>>}
 */
async function bootstrapDependentDiffStdDevPerQuantile(compare, base, hdWeightsByQuantile,
    nboot, rng, quiet) {
  const numberOfQuantiles = hdWeightsByQuantile.length;
  const variancesByQuantile = [];
  for (let i = 0; i < numberOfQuantiles; i++) {
    variancesByQuantile.push(new RunningVariance());
  }

  const length = compare.length;
  const resampledCompare = new Float64Array(length);
  const resampledBase = new Float64Array(length);

  for (let i = 0; i < nboot; i++) {
    if (!quiet && i % 25 === 0 && i > 0) {
      /* c8 ignore next 2 */
      console.warn(`bootstrap iteration ${i}/${nboot}`);
    }

    // Resample originals with replacement, sampling `base` and `compare`
    // simultaneously so pairing is preserved. This resampled data is used for
    // all quantiles in this bootstrap iteration.
    for (let j = 0; j < length; j++) {
      const index = getRandomInt(rng, length);
      resampledCompare[j] = compare[index];
      resampledBase[j] = base[index];
    }

    // This sorting is where most execution time occurs for large data sets.
    resampledCompare.sort();
    resampledBase.sort();

    // For each quantile: estimate that quantile of compare and base, then take the difference.
    // i.e. `weights_q·c - weights_q·base`
    for (let quantileIndex = 0; quantileIndex < numberOfQuantiles; quantileIndex++) {
      const weights = hdWeightsByQuantile[quantileIndex];
      let diffAtQuantile = 0;
      for (let j = 0; j < length; j++) {
        diffAtQuantile += weights[j] * (resampledCompare[j] - resampledBase[j]);
      }

      const runningVarianceForQuantile = variancesByQuantile[quantileIndex];
      runningVarianceForQuantile.push(diffAtQuantile);
    }
  }

  // Return the stddev of the nboot estimates for the difference of each quantile.
  return variancesByQuantile.map(vbq => vbq.getStdDev());
}

export {
  shiftdhd,
};
