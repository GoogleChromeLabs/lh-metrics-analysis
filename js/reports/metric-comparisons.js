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

/** @typedef {import('@google-cloud/bigquery').BigQuery} BigQuery */
/** @typedef {import('@google-cloud/bigquery').Dataset} Dataset */
/** @typedef {import('../types/externs').HaTableInfo} HaTableInfo */

const outfile = PROJECT_ROOT + '/report.md';
const output = fs.createWriteStream(outfile);

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
 * @param {HaTableInfo} baseTableInfo
 * @param {HaTableInfo} compareTableInfo
 * @param {Dataset} dataset
 * @param {string} description
 * @return {Promise<string>}
 */
async function getPerfScoreComparison(baseTableInfo, compareTableInfo, dataset, description) {
  const pairedScoreFilename = await fetchPairedTablesMetric(baseTableInfo, compareTableInfo,
      'performance_score', dataset);
  const shiftResults = await getShiftFunctionDeciles(pairedScoreFilename, {quiet: false});

  const baseName = `${getMonthName(baseTableInfo)} ${baseTableInfo.year}`;
  const compareName = `${getMonthName(compareTableInfo)} ${compareTableInfo.year}`;

  const prettyPrinted = getPrettyPrintedShiftData(shiftResults, {
    baseName,
    compareName,
    multiplier: 100, // Scale score from [0, 1] to [0, 100].
  });

  // TODO(bckenny): print number of paired records

  return `#### ${baseName} vs ${compareName} (${description})\n
${prettyPrinted}`;
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
