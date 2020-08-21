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

import {execFile} from 'child_process';
const execFileAsync = promisify(execFile);

/** @typedef {import('@google-cloud/bigquery').BigQuery} BigQuery */
/** @typedef {import('@google-cloud/bigquery').Dataset} Dataset */
/** @typedef {import('../types/externs').HaTableInfo} HaTableInfo */
/** @typedef {import('../big-query/extract-from-ha-tables.js').MetricValueId} MetricValueId */

const outfile = PROJECT_ROOT + '/report.md';
const output = fs.createWriteStream(outfile);

const PLOT_SIZE = 600;

/**
 * Print string to the output stream.
 * @param {string} txt
 */
function writeLn(txt) {
  output.write(txt);
  output.write('\n');
}

/**
 * Get the written name of the table's month.
 * @param {HaTableInfo} tableInfo
 */
function getMonthName({year, month}) {
  const date = new Date(year, month - 1, 1);
  return date.toLocaleString(undefined, {month: 'long'});
}

/**
 * @param {string} imageFilename
 * @param {string} altText
 * @param {number} [width]
 * @param {number} [height]
 * @return {string}
 */
function getImageTag(imageFilename, altText, width = PLOT_SIZE, height = PLOT_SIZE) {
  return `<img src="${imageFilename}" alt="${altText}" width="${width}" height="${height}">`;
}

/**
 * @param {HaTableInfo} baseTableInfo
 * @param {HaTableInfo} compareTableInfo
 * @param {Dataset} dataset
 * @param {string} description
 * @return {Promise<string>}
 */
