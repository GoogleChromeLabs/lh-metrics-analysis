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
import stream from 'stream';
import {promisify} from 'util';

// TODO(bckenny): use createRequire() for cjs deps when supported by tsc.
import BQModule from '@google-cloud/bigquery';
const {BigQuery} = BQModule;

import credentials from '../big-query/auth/credentials.js';
import HaTablesData from '../big-query/ha-tables-data.js';
import {PROJECT_ROOT} from '../module-utils.js';
import {getTableSummarySection} from './tables-summary.js';
import {fetchPairedTablesMetric} from '../big-query/fetch-from-extracted-tables.js';
import {getShiftFunctionDeciles, getPrettyPrintedShiftData} from '../estimators/shift-function.js';
import {getQuantileDeciles, getPrettyPrintedQuatileData} from '../estimators/quantiles-pbci.js';
import {ConcurrentMapper} from '../concurrent-mapper.js';

import {execFile} from 'child_process';
// Note: manually pick overload since incorrect one is chosen for pooledCall()s below.
/** @type {(file: string, args: string[] | null | undefined) => Promise<{stdout: string, stderr: string}>} */
const execFileAsync = promisify(execFile);

/** @typedef {import('@google-cloud/bigquery').BigQuery} BigQuery */
/** @typedef {import('../types/externs').HaTableInfo} HaTableInfo */
/** @typedef {import('../big-query/extract-from-ha-tables.js').MetricValueId} MetricValueId */

const PLOT_SIZE = 600;
const concurrencyLimit = 6;
const concurrentMapper = new ConcurrentMapper(concurrencyLimit);

/**
 * Get the written name of the table's month.
 * @param {HaTableInfo} tableInfo
 */
function getMonthName({year, month}) {
  const date = new Date(year, month - 1, 1);
  return date.toLocaleString(undefined, {month: 'long'});
}

/**
 * Get a short written name of the table's month.
 * @param {HaTableInfo} tableInfo
 */
function getShortMonthName({month}) {
  // The `toLocaleString({month: 'short'})` names can be dumb, so do it manually.
  const monthNames = [
    'Jan',
    'Feb',
    'March',
    'April',
    'May',
    'June',
    'July',
    'Aug',
    'Sept',
    'Nov',
    'Dec',
  ];

  return monthNames[month - 1];
}

/**
 * @param {string} imageFilename
 * @param {string} outPath
 * @param {string} altText
 * @param {number} [width]
 * @param {number} [height]
 * @return {string}
 */
function getImageTag(imageFilename, outPath, altText, width = PLOT_SIZE, height = PLOT_SIZE) {
  const src = path.relative(outPath, imageFilename);
  return `<img src="${src}" alt="${altText}" width="${width}" height="${height}">`;
}

/**
 * @param {HaTableInfo} baseTableInfo
 * @param {HaTableInfo} compareTableInfo
 * @param {string} outPath
 * @param {string} description
 * @param {ConcurrentMapper} concurrentMapper
 * @return {Promise<string>}
 */
