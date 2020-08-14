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

// TODO(bckenny): use createRequire() for cjs deps when supported by tsc.
import CSModule from '@google-cloud/storage';
const {Storage} = CSModule;

import {PROJECT_ROOT} from '../module-utils.js';
import credentials from './auth/credentials.js';
import {extractMetricsFromHaLhrs, assertValidYear, assertValidMonth} from
  './extract-from-ha-tables.js';
import {assertValidBigQueryId, assertValidColumnName, getUuidTableSuffix} from './bq-utils.js';

/** @typedef {import('@google-cloud/bigquery').Dataset} Dataset */

/** @typedef {import('./ha-tables-data.js').HaTableInfo} HaTableInfo */
/** @typedef {import('./extract-from-ha-tables.js').MetricValueId} MetricValueId */
/** @typedef {import('./extract-from-ha-tables.js').SourceOptions} SourceOptions */

// TODO(bckenny): bucket name will need to be settable to be generally usable.
// TODO(bckenny): or could use alternate downoad method (e.g. `createQueryStream`).
// Storage used for temporary pass through from BQ results to local file.
const STORAGE_BUCKET_NAME = 'lh-metrics-analysis-lh-extract';
const cloudStorage = new Storage(credentials);
const tmpBucket = cloudStorage.bucket(STORAGE_BUCKET_NAME);

/**
 * Assert that the provided etag looks correct and encode it for use in a
 * filename.
 * @param {string} tableEtag
 * @return {string}
 */
function encodeValidEtag(tableEtag) {
  // Just in case, because BQ `metadata` type guarantees are weak.
  if (typeof tableEtag !== 'string' || tableEtag.length < 5) {
    throw new Error(`Table etag '${tableEtag}' does not look valid`);
  }

  const encodedEtag = encodeURIComponent(tableEtag);

  // The etags are Base64, so this regex should be sufficient for the encoded version.
  if (!/^[\w%]+$/.test(encodedEtag)) {
    throw new Error(`Table etag '${tableEtag}' did not encode correctly`);
  }

  return encodedEtag;
}

/**
 * Generates an absolute path for a single-metric saved file, of the form
 * `PROJECT_ROOT/data/metricValueId/YYYY-MM.etag.csv'.
 * @param {MetricValueId|'performance_score'} metricValueId
 * @param {HaTableInfo} haTableInfo
 * @param {string} tableEtag
 * @return {string}
 */
function getSingleSaveFilename(metricValueId, haTableInfo, tableEtag) {
  const {year, month} = haTableInfo;
  assertValidYear(year);
  assertValidMonth(month);
  const paddedMonth = String(month).padStart(2, '0');

  const encodedEtag = encodeValidEtag(tableEtag);

  const relativePath = `/data/${metricValueId}/${year}-${paddedMonth}.${encodedEtag}.csv`;
  return path.normalize(PROJECT_ROOT + relativePath);
}

/**
 * Generates an absolute path for a paired-metric saved file, of the form
 * `PROJECT_ROOT/data/metricId/paired-YYYY-MM-to-YYYY-MM.betag-cetag.csv'.
 * @param {MetricValueId|'performance_score'} metricValueId
 * @param {HaTableInfo} baseTableInfo
 * @param {string} baseEtag
 * @param {HaTableInfo} compareTableInfo
 * @param {string} compareEtag
 * @return {string}
 */
function getPairedSaveFilename(metricValueId, baseTableInfo, baseEtag, compareTableInfo,
    compareEtag) {
  const {year: baseYear, month: baseMonth} = baseTableInfo;
  assertValidYear(baseYear);
  assertValidMonth(baseMonth);
  const {year: compareYear, month: compareMonth} = compareTableInfo;
  assertValidYear(compareYear);
  assertValidMonth(compareMonth);

  const paddedBaseMonth = String(baseMonth).padStart(2, '0');
  const paddedCompareMonth = String(compareMonth).padStart(2, '0');

  const encodedBaseEtag = encodeValidEtag(baseEtag);
  const encodedCompareEtag = encodeValidEtag(compareEtag);

  const relativePath = `/data/${metricValueId}/` +
      `paired-${baseYear}-${paddedBaseMonth}-to-${compareYear}-${paddedCompareMonth}.` +
      `${encodedBaseEtag}-${encodedCompareEtag}.csv`;
  return path.normalize(PROJECT_ROOT + relativePath);
}

