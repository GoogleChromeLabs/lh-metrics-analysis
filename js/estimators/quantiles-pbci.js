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

import fs from 'fs';
import path from 'path';
import {performance} from 'perf_hooks';

import commander from 'commander';
import esMain from 'es-main';

import {getFileHash} from '../file-hash.js';
import {quantilesPbci} from '../../third_party/rogme/quantiles-pbci.js';
import {PROJECT_ROOT} from '../module-utils.js';
import {CsvParser} from '../csv-parser.js';

/** @typedef {import('../../third_party/rogme/quantiles-pbci.js').DifferenceQuantile} DifferenceQuantile */

/**
 * chosen by fair xorshift roll.
 * guaranteed to be random.
 * @type {[number, number, number, number]}
 */
const XORSHIFT_SEED = [279246388, 907043963, 264839830, 1624453601];

/**
 * Default number of bootstrap iterations.
 */
const DEFAULT_NBOOT = 2000;

// TODO(bckenny): dedupe with shift-function.js.
/**
 * Constructs an APA-style string of the confidence interval for printing.
 * @param {number} value
 * @param {number} ciLow
 * @param {number} ciHigh
 * @param {string=} unit The units to print after `value`. Defaults to no unit.
 * @param {number=} digits The number of digits to appear after the decimal point. Default 1.
 */
function ciToApaString(value, ciLow, ciHigh, unit = '', digits = 1) {
  const valueStr = value.toLocaleString(undefined, {
    maximumFractionDigits: digits,
    // @ts-expect-error - Always show ± sign, except when zero. Option not yet in d.ts.
    signDisplay: 'exceptZero',
  });

  // toLocaleString will happily round to and print '-0', which is not really
  // what you want to pretty print. Working around that is awkward.
  let ciLowStr = ciLow.toLocaleString(undefined, {maximumFractionDigits: digits});
  ciLowStr = ciLowStr === '-0' ? '0' : ciLowStr;
  let ciHighStr = ciHigh.toLocaleString(undefined, {maximumFractionDigits: digits});
  ciHighStr = ciHighStr === '-0' ? '0' : ciHighStr;

  return `${valueStr}${unit} _(95% CI [${ciLowStr}, ${ciHighStr}])_`;
}

/**
 * Pretty-print the quantile data. Compatible with markdown tables.
 * @param {Array<DifferenceQuantile>} dataByQuantile
 * @param {{digits?: number, unit?: string, multiplier?: number}} [options]
 * @return {string}
 */
function getPrettyPrintedQuatileData(dataByQuantile, options = {}) {
  const {
    digits = 1,
    unit = '',
    multiplier = 1,
  } = options;

  let str = `| deciles | change |\n` +
      '| --- | --- |\n';

  for (const data of dataByQuantile) {
    const quantile = 'p' + Math.round(data.q * 10) + '0';

    const difference = data.difference * multiplier;
    const ciLower = data.ciLower * multiplier;
    const ciUpper = data.ciUpper * multiplier;
    const ciString = ciToApaString(difference, ciLower, ciUpper, unit, digits);

    str += `| ${quantile} | ${ciString} |\n`;
  }

  return str;
}

/**
 * Prints the quantile data as csv to a string, in a format consumable by R.
 * @param {Array<DifferenceQuantile>} dataByQuantile
 * @return {string}
 */
function getCsvPrintedQuantileData(dataByQuantile) {
  let str = 'q,difference,ciLower,ciUpper\n';

  for (const d of dataByQuantile) {
    str += `${d.q},${d.difference},${d.ciLower},${d.ciUpper}\n`;
  }

  return str;
}

/**
 * Returns a cache filepath for the given input path. Includes a hash of the
 * input file and quantile options in case the file's contents or options used
 * change over time.
 * @param {string} absolutePath
 * @param {{nboot: number, randomSeed: [number, number, number, number]}} quantileOptions
 * @return {Promise<string>}
 */
async function getResultsCachePath(absolutePath, {nboot, randomSeed}) {
  const hashAddendum = [nboot, ...randomSeed].join(',');
  const fileHash = await getFileHash(absolutePath, hashAddendum);
  const fileDirname = path.dirname(absolutePath);

  const fileBasename = path.basename(absolutePath);
  const basenameDates = /\d{4}-\d{2}-to-\d{4}-\d{2}/.exec(fileBasename);
  const outDates = basenameDates ? `-${basenameDates}` : '';

  return path.resolve(fileDirname, `quantiles-pbci${outDates}.${fileHash}.csv`);
}