async function getPerfScoreComparison(baseTableInfo, compareTableInfo, outPath, description,
    concurrentMapper) {
  const {filename, numRows} = await fetchPairedTablesMetric(baseTableInfo, compareTableInfo,
      'performance_score');
  const baseName = `${getMonthName(baseTableInfo)} ${baseTableInfo.year}`;
  const compareName = `${getMonthName(compareTableInfo)} ${compareTableInfo.year}`;

  const shiftResults = await concurrentMapper.pooledCall(getShiftFunctionDeciles,
      filename, {quiet: false});
  const shiftFunctionTable = getPrettyPrintedShiftData(shiftResults, {
    baseName,
    compareName,
    multiplier: 100, // Scale score from [0, 1] to [0, 100].
  });

  const shiftImageName = `${outPath}/` +
      // eslint-disable-next-line max-len
      `shift-performance-score-${baseTableInfo.year}-${getMonthName(baseTableInfo)}-${compareTableInfo.year}-${getMonthName(compareTableInfo)}.png`;

  const command = 'Rscript';
  const shiftArgs = [
    'R/plot-dependent-shift-bin.R',
    filename,
    shiftImageName,
    '--metric-name="Performance Score"',
    '-b', `"${getShortMonthName(baseTableInfo)} ${baseTableInfo.year}"`,
    '-c', `"${getShortMonthName(compareTableInfo)} ${compareTableInfo.year}"`,
    '--label-multiplier=100',
    '--include-percentage=100',
  ];
  await concurrentMapper.pooledCall(execFileAsync, command, shiftArgs);

  const shiftImageTag = getImageTag(shiftImageName, outPath,
      `${baseName} vs ${compareName} Performance Score`);

  const quantileResults = await concurrentMapper.pooledCall(getQuantileDeciles,
    filename, {quiet: false});
  const quantileTable = getPrettyPrintedQuatileData(quantileResults, {
    multiplier: 100, // Scale score from [0, 1] to [0, 100].
  });

  const quantilesImageName = `${outPath}/` +
      // eslint-disable-next-line max-len
      `diff-performance-score-${baseTableInfo.year}-${getMonthName(baseTableInfo)}-${compareTableInfo.year}-${getMonthName(compareTableInfo)}.png`;
  const quantileArgs = [
    'R/plot-difference-deciles-bin.R',
    filename,
    quantilesImageName,
    '--metric-name="Performance"',
    '-b', `"${getShortMonthName(baseTableInfo)} ${baseTableInfo.year}"`,
    '-c', `"${getShortMonthName(compareTableInfo)} ${compareTableInfo.year}"`,
    '--label-multiplier=100',
    '--include-percentage=99',
  ];
  await concurrentMapper.pooledCall(execFileAsync, command, quantileArgs);
  const quantilesImageTag = getImageTag(quantilesImageName, outPath,
      `${baseName} and ${compareName} Performance Score difference`);

  /* eslint-disable max-len */
  return `
### ${baseName} vs ${compareName} (${description})
_results based on ${numRows.toLocaleString()} pairs of before/after runs of the same sites without error_

##### Shifts in the overall performance distribution

${shiftImageTag}

${shiftFunctionTable}

##### Distribution of performance changes seen by individual sites

${quantilesImageTag}

${quantileTable}`;
  /* eslint-enable max-len */
}

/** @type {Record<MetricValueId, {sectionTitle: string, plotTitle: string, unit: string, digits: number, includePercentage?: number}>} */
const metricDisplayOptions = {
  fcp_value: {
    sectionTitle: 'First Contentful Paint',
    plotTitle: 'FCP',
    unit: 'ms',
    digits: 1,
  },
  fmp_value: {
    sectionTitle: 'First Meaningful Paint',
    plotTitle: 'FMP',
    unit: 'ms',
    digits: 1,
  },
  lcp_value: {
    sectionTitle: 'Largest Contentful Paint',
    plotTitle: 'LCP',
    unit: 'ms',
    digits: 1,
  },
  mpfid_value: {
    sectionTitle: 'Max Potential FID',
    plotTitle: 'MPFID',
    unit: 'ms',
    digits: 1,
  },
  si_value: {
    sectionTitle: 'Speed Index',
    plotTitle: 'Speed Index',
    unit: 'ms',
    digits: 1,
  },
  tbt_value: {
    sectionTitle: 'Total Blocking Time',
    plotTitle: 'TBT',
    unit: 'ms',
    digits: 1,
  },
  tti_value: {
    sectionTitle: 'Time to Interactive',
    plotTitle: 'TTI',
    unit: 'ms',
    digits: 1,
  },
  cls_value: {
    sectionTitle: 'Cumulative Layout Shift',
    plotTitle: 'CLS',
    unit: '',
    digits: 3,
    includePercentage: 82,
  },
};

/**
 * @param {HaTableInfo} baseTableInfo
 * @param {HaTableInfo} compareTableInfo
 * @param {MetricValueId} metricValueId
 * @param {string} outPath
 * @param {string} comparisonDescription
 * @param {ConcurrentMapper} concurrentMapper
 * @return {Promise<string>}
 */
