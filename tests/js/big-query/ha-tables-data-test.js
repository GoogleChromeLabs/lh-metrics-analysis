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

import {strict as assert} from 'assert';

// TODO(bckenny): use createRequire() for cjs deps when supported by tsc.
import BQModule from '@google-cloud/bigquery';
const {BigQuery} = BQModule;

import HaTablesData, {
  assertValidMonth,
  assertValidYear,
  getExtractedTableId,
  getTableDate,
  isHttpArchiveTable,
} from '../../../js/big-query/ha-tables-data.js';
import {createLhrTableInfo} from '../../../js/big-query/lhr-tables-data.js';
import credentials from '../../../js/big-query/auth/credentials.js';
import expectedExtractedTables from './expected-extracted-tables.js';

// Destination dataset for test.
const extractedDatasetId = 'test_lh_extract';

describe('HaTablesData', () => {
  const bigQuery = new BigQuery(credentials);
  const extractedDataset = bigQuery.dataset(extractedDatasetId);
  const haTablesData = new HaTablesData(extractedDataset);

  it('fetches the available tables', async function() {
    // First request to BQ can take a while, so give it a bit.
    this.timeout(10000); // eslint-disable-line no-invalid-this

    const tables = await haTablesData.getListOfTables();
    assert.ok(Array.isArray(tables));
    assert.ok(tables.length > 10);
  });

  it('parses and constructs table ids as expected', async function() {
    const tables = await haTablesData.getListOfTables();

    for (const tableInfo of tables) {
      const {tableId, extractedTableId, sourceDataset} = tableInfo;
      const {year, month} = getTableDate(tableId);

      assert.ok(tableId.startsWith(`${year}`));
      assert.ok(tableId.endsWith(`${month}_01_mobile`));

      assert.ok(extractedTableId.startsWith(`lh_extract_${year}_`));
      assert.ok(extractedTableId.endsWith(`${month}_01`));

      assert.strictEqual(sourceDataset.projectId, 'httparchive');
      assert.strictEqual(sourceDataset.datasetId, 'lighthouse');
    }
  });

  it('can load HTTP-Archive-like tables from a different source', async () => {
    // Test tables sampled from the real HTTP Archive tables.
    const alternateSource = {
      projectId: 'lh-metrics-analysis',
      datasetId: 'test_lighthouse',
    };

    const sampleTablesData = new HaTablesData(extractedDataset, alternateSource);
    const sampleTables = await sampleTablesData.getListOfTables();

    for (const tableInfo of sampleTables) {
      const {tableId, extractedTableId, sourceDataset} = tableInfo;
      const {year, month} = getTableDate(tableId);

      // tableId and extractedTableId should behave the same.
      assert.ok(tableId.startsWith(`${year}`));
      assert.ok(tableId.endsWith(`${month}_01_mobile`));

      assert.ok(extractedTableId.startsWith(`lh_extract_${year}_`));
      assert.ok(extractedTableId.endsWith(`${month}_01`));

      // but source IDs should be different.
      assert.strictEqual(sourceDataset.projectId, alternateSource.projectId);
      assert.strictEqual(sourceDataset.datasetId, alternateSource.datasetId);
    }

    // Should match the expectations used for the test tables.
    const sampleTableIds = sampleTables.map(t => t.tableId).sort();
    const expectedTableIds = Object.keys(expectedExtractedTables).sort();
    assert.deepStrictEqual(sampleTableIds, expectedTableIds);
  });

  it('should throw if different source uses invalid IDs', () => {
    const invalidDataset = {
      projectId: 'lh-metrics-analysis',
      datasetId: '&&&&&',
    };

    assert.throws(() => {
      return new HaTablesData(extractedDataset, invalidDataset);
    }, /^Error: invalid BigQuery id '&&&&&'$/);
  });

  describe('#getListOfTables', () => {
    it('sorts the tables chronologically', async () => {
      const tables = await haTablesData.getListOfTables();

      const {year: prevYear, month: prevMonth} = getTableDate(tables[0].tableId);
      let prevDate = prevYear * 100 + prevMonth;
      for (let i = 1; i < tables.length; i++) {
        const {year: nextYear, month: nextMonth} = getTableDate(tables[i].tableId);
        const nextDate = nextYear * 100 + nextMonth;
        assert.ok(prevDate > nextDate,
            `${nextDate} not before ${prevDate}`);

        prevDate = nextDate;
      }
    });

    it('returns a copy of the list so will not be mutated', async () => {
      const tables = await haTablesData.getListOfTables();

      const originalTablesCopy = [...tables];

      tables.pop();
      const firstElement = tables.shift();
      if (firstElement) tables.push(firstElement);

      const tablesAgain = await haTablesData.getListOfTables();
      assert.notDeepStrictEqual(tables, originalTablesCopy);
      assert.deepStrictEqual(tablesAgain, originalTablesCopy);
    });
  });

  describe('#getLatestTable', () => {
    it('returns the most recent table', async () => {
      const tables = await haTablesData.getListOfTables();
      const latestTable = await haTablesData.getLatestTable();

      // We know tables[0] is first from getListOfTables tests.
      assert.deepStrictEqual(latestTable, tables[0]);
    });
  });

  describe('#getMonthBefore', () => {
    it('can return the table a month before a given table', async () => {
      const tables = await haTablesData.getListOfTables();

      for (let i = 0; i < tables.length - 1; i++) {
        const thisMonth = tables[i];
        const lastMonth = await haTablesData.getMonthBefore(thisMonth);

        if (thisMonth.tableId === '2018_07_01_mobile') {
          // There was no 2018_06_01_mobile table.
          assert.strictEqual(lastMonth, null);
        } else {
          assert.deepStrictEqual(tables[i + 1], lastMonth);
        }
      }
    });

    it('returns null for tables with no entries one month before them', async () => {
      const tables = await haTablesData.getListOfTables();

      const earliestMonth = tables[tables.length - 1];
      const beforeTheDawnOfTime = await haTablesData.getMonthBefore(earliestMonth);
      assert.strictEqual(beforeTheDawnOfTime, null);
    });

    it('throws if queried with a table not in its set of tables', async () => {
      const fakeTable = {
        tableId: '2525_01_01_mobile',
        extractedTableId: 'lh_extract_2525_01_01',
        sourceDataset: {
          projectId: 'httparchive',
          datasetId: 'lighthouse',
        },
        extractedDataset,
      };

      await assert.rejects(async () => {
        return haTablesData.getMonthBefore(fakeTable);
      }, /^Error: 2525_01_01_mobile not a known table/);
    });
  });

  describe('#getYearBefore', () => {
    it('can return the table a year before a given table', async () => {
      const tables = await haTablesData.getListOfTables();

      const startYear = 2020;
      let currentYearTable = tables.find(t => {
        const {year, month} = getTableDate(t.tableId);
        return year === startYear && month === 7;
      });

      for (let i = 0; i < 3; i++) {
        // Assertion inside loop to keep tsc 3.9.3 happy.
        assert.ok(currentYearTable, `May ${startYear - i} table not found`);

        const previousYearTable = await haTablesData.getYearBefore(currentYearTable);
        assert.ok(previousYearTable, `May ${startYear - i - 1} table not found`);

        const {year: currentYear, month: currentMonth} = getTableDate(currentYearTable.tableId);
        const {year: previousYear, month: previousMonth} = getTableDate(previousYearTable.tableId);
        assert.strictEqual(currentYear - 1, previousYear);
        assert.strictEqual(currentMonth, previousMonth);

        currentYearTable = previousYearTable;
      }
    });

    it('returns null for tables with no entries one year before them', async () => {
      const tables = await haTablesData.getListOfTables();

      const earliestYear = tables[tables.length - 5];
      const beforeTheDawnOfTime = await haTablesData.getYearBefore(earliestYear);
      assert.strictEqual(beforeTheDawnOfTime, null);
    });

    it('throws if queried with a table not in its set of tables', async () => {
      const fakeTable = {
        tableId: '2525_01_01_mobile',
        extractedTableId: 'lh_extract_2525_01_01',
        sourceDataset: {
          projectId: 'httparchive',
          datasetId: 'lighthouse',
        },
        extractedDataset,
      };

      await assert.rejects(async () => {
        return haTablesData.getYearBefore(fakeTable);
      }, /^Error: 2525_01_01_mobile not a known table/);
    });
  });

  describe('#getExtractedTableId', () => {
    /**
     * @param {{year: number, month: number}} date
     * @return {string}
     */
    function getTestTableIdForDate({year, month}) {
      const paddedMonth = String(month).padStart(2, '0');
      return `${year}_${paddedMonth}_01_mobile`;
    }

    it('returns an extracted table id', () => {
      const tableId = getTestTableIdForDate({year: 2020, month: 12});
      const extractedTableId = getExtractedTableId(tableId);
      assert.strictEqual(extractedTableId, 'lh_extract_2020_12_01');
    });

    it('zero pads a single digit month', () => {
      const tableId = getTestTableIdForDate({year: 2021, month: 2});
      const extractedTableId = getExtractedTableId(tableId);
      assert.strictEqual(extractedTableId, 'lh_extract_2021_02_01');
    });

    it('throws for non-integer or out of range months', () => {
      assert.throws(() => getExtractedTableId(getTestTableIdForDate({year: 2021, month: 1.5})),
          /^Error: Invalid HA table name 2021_1.5_01_mobile$/);
      assert.throws(() => getExtractedTableId(getTestTableIdForDate({year: 2021, month: 0})),
          /^Error: Invalid.+month 0$/);
      assert.throws(() => getExtractedTableId(getTestTableIdForDate({year: 2021, month: -1})),
          /^Error: Invalid HA table name 2021_-1_01_mobile$/);
      assert.throws(() => getExtractedTableId(getTestTableIdForDate({year: 2021, month: 13})),
          /^Error: Invalid.+month 13$/);
    });

    it('throws for non-integer or out of range years', () => {
      assert.throws(() => getExtractedTableId(getTestTableIdForDate({year: 2020.4, month: 2})),
          /^Error: Invalid HA table name 2020.4_02_01_mobile$/);
      assert.throws(() => getExtractedTableId(getTestTableIdForDate({year: 1950, month: 3})),
          /^Error: Invalid.+year 1950$/);
      assert.throws(() => getExtractedTableId(getTestTableIdForDate({year: 2525, month: 4})),
          /^Error: Invalid.+year 2525$/);
    });
  });

  describe('#assertValidMonth', () => {
    it('throws for out-of-range months', () => {
      assert.throws(() => assertValidMonth(0), /^Error: Invalid.+month 0$/);
      assert.throws(() => assertValidMonth(-1), /^Error: Invalid.+month -1$/);
      assert.throws(() => assertValidMonth(13), /^Error: Invalid.+month 13$/);
    });

    it('throws for non-integer months', () => {
      assert.throws(() => assertValidMonth(1.5), /^Error: Invalid.+month 1.5$/);
      assert.throws(() => assertValidMonth(1 + Number.EPSILON),
          /^Error: Invalid.+month 1.0000000000000002$/);
    });
  });

  describe('#assertValidYear', () => {
    it('throws for out-of-range years', () => {
      assert.throws(() => assertValidYear(1950), /^Error: Invalid.+year 1950$/);
      assert.throws(() => assertValidYear(-1), /^Error: Invalid.+year -1$/);
      assert.throws(() => assertValidYear(2525), /^Error: Invalid.+year 2525$/);
    });

    it('throws for non-integer years', () => {
      assert.throws(() => assertValidYear(2020.4), /^Error: Invalid.+year 2020.4$/);
      assert.throws(() => assertValidYear(2020 - ((2 ** 9 + 1) * Number.EPSILON)),
          /^Error: Invalid.+year 2019.9999999999998$/);
    });
  });

  describe('#getTableDate', () => {
    it('extracts year and month from a well formed HA table ID', () => {
      assert.deepStrictEqual(getTableDate('2019_09_01_mobile'), {year: 2019, month: 9});
      assert.deepStrictEqual(getTableDate('2018_10_15_mobile'), {year: 2018, month: 10});
    });

    it('throws on invalid forms of HA table IDs', () => {
      assert.throws(() => getTableDate('20_09_01_mobile'),
          /^Error: Invalid HA table name 20_09_01_mobile$/);
      assert.throws(() => getTableDate('2019009_01_mobile'),
          /^Error: Invalid HA table name 2019009_01_mobile$/);
      assert.throws(() => getTableDate('a2019_09_01_mobile'),
          /^Error: Invalid HA table name a2019_09_01_mobile$/);
    });
  });

  describe('#isHttpArchiveTable', () => {
    /** @param {string} tableId */
    function createTableWithId(tableId) {
      const sourceDataset = {projectId: 'httparchive', datasetId: 'lighthouse'};
      return createLhrTableInfo(tableId, sourceDataset, extractedDataset);
    }

    it('returns true for valid HTTP Archive table IDs', () => {
      assert.ok(isHttpArchiveTable(createTableWithId('2019_09_01_mobile')));
      assert.ok(isHttpArchiveTable(createTableWithId('2018_10_15_mobile')));
    });

    it('returns false for invalid HTTP Archive table IDs', () => {
      assert.ok(!isHttpArchiveTable(createTableWithId('20_09_01_mobile')));
      assert.ok(!isHttpArchiveTable(createTableWithId('2019009_01_mobile')));
      assert.ok(!isHttpArchiveTable(createTableWithId('a2019_09_01_mobile')));
      assert.ok(!isHttpArchiveTable(createTableWithId('2019_09_01_mobiley')));
    });
  });
});