// TODO(bckenny): move to CsvParser (and generalize).
/**
 * @param {string} text
 * @return {{base: Array<number>, compare: Array<number>}}
 */
function getCsvColumns(text) {
  const tokenizer = new CsvParser(text);

  const col1Token = tokenizer.getToken();
  if (col1Token !== 'base') {
    throw new Error(`First column must be named 'base' ('${col1Token}' found)`);
  }
  const col2Token = tokenizer.getToken();
  if (col2Token !== 'compare') {
    throw new Error(`Second column must be named 'compare' ('${col2Token}' found)`);
  }

  if (!tokenizer.eol) {
    throw new Error(`CSV must have only 'base' and 'compare' columns`);
  }

  const base = [];
  const compare = [];

  while (!tokenizer.eof) {
    const col1Token = tokenizer.getToken();
    if (col1Token.length === 0) {
      throw new Error(`missing 'base' value`);
    }
    const col1Value = Number(col1Token);
    if (!Number.isFinite(col1Value)) {
      throw new Error(`bad 'base' value '${col1Token}'`);
    }
    base.push(col1Value);

    if (tokenizer.eol) {
      throw new Error('line shorter than two columns');
    }

    const col2Token = tokenizer.getToken();
    if (col2Token.length === 0) {
      throw new Error(`missing 'compare' value`);
    }
    const col2Value = Number(col2Token);
    if (!Number.isFinite(col2Value)) {
      throw new Error(`bad 'compare' value '${col2Token}'`);
    }
    compare.push(col2Value);

    if (!tokenizer.eol) {
      throw new Error('line longer than two columns');
    }
  }

  return {base, compare};
}

/**
 * Calculate the quantiles for the given file and return as a csv string.
 * @param {string} absolutePath
 * @param {{nboot: number, quiet: boolean, randomSeed?: [number, number, number, number]}} quantileOptions
 * @return {Promise<Array<DifferenceQuantile>>}
 */
async function calculateQuantiles(absolutePath, quantileOptions) {
  const csvStartTime = performance.now();
  const inputFile = await fs.promises.readFile(absolutePath, 'utf-8');
  const columns = getCsvColumns(inputFile);
  const csvEndTime = performance.now();

  const quantilesStartTime = performance.now();
  const quantiles = await quantilesPbci(columns, quantileOptions);
  const quantilesEndTime = performance.now();

  if (!quantileOptions.quiet) {
    /* c8 ignore next 5 */
    console.warn(getPrettyPrintedQuatileData(quantiles));

    console.warn(`csv time: ${(csvEndTime - csvStartTime).toLocaleString()}ms`);
    console.warn(`quantiles time: ${(quantilesEndTime - quantilesStartTime).toLocaleString()}ms`);
  }

  return quantiles;
}

/**
 * Resolve the given path relative to cwd or the project root.
 * @param {unknown} relativePath
 * @return {string}
 */
function resolvePath(relativePath) {
  if (typeof relativePath !== 'string') {
    throw new Error(`supplied path '${relativePath}' must be a string`);
  }

  if (path.extname(relativePath) !== '.csv') {
    throw new Error(`file '${relativePath}' doesn't appear to be a csv file`);
  }

  const cwdPath = path.resolve(process.cwd(), relativePath);
  if (fs.existsSync(cwdPath)) {
    return cwdPath;
  }

  const rootPath = path.resolve(PROJECT_ROOT, relativePath);
  if (fs.existsSync(rootPath)) {
    return rootPath;
  }

  const errorString =
    `Unable to locate '${relativePath}'.\n` +
    `  Tried to load from these locations:\n` +
    `    ${cwdPath}\n` +
    `    ${rootPath}`;
  throw new Error(errorString);
}

/**
 * Parse the nboot CLI flag.
 * @param {unknown} nbootFlag
 * @return {number}
 */
function parseNboot(nbootFlag) {
  if (nbootFlag === undefined || nbootFlag === '') {
    return DEFAULT_NBOOT;
  }

  if (typeof nbootFlag !== 'number' && typeof nbootFlag !== 'string') {
    throw new Error(`invalid nboot value ('${nbootFlag}')`);
  }

  const nboot = Number(nbootFlag);

  if (!Number.isInteger(nboot) || nboot < 1) {
    throw new Error(`nboot value ('${nbootFlag}') is not a positive integer`);
  }

  return nboot;
}

