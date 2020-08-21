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

/* eslint-env mocha */
/* eslint-disable no-invalid-this */

import {strict as assert} from 'assert';

// TODO(bckenny): use createRequire() for cjs deps when supported by tsc.
import BQModule from '@google-cloud/bigquery';
const {BigQuery} = BQModule;

import HaTablesData, {getExtractedTableId} from '../../../js/big-query/ha-tables-data.js';
import credentials from '../../../js/big-query/auth/credentials.js';
import {assertValidBigQueryId} from '../../../js/big-query/bq-utils.js';
import {
  extractMetricsFromHaLhrs,
  getTotalRows,
} from '../../../js/big-query/extract-from-ha-tables.js';

import expectedExtractedTables from './expected-extracted-tables.js';

/** @typedef {import('@google-cloud/bigquery').BigQuery} BigQuery */
/** @typedef {import('@google-cloud/bigquery').Table} Table */
/** @typedef {import('@google-cloud/bigquery').TableSchema} TableSchema */
/** @typedef {import('../../../js/types/externs').HaTableInfo} HaTableInfo */

// Source tables for test.
const testSourceDataset = {
  haProjectId: 'lh-metrics-analysis',
  haDatasetId: 'test_lighthouse',
};
// Extracted dataset for test.
const extractedDatasetId = 'test_lh_extract';

/**
 * @param {Table} extractedTable
 * @return {Promise<Array<Record<string, unknown>>>}
 */
async function getExtractedTableContents(extractedTable) {
  const tableId = extractedTable.id || 'keep tsc happy';
  assertValidBigQueryId(tableId);

  const query = `SELECT *
    FROM \`${tableId}\`
    ORDER BY requested_url, final_url`;

  const [rows] = await extractedTable.dataset.query({query});

  return rows;
}