/**
 * A query string to get a single column (with the name from `metricValueId`) of
 * results for the given metric and HTTP Archive run.
 * Query assumes it will be run in the context of an established dataset (table
 * in FROM clause isn't qualified by project/dataset).
 * @param {HaTableInfo} tableInfo
 * @param {MetricValueId|'performance_score'} metricValueId
 * @return {string}
 */
function getSingleTableMetricQuery(tableInfo, metricValueId) {
  assertValidColumnName(metricValueId);
  const {extractedTableId} = tableInfo;
  assertValidBigQueryId(extractedTableId);

  return `SELECT
      ROUND(${metricValueId}, 4) AS metric
    FROM
      \`${extractedTableId}\`
    WHERE
      ${metricValueId} IS NOT NULL AND
      runtime_error_code IS NULL
    ORDER BY
      # Keep results ordered by url (even though not included in results).
      requested_url, final_url`;
}

/**
 * A query string to get two columns (named `base` and `compare`) of results for the
 * given metric and two HTTP Archive runs, joined on URLs.
 * Query assumes it will be run in the context of an established dataset (table
 * in FROM clause isn't qualified by project/dataset).
 * @param {HaTableInfo} baseTableInfo
 * @param {HaTableInfo} compareTableInfo
 * @param {MetricValueId|'performance_score'} metricValueId
 * @return {string}
 */
function getPairedTablesMetricQuery(baseTableInfo, compareTableInfo, metricValueId) {
  assertValidColumnName(metricValueId);

  const baseTableId = baseTableInfo.extractedTableId;
  assertValidBigQueryId(baseTableId);

  const compareTableId = compareTableInfo.extractedTableId;
  assertValidBigQueryId(compareTableId);

  return `SELECT
      base_lh.${metricValueId} AS base,
      compare_lh.${metricValueId} AS compare
    FROM
      \`${baseTableId}\` AS base_lh
    INNER JOIN
      \`${compareTableId}\` AS compare_lh
    ON
      base_lh.final_url = compare_lh.final_url
      AND
      base_lh.requested_url = compare_lh.requested_url
    WHERE
      base_lh.${metricValueId} IS NOT NULL AND
        base_lh.runtime_error_code IS NULL
      AND
      compare_lh.${metricValueId} IS NOT NULL AND
        compare_lh.runtime_error_code IS NULL
    ORDER BY
      # Keep results ordered by url (even though not included in query results)
      base_lh.requested_url, base_lh.final_url`;
}

/**
 * Download a CSV result for the given query. Uses a temporary table in the
 * provided dataset for saving the results, which is deleted afterwards.
 * @param {string} metricQuery
 * @param {Dataset} intermediateDataset
 * @param {MetricValueId|'performance_score'} metricValueId For logging and easy table/file identification.
 * @return {Promise<Buffer>}
 */
async function getMetricQueryResults(metricQuery, intermediateDataset, metricValueId) {
  console.warn('  Running query...');

  const uuidSuffix = getUuidTableSuffix();
  const tmpId = `tmp_${metricValueId}_${uuidSuffix}`;

  // Temporary table to store query results before saving to cloud storage.
  const tmpTable = intermediateDataset.table(tmpId);
  await tmpTable.create();

  // Temporary cloud file to store tmpTable contents before saving to local disk.
  const tmpFile = tmpBucket.file(`${tmpId}.csv`);

  try {
    const [tmpMetricJob] = await intermediateDataset.createQueryJob({
      query: metricQuery,
      // Write to tmpTable only if it doesn't already exist.
      destination: tmpTable,
      writeDisposition: 'WRITE_EMPTY',
    });
    await tmpMetricJob.promise();

    const [metadata] = await tmpTable.getMetadata();
    const numRows = Number.parseInt(metadata.numRows).toLocaleString();
    console.warn(`  Complete. Query returned ${numRows} rows.`);

    // Extract temporary table to temporary cloud storage.
    console.warn('  Saving query results to a temporary cloud storage file for download...');
    await tmpTable.extract(tmpFile, {format: 'CSV'});

    console.warn('  Downloading query results from cloud storage...');
    const [contents] = await tmpFile.download();

    return contents;
  } finally {
    // Clean up tmp resources regardless of outcome.
    console.warn('  Cleaning up BQ and storage temp space...');
    await tmpTable.delete();
    await tmpFile.delete();
  }
}

