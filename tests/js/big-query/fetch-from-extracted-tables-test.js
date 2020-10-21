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
import path from 'path';
import fs from 'fs';

// TODO(bckenny): use createRequire() for cjs deps when supported by tsc.
import BQModule from '@google-cloud/bigquery';
const {BigQuery} = BQModule;

import HaTablesData from '../../../js/big-query/ha-tables-data.js';
import credentials from '../../../js/big-query/auth/credentials.js';
import {
  fetchSingleTableMetric,
  fetchPairedTablesMetric,
  getSingleSaveFilename,
  getPairedSaveFilename,
  fetchUniqueValueCounts,
} from '../../../js/big-query/fetch-from-extracted-tables.js';
import {extractMetricsFromLhrTable} from '../../../js/big-query/extract-from-ha-tables.js';
import {PROJECT_ROOT} from '../../../js/module-utils.js';

/** @typedef {import('@google-cloud/bigquery').Dataset} Dataset */
/** @typedef {import('../../../js/types/externs').LhrTableInfo} LhrTableInfo */

// Source tables for test.
const testSourceDataset = {
  projectId: 'lh-metrics-analysis',
  datasetId: 'test_lighthouse',
};
// Extracted dataset for test.
const extractedDatasetId = 'test_lh_extract';

/**
 * Assert that the dataset exists and contains no tables.
 * @param {Dataset} dataset
 */
async function assertEmptyDataset(dataset) {
  // ensure it starts with an empty dataset.
  const [datasetExists] = await dataset.exists();
  assert.ok(datasetExists, `need a dataset '${dataset.id}' for testing`);

  const [tables] = await dataset.getTables();
  assert.strictEqual(tables.length, 0,
      `test dataset ${dataset.id} should not contain any tables at this point`);
}