async function getPerfScoreComparison(baseTableInfo, compareTableInfo, dataset, description) {
  const {filename, numRows} = await fetchPairedTablesMetric(baseTableInfo, compareTableInfo,
      'performance_score', dataset);
  const shiftResults = await getShiftFunctionDeciles(filename, {quiet: false});

  const baseName = `${getMonthName(baseTableInfo)} ${baseTableInfo.year}`;
  const compareName = `${getMonthName(compareTableInfo)} ${compareTableInfo.year}`;

  const shiftFunctionTable = getPrettyPrintedShiftData(shiftResults, {
    baseName,
    compareName,
    multiplier: 100, // Scale score from [0, 1] to [0, 100].
  });

  // eslint-disable-next-line max-len
  const imageName = `${baseTableInfo.year}-${getMonthName(baseTableInfo)}-${compareTableInfo.year}-${getMonthName(compareTableInfo)}-performance-score.png`;

  const command = 'Rscript';
  const args = [
    'R/plot-dependent-shift-bin.R',
    filename,
    imageName,
    '--metric-name="Performance Sore"',
    '-b', '"July 2019"',
    '-c', '"July 2020"',
    '--label-multiplier=100',
    '--max-plotted-value=1',
  ];
  await execFileAsync(command, args);

  const imageTag = getImageTag(imageName, `${baseName} vs ${compareName} Performance Score`);

  return `
#### ${baseName} vs ${compareName} (${description})
_results based on ${numRows.toLocaleString()} runs of the same site without error_

${imageTag}


${shiftFunctionTable}`;
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
 * @param {Dataset} dataset
 * @param {MetricValueId} metricValueId
 * @param {string} comparisonDescription
 * @return {Promise<string>}
 */
async function getMetricValueComparison(baseTableInfo, compareTableInfo, dataset, metricValueId,
    comparisonDescription) {
  const {filename, numRows} = await fetchPairedTablesMetric(baseTableInfo, compareTableInfo,
      metricValueId, dataset);

  const baseName = `${getMonthName(baseTableInfo)} ${baseTableInfo.year}`;
  const compareName = `${getMonthName(compareTableInfo)} ${compareTableInfo.year}`;
  const metricOptions = metricDisplayOptions[metricValueId];
  const heading = `#### ${baseName} vs ${compareName} (${comparisonDescription})`;

  if (numRows === 0) {
    return `${heading}

No results found for ${metricOptions.plotTitle} in ${baseName}/${compareName}.
`;
  }

  const shiftResults = await getShiftFunctionDeciles(filename, {quiet: false});
  const shiftFunctionTable = getPrettyPrintedShiftData(shiftResults, {
    baseName,
    compareName,
    units: metricOptions.unit,
    digits: metricOptions.digits,
  });

  // eslint-disable-next-line max-len
  const imageName = `${baseTableInfo.year}-${getMonthName(baseTableInfo)}-${compareTableInfo.year}-${getMonthName(compareTableInfo)}-${metricValueId}.png`;

  // Rscript R/plot-dependent-shift-bin.R data/performance_score/paired-2019-07-to-2020-07.Io7aN%2FadjSmJ9avh19aI%2FQ%3D%3D-drFNlvOazc8XGu2iCkHA5A%3D%3D.csv paired-2019-2020.png
  // --metric-name="Performance Sore" -b "July 2019" -c "July 2020" --label-multiplier=100 --max-plotted-value=1
  const command = 'Rscript';
  const args = [
    'R/plot-dependent-shift-bin.R',
    filename,
    imageName,
    `--metric-name="${metricOptions.plotTitle}"`,
    '-b', '"July 2019"',
    '-c', '"July 2020"',
    '--reverse-diff-colors', // For metrics, positive difference means it regressed in `compare`.
    `--digits=${metricOptions.digits}`,
  ];
  // r/docopt doesn't handle an empty string value, for some reason,
  // so only add unit if there is one.
  if (metricOptions.unit) {
    args.push(`--unit="${metricOptions.unit}"`);
  }

  await execFileAsync(command, args);

  const imageTag = getImageTag(imageName,
      `${baseName} vs ${compareName} ${metricOptions.plotTitle} value`);

  return `${heading}
_results based on ${numRows.toLocaleString()} runs of the same site without error_


${imageTag}


${shiftFunctionTable}`;
}

/**
 * @param {HaTableInfo} tableInfo
 * @return {string}
 */
function getTitle({year, month}) {
  const date = new Date(year, month - 1, 1);
  const monthName = date.toLocaleString(undefined, {month: 'long'});
  return `## Analysis of Lighthouse results in the HTTP Archive, ${monthName} ${year} `;
}

async function run() {
  const bigQuery = new BigQuery(credentials);
  const extractedDataset = bigQuery.dataset('lh_extract');

  const haTablesData = new HaTablesData(bigQuery);
  const latestTable = await haTablesData.getLatestTable();
  const lastMonth = await haTablesData.getMonthBefore(latestTable);
  const lastYear = await haTablesData.getYearBefore(latestTable);

  writeLn(getTitle(latestTable));

  const tableSummary = await getTableSummarySection(extractedDataset,
    {tableInfo: latestTable, description: 'latest'},
    {tableInfo: lastMonth, description: 'one month prior'},
    {tableInfo: lastYear, description: 'one year prior'});
  writeLn(tableSummary);

  writeLn('### Overall Performance score');
  if (lastMonth) {
    const perfScoreComparison = await getPerfScoreComparison(lastMonth, latestTable,
        extractedDataset, 'month-over-month');
    writeLn(perfScoreComparison);
  } else {
    // something
  }
  if (lastYear) {
    const perfScoreComparison = await getPerfScoreComparison(lastYear, latestTable,
        extractedDataset, 'year-over-year');
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
    writeLn(`### ${metricDisplayOptions[metricValueId].sectionTitle}`);

    let monthComparisonPromise;
    if (lastMonth) {
      monthComparisonPromise = getMetricValueComparison(lastMonth, latestTable,
          extractedDataset, metricValueId, 'month-over-month');
    } else {
      // TODO(bckenny): something
      monthComparisonPromise = Promise.resolve('');
    }
    let yearComparisonPromise;
    if (lastYear) {
      yearComparisonPromise = getMetricValueComparison(lastYear, latestTable,
          extractedDataset, metricValueId, 'year-over-year');
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
