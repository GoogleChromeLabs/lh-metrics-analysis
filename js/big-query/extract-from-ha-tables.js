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

/**
 * @fileoverview Functions to extract metric data from raw string LHRs and put
 * it in a set of structured `lh_extract` dataset tables for faster (and
 * considerably cheaper) additional queries.
 */

import {assertValidProjectId, assertValidBigQueryId} from './bq-utils.js';

/** @typedef {import('@google-cloud/bigquery').BigQuery} BigQuery */
/** @typedef {Immutable<import('@google-cloud/bigquery').TableSchema>} TableSchema */
/** @typedef {import('@google-cloud/bigquery').Dataset} Dataset */
/** @typedef {import('@google-cloud/bigquery').Table} Table */
/** @typedef {import('@google-cloud/bigquery').Job} Job */

/** @typedef {import('./ha-tables-data.js').HaTableInfo} HaTableInfo */

/**
 * @typedef SourceOptions
 * @property {string} haProjectId Override for the HTTP Archive project to query.
 * @property {string} haDatasetId Override for the HTTP Archive dataset to query.
 */
/**
 * The metric values available to query.
 * @typedef {'fcp_value'|'fmp_value'|'lcp_value'|'mpfid_value'|'si_value'|'tbt_value'|'tti_value'|'cls_value'} MetricValueId
 */

// TODO(bckenny): use in caller
const EXTRACTED_DATASET_ID = 'lh_extract'; // eslint-disable-line no-unused-vars

const DEFAULT_HA_PROJECT_ID = 'httparchive';
const DEFAULT_HA_DATASET_ID = 'lighthouse';

// TODO(bckenny): perf error run (null perf score)?
// TODO(bckenny): Number/percentage of errored audits?
// TODO(bckenny): should usually ignore e.g. FAILED_DOCUMENT_REQUEST but still have all metrics?
// TODO(bckenny): should runWarning "The page loaded too slowly to finish" be considered valid metrics?

/**
 * Asserts valid year for HTTP Archive tables (though a table with this year may
 * not exist).
 * @param {number} year
 */
function assertValidYear(year) {
  if (!Number.isInteger(year) || year < 2017 || year > 2050) {
    throw new Error(`Invalid HTTP Archive run year ${year}`);
  }
}

/**
 * Asserts valid month for HTTP Archive tables (though a table with this month
 * may not exist). Note that month is assumed to be in [1, 12], *not* [0, 11] as
 * is usual in JS dates.
 * @param {number} month
 */
function assertValidMonth(month) {
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error(`Invalid HTTP Archive run month ${month}`);
  }
}

/**
 * Assumes always day 01 even back when runs happened twice a month.
 * @param {HaTableInfo} haTableInfo
 * @param {SourceOptions} sourceOptions
 */
function getFullHttpArchiveTableId({year, month}, sourceOptions) {
  assertValidYear(year);
  assertValidMonth(month);

  const haProjectId = sourceOptions.haProjectId ?? 'httparchive';
  assertValidProjectId(haProjectId);
  const haDatasetId = sourceOptions.haDatasetId ?? 'lighthouse';
  assertValidBigQueryId(haDatasetId);

  const paddedMonth = String(month).padStart(2, '0');
  return `${haProjectId}.${haDatasetId}.${year}_${paddedMonth}_01_mobile`;
}

/**
 * Returns a standard extracted table ID for the given date. Month is
 * assumed to be in [1, 12], not [0, 11] as is usual in JS dates.
 * @param {{year: number, month: number}} tableInfo
 */
function getExtractedTableId({year, month}) {
  assertValidYear(year);
  assertValidMonth(month);

  const paddedMonth = String(month).padStart(2, '0');
  return `lh_extract_${year}_${paddedMonth}_01`;
}

/**
 * @return {TableSchema}
 */
