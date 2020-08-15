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

import {getTotalRows} from '../big-query/extract-from-ha-tables.js';
import {fetchUniqueValueCounts} from '../big-query/fetch-from-extracted-tables.js';

/** @typedef {import('@google-cloud/bigquery').Dataset} Dataset */
/** @typedef {import('../big-query/ha-tables-data.js').HaTableInfo} HaTableInfo */

/**
 * @param {Array<string|number>} arr
 * @return {string}
 */
function arrayToList(arr) {
  if (arr.length === 0) return '';
  if (arr.length === 1) return `${arr[0]}`;
  return `${arr.slice(0, -1).join(', ')}, and ${arr[arr.length - 1]}`;
}

/**
 * Format a number as a short number with a suffix: 5.7M, 51K, etc.
 * @param {number} value
 * @return {string}
 */
function formatCompact(value) {
  return value.toLocaleString('en-US', {
    notation: 'compact',
    compactDisplay: 'short',
  });
}

/**
 * @param {HaTableInfo} tableInfo
 * @param {Dataset} dataset
 * @return {Promise<{summary: string, warning?: string}>}
 */
async function getLighthouseVersionsSummary(tableInfo, dataset) {
  const lhVersionCounts = await fetchUniqueValueCounts(tableInfo, 'lh_version', dataset);

  const versionStrings = Object.keys(lhVersionCounts)
    .sort()
    .map(version => `[\`${version}\`](https://github.com/GoogleChrome/lighthouse/releases/tag/v${version})`);
  const versionString = arrayToList(versionStrings);

  // TODO(bckenny): warning as well.
  // TODO(bckenny): detect when major version changed in a month and quantify per version.

  const pluralize = versionStrings.length === 1 ? '' : 's';
  const summary = `Lighthouse version${pluralize}: ${versionString}`;

  return {
    summary,
  };
}

/**
 * @param {HaTableInfo} tableInfo
 * @param {Dataset} dataset
 * @return {Promise<{summary: string, warning?: string}>}
 */
async function getChromeVersionsSummary(tableInfo, dataset) {
  const chromeVersionCounts = await fetchUniqueValueCounts(tableInfo, 'chrome_version', dataset);

  const versionStrings = Object.keys(chromeVersionCounts)
    .sort()
    .map(version => `\`${version}\``);
  const versionString = arrayToList(versionStrings);

  // TODO(bckenny): warning as well.
  // TODO(bckenny): detect when major version changed in a month and quantify per version.

  const pluralize = versionStrings.length === 1 ? '' : 's';
  const summary = `Chrome version${pluralize}: ${versionString}`;

  return {
    summary,
  };
}

/**
 * @param {HaTableInfo} tableInfo
 * @param {Dataset} dataset
 * @param {number} totalRows
 * @return {Promise<{summary: string, warning?: string}>}
 */
async function getErrorRateSummary(tableInfo, dataset, totalRows) {
  const runtimeErrorCounts = await fetchUniqueValueCounts(tableInfo, 'runtime_error_code', dataset);

  // Count all the entries that had a non-`'null'` error code (`null` converted to a `'null'` key).
  const {'null': _, ...allErrorCounts} = runtimeErrorCounts;
  const totalErrors = Object.values(allErrorCounts).reduce((total, count) => total + count);
  const errorPercentage = (totalErrors / totalRows)
    .toLocaleString('en-US', {style: 'percent', maximumFractionDigits: 2});

  const summary = `${errorPercentage} error rate ` +
      `(${formatCompact(totalErrors)} runs with a \`runtimeError\`)`;

  // TODO(bckenny): warning when unusual level of errors. Hard code threshold?
  return {
    summary,
  };
}

/**
 * Write a summary of the given table.
 * @param {HaTableInfo|null} tableInfo
 * @param {Dataset} dataset
 * @param {string} description
 * @return {Promise<string>}
 */
async function getSingleTableSummary(tableInfo, dataset, description) {
  if (!tableInfo) {
    return `**no ${description} table found**\n`;
  }

  const {year, month} = tableInfo;
  const date = new Date(year, month - 1, 1);
  const monthName = date.toLocaleString(undefined, {month: 'long'});

  const totalRows = await getTotalRows(dataset.bigQuery, tableInfo);

  const lhVersions = await getLighthouseVersionsSummary(tableInfo, dataset);
  const chromeVersions = await getChromeVersionsSummary(tableInfo, dataset);
  const errorRate = await getErrorRateSummary(tableInfo, dataset, totalRows);

  // TODO(bckenny): null perfScore summary line?

  return `**${monthName} ${year}** (${description}):
  - ${lhVersions.summary}
  - ${formatCompact(totalRows)} total Lighthouse runs
  - ${errorRate.summary}
  - ${chromeVersions.summary}
`;
}

/**
 * Create a table summary section for the given base tableInfo and any tables to
 * be compared against it. A compare table can be `null` if one doesn't exist
 * but it's still worth including in the summary (e.g. there is no
 * `2018_06_01_mobile` table but it's worth calling out its absence).
 * @param {Dataset} dataset
 * @param {{tableInfo: HaTableInfo, description: string}} baseTable
 * @param  {...{tableInfo: HaTableInfo|null, description: string}} compareTables
 * @return {Promise<string>}
 */
async function getTableSummarySection(dataset, baseTable, ...compareTables) {
  const tableSummaries = await Promise.all([baseTable, ...compareTables]
    .map(t => getSingleTableSummary(t.tableInfo, dataset, t.description)));

  return '### Summary of queried tables\n' +
    tableSummaries.join('\n');
}

export {
  getTableSummarySection,
};
