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
import {
  extractMetricsFromLhrTable,
  getFullyQualifiedSourceTableId,
} from './extract-from-ha-tables.js';
import {
  assertValidYear,
  assertValidMonth,
  isHttpArchiveTable,
  getTableDate,
} from './ha-tables-data.js';
import {assertValidBigQueryId, assertValidColumnName, getUuidTableSuffix} from './bq-utils.js';

/** @typedef {import('@google-cloud/bigquery').Dataset} Dataset */

/** @typedef {import('../types/externs').LhrTableInfo} LhrTableInfo */
/** @typedef {import('./extract-from-ha-tables.js').MetricValueId} MetricValueId */

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
 * Generates a part of a file path used for identifying what BigQuery table the
 * source of the data is from. Uses `YYYY-MM` shorthand for HTTP Archive tables,
 * or `fully-qualified-table-id` for arbitrary tables with LHRs in them.
 * @param {LhrTableInfo} lhrTableInfo
 * @return {string}
 */
function getTableFileIdentifier(lhrTableInfo) {
  if (isHttpArchiveTable(lhrTableInfo)) {
    const {year, month} = getTableDate(lhrTableInfo.tableId);
    assertValidYear(year);
    assertValidMonth(month);
    const paddedMonth = String(month).padStart(2, '0');

    return `${year}-${paddedMonth}`;
  }

  // Default to fully qualified source name with '_' and '.' replaced with '-'.
  return getFullyQualifiedSourceTableId(lhrTableInfo)
    .replace(/[._]/g, '-');
}

/**
 * Generates an absolute path for a single-metric saved file, of the form
 * `PROJECT_ROOT/data/metricValueId/YYYY-MM.etag.csv' for HTTP Archive tables,
 * or `PROJECT_ROOT/data/metricValueId/fully-qualified-table-id.etag.csv' for
 * arbitrary tables with LHRs in them.
 * @param {MetricValueId|'performance_score'} metricValueId
 * @param {LhrTableInfo} lhrTableInfo
 * @param {string} tableEtag
 * @return {string}
 */
function getSingleSaveFilename(metricValueId, lhrTableInfo, tableEtag) {
  const encodedEtag = encodeValidEtag(tableEtag);

  const fileIdentifier = getTableFileIdentifier(lhrTableInfo);

  const relativePath = `/data/${metricValueId}/${fileIdentifier}.${encodedEtag}.csv`;
  return path.normalize(PROJECT_ROOT + relativePath);
}

/**
 * Generates an absolute path for a paired-metric saved file, of the form
 * `PROJECT_ROOT/data/metricId/paired-YYYY-MM-to-YYYY-MM.betag-cetag.csv' for
 * HTTP Archive tables, or
 * `PROJECT_ROOT/data/metricValueId/paired-fully-qualified-table-id-to-fully-qualified-table-id.etag.csv'
 * (or a mix of the two) for arbitrary tables with LHRs in them.
 * @param {MetricValueId|'performance_score'} metricValueId
 * @param {LhrTableInfo} baseTableInfo
 * @param {string} baseEtag
 * @param {LhrTableInfo} compareTableInfo
 * @param {string} compareEtag
 * @return {string}
 */
function getPairedSaveFilename(metricValueId, baseTableInfo, baseEtag, compareTableInfo,
    compareEtag) {
  const baseFileIdentifier = getTableFileIdentifier(baseTableInfo);
  const compareFileIdentifier = getTableFileIdentifier(compareTableInfo);

  const encodedBaseEtag = encodeValidEtag(baseEtag);
  const encodedCompareEtag = encodeValidEtag(compareEtag);

  const relativePath = `/data/${metricValueId}/` +
      `paired-${baseFileIdentifier}-to-${compareFileIdentifier}.` +
      `${encodedBaseEtag}-${encodedCompareEtag}.csv`;
  return path.normalize(PROJECT_ROOT + relativePath);
}

/**
 * Counts the number of rows in the given file, not counting the header line.
 * Assumes file is CSV without verification.
 * @param {string} filename
 * @return {Promise<number>}
 */
async function getCsvRowCount(filename) {
  const readStream = fs.createReadStream(filename, {encoding: 'utf-8'});
  let count = 0;
  for await (const chunk of readStream) {
    for (let i = 0; i < chunk.length; i++) {
      if (chunk.charCodeAt(i) === 10) { // '\n'
        count++;
      }
    }
  }

  // Subtract 1 to not count the headers.
  return count - 1;
}