/**
 * Query a metric from the given HTTP Archive table and save locally as a
 * single-column csv file.
 * `intermediateDataset` is the dataset used to cache tables of extracted LHRs.
 * Reuse `intermediateDataset` wherever possible as this is the expensive step.
 * By default these are extracted from the official `httparchive.lighthouse.*`
 * tables, but this can be overriden in `sourceOptions`.
 * @param {HaTableInfo} haTableInfo
 * @param {MetricValueId|'performance_score'} metricValueId
 * @param {Dataset} intermediateDataset
 * @param {Partial<SourceOptions>} [sourceOptions]
 * @return {Promise<string>}
 */
async function fetchSingleTableMetric(haTableInfo, metricValueId, intermediateDataset,
    sourceOptions) {
  console.warn(`Fetching '${metricValueId}' from extracted HTTP Archive run ` +
      `${haTableInfo.extractedTableId}`);

  // Start by making sure target HTTP Archive run has been extracted to intermediate table.
  const extractedTable = await extractMetricsFromHaLhrs(haTableInfo, intermediateDataset,
    sourceOptions);
  const [extractedMetadata] = await extractedTable.getMetadata();
  const extractedEtag = extractedMetadata.etag;

  // If file is already downloaded for this specific etag, we're good.
  const filename = getSingleSaveFilename(metricValueId, haTableInfo, extractedEtag);
  if (fs.existsSync(filename)) {
    console.warn(`  ./${path.relative(PROJECT_ROOT, filename)} already saved locally. Using it!`);
    return filename;
  }
  // TODO(bckenny): at some point, should probably clean up old data files with old etags.

  // If not, download a single column of metric data.
  const metricQuery = getSingleTableMetricQuery(haTableInfo, metricValueId);
  const metricCsv = await getMetricQueryResults(metricQuery, intermediateDataset, metricValueId);

  // And save to disk.
  await fs.promises.mkdir(path.dirname(filename), {recursive: true});
  await fs.promises.writeFile(filename, metricCsv);

  return filename;
}

/**
 * Query the given metric from the base and compare HTTP Archive tables, joined
 * on both `requested_url` and `final_url`, and save locally as a two-column csv
 * file. Results may be smaller than against the two separate tables as both
 * must have a non-error result for a particular URL.
 * Caching relies on the order of base and compare for simplicity, so always use
 * the same order to avoid doing extra work.
 * `intermediateDataset` is the dataset used to cache tables of extracted LHRs.
 * Reuse `intermediateDataset` wherever possible as this is the expensive step.
 * By default these are extracted from the official `httparchive.lighthouse.*`
 * tables, but this can be overriden in `sourceOptions`.
 * @param {HaTableInfo} baseTableInfo
 * @param {HaTableInfo} compareTableInfo
 * @param {MetricValueId|'performance_score'} metricValueId
 * @param {Dataset} intermediateDataset
 * @param {Partial<SourceOptions>} [sourceOptions]
 * @return {Promise<string>}
 */
