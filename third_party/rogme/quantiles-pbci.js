// Copyright (c) <2016-2018> <Guillaume Rousselet, Rand Wilcox>
// Copyright 2020 Google LLC
// MIT License

// Modified and ported from https://github.com/GRousselet/rogme/blob/6582a8af4269be3773f111b57ce787892884b912/R/stats.R

import xorshift from 'xorshift';

import {getHarrellDavisDecileWeights} from '../../js/estimators/harrell-davis-estimator-weights.js';

const MAX_32_UINT = Math.pow(2, 32) - 1;

/** @typedef {{q: number, difference: number, ciLower: number, ciUpper: number}} DifferenceQuantile */

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
 * `nboot` is the number of bootstrap samples to take. Rogme uses 2000 by default.
 * `randomSeed` can be provided to deterministically sample during
 * bootstrapping. Otherwise, a random seed is chosen on every run.
 * Currently works exclusively with deciles and alpha = 0.05 so that only 95%
 * confidence intervals can be computed.
 * The same bootstrap samples are used for each decile.
 * NOTE: confidence intervals are *not* corrected for mulitple comparisons.
 * @param {{compare: Array<number>, base: Array<number>}} data
 * @param {{nboot: number, quiet?: boolean, randomSeed?: [number, number, number, number]}} options
 * @return {Promise<Array<DifferenceQuantile>>}
 */
async function quantilesPbci({compare, base}, {nboot, quiet, randomSeed}) {
  if (compare.length !== base.length) {
    throw new Error('dependent `base` and `compare` must have the same length');
  }
  const length = compare.length;
  if (!quiet) {
    /* c8 ignore next 2 */
    console.warn(`calculating difference quantiles and CIs on length ${length.toLocaleString()}`);
  }

  const differences = new Float64Array(base.length);
  for (let i = 0; i < differences.length; i++) {
    differences[i] = compare[i] - base[i];
  }

  // Harrell-Davis weights don't change for a given length and decile, so can
  // pregenerate them. Indexed 0-8 for 10th through 90th deciles.
  const hdWeightsByDecile = getHarrellDavisDecileWeights(length);

  const rng = randomSeed ? new xorshift.constructor(randomSeed) : xorshift;
  const confidenceIntervalsByDecile = await bootstrapConfidenceIntervalPerQuantile(differences,
      hdWeightsByDecile, nboot, rng, quiet);

  differences.sort((a, b) => a - b);

  // TODO(bckenny): Appears to be actual percentile bootstrap according to https://stats.stackexchange.com/a/357498
  // compare against se CIs (like shiftdhd) to see relative usefulness.
  const results = [];
  for (let decile = 1; decile < 10; decile++) {
    const weights = hdWeightsByDecile[decile - 1];
    let difference = 0;
    for (let i = 0; i < length; i++) {
      difference += weights[i] * differences[i];
    }

    const confidenceInterval = confidenceIntervalsByDecile[decile - 1];
    results.push({
      q: decile / 10,
      difference,
      ciLower: confidenceInterval.low,
      ciUpper: confidenceInterval.up,
    });
  }

  return results;
}

/**
 * Take `nboot` bootstrap samples per quantile and take CI bounds directly from
 * the resulting distributions.
 * Currently works exclusively with alpha = 0.05 so that only 95% confidence
 * intervals can be computed.
 * @param {Float64Array} data
 * @param {Array<Float64Array>} hdWeightsByQuantile
 * @param {number} nboot
 * @param {xorshift} rng
 * @param {boolean} [quiet]
 * @return {Promise<Array<{low: number, up: number}>>}
 */
async function bootstrapConfidenceIntervalPerQuantile(data, hdWeightsByQuantile, nboot, rng,
    quiet) {
  const numberOfQuantiles = hdWeightsByQuantile.length;
  const bootstrapResultsPool = new ArrayBuffer(numberOfQuantiles * nboot *
      Float64Array.BYTES_PER_ELEMENT);

  const bootstrapResultsByQuantile = [];
  for (let i = 0; i < numberOfQuantiles; i++) {
    const byteOffset = i * nboot * Float64Array.BYTES_PER_ELEMENT;
    bootstrapResultsByQuantile.push(new Float64Array(bootstrapResultsPool, byteOffset, nboot));
  }

  const resampledData = new Float64Array(data.length);

  for (let i = 0; i < nboot; i++) {
    if (!quiet && i % 100 === 0 && i > 0) {
      /* c8 ignore next 2 */
      console.warn(`bootstrap iteration ${i}/${nboot}`);
    }

    // Resample `data` with replacement. `resampledData` data is used for all quantiles in this
    // bootstrap iteration.
    for (let j = 0; j < data.length; j++) {
      const index = getRandomInt(rng, data.length);
      resampledData[j] = data[index];
    }

    // This sorting is where most execution time occurs for large data sets.
    resampledData.sort();

    // Estimate the value of each quantile.
    for (let quantileIndex = 0; quantileIndex < numberOfQuantiles; quantileIndex++) {
      const weights = hdWeightsByQuantile[quantileIndex];
      let value = 0;
      for (let j = 0; j < resampledData.length; j++) {
        value += weights[j] * resampledData[j];
      }

      const bootstrapResultsForQuantile = bootstrapResultsByQuantile[quantileIndex];
      bootstrapResultsForQuantile[i] = value;
    }
  }

  // Return the 95th percentile CI values.
  const alpha = 0.05;
  const lowIndex = Math.round(alpha / 2 * nboot);
  const upIndex = nboot - lowIndex - 1;
  return bootstrapResultsByQuantile.map(bootstrapResults => {
    bootstrapResults.sort();
    return {
      low: bootstrapResults[lowIndex],
      up: bootstrapResults[upIndex],
    };
  });
}

export {
  quantilesPbci,
};