describe('Fetching from extracted metrics tables', () => {
  const bigQuery = new BigQuery(credentials);
  const extractedDataset = bigQuery.dataset(extractedDatasetId);
  const haTablesData = new HaTablesData(extractedDataset, testSourceDataset);

  /** @type {LhrTableInfo} */
  let may2020TableInfo;
  /** @type {LhrTableInfo} */
  let aug2017TableInfo;

  before('initialize ha tables data', async function() {
    // First request to BQ can take a while, so give it a bit.
    this.timeout(30_000);

    const probMay2020Info = await haTablesData.getTableWithDate({year: 2020, month: 5});
    assert.ok(probMay2020Info);
    may2020TableInfo = probMay2020Info;
    const probAug2017Info = await haTablesData.getTableWithDate({year: 2017, month: 8});
    assert.ok(probAug2017Info);
    aug2017TableInfo = probAug2017Info;
  });

  describe('Save file paths', () => {
    const metricValueId = 'lcp_value';
    const baseEtag = 'Mr/vppV23GU9WmV9RALG7Yg==';
    const compareEtag = 'VYhpX9WIVt9DxtvnnUGzKw==';

    describe('#getSingleSaveFilename', () => {
      it('creates a valid save file name for a metric from a single HA table', () => {
        const filename = getSingleSaveFilename(metricValueId, may2020TableInfo, baseEtag);
        const relativeFilename = path.relative(PROJECT_ROOT, filename);
        assert.strictEqual(relativeFilename,
            'data/lcp_value/2020-05.Mr%2FvppV23GU9WmV9RALG7Yg%3D%3D.csv');
      });

      it('creates a valid save file name for a metric from a single arbitrary table', () => {
        const customIdInfo = {...may2020TableInfo, tableId: 'some_valid_table_id'};
        const filename = getSingleSaveFilename(metricValueId, customIdInfo, baseEtag);
        const relativeFilename = path.relative(PROJECT_ROOT, filename);
        assert.strictEqual(relativeFilename,
            // eslint-disable-next-line max-len
            'data/lcp_value/lh-metrics-analysis-test-lighthouse-some-valid-table-id.Mr%2FvppV23GU9WmV9RALG7Yg%3D%3D.csv');
      });

      it('throws for invalid httpArchiveTable dates', () => {
        const badMonthInfo = {...may2020TableInfo, tableId: '2020_32_01_mobile'};
        assert.throws(() => getSingleSaveFilename(metricValueId, badMonthInfo, baseEtag),
          /^Error: Invalid.+month 32$/);

        const badYearInfo = {...may2020TableInfo, tableId: '2525_05_01_mobile'};
        assert.throws(() => getSingleSaveFilename(metricValueId, badYearInfo, baseEtag),
            /^Error: Invalid.+year 2525$/);
      });

      it('throws for invalid fully-qualified table IDs', () => {
        const badTableIdInfo = {...may2020TableInfo, tableId: '----'};
        assert.throws(() => getSingleSaveFilename(metricValueId, badTableIdInfo, baseEtag),
          /^Error: invalid BigQuery id '----'$/);

        const badProjectInfo = {
          ...may2020TableInfo,
          tableId: 'some_valid_table_id', // custom tableId to move off HA template.
          sourceDataset: {
            projectId: '$$',
            datasetId: 'a',
          },
        };
        assert.throws(() => getSingleSaveFilename(metricValueId, badProjectInfo, baseEtag),
            /^Error: invalid GCloud project id '\$\$'$/);
      });

      it('throws for short etags', () => {
        const shortEtag = 'aaa';
        assert.throws(() => getSingleSaveFilename(metricValueId, may2020TableInfo, shortEtag),
          /^Error: Table etag 'aaa' does not look valid$/);
      });

      it('throws for missing etags', () => {
        // @ts-expect-error  - undefined not allowed as string input.
        assert.throws(() => getSingleSaveFilename(metricValueId, may2020TableInfo, undefined),
          /^Error: Table etag 'undefined' does not look valid$/);
      });

      it('throws for etags with invalid characters', () => {
        const badEtag = '))oooo((';
        assert.throws(() => getSingleSaveFilename(metricValueId, may2020TableInfo, badEtag),
          /^Error: Table etag '\)\)oooo\(\(' did not encode correctly$/);
      });
    });

    describe('#getPairedSaveFilename', () => {
      it('creates a valid save file name for a metric from paired HA tables', () => {
        const filename = getPairedSaveFilename(metricValueId, may2020TableInfo, baseEtag,
            aug2017TableInfo, compareEtag);
        const relativeFilename = path.relative(PROJECT_ROOT, filename);
        assert.strictEqual(relativeFilename,
            'data/lcp_value/paired-2020-05-to-2017-08.Mr%2FvppV23GU9WmV9RALG7Yg%3D%3D-VYhpX9WIVt9DxtvnnUGzKw%3D%3D.csv'); // eslint-disable-line max-len
      });

      it('creates a valid save file name for a metric from paired arbitrary tables', () => {
        const baseInfo = {...may2020TableInfo, tableId: 'some_valid_table_id'};
        const compareInfo = {...aug2017TableInfo, tableId: 'another_table_id'};
        const filename = getPairedSaveFilename(metricValueId, baseInfo, baseEtag, compareInfo,
            compareEtag);
        const relativeFilename = path.relative(PROJECT_ROOT, filename);
        assert.strictEqual(relativeFilename,
            // eslint-disable-next-line max-len
            'data/lcp_value/paired-lh-metrics-analysis-test-lighthouse-some-valid-table-id-to-lh-metrics-analysis-test-lighthouse-another-table-id.Mr%2FvppV23GU9WmV9RALG7Yg%3D%3D-VYhpX9WIVt9DxtvnnUGzKw%3D%3D.csv');
      });

      it('creates a valid save file name for a metric from paired arbitrary and HA tables', () => {
        const baseInfo = {...may2020TableInfo, tableId: 'some_valid_table_id'};
        const filename = getPairedSaveFilename(metricValueId, baseInfo, baseEtag, aug2017TableInfo,
            compareEtag);
        const relativeFilename = path.relative(PROJECT_ROOT, filename);
        assert.strictEqual(relativeFilename,
            // eslint-disable-next-line max-len
            'data/lcp_value/paired-lh-metrics-analysis-test-lighthouse-some-valid-table-id-to-2017-08.Mr%2FvppV23GU9WmV9RALG7Yg%3D%3D-VYhpX9WIVt9DxtvnnUGzKw%3D%3D.csv');
      });

      it('throws for invalid httpArchiveTable months', () => {
        const badBaseMonthInfo = {...may2020TableInfo, tableId: '2020_00_01_mobile'};
        assert.throws(() => getPairedSaveFilename(metricValueId, badBaseMonthInfo, baseEtag,
            aug2017TableInfo, compareEtag), /^Error: Invalid.+month 0$/);
        const badCompareMonthInfo = {...aug2017TableInfo, tableId: '2017_13_01_mobile'};
        assert.throws(() => getPairedSaveFilename(metricValueId, may2020TableInfo, baseEtag,
            badCompareMonthInfo, compareEtag), /^Error: Invalid.+month 13$/);
      });

      it('throws for invalid httpArchiveTable years', () => {
        const badBaseYearInfo = {...may2020TableInfo, tableId: '0000_05_01_mobile'};
        assert.throws(() => getPairedSaveFilename(metricValueId, badBaseYearInfo, baseEtag,
            aug2017TableInfo, compareEtag), /^Error: Invalid.+year 0$/);
        const badCompareYearInfo = {...aug2017TableInfo, tableId: '2525_08_01_mobile'};
        assert.throws(() => getPairedSaveFilename(metricValueId, may2020TableInfo, baseEtag,
            badCompareYearInfo, compareEtag), /^Error: Invalid.+year 2525$/);
      });

      it('throws for invalid fully-qualified table IDs', () => {
        const badTableIdInfo = {...may2020TableInfo, tableId: '----'};
        assert.throws(() => getPairedSaveFilename(metricValueId, badTableIdInfo, baseEtag,
            aug2017TableInfo, compareEtag), /^Error: invalid BigQuery id '----'$/);

        const badProjectInfo = {
          ...may2020TableInfo,
          tableId: 'some_valid_table_id', // custom tableId to move off HA template.
          sourceDataset: {
            projectId: 'something',
            datasetId: '%%%',
          },
        };
        assert.throws(() => getPairedSaveFilename(metricValueId, may2020TableInfo, baseEtag,
            badProjectInfo, compareEtag), /^Error: invalid BigQuery id '%%%'$/);
      });

      it('throws for short etags', () => {
        const shortBaseEtag = 'yu';
        assert.throws(() => getPairedSaveFilename(metricValueId, may2020TableInfo, shortBaseEtag,
            aug2017TableInfo, compareEtag), /^Error: Table etag 'yu' does not look valid$/);
        const shortCompareEtag = 'wasd';
        assert.throws(() => getPairedSaveFilename(metricValueId, may2020TableInfo, baseEtag,
            aug2017TableInfo, shortCompareEtag), /^Error: Table etag 'wasd' does not look valid$/);
      });

      it('throws for missing etags', () => {
        // @ts-expect-error  - undefined not allowed as string input.
        assert.throws(() => getPairedSaveFilename(metricValueId, may2020TableInfo, undefined,
            aug2017TableInfo, compareEtag), /^Error: Table etag 'undefined' does not look valid$/);
        assert.throws(() => getPairedSaveFilename(metricValueId, may2020TableInfo, baseEtag,
          // @ts-expect-error  - undefined not allowed as string input.
          aug2017TableInfo, null), /^Error: Table etag 'null' does not look valid$/);
      });

      it('throws for etags with invalid characters', () => {
        const badBaseEtag = '***O.o***';
        assert.throws(() => getPairedSaveFilename(metricValueId, may2020TableInfo, badBaseEtag,
            aug2017TableInfo, compareEtag), /^Error: Table etag '\*\*\*O\.o\*\*\*' did not encode correctly$/); // eslint-disable-line max-len
        const badCompareEtag = '~~~88~~~';
        assert.throws(() => getPairedSaveFilename(metricValueId, may2020TableInfo, baseEtag,
            aug2017TableInfo, badCompareEtag), /^Error: Table etag '~~~88~~~' did not encode correctly$/); // eslint-disable-line max-len
      });
    });
  });

  describe('Fetching', function() {
    this.timeout(30_000);

    const preservedConsoleWarn = console.warn;

    before(async function() {
      await assertEmptyDataset(extractedDataset);

      // Silence console during test.
      console.warn = () => {};
    });

    after(async () => {
      // Delete any tables created during test.
      const [testTables] = await extractedDataset.getTables();
      await Promise.all(testTables.map(testTable => testTable.delete()));

      await assertEmptyDataset(extractedDataset);

      console.warn = preservedConsoleWarn;
    });

    it('throws if not using custom source tables in a testing env (like this one)', async () => {
      const defaultHaTablesData = new HaTablesData(extractedDataset);
      const tables = await defaultHaTablesData.getListOfTables();

      await assert.rejects(async () => {
        return fetchSingleTableMetric(tables[0], 'lcp_value');
      }, /^Error: appear to be in test but still using the default httparchive source IDs$/);

      await assert.rejects(async () => {
        return fetchPairedTablesMetric(tables[0], tables[1], 'lcp_value');
      }, /^Error: appear to be in test but still using the default httparchive source IDs$/);
    });

    describe('#fetchSingleTableMetric', () => {
      const metricValueId = 'fcp_value';
      const may2020FcpValues = 'metric\n3305.875\n4787.858\n4364.566\n2501.414\n';
      /** @type {string|undefined} */
      let savedFilename;

      after(() => {
        if (savedFilename) {
          fs.unlinkSync(savedFilename);
        }
      });

      it('downloads a metric from a table', async () => {
        const {filename, numRows} = await fetchSingleTableMetric(may2020TableInfo, metricValueId);
        savedFilename = filename;

        assert.ok(fs.existsSync(savedFilename));
        const fileContents = fs.readFileSync(savedFilename, 'utf8');
        assert.strictEqual(fileContents, may2020FcpValues);
        assert.strictEqual(numRows, 4);
      });

      // Dependent on above test being run first.
      it('should use the same filename as #getSingleSaveFilename', async () => {
        // This should come from tableInfo since it will have just been extracted by the above.
        const extractedTable = await extractMetricsFromLhrTable(may2020TableInfo);

        // Get where it should have been saved.
        const [{etag}] = await extractedTable.getMetadata();
        const independentSavedFilename = getSingleSaveFilename(metricValueId, may2020TableInfo,
            etag);

        // We should be able to retrieve the file without going through getSingleSaveFilename.
        assert.strictEqual(independentSavedFilename, savedFilename);
      });

      // Dependent on above test being run first.
      it('reuses an already-downloaded file if one exists', async () => {
        assert.ok(savedFilename, 'file has not been downloaded yet');
        assert.ok(fs.existsSync(savedFilename));
        const originalFileContents = fs.readFileSync(savedFilename, 'utf8');
        assert.strictEqual(originalFileContents, may2020FcpValues);

        const {ctime: originalCtime} = fs.statSync(savedFilename);
        const {length: originalFileCount} = fs.readdirSync(path.dirname(savedFilename));

        // Attempt to fetch again.
        const {filename: repeatSavedFilename, numRows: numRowsFromFile} =
            await fetchSingleTableMetric(may2020TableInfo, metricValueId);
        assert.strictEqual(repeatSavedFilename, savedFilename);
        assert.ok(fs.existsSync(savedFilename));

        // Contents are the same.
        const fileContents = fs.readFileSync(savedFilename, 'utf8');
        assert.strictEqual(fileContents, may2020FcpValues);

        // Modify date is the same.
        const {ctime: newCtime} = fs.statSync(savedFilename);
        assert.strictEqual(newCtime.getTime(), originalCtime.getTime());

        // No new files have been saved alongside.
        const {length: newFileCount} = fs.readdirSync(path.dirname(savedFilename));
        assert.strictEqual(newFileCount, originalFileCount);

        // numRows count (from file) remains the same.
        assert.strictEqual(numRowsFromFile, 4);
      });
    });

    describe('#fetchPairedTablesMetric', () => {
      const metricValueId = 'fcp_value';
      const pairedCsvValues = 'base,compare\n1566.807,2085.854\n';
      /** @type {LhrTableInfo} */
      let july2018TableInfo;

      /** @type {string|undefined} */
      let savedFilename;

      after(() => {
        if (savedFilename) {
          fs.unlinkSync(savedFilename);
        }
      });

      it('throws if pairing the same table with itself', async () => {
        await assert.rejects(async () => {
          return fetchPairedTablesMetric(aug2017TableInfo, aug2017TableInfo, metricValueId);
        }, /^Error: Cannot fetch with same table as base and compare$/);
      });

      it('downloads a metric from a pair of tables', async () => {
        const probjuly2018Info = await haTablesData.getTableWithDate({year: 2018, month: 7});
        assert.ok(probjuly2018Info);
        july2018TableInfo = probjuly2018Info;

        // july2018TableInfo and aug2017TableInfo test tables have wikipedia in common.
        const {filename, numRows} = await fetchPairedTablesMetric(aug2017TableInfo,
            july2018TableInfo, metricValueId);
        savedFilename = filename;

        assert.ok(fs.existsSync(savedFilename));
        const fileContents = fs.readFileSync(savedFilename, 'utf8');
        assert.strictEqual(fileContents, pairedCsvValues);
        assert.strictEqual(numRows, 1);
      });

      // Dependent on above test being run first.
      it('should use the same filename as #getPairedSaveFilename', async () => {
        // These should come from tableInfo since they will have just been extracted by the above.
        const extractedBaseTable = await extractMetricsFromLhrTable(aug2017TableInfo);
        const extractedCompareTable = await extractMetricsFromLhrTable(july2018TableInfo);

        // Get where it should have been saved.
        const [{etag: baseEtag}] = await extractedBaseTable.getMetadata();
        const [{etag: compareEtag}] = await extractedCompareTable.getMetadata();
        const independentSavedFilename = getPairedSaveFilename(metricValueId, aug2017TableInfo,
            baseEtag, july2018TableInfo, compareEtag);

        // We should be able to retrieve the file without going through fetchPairedTablesMetric.
        assert.strictEqual(independentSavedFilename, savedFilename);
      });

      // Dependent on first test abvove being run first.
      it('reuses an already-downloaded file if one exists', async () => {
        assert.ok(savedFilename, 'file has not been downloaded yet');
        assert.ok(fs.existsSync(savedFilename));
        const originalFileContents = fs.readFileSync(savedFilename, 'utf8');
        assert.strictEqual(originalFileContents, pairedCsvValues);

        const {ctime: originalCtime} = fs.statSync(savedFilename);
        const {length: originalFileCount} = fs.readdirSync(path.dirname(savedFilename));

        // Attempt to fetch again.
        const {filename: repeatSavedFilename, numRows: numRowsFromFile} =
            await fetchPairedTablesMetric(aug2017TableInfo, july2018TableInfo, metricValueId);
        assert.strictEqual(repeatSavedFilename, savedFilename);
        assert.ok(fs.existsSync(savedFilename));

        // Contents are the same.
        const fileContents = fs.readFileSync(savedFilename, 'utf8');
        assert.strictEqual(fileContents, pairedCsvValues);

        // Modify date is the same.
        const {ctime: newCtime} = fs.statSync(savedFilename);
        assert.strictEqual(newCtime.getTime(), originalCtime.getTime());

        // No new files have been saved alongside.
        const {length: newFileCount} = fs.readdirSync(path.dirname(savedFilename));
        assert.strictEqual(newFileCount, originalFileCount);

        // numRows count (from file) remains the same.
        assert.strictEqual(numRowsFromFile, 1);
      });
    });

    describe('#fetchUniqueValueCounts', () => {
      it('throws if not using custom source tables in a testing env (like this one)', async () => {
        const defaultHaTablesData = new HaTablesData(extractedDataset);
        const tables = await defaultHaTablesData.getListOfTables();
        await assert.rejects(async () => {
          return fetchUniqueValueCounts(tables[0], 'lh_version');
        }, /^Error: appear to be in test but still using the default httparchive source IDs$/);
      });

      it('downloads the counts of unique values in a column', async () => {
        const lhVersionCounts = await fetchUniqueValueCounts(may2020TableInfo, 'lh_version');

        assert.deepStrictEqual(lhVersionCounts, {
          '5.6.0': 4,
          '6.0.0': 4,
        });
      });

      it('includes a \'null\' key if a `null` value was found and counted', async () => {
        const lhVersionCounts = await fetchUniqueValueCounts(may2020TableInfo,
          'runtime_error_code');

        assert.deepStrictEqual(lhVersionCounts, {
          'CHROME_INTERSTITIAL_ERROR': 1,
          'ERRORED_DOCUMENT_REQUEST': 1,
          'NO_FCP': 1,
          'null': 4,
          'PROTOCOL_TIMEOUT': 1,
        });
      });

      it('throws if requesting an invalid column', async () => {
        /** @type {'runtime_error_code'} */
        // @ts-expect-error - lying about type to test column sanitization.
        const columnId = 'Robert\'); DROP TABLE Students; --';

        await assert.rejects(async () => {
          return fetchUniqueValueCounts(may2020TableInfo, columnId);
        // eslint-disable-next-line max-len
        }, /^Error: invalid characters in BigQuery column name \('Robert'\); DROP TABLE Students; --'\)$/);
      });

      it('throws if fetching from an invalid extractedTableId', async () => {
        const tableInfo = {...may2020TableInfo, extractedTableId: '----'};

        await assert.rejects(async () => {
          return fetchUniqueValueCounts(tableInfo, 'chrome_version');
        // eslint-disable-next-line max-len
        }, /^Error: invalid BigQuery id '----'$/);
      });
    });
  });
});