/**
 * A query string to get a single column (with the name from `metricValueId`) of
 * results for the given metric from the given extracted table.
 * Query assumes it will be run in the context of an established dataset (table
 * in FROM clause isn't qualified by project/dataset).
 * @param {LhrTableInfo} lhrTableInfo
 * @param {MetricValueId|'performance_score'} metricValueId
 * @return {string}
 */
function getSingleTableMetricQuery(lhrTableInfo, metricValueId) {
  assertValidColumnName(metricValueId);
  const {extractedTableId} = lhrTableInfo;
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
 * A query string to get two columns (to be named `base` and `compare`) of
 * results for the given metric and two extracted tables, joined on URLs.
 * Query assumes it will be run in the context of an established dataset (table
 * in FROM clause isn't qualified by project/dataset).
 * @param {LhrTableInfo} baseTableInfo
 * @param {LhrTableInfo} compareTableInfo
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
 * Download a CSV result for the given query. Uses a temporary storage file in
 * the provided bucket for saving the results, which is deleted afterwards.
 * @param {string} metricQuery
 * @param {Dataset} extractedDataset
 * @param {MetricValueId|'performance_score'} metricValueId For logging and easy table/file identification.
 * @return {Promise<{results: Buffer, numRows: number}>}
 */
async function getMetricQueryResults(metricQuery, extractedDataset, metricValueId) {
  console.warn('  Running query...');

  // Temporary cloud file to store query contents before saving to local disk.
  const uuidSuffix = getUuidTableSuffix(); // TODO(bckenny): more of a file suffix now.
  const tmpFile = tmpBucket.file(`tmp_${metricValueId}_${uuidSuffix}.csv`);

  try {
    // Results are written to a temporary table created by BigQuery.
    const [tmpMetricJob] = await extractedDataset.createQueryJob({
      query: metricQuery,
    });
    await tmpMetricJob.promise();

    // Get a reference to the temporary table.
    const [tmpJobMetadata] = await tmpMetricJob.getMetadata();
    const destinationInfo = tmpJobMetadata.configuration.query.destinationTable;
    const tmpTable = extractedDataset.bigQuery
      .dataset(destinationInfo.datasetId)
      .table(destinationInfo.tableId);

    const [tmpTableExists] = await tmpTable.exists();
    if (!tmpTableExists) {
      throw new Error(`temporary table not found at ${JSON.stringify(destinationInfo)}`);
    }

    const [metadata] = await tmpTable.getMetadata();
    const numRows = Number.parseInt(metadata.numRows).toLocaleString();
    console.warn(`  Complete. Query returned ${numRows} rows.`);

    // Extract temporary table to temporary cloud storage.
    console.warn('  Saving query results to a temporary cloud storage file for download...');
    await tmpTable.extract(tmpFile, {format: 'CSV'});

    console.warn('  Downloading query results from cloud storage...');
    const [results] = await tmpFile.download();

    return {
      results,
      numRows: Number(metadata.numRows),
    };
  } finally {
    // Clean up tmp file regardless of outcome.
    console.warn('  Cleaning up storage temp file...');
    await tmpFile.delete();
  }
}

/**
 * Query a metric from the source LHR table and save locally as a
 * single-column csv file.
 * @param {LhrTableInfo} lhrTableInfo
 * @param {MetricValueId|'performance_score'} metricValueId
 * @return {Promise<{filename: string, numRows: number}>}
 */
async function fetchSingleTableMetric(lhrTableInfo, metricValueId) {
  console.warn(`Fetching '${metricValueId}' from extracted HTTP Archive run ` +
      `${lhrTableInfo.extractedTableId}`);

  // Start by making sure target HTTP Archive run has been extracted.
  const extractedTable = await extractMetricsFromLhrTable(lhrTableInfo);
  const [extractedMetadata] = await extractedTable.getMetadata();
  const extractedEtag = extractedMetadata.etag;

  // If file is already downloaded for this specific etag, we're good.
  const filename = getSingleSaveFilename(metricValueId, lhrTableInfo, extractedEtag);
  if (fs.existsSync(filename)) {
    const numRows = await getCsvRowCount(filename);
    console.warn(`  ./${path.relative(PROJECT_ROOT, filename)} already saved locally. Using it!`);
    return {
      filename,
      numRows,
    };
  }
  // TODO(bckenny): at some point, should probably clean up old data files with old etags.

  // If not, download a single column of metric data.
  const metricQuery = getSingleTableMetricQuery(lhrTableInfo, metricValueId);
  const extractedDataset = lhrTableInfo.extractedDataset;
  const {results: metricCsv, numRows} = await getMetricQueryResults(metricQuery,
      extractedDataset, metricValueId);

  // And save to disk.
  await fs.promises.mkdir(path.dirname(filename), {recursive: true});
  await fs.promises.writeFile(filename, metricCsv);

  return {
    filename,
    numRows,
  };
}

/**
 * Query the given metric from the `base` and `compare` LHR-containing tables
 * (like from the HTTP Archive), joined on both `requested_url` and `final_url`,
 * and save the results locally as a two-column csv file. Results may be smaller
 * than from each of the two separate tables as both are required to have a non-
 * error result for a particular URL. Caching relies on the order of `base` and
 * `compare` for simplicity, so always use the same order to avoid doing extra
 * work.
 * @param {LhrTableInfo} baseTableInfo
 * @param {LhrTableInfo} compareTableInfo
 * @param {MetricValueId|'performance_score'} metricValueId
 * @return {Promise<{filename: string, numRows: number}>}
 */
async function fetchPairedTablesMetric(baseTableInfo, compareTableInfo, metricValueId) {
  if (baseTableInfo.extractedTableId === compareTableInfo.extractedTableId) {
    throw new Error('Cannot fetch with same table as base and compare');
  }

  console.warn(`Fetching paired '${metricValueId}' from extracted HTTP Archive runs ` +
      `${baseTableInfo.extractedTableId} and ${compareTableInfo.extractedTableId}`);

  // Start by making sure target HTTP Archive runs have been extracted.
  const [baseTable, compareTable] = await Promise.all([
    extractMetricsFromLhrTable(baseTableInfo),
    extractMetricsFromLhrTable(compareTableInfo),
  ]);
  const [baseMetadata] = await baseTable.getMetadata();
  const baseEtag = baseMetadata.etag;
  const [compareMetadata] = await compareTable.getMetadata();
  const compareEtag = compareMetadata.etag;

  // If file is already downloaded, we're good.
  const filename = getPairedSaveFilename(metricValueId, baseTableInfo, baseEtag, compareTableInfo,
      compareEtag);
  if (fs.existsSync(filename)) {
    const numRows = await getCsvRowCount(filename);
    console.warn(`  ./${path.relative(PROJECT_ROOT, filename)} already saved locally. Using it!`);
    return {
      filename,
      numRows,
    };
  }
  // TODO(bckenny): at some point, should probably clean up old data files with old etags.

  // If not, download the metric data.
  const pairedQuery = getPairedTablesMetricQuery(baseTableInfo, compareTableInfo, metricValueId);
  const extractedDataset = baseTableInfo.extractedDataset;
  const {results: pairedMetricCsv, numRows} = await getMetricQueryResults(pairedQuery,
      extractedDataset, metricValueId);

  // And save to disk.
  await fs.promises.mkdir(path.dirname(filename), {recursive: true});
  await fs.promises.writeFile(filename, pairedMetricCsv);

  return {
    filename,
    numRows,
  };
}

/**
 * Get a collection of the unique values of `columnId` in the LHRs in the given
 * table with a count of the occurrences of each.
 * Returns the results directly instead of through Cloud Storage, so query is
 * limited to columns with a limited number of possibilities.
 * If one of the values is `null`, the returned object will have a property with
 * a key of (the stringified) `'null'` for the count of the null values.
 * @param {LhrTableInfo} lhrTableInfo
 * @param {'lh_version'|'runtime_error_code'|'chrome_version'|'performance_score'} columnId
 * @return {Promise<Record<string, number>>}
 */
async function fetchUniqueValueCounts(lhrTableInfo, columnId) {
  console.warn(`Fetching ${columnId} counts from extracted HTTP Archive run ` +
      `${lhrTableInfo.extractedTableId}`);

  // Fail early on invalid identifiers.
  assertValidColumnName(columnId);
  const {extractedTableId} = lhrTableInfo;
  assertValidBigQueryId(extractedTableId);

  // Start by making sure target LHR table has been extracted.
  await extractMetricsFromLhrTable(lhrTableInfo);

  const countQuery = `SELECT
      ${columnId},
      COUNT(*) AS count,
    FROM
      \`${extractedTableId}\`
    GROUP BY
      ${columnId}
    ORDER BY
      ${columnId}`;

  const [rows] = await lhrTableInfo.extractedDataset.query({
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