/**
 * @param {string} inputPath
 * @param {{nboot?: number | string, useRandomSeed?: boolean, quiet?: boolean}} [options]
 * @return {Promise<Array<DifferenceQuantile>>}
 */
async function getQuantileDeciles(inputPath,
    {nboot: inputNboot, useRandomSeed: inputUseRandomSeed, quiet: inputQuiet} = {}) {
  // We don't trust input (due to CLI args really being `any`), so treat them as
  // `unknown`. Types are left on params for type checking of programmatic calls.
  const filePath = resolvePath(inputPath);
  const useRandomSeed = !!inputUseRandomSeed;
  const nboot = parseNboot(inputNboot);
  const quiet = !!inputQuiet;

  // If using a random seed, no point in caching. Just run and go.
  if (useRandomSeed) {
    if (!quiet) {
      /* c8 ignore next 2 */
      console.warn('Using a random seed for sampling; forgoing cache...');
    }
    return calculateQuantiles(filePath, {nboot, quiet});
  }

  // With a fixed seed, can use a cached result if available.
  const quantileOptions = {
    nboot,
    randomSeed: XORSHIFT_SEED,
    quiet,
  };
  const cachePath = await getResultsCachePath(filePath, quantileOptions);

  if (fs.existsSync(cachePath)) {
    if (!quiet) {
      /* c8 ignore next 3 */
      const relativePath = path.resolve(PROJECT_ROOT, cachePath);
      console.warn(`Cached quantile-pbci results exist at '${relativePath}'. Using...`);
    }
    const csvText = await fs.promises.readFile(cachePath, 'utf-8');
    return CsvParser.parseToNumericRecords(csvText,
        ['q', 'difference', 'ciLower', 'ciUpper']);
  }

  // Calculate anew and cache the result.
  const quantileResults = await calculateQuantiles(filePath, quantileOptions);
  const quantilesAsCsv = getCsvPrintedQuantileData(quantileResults);
  if (!quiet) {
    /* c8 ignore next 3 */
    const relativePath = path.resolve(PROJECT_ROOT, cachePath);
    console.warn(`Caching quantile-pbci results at '${relativePath}'...`);
  }
  await fs.promises.writeFile(cachePath, quantilesAsCsv);

  return quantileResults;
}

// TODO(bckenny): move out into quantiles-pbci-bin.js and drop es-main?
/**
 * Parse arguments and run from the command line.
 */
/* c8 ignore next 35 */
async function run() {
  // until we have `--unhandled-rejections=strict` by default.
  process.on('unhandledRejection', err => {
    console.error(err);
    process.exit(1);
  });

  commander
    .usage('--input=<path/to/data.csv> [options]')
    .storeOptionsAsProperties(false) // put parsed results on .opts()

    .requiredOption('-i, --input <path>',
        'The path of the input data file. Must be a csv with columns `base` and `compare`.')
    .option('-r, --random-seed',
        // eslint-disable-next-line max-len
        'Use a new random seed for bootstrap sampling on each run and skip the cache. Defaults to false.')
    .option('-n, --nboot <value>',
        `The number of bootstrap samples to take. Defaults to ${DEFAULT_NBOOT}`)
    .option('-q, --quiet',
        'Silence all logging except the quantile-pbci results on stdout');

  commander.parse(process.argv);
  const parsedFlags = commander.opts();

  // Get csv and write to stdout.
  const quantileResults = await getQuantileDeciles(parsedFlags.input, {
    nboot: parsedFlags.nboot,
    useRandomSeed: parsedFlags.randomSeed,
    quiet: parsedFlags.quiet,
  });

  const quantilesAsCsv = getCsvPrintedQuantileData(quantileResults);
  // eslint-disable-next-line no-console
  console.log(quantilesAsCsv);
}

export {
  getQuantileDeciles,
  getPrettyPrintedQuatileData,
};

// Allow running from the CLI.
// @ts-expect-error - we can use import.meta without `--module=esnext`.
if (esMain(import.meta)) {
  /* c8 ignore next 2 */
  run();
}