function getExtractedTableSchema() {
  /**
   * @type {Array<{
   *   name: 'requested_url'|'final_url'|'lh_version'|'runtime_error_code'|'chrome_version'|'performance_score'|MetricValueId,
   *   type: 'STRING'|'FLOAT',
   *   mode?: 'REQUIRED'
   * }>}
   */
  const fields = [
    {name: 'requested_url', type: 'STRING', mode: 'REQUIRED'},
    {name: 'final_url', type: 'STRING', mode: 'REQUIRED'},
    {name: 'lh_version', type: 'STRING', mode: 'REQUIRED'},

    // Nullable.
    {name: 'runtime_error_code', type: 'STRING'},
    {name: 'chrome_version', type: 'STRING'},

    // Metrics (nullable if errored).
    // For whatever reason, schema always comes back as FLOAT, even if FLOAT64
    // is set, so keep it FLOAT for now.
    {name: 'performance_score', type: 'FLOAT'},
    {name: 'fcp_value', type: 'FLOAT'},
    {name: 'fmp_value', type: 'FLOAT'},
    {name: 'lcp_value', type: 'FLOAT'},
    {name: 'mpfid_value', type: 'FLOAT'},
    {name: 'si_value', type: 'FLOAT'},
    {name: 'tbt_value', type: 'FLOAT'},
    {name: 'tti_value', type: 'FLOAT'},
    {name: 'cls_value', type: 'FLOAT'},
  ];

  return {
    fields,
  };
}

/**
 * Ensure that schemaA's fields are a subset of schemaB's fields. Includes
 * labels for better error logging.
 * @param {TableSchema} schemaA
 * @param {TableSchema} schemaB
 * @param {string} schemaALabel
 * @param {string} schemaBLabel
 * @return {boolean}
 */
function isSchemaFieldsSubset(schemaA, schemaB, schemaALabel, schemaBLabel) {
  if (!schemaA.fields || !schemaB.fields) {
    return false;
  }

  for (const fieldInA of schemaA.fields) {
    if (!fieldInA.name) {
      console.warn(`${schemaALabel} has a field without a name`);
      return false;
    }

    const matchingFieldInB = schemaB.fields.find(candidateField => {
      return candidateField.name === fieldInA.name;
    });
    if (!matchingFieldInB) {
      console.warn(`${schemaALabel} has a field '${fieldInA.name}' not found in ${schemaBLabel}`);
      return false;
    }

    // Check fieldInA's properties all have a match in matchingFieldInB.
    // TODO(bckenny): if we aren't going to handle nested categories/fields, maybe just do explicit keys
    for (const fieldInAProp of Object.keys(fieldInA)) {
      if (!(fieldInAProp in matchingFieldInB)) {
        // eslint-disable-next-line max-len
        console.warn(`${schemaBLabel} field '${fieldInA.name}' is missing property '${fieldInAProp}' found in matching ${schemaALabel} field`);
        return false;
      }

      // @ts-expect-error - property established as existing; type not important.
      if (fieldInA[fieldInAProp] !== matchingFieldInB[fieldInAProp]) {
        console.warn(`${schemaBLabel} field '${fieldInA.name}' has '${fieldInAProp}' set to ` +
            // @ts-expect-error - properties just accessed for logging.
            // eslint-disable-next-line max-len
            `'${matchingFieldInB[fieldInAProp]}', while ${schemaALabel} expects it to be set to '${fieldInA[fieldInAProp]}'`);
        return false;
      }
    }
  }

  return true;
}

/**
 * Returns whether provided schema matches the required extractedTable schema.
 * @param {TableSchema} schema
 * @return {boolean}
 */
function isValidExpectedSchema(schema) {
  const expectedSchema = getExtractedTableSchema();

  // Check if each is a subset of the other for better logging.
  if (!isSchemaFieldsSubset(schema, expectedSchema, 'found schema', 'expected schema')) {
    return false;
  }
  if (!isSchemaFieldsSubset(expectedSchema, schema, 'expected schema', 'found schema')) {
    return false;
  }

  return true;
}