async function getMetricValueComparison(baseTableInfo, compareTableInfo, metricValueId, outPath,
    comparisonDescription, concurrentMapper) {
  const {filename, numRows} = await fetchPairedTablesMetric(baseTableInfo, compareTableInfo,
      metricValueId);

  const baseName = `${getMonthName(baseTableInfo)} ${baseTableInfo.year}`;
  const compareName = `${getMonthName(compareTableInfo)} ${compareTableInfo.year}`;
  const metricOptions = metricDisplayOptions[metricValueId];
  const heading = `### ${baseName} vs ${compareName} (${comparisonDescription})`;

  // TODO(bckenny): currently hacked in, but add limits for when metric known to not exist for date.
  if (numRows === 0) {
    return `${heading}

${metricOptions.plotTitle} data was not collected in ${baseName}.
`;
  }

  const shiftResults = await concurrentMapper.pooledCall(getShiftFunctionDeciles,
      filename, {quiet: false});
  const shiftFunctionTable = getPrettyPrintedShiftData(shiftResults, {
    baseName,
    compareName,
    unit: metricOptions.unit,
    digits: metricOptions.digits,
  });

  const shiftImageName = `${outPath}/` +
      // eslint-disable-next-line max-len
      `shift-${metricValueId}-${baseTableInfo.year}-${getMonthName(baseTableInfo)}-${compareTableInfo.year}-${getMonthName(compareTableInfo)}.png`;

  // TODO(bckenny): print stderr from Rscript.
  const command = 'Rscript';
  const shiftArgs = [
    'R/plot-dependent-shift-bin.R',
    filename,
    shiftImageName,
    `--metric-name="${metricOptions.plotTitle}"`,
    '-b', `"${getShortMonthName(baseTableInfo)} ${baseTableInfo.year}"`,
    '-c', `"${getShortMonthName(compareTableInfo)} ${compareTableInfo.year}"`,
    '--reverse-diff-colors', // For metrics, positive difference means it regressed in `compare`.
    `--digits=${metricOptions.digits}`,
  ];
  // r/docopt doesn't handle an empty string value, for some reason,
  // so only add unit if there is one.
  if (metricOptions.unit) {
    shiftArgs.push(`--unit="${metricOptions.unit}"`);
  }
  if (metricOptions.includePercentage) {
    shiftArgs.push(`--include-percentage=${metricOptions.includePercentage}`);
  }

  await concurrentMapper.pooledCall(execFileAsync, command, shiftArgs);

  const shiftImageTag = getImageTag(shiftImageName, outPath,
      `${baseName} vs ${compareName} ${metricOptions.plotTitle} value`);

  const quantileResults = await concurrentMapper.pooledCall(getQuantileDeciles,
      filename, {quiet: false});
  const quantileTable = getPrettyPrintedQuatileData(quantileResults, {
    unit: metricOptions.unit,
    digits: metricOptions.digits,
  });

  const quantilesImageName = `${outPath}/` +
      // eslint-disable-next-line max-len
      `diff-${metricValueId}-${baseTableInfo.year}-${getMonthName(baseTableInfo)}-${compareTableInfo.year}-${getMonthName(compareTableInfo)}.png`;
  const quantileArgs = [
    'R/plot-difference-deciles-bin.R',
    filename,
    quantilesImageName,
    `--metric-name="${metricOptions.plotTitle}"`,
    '-b', `"${getShortMonthName(baseTableInfo)} ${baseTableInfo.year}"`,
    '-c', `"${getShortMonthName(compareTableInfo)} ${compareTableInfo.year}"`,
  ];
  // r/docopt doesn't handle an empty string value, for some reason,
  // so only add unit if there is one.
  if (metricOptions.unit) {
    quantileArgs.push(`--unit="${metricOptions.unit}"`);
  }
  if (metricOptions.includePercentage) {
    quantileArgs.push(`--include-percentage=${metricOptions.includePercentage}`);
  }
  await concurrentMapper.pooledCall(execFileAsync, command, quantileArgs);
  const quantilesImageTag = getImageTag(quantilesImageName, outPath,
    `${baseName} vs ${compareName} ${metricOptions.plotTitle} value`);

  /* eslint-disable max-len */
  return `${heading}
_results based on ${numRows.toLocaleString()} pairs of before/after runs of the same sites without error_

##### Shifts in the overall ${metricOptions.plotTitle} distribution

${shiftImageTag}

${shiftFunctionTable}

##### Distribution of ${metricOptions.plotTitle} changes seen by individual sites

${quantilesImageTag}

${quantileTable}`;
  /* eslint-enable max-len */
}