async function fetchPairedTablesMetric(baseTableInfo, compareTableInfo, metricValueId,
    intermediateDataset, sourceOptions) {
  if (baseTableInfo.extractedTableId === compareTableInfo.extractedTableId) {
    throw new Error('Cannot fetch with same table as base and compare');
  }

  console.warn(`Fetching paired '${metricValueId}' from extracted HTTP Archive runs ` +
      `${baseTableInfo.extractedTableId} and ${compareTableInfo.extractedTableId}`);

  // Start by making sure target HTTP Archive runs have been extracted to intermediate tables.
  const [baseTable, compareTable] = await Promise.all([
    extractMetricsFromHaLhrs(baseTableInfo, intermediateDataset, sourceOptions),
    extractMetricsFromHaLhrs(compareTableInfo, intermediateDataset, sourceOptions),
  ]);
  const [baseMetadata] = await baseTable.getMetadata();
  const baseEtag = baseMetadata.etag;
  const [compareMetadata] = await compareTable.getMetadata();
  const compareEtag = compareMetadata.etag;

  // If file is already downloaded, we're good.
  const filename = getPairedSaveFilename(metricValueId, baseTableInfo, baseEtag, compareTableInfo,
      compareEtag);
  if (fs.existsSync(filename)) {
    console.warn(`  ./${path.relative(PROJECT_ROOT, filename)} already saved locally. Using it!`);
    return filename;
  }
  // TODO(bckenny): at some point, should probably clean up old data files with old etags.

  // If not, download the metric data.
  const pairedQuery = getPairedTablesMetricQuery(baseTableInfo, compareTableInfo, metricValueId);
  const pairedMetricCsv = await getMetricQueryResults(pairedQuery, intermediateDataset,
      metricValueId);

  // TODO(bckenny): do a zero-row result check cause something went wrong.

  // And save to disk.
  await fs.promises.mkdir(path.dirname(filename), {recursive: true});
  await fs.promises.writeFile(filename, pairedMetricCsv);

  return filename;
}

/**
 * Get a collection of the unique values of `columnId` in the LHRs in the given
 * table with a count of the occurrences of each.
 * Returns the results directly instead of through Cloud Storage, so query is
 * limited to columns with a limited number of possibilities.
 * If one of the values is `null`, the returned object will have a property with
 * a key of (the stringified) `'null'` for the count of the null values.
 * `intermediateDataset` is the dataset used to cache tables of extracted LHRs.
 * Reuse `intermediateDataset` wherever possible as this is the expensive step.
 * By default these are extracted from the official `httparchive.lighthouse.*`
 * tables, but this can be overriden in `sourceOptions`.
 * @param {HaTableInfo} tableInfo
 * @param {'lh_version'|'runtime_error_code'|'chrome_version'} columnId
 * @param {Dataset} intermediateDataset
 * @param {Partial<SourceOptions>} [sourceOptions]
 * @return {Promise<Record<string, number>>}
 */
async function fetchUniqueValueCounts(tableInfo, columnId, intermediateDataset, sourceOptions) {
  console.warn(`Fetching ${columnId} counts from extracted HTTP Archive run ` +
      `${tableInfo.extractedTableId}`);

  assertValidColumnName(columnId);
  const {extractedTableId} = tableInfo;
  assertValidBigQueryId(extractedTableId);

  // Start by making sure target HTTP Archive runs have been extracted to intermediate tables.
  await extractMetricsFromHaLhrs(tableInfo, intermediateDataset, sourceOptions);

  const countQuery = `SELECT
      ${columnId},
      COUNT(*) AS count,
    FROM
      \`${extractedTableId}\`
    GROUP BY
      ${columnId}
    ORDER BY
      ${columnId}`;

  const [rows] = await intermediateDataset.query({
    query: countQuery,
  });

  /** @type {Array<[string, number]>} */
  const countEntries = rows.map(t => [t[columnId], Number(t.count)]);

  // NOTE: `null` gets automatically converted to a string key here, but we
  // could switch to `Symbol.for(null)` or something if we ever need to avoid a
  // conflict or be more explicit in handling the result.
  return Object.fromEntries(countEntries);
}

export {
  fetchSingleTableMetric,
  getSingleSaveFilename,
  fetchPairedTablesMetric,
  getPairedSaveFilename,
  fetchUniqueValueCounts,
};