describe('Extraction from HTTP Archive tables', () => {
  describe('#extractMetricsFromHaLhrs', () => {
    const bigQuery = new BigQuery(credentials);
    const extractedDataset = bigQuery.dataset(extractedDatasetId);
    const haTablesData = new HaTablesData(extractedDataset, testSourceDataset);

    before('initialize ha tables data', async function() {
      // First request to BQ can take a while, so give it a bit.
      this.timeout(10000);

      await haTablesData.getListOfTables();
    });

    describe('Input validation', () => {
      it('throws if not using custom source tables in a testing env (like this one)', async () => {
        const defaultHaTablesData = new HaTablesData(extractedDataset);
        const tables = await defaultHaTablesData.getListOfTables();
        await assert.rejects(async () => {
          return extractMetricsFromHaLhrs(tables[0]);
        }, /^Error: appear to be in test but still using the default httparchive source IDs$/);
      });

      it('throws on an invalid source project ID', async () => {
        const [realTable] = await haTablesData.getListOfTables();
        const badSourceDataset = {haProjectId: ')(---)(', haDatasetId: '|||'};
        const badTable = {...realTable, sourceDataset: badSourceDataset};
        await assert.rejects(async () => {
          return extractMetricsFromHaLhrs(badTable);
        }, /^Error: invalid GCloud project id '\)\(---\)\('$/);
      });

      it('throws on an invalid source dataset ID', async () => {
        const [realTable] = await haTablesData.getListOfTables();
        const badSourceDataset = {haProjectId: 'a--b', haDatasetId: '|||'};
        const badTable = {...realTable, sourceDataset: badSourceDataset};
        await assert.rejects(async () => {
          return extractMetricsFromHaLhrs(badTable);
        }, /^Error: invalid BigQuery id '|||'$/);
      });

      it('throws for non-integer or out of range months', async () => {
        const [realTable] = await haTablesData.getListOfTables();
        const testTable = {...realTable, month: -1};
        await assert.rejects(async () => {
          return extractMetricsFromHaLhrs(testTable);
        }, /^Error: Invalid.+month -1$/);

        const testTable2 = {...realTable, month: 2.5};
        await assert.rejects(async () => {
          return extractMetricsFromHaLhrs(testTable2);
        }, /^Error: Invalid.+month 2.5$/);
      });

      it('throws for non-integer or out of range years', async () => {
        const [realTable] = await haTablesData.getListOfTables();
        const testTable = {...realTable, year: -1};
        await assert.rejects(async () => {
          return extractMetricsFromHaLhrs(testTable);
        }, /^Error: Invalid.+year -1$/);

        const testTable2 = {...realTable, year: 2020.6};
        await assert.rejects(async () => {
          return extractMetricsFromHaLhrs(testTable2);
        }, /^Error: Invalid.+year 2020.6$/);
      });
    });

    describe('lhr extraction (slow start while extracting)', async () => {
      const preservedConsoleWarn = console.warn;

      /**
       * Extracted tables, keys are table IDs, values are arrays of rows.
       * @type {Record<string, Array<Record<string, unknown>>>}
       */
      let extractedContent;

      before('extract from all the lhrs', async function() {
        // Traffic to BQ may be relatively slow.
        this.timeout(60_000);

        // Sampled source tables are only available for a subset of all HTTP Archive tables.
        const sourceTables = await haTablesData.getListOfTables();

        // Fail if test tables haven't been updated in the last six months.
        const latestSourceTableDate = new Date(sourceTables[0].year, sourceTables[0].month - 1);
        if (Date.now() - latestSourceTableDate.getTime() > (6 * 30 * 24 * 60 * 60 * 1000)) {
          throw new Error('Re-run `generate-test-ha-tables.js` to get an up-to-date test table');
        }

        console.warn = () => {};

        // ensure it starts with an empty dataset.
        const [datasetExists] = await extractedDataset.exists();
        assert.ok(datasetExists, `need a dataset '${extractedDatasetId}' for testing`);

        const [tables] = await extractedDataset.getTables();
        assert.strictEqual(tables.length, 0,
            `test dataset ${extractedDatasetId} should not contain tables when starting`);

        // Also demonstrates function can be used concurrently.
        const extractedTableRequests = sourceTables.map(async sourceTableInfo => {
          try {
            const extractedTable = await extractMetricsFromHaLhrs(sourceTableInfo);
            /** @type {[string, Table]} */
            const result = [sourceTableInfo.tableId, extractedTable];
            return result;
          } catch (err) {
            err.message = sourceTableInfo.tableId + ': ' + err.message;
            throw err;
          }
        });
        const extractedTableEntries = await Promise.all(extractedTableRequests);

        // Retrieve table contents for testing against.
        const extractedContentRequests = extractedTableEntries
          .map(async ([tableId, extractedTable]) => {
            const rows = await getExtractedTableContents(extractedTable);
            /** @type {[string, Array<Record<string, unknown>>]} */
            const result = [tableId, rows];
            return result;
          });
        extractedContent = Object.fromEntries(await Promise.all(extractedContentRequests));
      });

      after(async () => {
        const [testTables] = await extractedDataset.getTables();
        await Promise.all(testTables.map(testTable => testTable.delete()));

        const [afterTables] = await extractedDataset.getTables();
        assert.strictEqual(afterTables.length, 0,
            `failed to clear test dataset '${extractedDataset.id}'`);

        console.warn = preservedConsoleWarn;
      });

      // Loop over expectations, dynamically adding tests that they match.
      for (const [tableId, expectedRows] of Object.entries(expectedExtractedTables)) {
        const lhVersions = expectedRows.map(r => `${r.lh_version}`).sort();
        const uniqueLhVersions = [...new Set(lhVersions)];
        assert.ok(uniqueLhVersions.length, 'expected at least 1 lh_version');

        let lhVersionsStr = '';
        if (uniqueLhVersions.length === 1) {
          lhVersionsStr = ` ${uniqueLhVersions[0]}`;
        } else if (uniqueLhVersions.length === 2) {
          lhVersionsStr = `s ${uniqueLhVersions[0]} and ${uniqueLhVersions[1]}`;
        } else {
          const lastVersion = uniqueLhVersions.pop();
          lhVersionsStr = `s ${uniqueLhVersions.join(', ')}, and ${lastVersion}`;
        }

        it(`can extract from LH version${lhVersionsStr} (table '${tableId}')`, () => {
          const extractedRows = extractedContent[tableId];
          assert.strictEqual(extractedRows.length, expectedRows.length);

          for (let i = 0; i < expectedRows.length; i++) {
            assert.deepStrictEqual(extractedRows[i], expectedRows[i]);
          }
        });
      }

      it('expectations assert all available source tables', () => {
        // Double check we don't have missing or unasserted results.
        for (const extractedId of Object.keys(extractedContent)) {
          assert.ok(extractedId in expectedExtractedTables,
              `table '${extractedId}' not in expectations`);
        }

        for (const expectedId of Object.keys(expectedExtractedTables)) {
          assert.ok(expectedId in extractedContent,
              `table '${expectedId}' in expectations but not in extracted tables`);
        }
      });

      describe('reuse and replacement of existing tables', function() {
        this.timeout(10_000);

        /**
         * Get metadata for an already-extracted HA table.
         * @param {{year: number, month: number}} tableInfo
         * @return {Promise<{existingTable: Table, existingMetadata: {etag: string, numBytes: string, numRows: string, creationTime: string, lastModifiedTime: string, schema: TableSchema}}>}
         */
        async function getTableAndMetadata({year, month}) {
          const extractedTableId = getExtractedTableId({year, month});
          const existingTable = extractedDataset.table(extractedTableId);
          const [tableExists] = await existingTable.exists();
          assert.ok(tableExists);
          const [existingMetadata] = await existingTable.getMetadata();

          // Make sure it's reasonable.
          assert.ok(existingMetadata.etag);
          assert.ok(Number(existingMetadata.numBytes) > 0);
          assert.strictEqual(Number(existingMetadata.numRows), 2);

          return {existingTable, existingMetadata};
        }

        /**
         * Retrieves the HaTableInfo for the HTTP Archive table matching the
         * given date.
         * @param {HaTablesData} haTablesData
         * @param {{year: number, month: number}} tableInfo
         * @return {Promise<HaTableInfo>}
         */
        async function getTableInfo(haTablesData, {year, month}) {
          const tables = await haTablesData.getListOfTables();
          const firstMatchInfo = tables.find(t => t.year === year && t.month === month);
          assert.ok(firstMatchInfo);
          return firstMatchInfo;
        }

        it('reuses a table if already extracted', async () => {
          // First table in test set (and HTTP Archive).
          const firstDate = {year: 2017, month: 6};
          const {existingMetadata} = await getTableAndMetadata(firstDate);

          // Extract from the first HA table again.
          // NOTE: extractedTable likely from cache on haTableInfo.
          const firstTableInfo = await getTableInfo(haTablesData, firstDate);
          const extractedFirstTable = await extractMetricsFromHaLhrs(firstTableInfo);
          const [newMetadata] = await extractedFirstTable.getMetadata();

          assert.strictEqual(newMetadata.etag, existingMetadata.etag);

          // In theory the etag should be sufficient, but just in case...
          assert.strictEqual(newMetadata.creationTime, existingMetadata.creationTime);
          assert.strictEqual(newMetadata.lastModifiedTime, existingMetadata.lastModifiedTime);
          assert.strictEqual(newMetadata.numBytes, existingMetadata.numBytes);
        });

        it('reuses a table if already extracted, even from a fresh HaTableInfo', async () => {
          // First table in test set (and HTTP Archive).
          const firstDate = {year: 2017, month: 6};
          const {existingMetadata} = await getTableAndMetadata(firstDate);

          // Extract again from a fresh version of the first HA.
          const freshHaTablesData = new HaTablesData(extractedDataset, testSourceDataset);
          const firstTableInfo = await getTableInfo(freshHaTablesData, firstDate);
          const extractedFirstTable = await extractMetricsFromHaLhrs(firstTableInfo);
          const [newMetadata] = await extractedFirstTable.getMetadata();

          assert.strictEqual(newMetadata.etag, existingMetadata.etag);

          // In theory the etag should be sufficient, but just in case...
          assert.strictEqual(newMetadata.creationTime, existingMetadata.creationTime);
          assert.strictEqual(newMetadata.lastModifiedTime, existingMetadata.lastModifiedTime);
          assert.strictEqual(newMetadata.numBytes, existingMetadata.numBytes);
        });

        it('deletes and reextracts a new table if the schema has changed', async () => {
          // First table in test set (and HTTP Archive).
          const firstDate = {year: 2017, month: 6};
          const {existingTable, existingMetadata} = await getTableAndMetadata(firstDate);

          // Add an unexpected column to the existing table.
          const {schema} = existingMetadata;
          assert.ok(schema.fields);
          schema.fields.push({name: 'not_a_likely_column', type: 'FLOAT'});
          await existingTable.setMetadata(existingMetadata);

          // Extract again from a fresh version of the first HA table.
          const freshHaTablesData = new HaTablesData(extractedDataset, testSourceDataset);
          const firstTableInfo = await getTableInfo(freshHaTablesData, firstDate);
          const extractedFirstTable = await extractMetricsFromHaLhrs(firstTableInfo);
          const [newMetadata] = await extractedFirstTable.getMetadata();

          // Table should be recreated, so creationTime should be new.
          assert.notStrictEqual(newMetadata.creationTime, existingMetadata.creationTime);
          assert.notStrictEqual(newMetadata.lastModifiedTime, existingMetadata.lastModifiedTime);

          // But data should be the same as before.
          assert.strictEqual(newMetadata.numBytes, existingMetadata.numBytes);
          assert.strictEqual(newMetadata.numRows, existingMetadata.numRows);
        });

        it('deletes and reextracts a new table if the existing one is empty', async () => {
          // Second table in test set (let's not hit per-table quota limits).
          const secondDate = {year: 2017, month: 8};
          const {existingTable, existingMetadata} = await getTableAndMetadata(secondDate);

          // Take the existing schema and delete the existing table.
          const existingTableId = existingTable.id;
          assert.ok(existingTableId);
          const {schema} = existingMetadata;
          await existingTable.delete();

          // Create a new table with the same schema but empty.
          const emptyNewTable = extractedDataset.table(existingTableId);
          await emptyNewTable.create({schema});
          const [emptyMetadata] = await emptyNewTable.getMetadata();
          assert.strictEqual(Number(emptyMetadata.numRows), 0);
          assert.strictEqual(Number(emptyMetadata.numBytes), 0);

          // Extract again from a fresh version of the second HA table.
          const freshHaTablesData = new HaTablesData(extractedDataset, testSourceDataset);
          const secondTableInfo = await getTableInfo(freshHaTablesData, secondDate);
          const extractedNewTable = await extractMetricsFromHaLhrs(secondTableInfo);
          const [newMetadata] = await extractedNewTable.getMetadata();

          // Table should be recreated, so creationTime should be new.
          assert.notStrictEqual(newMetadata.creationTime, existingMetadata.creationTime);
          assert.notStrictEqual(newMetadata.creationTime, emptyMetadata.creationTime);

          // But data should be the same as before.
          assert.strictEqual(newMetadata.numBytes, existingMetadata.numBytes);
          assert.strictEqual(newMetadata.numRows, existingMetadata.numRows);
        });
      });
    });
  });

  describe('#getTotalRows', () => {
    const bigQuery = new BigQuery(credentials);
    const extractedDataset = bigQuery.dataset(extractedDatasetId);
    const haTablesData = new HaTablesData(extractedDataset, testSourceDataset);

    it('throws if not using custom source tables in a testing env (like this one)', async () => {
      const defaultHaTablesData = new HaTablesData(extractedDataset);
      const tables = await defaultHaTablesData.getListOfTables();
      await assert.rejects(async () => {
        return getTotalRows(tables[0]);
      }, /^Error: appear to be in test but still using the default httparchive source IDs$/);
    });

    it('throws on an invalid table id', async () => {
      const badTableInfo = {
        year: 2525,
        month: 1,
        tableId: 'invalid-table-id',
        sourceDataset: testSourceDataset,
        extractedDataset,
      };

      await assert.rejects(async () => {
        return getTotalRows(badTableInfo);
      }, /^Error: invalid BigQuery id 'invalid-table-id'$/);
    });

    it('throws when table info cannot be found', async () => {
      const badTableInfo = {
        year: 2525,
        month: 1,
        tableId: 'not_a_table_id',
        sourceDataset: testSourceDataset,
        extractedDataset,
      };

      await assert.rejects(async () => {
        return getTotalRows(badTableInfo);
      }, /^Error: unable to find a row count for table 'not_a_table_id'$/);
    });

    it('returns the number of rows in a table', async () => {
      const sourceTables = await haTablesData.getListOfTables();
      // Use the last one so it stays fairly stable over time.
      const sourceTableInfo = sourceTables[sourceTables.length - 1];

      const totalRows = await getTotalRows(sourceTableInfo);

      const expectedLength = Object.values(expectedExtractedTables)[0].length;
      assert.notStrictEqual(expectedLength, 0);
      assert.strictEqual(totalRows, expectedLength);
    });
  });
});
