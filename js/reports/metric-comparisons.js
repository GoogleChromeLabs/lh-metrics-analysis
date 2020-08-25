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

import {execFile} from 'child_process';
const execFileAsync = promisify(execFile);

/** @typedef {import('@google-cloud/bigquery').BigQuery} BigQuery */
/** @typedef {import('../types/externs').HaTableInfo} HaTableInfo */
/** @typedef {import('../big-query/extract-from-ha-tables.js').MetricValueId} MetricValueId */

const PLOT_SIZE = 600;

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
 * @return {Promise<string>}
 */
async function getPerfScoreComparison(baseTableInfo, compareTableInfo, outPath, description) {
  const {filename, numRows} = await fetchPairedTablesMetric(baseTableInfo, compareTableInfo,
      'performance_score');
  const baseName = `${getMonthName(baseTableInfo)} ${baseTableInfo.year}`;
  const compareName = `${getMonthName(compareTableInfo)} ${compareTableInfo.year}`;

  const shiftResults = await getShiftFunctionDeciles(filename, {quiet: false});
  const shiftFunctionTable = getPrettyPrintedShiftData(shiftResults, {
    baseName,
    compareName,
    multiplier: 100, // Scale score from [0, 1] to [0, 100].
  });

  const shiftImageName = `${outPath}/` +
      // eslint-disable-next-line max-len
      `shift-${baseTableInfo.year}-${getMonthName(baseTableInfo)}-${compareTableInfo.year}-${getMonthName(compareTableInfo)}-performance-score.png`;

  const command = 'Rscript';
  const shiftArgs = [
    'R/plot-dependent-shift-bin.R',
    filename,
    shiftImageName,
    '--metric-name="Performance Score"',
    '-b', `"${getShortMonthName(baseTableInfo)} ${baseTableInfo.year}"`,
    '-c', `"${getShortMonthName(compareTableInfo)} ${compareTableInfo.year}"`,
    '--label-multiplier=100',
    '--max-plotted-value=1',
  ];
  await execFileAsync(command, shiftArgs);

  const shiftImageTag = getImageTag(shiftImageName, outPath,
      `${baseName} vs ${compareName} Performance Score`);

  const quantileResults = await getQuantileDeciles(filename, {quiet: false});
  const quantileTable = getPrettyPrintedQuatileData(quantileResults, {
    multiplier: 100, // Scale score from [0, 1] to [0, 100].
  });

  const quantilesImageName = `${outPath}/` +
      // eslint-disable-next-line max-len
      `diff-${baseTableInfo.year}-${getMonthName(baseTableInfo)}-${compareTableInfo.year}-${getMonthName(compareTableInfo)}-performance-score.png`;
  const quantileArgs = [
    'R/plot-difference-deciles-bin.R',
    filename,
    quantilesImageName,
    '--metric-name="Performance"',
    '-b', `"${getShortMonthName(baseTableInfo)} ${baseTableInfo.year}"`,
    '-c', `"${getShortMonthName(compareTableInfo)} ${compareTableInfo.year}"`,
    '--label-multiplier=100',
    '--clip-percentile=1',
  ];
  await execFileAsync(command, quantileArgs);
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

/** @type {Record<MetricValueId, {sectionTitle: string, plotTitle: string, unit: string, digits: number}>} */
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
  },
};

/**
 * @param {HaTableInfo} baseTableInfo
 * @param {HaTableInfo} compareTableInfo
 * @param {MetricValueId} metricValueId
 * @param {string} outPath
 * @param {string} comparisonDescription
 * @return {Promise<string>}
 */
async function getMetricValueComparison(baseTableInfo, compareTableInfo, metricValueId, outPath,
    comparisonDescription) {
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

  const shiftResults = await getShiftFunctionDeciles(filename, {quiet: false});
  const shiftFunctionTable = getPrettyPrintedShiftData(shiftResults, {
    baseName,
    compareName,
    unit: metricOptions.unit,
    digits: metricOptions.digits,
  });

  const shiftImageName = `${outPath}/` +
      // eslint-disable-next-line max-len
      `shift-${baseTableInfo.year}-${getMonthName(baseTableInfo)}-${compareTableInfo.year}-${getMonthName(compareTableInfo)}-${metricValueId}.png`;

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

  await execFileAsync(command, shiftArgs);

  const shiftImageTag = getImageTag(shiftImageName, outPath,
      `${baseName} vs ${compareName} ${metricOptions.plotTitle} value`);

  const quantileResults = await getQuantileDeciles(filename, {quiet: false});
  const quantileTable = getPrettyPrintedQuatileData(quantileResults, {
    unit: metricOptions.unit,
    digits: metricOptions.digits,
  });

  const quantilesImageName = `${outPath}/` +
      // eslint-disable-next-line max-len
      `diff-${baseTableInfo.year}-${getMonthName(baseTableInfo)}-${compareTableInfo.year}-${getMonthName(compareTableInfo)}-${metricValueId}.png`;
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
  await execFileAsync(command, quantileArgs);
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
  const lastMonth = await haTablesData.getMonthBefore(latestTable);
  const lastYear = await haTablesData.getYearBefore(latestTable);

  // TODO(bckenny): temp block from new expensive run if new data comes out.
  if (latestTable.month !== 7) {
    throw new Error('Is august out yet?');
  }

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
    {tableInfo: lastMonth, description: 'one month prior'},
    {tableInfo: lastYear, description: 'one year prior'}
  );
  writeLn(tableSummary);

  writeLn('## Overall Performance score');
  if (lastMonth) {
    const perfScoreComparison = await getPerfScoreComparison(lastMonth, latestTable, outDirname,
        'month-over-month');
    writeLn(perfScoreComparison);
  } else {
    // something
  }
  if (lastYear) {
    const perfScoreComparison = await getPerfScoreComparison(lastYear, latestTable, outDirname,
        'year-over-year');
    writeLn(perfScoreComparison);
  } else {
    // something
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

  for (const metricValueId of metricsOfInterest) {
    writeLn(`## ${metricDisplayOptions[metricValueId].sectionTitle}`);

    let monthComparisonPromise;
    if (lastMonth) {
      monthComparisonPromise = getMetricValueComparison(lastMonth, latestTable,
          metricValueId, outDirname, 'month-over-month');
    } else {
      // TODO(bckenny): something
      monthComparisonPromise = Promise.resolve('');
    }
    let yearComparisonPromise;
    if (lastYear) {
      yearComparisonPromise = getMetricValueComparison(lastYear, latestTable,
          metricValueId, outDirname, 'year-over-year');
    } else {
      // TODO(bckenny): something
      yearComparisonPromise = Promise.resolve('');
    }

    const [monthComparison, yearComparison] = await Promise.all([
      monthComparisonPromise,
      yearComparisonPromise,
    ]);
    writeLn(monthComparison);
    writeLn(yearComparison);
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