/**
 * Get query to extract metrics from HTTPArchive LHRs.
 * @param {HaTableInfo} haTableInfo
 * @param {SourceOptions} sourceOptions
 * @return {string}
 */
function getLhrExtractQuery(haTableInfo, sourceOptions) {
  const haTableId = getFullHttpArchiveTableId(haTableInfo, sourceOptions);

  /* eslint-disable max-len */
  return `SELECT
      # lh_version
      # due to a publishing mishap, "4.0.0-alpha.2-3.2.1" is really "3.2.1".
      CASE WHEN JSON_EXTRACT_SCALAR(report, '$.lighthouseVersion') = '4.0.0-alpha.2-3.2.1'
        THEN "3.2.1"
        ELSE JSON_EXTRACT_SCALAR(report, '$.lighthouseVersion')
        END AS lh_version,

      # requested_url
      CASE WHEN major_lh_version = 2
        THEN JSON_EXTRACT_SCALAR(report, '$.initialUrl')
        ELSE JSON_EXTRACT_SCALAR(report, '$.requestedUrl')
        END AS requested_url,

      # final_url
      CASE WHEN major_lh_version = 2
        THEN JSON_EXTRACT_SCALAR(report, '$.url')
        ELSE JSON_EXTRACT_SCALAR(report, '$.finalUrl')
        END AS final_url,

      # runtime_error_code
      # NULL before runtimeError was added or when no error after 4.2.0.
      # Between 3.2.0 but 4.2.0, no error was code 'NO_ERROR', so coerce to NULL.
      CASE WHEN raw_runtime_error_code = 'NO_ERROR'
        THEN NULL
        ELSE raw_runtime_error_code
        END AS runtime_error_code,

      # chrome_version
      CASE
        WHEN major_lh_version = 2 AND minor_lh_version < 3
          # $.userAgent added in 2.0.0 but was the *emulated* UA string before 2.3.0 (GoogleChrome/lighthouse#2612)
          THEN NULL
        WHEN major_lh_version < 4
          THEN REGEXP_EXTRACT(JSON_EXTRACT_SCALAR(report, '$.userAgent'), r"Chrome\\/([\\d.]+)")
        ELSE
          # $.userAgent still works at this point, but $.environment.hostUserAgent is the intended future-proof property.
          REGEXP_EXTRACT(JSON_EXTRACT_SCALAR(report, '$.environment.hostUserAgent'), r"Chrome\\/([\\d.]+)")
        END AS chrome_version,

      # performance_score
      CASE
        WHEN major_lh_version = 2 AND minor_lh_version < 8
          # Originally reportCategories was an array and perf was the second element. Normalize to [0,1].
          THEN ROUND(CAST(JSON_EXTRACT_SCALAR(report, '$.reportCategories[1].score') AS FLOAT64) / 100, 2)
        WHEN major_lh_version < 3
          # Perf moved to the first element of reportCategories in 2.8 (GoogleChrome/lighthouse#4095). Normalize to [0,1].
          THEN ROUND(CAST(JSON_EXTRACT_SCALAR(report, '$.reportCategories[0].score') AS FLOAT64) / 100, 2)
        ELSE
          # Moved to the categories object in 3.0 (GoogleChrome/lighthouse#5155), score is in [0,1], and
          # an error in one of the metrics makes this value null.
          CAST(JSON_EXTRACT_SCALAR(report, '$.categories.performance.score') AS FLOAT64)
        END AS performance_score,

      # fcp_value
      CASE
        WHEN major_lh_version = 2
          # nested in FMP details in 2.x
          THEN CAST(JSON_EXTRACT_SCALAR(report, '$.audits.first-meaningful-paint.extendedInfo.value.timings.fCP') AS FLOAT64)
        WHEN major_lh_version < 5
          THEN CAST(JSON_EXTRACT_SCALAR(report, '$.audits.first-contentful-paint.rawValue') AS FLOAT64)
        ELSE
          CAST(JSON_EXTRACT_SCALAR(report, '$.audits.first-contentful-paint.numericValue') AS FLOAT64)
        END AS fcp_value,

      # fmp_value
      CASE WHEN major_lh_version < 5
        THEN CAST(JSON_EXTRACT_SCALAR(report, '$.audits.first-meaningful-paint.rawValue') AS FLOAT64)
        ELSE CAST(JSON_EXTRACT_SCALAR(report, '$.audits.first-meaningful-paint.numericValue') AS FLOAT64)
        END AS fmp_value,

      # lcp_value
      CASE WHEN major_lh_version < 6
        # Observed LCP is available in 'metrics' audit prior to 6.0.
        THEN CAST(JSON_EXTRACT_SCALAR(report, '$.audits.metrics.details.items[0].observedLargestContentfulPaint') AS FLOAT64)
        ELSE CAST(JSON_EXTRACT_SCALAR(report, '$.audits.largest-contentful-paint.numericValue') AS FLOAT64)
        END AS lcp_value,

      # mpfid_value
      CASE WHEN major_lh_version < 5
        # mpfid available starting in 4.2.
        THEN CAST(JSON_EXTRACT_SCALAR(report, '$.audits.max-potential-fid.rawValue') AS FLOAT64)
        ELSE CAST(JSON_EXTRACT_SCALAR(report, '$.audits.max-potential-fid.numericValue') AS FLOAT64)
        END AS mpfid_value,

      # si_value
      CASE
        WHEN major_lh_version = 2
          # Originally 'speed-index-metric'
          THEN  CAST(JSON_EXTRACT_SCALAR(report, '$.audits.speed-index-metric.rawValue') AS FLOAT64)
        WHEN major_lh_version < 5
          THEN CAST(JSON_EXTRACT_SCALAR(report, '$.audits.speed-index.rawValue') AS FLOAT64)
        ELSE
          CAST(JSON_EXTRACT_SCALAR(report, '$.audits.speed-index.numericValue') AS FLOAT64)
        END AS si_value,

      # tbt_value available starting in 5.2.
      CAST(JSON_EXTRACT_SCALAR(report, '$.audits.total-blocking-time.numericValue') AS FLOAT64) AS tbt_value,

      # tti_value
      CASE
        WHEN major_lh_version = 2
          # Originally 'consistently-interactive'
          THEN CAST(JSON_EXTRACT_SCALAR(report, '$.audits.consistently-interactive.rawValue') AS FLOAT64)
        WHEN major_lh_version < 5
          THEN CAST(JSON_EXTRACT_SCALAR(report, '$.audits.interactive.rawValue') AS FLOAT64)
        ELSE
          CAST(JSON_EXTRACT_SCALAR(report, '$.audits.interactive.numericValue') AS FLOAT64)
        END AS tti_value,

      # cls_value available starting in 6.0.
      CAST(JSON_EXTRACT_SCALAR(report, '$.audits.cumulative-layout-shift.numericValue') AS FLOAT64) AS cls_value,

    FROM (
      SELECT
        report,

        # extract major and minor Lighthouse versions.
        # due to a publishing mishap, "4.0.0-alpha.2-3.2.1" is really "3.2.1".
        CASE WHEN JSON_EXTRACT_SCALAR(report, '$.lighthouseVersion') = '4.0.0-alpha.2-3.2.1'
          THEN 3
          ELSE CAST(REGEXP_EXTRACT(JSON_EXTRACT_SCALAR(report, '$.lighthouseVersion'), r"^(\\d+)\\.") AS INT64)
          END AS major_lh_version,
        CASE WHEN JSON_EXTRACT_SCALAR(report, '$.lighthouseVersion') = '4.0.0-alpha.2-3.2.1'
          THEN 2
          ELSE CAST(REGEXP_EXTRACT(JSON_EXTRACT_SCALAR(report, '$.lighthouseVersion'), r"^\\d+\\.(\\d+)\\.") AS INT64)
          END AS minor_lh_version,

        JSON_EXTRACT_SCALAR(report, '$.runtimeError.code') AS raw_runtime_error_code
      FROM \`${haTableId}\`
      WHERE report is not NULL
    )`;
  /* eslint-enable max-len */
}

