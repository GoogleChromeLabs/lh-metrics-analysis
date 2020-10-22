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
 * @fileoverview An interactive utility to create (very small) samples of the
 * `httparchive.lighthouse.20XX_XX_01_mobile` tables for testing of LHR queries
 * without running through TBs of quota.
 *
 * Currently assumes write access to `lh-metrics-analysis.test_lighthouse.*`,
 * but this could maybe be genericized if others want to generate test data.
 */

import enquirer from 'enquirer';

// TODO(bckenny): use createRequire() for cjs deps when supported by tsc.
import BQModule from '@google-cloud/bigquery';
const {BigQuery} = BQModule;

import HaTablesData from '../../js/big-query/ha-tables-data.js';
import credentials from '../../js/big-query/auth/credentials.js';

/** @typedef {import('@google-cloud/bigquery').Table} Table */
/** @typedef {import('@google-cloud/bigquery').Dataset} Dataset */
/** @typedef {import('../../js/types/externs').LhrTableInfo} LhrTableInfo */

// Tables mirror `httparchive.lighthouse` but in the test dataset.
const TEST_DATASET_ID = 'test_lighthouse';

/**
 * @param {string} id
 */
function assertSafeTableId(id) {
  if (!/^\w+$/.test(id)) {
    throw new Error(`invalid table id ${id}`);
  }
}

/**
 * A query to get count per Lighthouse version in the sampled test table.
 * @param {string} tableId
 * @return {string}
 */
function getTestTableVersionQuery(tableId) {
  assertSafeTableId(tableId);

  return `SELECT
      lh_version,
      COUNT(*) as count,
    FROM
      \`${tableId}\`
    GROUP BY lh_version
    ORDER BY lh_version`;
}

/**
 * A sampling query that gets a unique LHR for every
 * (lighthouseVersion ⨯ error/no-error perf score ⨯ runtimeError.code (if defined)).
 * Goal is to give a small number of LHRs (as few as 2 for Lighthouse < 3.2.0)
 * to make sure extraction queries handle the varieties of LHR states per version
 * and as versions have evolved over time.
 * @param {LhrTableInfo} lhrTableInfo
 * @return {string}
 */
function getSamplingQuery(lhrTableInfo) {
  const {tableId} = lhrTableInfo;
  assertSafeTableId(tableId);

  /* eslint-disable max-len */
  return `SELECT
      MIN(report) as report,
      lh_version,
      runtime_error,
      valid_perf_score
    FROM (
      SELECT
        report,
        JSON_EXTRACT_SCALAR(report, '$.lighthouseVersion') AS lh_version,

        # capture an error case and a non-error case
        # always null before it was added in Lighthouse 3.2.0
        CASE WHEN
            JSON_EXTRACT_SCALAR(report, '$.runtimeError.code') IS NULL OR
            # no error before 4.2.0 was code 'NO_ERROR'
            JSON_EXTRACT_SCALAR(report, '$.runtimeError.code') = 'NO_ERROR'
          THEN FALSE
          ELSE TRUE
          END AS runtime_error,

        # Select for runs with error/no-error perf category score.
        CASE WHEN STARTS_WITH(JSON_EXTRACT_SCALAR(report, '$.lighthouseVersion'), "2")
          THEN
            # In LH 2.x, null scores were averaged as 0, so look at fmp (which was required for many audits) for perf-error run.
            JSON_EXTRACT_SCALAR(report, '$.audits.first-meaningful-paint.score') IS NOT NULL
          ELSE
            # In LH ≥ 3.0.0, perf score is null if any category errored.
            JSON_EXTRACT_SCALAR(report, '$.categories.performance.score') IS NOT NULL
          END AS valid_perf_score,

      FROM \`httparchive.lighthouse.${tableId}\`
      WHERE report is not NULL
    )
    GROUP BY lh_version, runtime_error, valid_perf_score`;
  /* eslint-enable max-len */
}

/**
 * Sample the given table's LHRs and save them to a table for testing.
 * @param {Dataset} testDataset
 * @param {LhrTableInfo} lhrTableInfo
 * @return {Promise<Table>}
 */
async function createTestTable(testDataset, lhrTableInfo) {
  // Table id is the same HTTP Archive id but in the test dataset.
  const testTable = testDataset.table(lhrTableInfo.tableId);

  console.warn(`Sampling LHRs from ${lhrTableInfo.tableId} and saving to test table...`);
  const samplingQuery = getSamplingQuery(lhrTableInfo);
  const [samplingJob] = await testDataset.bigQuery.createQueryJob({
    query: samplingQuery,

    // Write to testTable only if it doesn't already exist.
    destination: testTable,
    writeDisposition: 'WRITE_EMPTY',
  });
  await samplingJob.promise();
  console.warn('  Sampling complete.');

  return testTable;
}

/**
 * @param {Table} testTable
 * @return {Promise<void>}
 */
async function printTestTableInfo(testTable) {
  const [{numRows}] = await testTable.getMetadata();

  const tableId = testTable.id;
  if (!tableId) return; // Keep tsc happy; the id exists.
  const query = getTestTableVersionQuery(tableId);

  const [rows] = await testTable.query({query});

  console.warn(`${tableId} resulted in ${numRows} rows of test LHRs`);
  console.table(rows); // eslint-disable-line no-console
}

/**
 * @param {Dataset} testDataset
 * @return {Promise<Array<string>>}
 */
async function getExistingTestTableIds(testDataset) {
  const query = `SELECT table_id
    FROM \`${TEST_DATASET_ID}.__TABLES__\`
    WHERE ENDS_WITH(table_id, 'mobile')`;

  const [tables] = await testDataset.query({query});
  return tables.map(t => t.table_id);
}

/**
 * @param {Dataset} testDataset
 * @return {Promise<LhrTableInfo>}
 */
async function selectHaTable(testDataset) {
  const haTablesData = new HaTablesData(testDataset);
  console.warn('  Fetching available HTTP Archive tables...');
  const availableTableList = await haTablesData.getListOfTables();

  console.warn('  Fetching existing test tables...');
  const existingTableList = await getExistingTestTableIds(testDataset);

  // Return all available tables with existing ones disabled to give context.
  const choices = availableTableList.map(tableInfo => {
    return {
      name: tableInfo.tableId,
      disabled: existingTableList.includes(tableInfo.tableId),
    };
  });

  /** @type {{selectedTableId: string}} */
  const {selectedTableId} = await enquirer.prompt({
    type: 'select',
    name: 'selectedTableId',
    message: 'Select an HTTP Archive table to sample for testing',
    choices,
  });
  const selectedTable = availableTableList.find(tableInfo => tableInfo.tableId === selectedTableId);
  if (!selectedTable) {
    throw new Error('a table should have been selected');
  }

  return selectedTable;
}

async function run() {
  const bigQuery = new BigQuery(credentials);
  const testDataset = bigQuery.dataset(TEST_DATASET_ID);

  const selectedHaTable = await selectHaTable(testDataset);
  const testTable = await createTestTable(testDataset, selectedHaTable);

  await printTestTableInfo(testTable);
}

// until we have `--unhandled-rejections=strict` by default.
process.on('unhandledRejection', err => {
  throw err;
});

run(); // eslint-disable-line @typescript-eslint/no-floating-promises
