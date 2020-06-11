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
/* eslint-disable no-console */

import enquirer from 'enquirer';

// TODO(bckenny): use createRequire() for cjs deps when supported by tsc.
import BQModule from '@google-cloud/bigquery';
const {BigQuery} = BQModule;

// import {fetchMetricSingleTableData, fetchMetricPairedTablesData} from './fetch-metric-data.js';
import HaTablesData from './ha-tables-data.js';
import credentials from './auth/credentials.js';

/** @typedef {import('./extract-from-ha-tables.js').MetricValueId} MetricValueId */
/** @typedef {import('./ha-tables-data.js').HaTableInfo} HaTableInfo */
/** @typedef {import('@google-cloud/bigquery').BigQuery} BigQuery */

// TODO(bckenny): create on demand
const bigQuery = new BigQuery(credentials);

// TODO(bckenny): CLS
/**
 * Map from metric display names to ids.
 * @type {Record<string, MetricValueId>}
 */
const metricDisplayToIds = {
  'FirstContenfulPaint (FCP)': 'fcp_value',
  'FirstMeaningfulPaint (FMP)': 'fmp_value',
  'LargestContentfulPaint (LCP)': 'lcp_value',
  'MaxPotentialFID (MP-FID)': 'mpfid_value',
  'SpeedIndex (SI)': 'si_value',
  'TotalBlockingTime (TBT)': 'tbt_value',
  'TimeToInteractive (TTI)': 'tti_value',
};

/**
 * Returns a friendly year/month string version of the numeric date.
 * Month is assumed to be in [1, 12], not [0, 11] as is usual in JS dates.
 * @param {{year: number, month: number}} tableInfo
 */
function getFriendlyDateString({year, month}) {
  const date = new Date(year, month - 1, 1);
  const monthName = date.toLocaleString(undefined, {month: 'long'});

  return `${year} ${monthName}`;
}

/**
 * Select an available metric.
 * @return {Promise<MetricValueId>}
 */
async function selectMetric() {
  /** @type {{metricDisplayName: string}} */
  const {metricDisplayName} = await enquirer.prompt({
    type: 'select',
    name: 'metricDisplayName',
    message: 'Select a metric of interest',
    choices: Object.keys(metricDisplayToIds),
  });

  return metricDisplayToIds[metricDisplayName];
}


/**
 * Retrieve available HTTP Archive run tables, sorted chronologically starting
 * with the most recent.
 * @param {HaTablesData} haTablesData
 * @return {Promise<Record<string, HaTableInfo>>}
 */
async function getTableChoices(haTablesData) {
  console.warn('  Fetching available HTTP Archive tables...');
  const tableList = await haTablesData.getListOfTables();

  return Object.fromEntries(tableList.map(tableInfo => {
    const friendlyDateString = getFriendlyDateString(tableInfo);

    return [friendlyDateString, tableInfo];
  }));
}

/**
 * @return {Promise<{baseTableInfo: HaTableInfo, compareTableInfo: HaTableInfo}>}
 */
async function selectTables() {
  const haTablesData = new HaTablesData(bigQuery);
  const tableChoices = await getTableChoices(haTablesData);

  // Table to use compare against a baseline.
  const {compareTableKey} = await enquirer.prompt({
    type: 'select',
    name: 'compareTableKey',
    message: 'Select an HTTP Archive run to compare against a previous table',
    choices: Object.keys(tableChoices),
  });
  const compareTableInfo = tableChoices[compareTableKey];

  // Offer month-over-month, year-over-year, or manual date pick options for the baseline.
  const compareTypeChoices = [];
  const monthBeforeInfo = await haTablesData.getMonthBefore(compareTableInfo);
  if (monthBeforeInfo) {
    const friendlyDate = getFriendlyDateString(monthBeforeInfo);
    compareTypeChoices.push(`Month over month (${friendlyDate})`);
  }
  const yearBeforeInfo = await haTablesData.getYearBefore(compareTableInfo);
  if (yearBeforeInfo) {
    const friendlyDate = getFriendlyDateString(yearBeforeInfo);
    compareTypeChoices.push(`Year over year (${friendlyDate})`);
  }
  compareTypeChoices.push('Manually pick a date');

  /** @type {{compareType: string}} */
  const {compareType} = await enquirer.prompt({
    type: 'select',
    name: 'compareType',
    message: 'Select an HTTP Archive run to serve as a baseline for comparison',
    choices: compareTypeChoices,
  });

  // Enquirer annoyingly seems to require using only the choice name here:
  // https://github.com/enquirer/enquirer/issues/121
  // Extra && ID existence check is to make tsc happy.
  if (compareType.startsWith('Month over month') && monthBeforeInfo) {
    return {baseTableInfo: monthBeforeInfo, compareTableInfo};
  }
  if (compareType.startsWith('Year over year') && yearBeforeInfo) {
    return {baseTableInfo: yearBeforeInfo, compareTableInfo};
  }

  // Fall back to manually selecting the baseline table to compare against.
  // TODO(bckenny): do we care about requiring comparison to come after base?
  const tableChoicesKeysFiltered = Object.keys(tableChoices).filter(key => key !== compareTableKey);
  const {baseTableKey} = await enquirer.prompt({
    type: 'select',
    name: 'baseTableKey',
    message: 'Manually select an HTTP Archive run to serve as a baseline',
    choices: tableChoicesKeysFiltered,
  });
  const baseTableInfo = tableChoices[baseTableKey];

  return {baseTableInfo, compareTableInfo};
}

async function run() {
  const metricValueId = await selectMetric();
  console.log(`querying ${metricValueId}...`);

  const {baseTableInfo, compareTableInfo} = await selectTables();

  console.log(`Retrieving comparison HTTP Archvie table '${compareTableInfo.tableId}'...`);
  // await fetchMetricSingleTableData(bigQuery, metricValueId, compareTableInfo);
  console.log('Comparison table retrieved.');

  console.log(`Retrieving base HTTP Archvie table '${baseTableInfo.tableId}'...`);
  // await fetchMetricSingleTableData(bigQuery, metricValueId, baseTableInfo);
  console.log('Base table retrieved.');

  console.log(`Retrieving paired results from '${baseTableInfo.tableId}' and ` +
      `'${compareTableInfo.tableId}'...`);
  // await fetchMetricPairedTablesData(bigQuery, metricValueId, baseTableInfo, compareTableInfo);
  console.log('Paired tables retrieved.');
}

run();