/**
 * Returns whether extractedTable already exists.
 * @param {Table} extractedTable
 * @return {Promise<boolean>}
 */
async function isExistingTable(extractedTable) {
  // `id` exists, just give a backup 'Table' name due to BQ type looseness.
  const extractedTableName = extractedTable.id || 'Table';

  console.warn(`  Checking if table '${extractedTableName}' already exists...`);
  const [exists] = await extractedTable.exists();

  if (!exists) {
    console.warn('  Table does not exist.');
  }

  return exists;
}

/**
 * Returns whether an existing extracted table can be reused.
 * @param {Table} extractedTable
 * @return {Promise<boolean>}
 */
async function isExtractedTableValid(extractedTable) {
  const [{schema: existingSchema, numRows}] = await extractedTable.getMetadata();

  const zeroRows = numRows === '0';
  if (zeroRows) {
    console.warn('  Table found but it contains no data.');
    return false;
  }

  const invalidSchema = !isValidExpectedSchema(existingSchema);
  if (invalidSchema) {
    console.warn('  Existing table\'s schema is out of date.');
    return false;
  }
  return true;
}

/**
 * Delete the given table, due to invalid schema, malformed contents, etc.
 * @param {Table} extractedTable
 * @return {Promise<void>}
 */
async function deleteExtractedTable(extractedTable) {
  // TODO(bckenny): useful during dev if invalid prognosis might be wrong.
  // let deleteTable = true;
  // const {interactiveDeleteTable} = await enquirer.prompt({
  //   type: 'confirm',
  //   name: 'interactiveDeleteTable',
  //   message: 'Is this expected? Will delete if so.',
  //   initial: true,
  // });
  // deleteTable = interactiveDeleteTable;
  // if (!deleteTable) {
  //   throw new Error(`Existing table was invalid for current use but not scheduled for deletion`);
  // }

  console.warn('  Deleting existing table...');
  await extractedTable.delete();
}

