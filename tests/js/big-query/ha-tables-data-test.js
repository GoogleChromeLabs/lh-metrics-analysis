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
} from '../../../js/big-query/ha-tables-data.js';
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
      const {year, month, tableId, sourceDataset} = tableInfo;

      assert.ok(tableId.startsWith(`${year}`));
      assert.ok(tableId.endsWith(`${month}_01_mobile`));

      assert.strictEqual(sourceDataset.haProjectId, 'httparchive');
      assert.strictEqual(sourceDataset.haDatasetId, 'lighthouse');
    }
  });

  it('can load HTTP-Archive-like tables from a different source', async () => {
    // Test tables sampled from the real HTTP Archive tables.
    const alternateSource = {
      haProjectId: 'lh-metrics-analysis',
      haDatasetId: 'test_lighthouse',
    };

    const sampleTablesData = new HaTablesData(extractedDataset, alternateSource);
    const sampleTables = await sampleTablesData.getListOfTables();

    for (const tableInfo of sampleTables) {
      const {year, month, tableId, sourceDataset} = tableInfo;

      // tableId, year, and month should all behave the same.
      assert.ok(tableId.startsWith(`${year}`));
      assert.ok(tableId.endsWith(`${month}_01_mobile`));

      // but source IDs should be different.
      assert.strictEqual(sourceDataset.haProjectId, alternateSource.haProjectId);
      assert.strictEqual(sourceDataset.haDatasetId, alternateSource.haDatasetId);
    }

    // Should match the expectations used for the test tables.
    const sampleTableIds = sampleTables.map(t => t.tableId).sort();
    const expectedTableIds = Object.keys(expectedExtractedTables).sort();
    assert.deepStrictEqual(sampleTableIds, expectedTableIds);
  });

  it('should throw if different source uses invalid IDs', () => {
    const invalidDataset = {
      haProjectId: 'lh-metrics-analysis',
      haDatasetId: '&&&&&',
    };

    assert.throws(() => {
      return new HaTablesData(extractedDataset, invalidDataset);
    }, /^Error: invalid BigQuery id '&&&&&'$/);
  });

  describe('#getListOfTables', () => {
    it('sorts the tables chronologically', async () => {
      const tables = await haTablesData.getListOfTables();

      let prevDate = tables[0].year * 100 + tables[0].month;
      for (let i = 1; i < tables.length; i++) {
        const nextDate = tables[i].year * 100 + tables[i].month;
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
        year: 2525,
        month: 1,
        tableId: '2525_01_01_mobile',
        sourceDataset: {
          haProjectId: 'httparchive',
          haDatasetId: 'lighthouse',
        },
        extractedDataset,
      };

      await assert.rejects(async () => {
        return haTablesData.getMonthBefore(fakeTable);
      }, /^Error: 2525_01_01_mobile not in known tables/);
    });
  });

  describe('#getYearBefore', () => {
    it('can return the table a year before a given table', async () => {
      const tables = await haTablesData.getListOfTables();

      const startYear = 2020;
      let currentYearTable = tables.find(t => t.year === startYear && t.month === 7);

      for (let i = 0; i < 3; i++) {
        // Assertion inside loop to keep tsc 3.9.3 happy.
        assert.ok(currentYearTable, `May ${startYear - i} table not found`);

        const previousYearTable = await haTablesData.getYearBefore(currentYearTable);
        assert.ok(previousYearTable, `May ${startYear - i - 1} table not found`);
        assert.strictEqual(currentYearTable.year - 1, previousYearTable.year);
        assert.strictEqual(currentYearTable.month, previousYearTable.month);

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
        year: 2525,
        month: 1,
        tableId: '2525_01_01_mobile',
        sourceDataset: {
          haProjectId: 'httparchive',
          haDatasetId: 'lighthouse',
        },
        extractedDataset,
      };

      await assert.rejects(async () => {
        return haTablesData.getYearBefore(fakeTable);
      }, /^Error: 2525_01_01_mobile not in known tables/);
    });
  });

  describe('HaTablesData.addExtractedTable', () => {
    // Create a new HaTablesData instance so we don't interfere with other tests.
    const tmpHaTablesData = new HaTablesData(extractedDataset);

    it('can add an extracted table to a tableInfo', async function() {
      this.timeout(10000); // eslint-disable-line no-invalid-this
      const [tableInfo] = await tmpHaTablesData.getListOfTables();

      // Actual BQ table is never created, this is just a local object.
      const extractedId = getExtractedTableId(tableInfo);
      const tmpExtractedTable = extractedDataset.table(extractedId);

      HaTablesData.addExtractedTable(tableInfo, tmpExtractedTable);
      assert.strictEqual(tableInfo.extractedTable, tmpExtractedTable);
    });

    it('throws if an extractedTable has already been added', async () => {
      const [tableInfo] = await tmpHaTablesData.getListOfTables();
      assert.ok(tableInfo.extractedTable, 'table does not already have an `extractedTable`');

      // Actual BQ table is never created, this is just a local object.
      const extractedId = getExtractedTableId(tableInfo);
      const repeatExtractedTable = extractedDataset.table(extractedId);

      assert.throws(() => {
        return HaTablesData.addExtractedTable(tableInfo, repeatExtractedTable);
      }, /^Error: tableInfo already has an `extractedTable`$/);
    });

    it('throws if extractedTable was created with a different dataset', async () => {
      const tablesInfo = await tmpHaTablesData.getListOfTables();
      const tableInfo = tablesInfo[1];
      assert.ok(!tableInfo.extractedTable, 'table already has an `extractedTable`');

      // Actual BQ dataset and table are never created, these are just local objects.
      const nonsenseDataset = bigQuery.dataset('nonsense_id');
      const extractedId = getExtractedTableId(tableInfo);
      const nonsenseExtractedTable = nonsenseDataset.table(extractedId);

      assert.throws(() => {
        return HaTablesData.addExtractedTable(tableInfo, nonsenseExtractedTable);
      }, /^Error: `extractedTable` from a different dataset than the one in `tableInfo`$/);

      assert.ok(!tableInfo.extractedTable, 'an `extractedTable` was added to the table');
    });

    it('can add an extracted table to a tableInfo', async function() {
      const tablesInfo = await tmpHaTablesData.getListOfTables();
      const tableInfo = tablesInfo[1];
      assert.ok(!tableInfo.extractedTable, 'table already has an `extractedTable`');

      // Actual BQ table is never created, this is just a local object.
      const badExtractedId = 'just_really_useless_stuff_here';
      const extractedBadIdTable = extractedDataset.table(badExtractedId);

      assert.throws(() => {
        return HaTablesData.addExtractedTable(tableInfo, extractedBadIdTable);
      // eslint-disable-next-line max-len
      }, /^Error: extractedTable 'just_really_useless_stuff_here' did not match expected id 'lh_extract_20\d\d_\d\d_01'$/);

      assert.ok(!tableInfo.extractedTable, 'an `extractedTable` was added to the table');
    });
  });

  describe('#getExtractedTableId', () => {
    it('returns an extracted table id', () => {
      const tableId = getExtractedTableId({year: 2020, month: 12});
      assert.strictEqual(tableId, 'lh_extract_2020_12_01');
    });

    it('zero pads a single digit month', () => {
      const tableId = getExtractedTableId({year: 2021, month: 2});
      assert.strictEqual(tableId, 'lh_extract_2021_02_01');
    });

    it('throws for non-integer or out of range months', () => {
      assert.throws(() => getExtractedTableId({year: 2021, month: 1.5}),
          /^Error: Invalid.+month 1.5$/);
      assert.throws(() => getExtractedTableId({year: 2021, month: 0}),
          /^Error: Invalid.+month 0$/);
      assert.throws(() => getExtractedTableId({year: 2021, month: -1}),
          /^Error: Invalid.+month -1$/);
      assert.throws(() => getExtractedTableId({year: 2021, month: 13}),
          /^Error: Invalid.+month 13$/);
    });

    it('throws for non-integer or out of range years', () => {
      assert.throws(() => getExtractedTableId({year: 2020.4, month: 2}),
          /^Error: Invalid.+year 2020.4$/);
      assert.throws(() => getExtractedTableId({year: 1950, month: 3}),
          /^Error: Invalid.+year 1950$/);
      assert.throws(() => getExtractedTableId({year: 2525, month: 4}),
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
});
