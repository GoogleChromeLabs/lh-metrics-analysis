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

import {
  createLhrTableInfo,
  addExtractedToLhrTable,
  assertValidLhrTableInfo,
} from '../../../js/big-query/lhr-tables-data.js';
import HaTablesData from '../../../js/big-query/ha-tables-data.js';
import credentials from '../../../js/big-query/auth/credentials.js';

// Destination dataset for test.
const extractedDatasetId = 'test_lh_extract';

describe('LhrTablesData', () => {
  const bigQuery = new BigQuery(credentials);
  const extractedDataset = bigQuery.dataset(extractedDatasetId);

  describe('createLhrTableInfo', () => {
    const sourceTableId = 'test_table';
    const sourceDataset = {
      projectId: 'lh-metrics-analysis',
      datasetId: extractedDatasetId, // Fine, we're not actually doing anything with this.
    };

    it('can create a correct LhrTableInfo', () => {
      const lhrTable = createLhrTableInfo(sourceTableId, sourceDataset, extractedDataset);
      assert.strictEqual(lhrTable.tableId, sourceTableId);
      assert.strictEqual(lhrTable.extractedTableId,
          `lh_extract_${sourceDataset.datasetId}_${sourceTableId}`);
      assert.deepStrictEqual(lhrTable.sourceDataset, sourceDataset);
      assert.strictEqual(lhrTable.extractedDataset, extractedDataset);
    });

    it('throws on an invalid sourceTableId', () => {
      const badSourceTableId = 'my_badly_named_\'table\'';
      assert.throws(() => {
        return createLhrTableInfo(badSourceTableId, sourceDataset, extractedDataset);
      }, /^Error: invalid BigQuery id 'my_badly_named_'table''$/);
    });

    it('throws on an invalid source project ID', () => {
      const badSourceDataset = {projectId: ')(---)(', datasetId: sourceDataset.datasetId};
      assert.throws(() => {
        return createLhrTableInfo(sourceTableId, badSourceDataset, extractedDataset);
      }, /^Error: invalid GCloud project id '\)\(---\)\('$/);
    });

    it('throws on an invalid source dataset ID', () => {
      const badSourceDataset = {projectId: sourceDataset.projectId, datasetId: '|||'};
      assert.throws(() => {
        return createLhrTableInfo(sourceTableId, badSourceDataset, extractedDataset);
      }, /^Error: invalid BigQuery id '|||'$/);
    });
  });

  describe('addExtractedToLhrTable()', () => {
    describe('works with HTTP Archive table info', () => {
      // Create a new HaTablesData instance so we don't interfere with other tests.
      const tmpHaTablesData = new HaTablesData(extractedDataset);

      it('can add an extracted table to a tableInfo', async function() {
        this.timeout(10000); // eslint-disable-line no-invalid-this
        const [tableInfo] = await tmpHaTablesData.getListOfTables();

        // Actual BQ table is never created, this is just a local object.
        const tmpExtractedTable = extractedDataset.table(tableInfo.extractedTableId);

        assert.strictEqual(tableInfo.extractedTable, undefined);
        addExtractedToLhrTable(tableInfo, tmpExtractedTable);
        assert.strictEqual(tableInfo.extractedTable, tmpExtractedTable);
      });

      it('throws if an extractedTable has already been added', async () => {
        const [tableInfo] = await tmpHaTablesData.getListOfTables();
        assert.ok(tableInfo.extractedTable, 'table does not already have an `extractedTable`');

        // Actual BQ table is never created, this is just a local object.
        const repeatExtractedTable = extractedDataset.table(tableInfo.extractedTableId);

        assert.throws(() => {
          return addExtractedToLhrTable(tableInfo, repeatExtractedTable);
        }, /^Error: tableInfo already has an `extractedTable`$/);
      });

      it('throws if extractedTable was created with a different dataset', async () => {
        const tablesInfo = await tmpHaTablesData.getListOfTables();
        const tableInfo = tablesInfo[1];
        assert.ok(!tableInfo.extractedTable, 'table already has an `extractedTable`');

        // Actual BQ dataset and table are never created, these are just local objects.
        const nonsenseDataset = bigQuery.dataset('nonsense_id');
        const nonsenseExtractedTable = nonsenseDataset.table(tableInfo.extractedTableId);

        assert.throws(() => {
          return addExtractedToLhrTable(tableInfo, nonsenseExtractedTable);
        }, /^Error: `extractedTable` from a different dataset than the one in `tableInfo`$/);

        assert.ok(!tableInfo.extractedTable, 'an `extractedTable` was added to the table');
      });

      it('throws if extractedTable tableId is different than expected', async function() {
        const tablesInfo = await tmpHaTablesData.getListOfTables();
        const tableInfo = tablesInfo[1];
        assert.ok(!tableInfo.extractedTable, 'table already has an `extractedTable`');

        // Actual BQ table is never created, this is just a local object.
        const badExtractedId = 'just_really_useless_stuff_here';
        const extractedBadIdTable = extractedDataset.table(badExtractedId);

        assert.throws(() => {
          return addExtractedToLhrTable(tableInfo, extractedBadIdTable);
        // eslint-disable-next-line max-len
        }, /^Error: extractedTable 'just_really_useless_stuff_here' did not match expected id 'lh_extract_20\d\d_\d\d_01'$/);

        assert.ok(!tableInfo.extractedTable, 'an `extractedTable` was added to the table');
      });
    });

    describe('works with raw LhrTableInfo instances', () => {
      const sourceTableId = 'test_table';
      const sourceDataset = {
        projectId: 'lh-metrics-analysis',
        datasetId: extractedDatasetId, // Fine, we're not actually doing anything with this.
      };

      it('can add an extracted table to a tableInfo', async function() {
        const tableInfo = createLhrTableInfo(sourceTableId, sourceDataset, extractedDataset);

        // Actual BQ table is never created, this is just a local object.
        const tmpExtractedTable = extractedDataset.table(tableInfo.extractedTableId);

        assert.strictEqual(tableInfo.extractedTable, undefined);
        addExtractedToLhrTable(tableInfo, tmpExtractedTable);
        assert.strictEqual(tableInfo.extractedTable, tmpExtractedTable);
      });

      it('throws if an extractedTable has already been added', async () => {
        const tableInfo = createLhrTableInfo(sourceTableId, sourceDataset, extractedDataset);
        // Actual BQ table is never created, this is just a local object.
        const tmpExtractedTable = extractedDataset.table(tableInfo.extractedTableId);
        addExtractedToLhrTable(tableInfo, tmpExtractedTable);

        assert.ok(tableInfo.extractedTable, 'table does not already have an `extractedTable`');
        assert.throws(() => {
          return addExtractedToLhrTable(tableInfo, tmpExtractedTable);
        }, /^Error: tableInfo already has an `extractedTable`$/);
      });

      it('throws if extractedTable was created with a different dataset', async () => {
        const tableInfo = createLhrTableInfo(sourceTableId, sourceDataset, extractedDataset);

        // Actual BQ dataset and table are never created, these are just local objects.
        const nonsenseDataset = bigQuery.dataset('nonsense_id');
        const nonsenseExtractedTable = nonsenseDataset.table(tableInfo.extractedTableId);

        assert.throws(() => {
          return addExtractedToLhrTable(tableInfo, nonsenseExtractedTable);
        }, /^Error: `extractedTable` from a different dataset than the one in `tableInfo`$/);

        assert.ok(!tableInfo.extractedTable, 'an `extractedTable` was added to the table');
      });

      it('throws if extractedTable tableId is different than expected', async function() {
        const tableInfo = createLhrTableInfo(sourceTableId, sourceDataset, extractedDataset);

        // Actual BQ table is never created, this is just a local object.
        const badExtractedId = 'just_really_useless_stuff_here';
        const extractedBadIdTable = extractedDataset.table(badExtractedId);

        assert.throws(() => {
          return addExtractedToLhrTable(tableInfo, extractedBadIdTable);
        // eslint-disable-next-line max-len
        }, /^Error: extractedTable 'just_really_useless_stuff_here' did not match expected id 'lh_extract_test_lh_extract_test_table'$/);

        assert.ok(!tableInfo.extractedTable, 'an `extractedTable` was added to the table');
      });
    });
  });

  describe('assertValidLhrTableInfo', () => {
    const sourceTableId = 'test_table';
    const sourceDataset = {
      projectId: 'lh-metrics-analysis',
      datasetId: extractedDatasetId, // Fine, we're not actually doing anything with this.
    };

    it('passes for a valid lhrTableInfo', () => {
      const lhrTableInfo = createLhrTableInfo(sourceTableId, sourceDataset, extractedDataset);
      assertValidLhrTableInfo(lhrTableInfo);
      assert.ok(true);
    });

    it('passes for a valid lhrTableInfo with a real extractedTable added', () => {
      const lhrTableInfo = createLhrTableInfo(sourceTableId, sourceDataset, extractedDataset);

      // Actual BQ table is never created, this is just a local object.
      const tmpExtractedTable = extractedDataset.table(lhrTableInfo.extractedTableId);
      addExtractedToLhrTable(lhrTableInfo, tmpExtractedTable);

      assertValidLhrTableInfo(lhrTableInfo);
      assert.ok(true);
    });

    it('throws for an invalid tableId', () => {
      const lhrTableInfo = createLhrTableInfo(sourceTableId, sourceDataset, extractedDataset);
      // @ts-expect-error - writing to readonly property for test.
      lhrTableInfo.tableId = '----';
      assert.throws(() => assertValidLhrTableInfo(lhrTableInfo),
          /^Error: invalid BigQuery id '----'$/);
    });

    it('throws for an invalid extractedTableId', () => {
      const lhrTableInfo = createLhrTableInfo(sourceTableId, sourceDataset, extractedDataset);
      // @ts-expect-error - writing to readonly property for test.
      lhrTableInfo.extractedTableId = '&&&';
      assert.throws(() => assertValidLhrTableInfo(lhrTableInfo),
          /^Error: invalid BigQuery id '&&&'$/);
    });

    it('throws for an invalid source projectId', () => {
      const lhrTableInfo = createLhrTableInfo(sourceTableId, sourceDataset, extractedDataset);
      // @ts-expect-error - writing to readonly property for test.
      lhrTableInfo.sourceDataset.projectId = '0bad0';
      assert.throws(() => assertValidLhrTableInfo(lhrTableInfo),
          /^Error: invalid GCloud project id '0bad0'$/);
    });

    it('throws for an invalid source datasetId', () => {
      const lhrTableInfo = createLhrTableInfo(sourceTableId, sourceDataset, extractedDataset);
      // @ts-expect-error - writing to readonly property for test.
      lhrTableInfo.sourceDataset.datasetId = '%__%';
      assert.throws(() => assertValidLhrTableInfo(lhrTableInfo),
          /^Error: invalid BigQuery id '%__%'$/);
    });

    it('throws if extractedTable.id does not match real extractedTableId', () => {
      const lhrTableInfo = createLhrTableInfo(sourceTableId, sourceDataset, extractedDataset);

      // Actual BQ table is never created, this is just a local object.
      const tmpExtractedTable = extractedDataset.table('valid_but_nonsense_id');

      // Manually setting table. Don't do this!
      // @ts-expect-error - writing to readonly property for test.
      lhrTableInfo.extractedTable = tmpExtractedTable;

      assert.throws(() => assertValidLhrTableInfo(lhrTableInfo),
          // eslint-disable-next-line max-len
          /^Error: extractedTable 'valid_but_nonsense_id' did not match expected id 'lh_extract_test_lh_extract_test_table'$/);
    });

    it('throws if extractedTableId does not match real extractedTable.id', () => {
      const lhrTableInfo = createLhrTableInfo(sourceTableId, sourceDataset, extractedDataset);

      // Actual BQ table is never created, this is just a local object.
      const tmpExtractedTable = extractedDataset.table(lhrTableInfo.extractedTableId);
      addExtractedToLhrTable(lhrTableInfo, tmpExtractedTable);

      // Override real extractedTableId.
      // @ts-expect-error - writing to readonly property for test.
      lhrTableInfo.extractedTableId = 'valid_id_but_not_the_real_deal';

      assert.throws(() => assertValidLhrTableInfo(lhrTableInfo),
          // eslint-disable-next-line max-len
          /^Error: extractedTable 'lh_extract_test_lh_extract_test_table' did not match expected id 'valid_id_but_not_the_real_deal'$/);
    });
  });
});