/**
 * Create the given table and extract LHR data to it.
 * @param {Table} extractedTable
 * @param {HaTableInfo} haTableInfo
 * @param {SourceOptions} sourceOptions
 */
async function createExtractedTable(extractedTable, haTableInfo, sourceOptions) {
  const extractedTableName = extractedTable.id || 'Table';

  const schema = getExtractedTableSchema();
  await extractedTable.create({schema});
  console.warn(`  '${extractedTableName}' created.`);

  // And extract to it.
  const haTableId = getFullHttpArchiveTableId(haTableInfo, sourceOptions);
  console.warn(`Extracting metrics from ${haTableId} and saving to ${extractedTableName}...`);
  const extractQuery = getLhrExtractQuery(haTableInfo, sourceOptions);
  const [extractJob] = await extractedTable.bigQuery.createQueryJob({
    query: extractQuery,
    // Write to extractedTable only if it doesn't already exist.
    destination: extractedTable,
    writeDisposition: 'WRITE_EMPTY',
  });
  await extractJob.promise();
  console.warn('  Extraction complete.');
}

/**
 * Assert the project/dataset ids to extract from are valid and, (HACK) if in a
 * test, that the default HTTP Archive dataset isn't accidentally being used.
 * @param {Partial<SourceOptions>} options
 * @return {SourceOptions}
 */
