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

import HaTablesData from '../../../js/big-query/ha-tables-data.js';
import credentials from '../../../js/big-query/auth/credentials.js';

describe('HaTablesData', () => {
  const bigQuery = new BigQuery(credentials);
  const haTablesData = new HaTablesData(bigQuery);

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
      const {year, month, tableId, extractedTableId} = tableInfo;

      assert.ok(tableId.startsWith(`${year}`));
      assert.ok(tableId.endsWith(`${month}_01_mobile`));

      assert.ok(extractedTableId.startsWith(`lh_extract_${year}`));
      assert.ok(extractedTableId.endsWith(`${month}_01`));
    }
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

      const originalTablesClone = JSON.parse(JSON.stringify(tables));

      tables.pop();
      const firstElement = tables.shift();
      if (firstElement) tables.push(firstElement);

      const tablesAgain = await haTablesData.getListOfTables();
      assert.deepStrictEqual(tablesAgain, originalTablesClone);
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
        extractedTableId: 'lh_extract_2525_01_01',
      };

      await assert.rejects(async () => {
        return haTablesData.getMonthBefore(fakeTable);
      }, /^Error: lh_extract_2525_01_01/);
    });
  });

  describe('#getYearBefore', () => {
    it('can return the table a year before a given table', async () => {
      const tables = await haTablesData.getListOfTables();

      const startYear = 2020;
      let currentYearTable = tables.find(t => t.year === startYear && t.month === 5);

      // TODO(bckenny): once June 2020 data lands, can then go back 3 years.
      for (let i = 0; i < 2; i++) {
        // Inside loop to keep tsc 3.9.3 happy.
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
        extractedTableId: 'lh_extract_2525_01_01',
      };

      await assert.rejects(async () => {
        return haTablesData.getYearBefore(fakeTable);
      }, /^Error: lh_extract_2525_01_01/);
    });
  });
});