/**
 * @param {HaTableInfo} tableInfo
 * @return {string}
 */
function getTitle({year, month}) {
  const date = new Date(year, month - 1, 1);
  const monthName = date.toLocaleString(undefined, {month: 'long'});
  return `# Analysis of HTTP Archive Lighthouse results, ${monthName} ${year} `;
}

async function run() {
  const bigQuery = new BigQuery(credentials);
  const extractedDataset = bigQuery.dataset('lh_extract');

  const haTablesData = new HaTablesData(extractedDataset);
  const latestTable = await haTablesData.getLatestTable();
  // HACK: using two months prior:
  const actualLastMonth = await haTablesData.getMonthBefore(latestTable);
  const lastMonth = await haTablesData.getMonthBefore(actualLastMonth);
  const lastYear = await haTablesData.getYearBefore(latestTable);

  const paddedMonth = String(latestTable.month).padStart(2, '0');
  const outDirname = `${PROJECT_ROOT}/reports/metrics/${latestTable.year}-${paddedMonth}`;
  fs.mkdirSync(outDirname, {recursive: true});

  // For now, we're just overwriting everything in the directory.
  const outfile = `${outDirname}/report.md`;
  const output = fs.createWriteStream(outfile);

  /**
   * Print string to the output stream.
   * @param {string} txt
   */
  function writeLn(txt) {
    output.write(txt);
    output.write('\n');
  }

  writeLn(getTitle(latestTable));

  const tableSummary = await getTableSummarySection(
    {tableInfo: latestTable, description: 'latest'},
    // HACK: hard code "two months prior"
    {tableInfo: lastMonth, description: 'two months prior'},
    {tableInfo: lastYear, description: 'one year prior'}
  );
  writeLn(tableSummary);

  // Launch month/year summaries of perf scores in parallel. `concurrentMapper`
  // will handle child processes not getting out of hand.
  writeLn('## Overall Performance score');
  const perfPromises = [];
  if (lastMonth) {
    const perfMonthComparisonPromise = getPerfScoreComparison(lastMonth, latestTable, outDirname,
        'month-over-month', concurrentMapper);
    perfPromises.push(perfMonthComparisonPromise);
  } else {
    // TODO(bckenny): some "month did not have data" fallback
  }
  if (lastYear) {
    const perfYearComparisonPromise = getPerfScoreComparison(lastYear, latestTable, outDirname,
        'year-over-year', concurrentMapper);
    perfPromises.push(perfYearComparisonPromise);
  } else {
    // TODO(bckenny): some "month did not have data" fallback
  }

  for (const perfPromise of perfPromises) {
    writeLn(await perfPromise);
  }

  /** @type {Array<MetricValueId>} */
  const metricsOfInterest = [
    'fcp_value',
    'si_value',
    'lcp_value',
    'tti_value',
    'tbt_value',
    'cls_value',
  ];

  // Launch summaries of each metric in parallel. `concurrentMapper` will handle
  // child processes not getting out of hand.
  const comparisonPromises = metricsOfInterest.flatMap(metricValueId => {
    const comparisonTitle = `## ${metricDisplayOptions[metricValueId].sectionTitle}`;
    /** @type {Array<string | Promise<string>>} */
    const comparisonStrings = [
      comparisonTitle,
    ];

    if (lastMonth) {
      const monthComparisonPromise = getMetricValueComparison(lastMonth, latestTable, metricValueId,
          outDirname, 'month-over-month', concurrentMapper);
      comparisonStrings.push(monthComparisonPromise);
    } else {
      // TODO(bckenny): some "month did not have data" fallback
    }

    if (lastYear) {
      const yearComparisonPromise = getMetricValueComparison(lastYear, latestTable, metricValueId,
          outDirname, 'year-over-year', concurrentMapper);
      comparisonStrings.push(yearComparisonPromise);
    } else {
      // TODO(bckenny): some "month did not have data" fallback
    }

    return comparisonStrings;
  });

  for (const comparisonPromise of comparisonPromises) {
    writeLn(await comparisonPromise);
  }

  // Close output stream.
  output.end();
  await promisify(stream.finished)(output);
}

// until we have `--unhandled-rejections=strict` by default.
process.on('unhandledRejection', err => {
  console.error(err);
  process.exit(1);
});

run();