function assertValidSourceOptions(options) {
  const haProjectId = options.haProjectId ?? DEFAULT_HA_PROJECT_ID;
  const haDatasetId = options.haDatasetId ?? DEFAULT_HA_DATASET_ID;

  assertValidProjectId(haProjectId);
  assertValidBigQueryId(haDatasetId);

  // Querying the full HTTP Archive tables can be done but it's expensive.
  // HACK: guard against when testing.
  const isTest = typeof global.describe === 'function' && typeof global.beforeEach === 'function';

  // If in a test, don't accidentally use the defaults.
  if (isTest && haProjectId === DEFAULT_HA_PROJECT_ID) {
    throw new Error('appear to be in test but still using the default httparchive source IDs');
  }

  // Otherwise, fine, do what you want.
  return {haProjectId, haDatasetId};
}

/**
 * Extracts the key metrics from the LHR JSON strings in the given HTTP Archive
 * table and saves them as columns in a matching table ID in the
 * `destinationDataset`.
 * If a table by that ID already exists (and it matches the expected schema), no
 * additional work is done.
 * Returns a reference to the table with the extracted metrics.
 * By default these are extracted from the official `httparchive.lighthouse.*`
 * tables, but this can be overriden in `sourceOptions`.
 * @param {HaTableInfo} haTableInfo
 * @param {Dataset} destinationDataset
 * @param {Partial<SourceOptions>} [sourceOptions]
 * @return {Promise<Table>}
 */
async function extractMetricsFromHaLhrs(haTableInfo, destinationDataset, sourceOptions = {}) {
  const checkedSourceOptions = assertValidSourceOptions(sourceOptions);

  const {year, month, extractedTableId} = haTableInfo;
  assertValidYear(year);
  assertValidMonth(month);
  const extractedTable = destinationDataset.table(extractedTableId);

  // Check if LHR has already been extracted and existing table's schema looks right.
  const tableExists = await isExistingTable(extractedTable);
  if (tableExists) {
    console.warn('  Table already exists. Checking if schema matches...');
    const isValid = await isExtractedTableValid(extractedTable);
    if (isValid) {
      console.warn('  Table is good to go. Using it.');
      return extractedTable;
    }

    // Current table is invalid, so delete and recreate below.
    await deleteExtractedTable(extractedTable);
  }

  // If not, create new table.
  console.warn('  Valid table not found. Creating one...');
  await createExtractedTable(extractedTable, haTableInfo, checkedSourceOptions);

  // Throw if somehow the extracted table is invalid or empty.
  const isValid = await isExtractedTableValid(extractedTable);
  if (!isValid) {
    throw new Error(`extracted table '${destinationDataset.id}.${extractedTableId}' ` +
        'is empty or invalid');
  }

  return extractedTable;
}

/**
 * Returns the total number of rows in the given table.
 * By default these are extracted from the official `httparchive.lighthouse.*`
 * tables, but this can be overriden in `sourceOptions`.
 * @param {BigQuery} bigQuery
 * @param {HaTableInfo} haTableInfo
 * @param {Partial<SourceOptions>} [sourceOptions]
 * @return {Promise<number>}
 */
async function getTotalRows(bigQuery, haTableInfo, sourceOptions = {}) {
  const {haProjectId, haDatasetId} = assertValidSourceOptions(sourceOptions);
  const tableId = haTableInfo.tableId;
  assertValidBigQueryId(tableId);

  const rowNumQuery = `SELECT row_count AS rowCount
    FROM \`${haProjectId}.${haDatasetId}.__TABLES__\`
    WHERE table_id = '${tableId}'`;

  const [rows] = await bigQuery.query({
    query: rowNumQuery,
  });

  /** @type {string} */
  const rowCount = rows[0]?.rowCount;
  // Throw on undefined and empty string.
  if (!rowCount) {
    throw new Error(`unable to find a row count for table '${tableId}'`);
  }

  return Number(rowCount);
}

export {
  getExtractedTableId,
  extractMetricsFromHaLhrs,
  assertValidYear,
  assertValidMonth,
  getTotalRows,
};
