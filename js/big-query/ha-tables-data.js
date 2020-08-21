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

import {assertValidProjectId, assertValidBigQueryId} from './bq-utils.js';

/**
 * @fileoverview A class that lazily queries the available HTTPArchive
 * Lighthouse monthly tables and provides the info needed to query them and
 * their extracted form.
 */

/** @typedef {import('@google-cloud/bigquery').BigQuery} BigQuery */
/** @typedef {import('@google-cloud/bigquery').Dataset} Dataset */
/** @typedef {import('@google-cloud/bigquery').Table} Table */
/** @typedef {import('../types/externs').HaTableInfo} HaTableInfo */

const DEFAULT_HA_PROJECT_ID = 'httparchive';
const DEFAULT_HA_DATASET_ID = 'lighthouse';

/**
 * Asserts valid year for HTTP Archive tables (though a table with this year may
 * not exist).
 * @param {number} year
 */
export function assertValidYear(year) {
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
export function assertValidMonth(month) {
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error(`Invalid HTTP Archive run month ${month}`);
  }
}

/**
 * Returns a standard extracted table ID for the given date. Month is
 * assumed to be in [1, 12], not [0, 11] as is usual in JS dates.
 * @param {{year: number, month: number}} tableInfo
 */
export function getExtractedTableId({year, month}) {
  assertValidYear(year);
  assertValidMonth(month);

  const paddedMonth = String(month).padStart(2, '0');
  return `lh_extract_${year}_${paddedMonth}_01`;
}

export default class HaTablesData {
  /**
   * The list of available HTTP Archive tables, sorted chronologically, starting
   * with the most recent (or null, if they haven't been fetched yet).
   * @type {Array<HaTableInfo>|null}
   * @private
   */
  _tablesData = null;

  /**
   * @type {BigQuery}
   * @private
   */
  _bigQuery;

  /**
   * @type {HaTableInfo['sourceDataset']}
   * @private
   */
  _sourceDataset;

  /**
   * @type {Dataset}
   * @private
   */
  _extractedDataset;

  /**
   * A class that represents the available HTTP Archive Lighthouse monthly
   * tables, both in the "source" form of full JSON LHRs stored as string blobs
   * and as the "extracted" tables filled with values pulled from the "source".
   * `extractedDataset` is the dataset where the breakdown of values from the
   * full LHRs will be stored in extracted tables.
   * By default these are extracted from the official `httparchive.lighthouse.*`
   * tables, but this can be overriden via `sourceDataset`.
   * @param {Dataset} extractedDataset
   * @param {HaTableInfo['sourceDataset']} [sourceDataset]
   */
  constructor(extractedDataset, sourceDataset) {
    this._extractedDataset = extractedDataset;
    this._bigQuery = extractedDataset.bigQuery;
    this._sourceDataset = this._initAndCheckSourceDataset(sourceDataset);
  }

  /**
   * Do some basic, local checks that `extractedTable` is the extracted form of
   * `tableInfo`, then break `HaTableInfo` readonlyness and add `extractedTable`
   * to `tableInfo`.
   * @param {HaTableInfo} tableInfo
   * @param {Table} extractedTable
   */
  static addExtractedTable(tableInfo, extractedTable) {
    // Checks are a little strict until there's a need for relaxing them.
    // For now, don't allow re-adding a table. Check first next time.
    if (tableInfo.extractedTable) {
      throw new Error('tableInfo already has an `extractedTable`');
    }

    // Require creating by the same dataset JS instance, not just same BQ dataset.
    if (extractedTable.dataset !== tableInfo.extractedDataset) {
      throw new Error('`extractedTable` from a different dataset than the one in `tableInfo`');
    }

    const expectedExtractedId = getExtractedTableId(tableInfo);
    if (expectedExtractedId !== extractedTable.id) {
      // eslint-disable-next-line max-len
      throw new Error(`extractedTable '${extractedTable.id}' did not match expected id '${expectedExtractedId}'`);
    }

    // @ts-expect-error - break readonly to add `extractedTable`.
    tableInfo.extractedTable = extractedTable;
  }

  /**
   * Get the default HTTP Archive project and dataset IDs, unless overridden.
   * Also asserts that the source IDs are valid so any typos can fail as early
   * as possible.
   * @param {Partial<HaTableInfo['sourceDataset']>} [options]
   * @return {HaTableInfo['sourceDataset']}
   * @private
   */
  _initAndCheckSourceDataset(options = {}) {
    const haProjectId = options.haProjectId ?? DEFAULT_HA_PROJECT_ID;
    const haDatasetId = options.haDatasetId ?? DEFAULT_HA_DATASET_ID;

    assertValidProjectId(haProjectId);
    assertValidBigQueryId(haDatasetId);

    return {haProjectId, haDatasetId};
  }

  /**
   * Retrieve available HTTP Archive run tables, sorted chronologically starting
   * with the most recent.
   * @return {Promise<Array<HaTableInfo>>}
   * @private
   */
  async _getTablesData() {
    if (this._tablesData) {
      return this._tablesData;
    }

    const tableIds = await getAvailableHaTableIds(this._bigQuery, this._sourceDataset);

    this._tablesData = tableIds
      // Put most recent first.
      .sort().reverse()
      // And map to tableInfo objects.
      .map(tableId => {
        const result = /(?<year>\d{4})_(?<month>\d{2})/.exec(tableId);
        if (result === null || !result.groups) throw new Error(`Invalid HA table name ${tableId}`);

        const year = Number.parseInt(result.groups.year);
        const month = Number.parseInt(result.groups.month);
        const {haProjectId, haDatasetId} = this._sourceDataset;

        return {
          year,
          month,
          tableId,
          sourceDataset: {
            haProjectId,
            haDatasetId,
          },
          extractedDataset: this._extractedDataset,
        };
      });

    return this._tablesData;
  }

  /**
   * Retrieve available HTTP Archive run tables, sorted chronologically starting
   * with the most recent.
   * @return {Promise<Array<HaTableInfo>>}
   */
  async getListOfTables() {
    const tablesData = await this._getTablesData();
    return tablesData.slice();
  }

  /**
   * A convenience method that returns the most recent tableInfo available.
   * @return {Promise<HaTableInfo>}
   */
  async getLatestTable() {
    const tablesData = await this._getTablesData();
    return tablesData[0];
  }

  /**
   * Returns the tableInfo one month before the given tableInfo, or null if one
   * doesn't exist. Month is assumed to be in [1, 12], not [0, 11] as is usual in
   * JS dates.
   * @param {HaTableInfo} tableInfo
   * @return {Promise<HaTableInfo|null>}
   */
  async getMonthBefore(tableInfo) {
    const tablesData = await this._getTablesData();
    if (!tablesData.includes(tableInfo)) {
      throw new Error(`${tableInfo.tableId} not in known tables. Where did you get that?`);
    }

    let {month: earlierMonth, year: earlierYear} = tableInfo;
    earlierMonth -= 1;
    if (earlierMonth === 0) {
      earlierMonth = 12;
      earlierYear -= 1;
    }

    const earlierInfo = tablesData
      .find(choice => choice.year === earlierYear && choice.month === earlierMonth);

    return earlierInfo || null;
  }

  /**
   * Returns the tableInfo one year before the given tableInfo, or null if one
   * doesn't exist.
   * @param {HaTableInfo} tableInfo
   * @return {Promise<HaTableInfo|null>}
   */
  async getYearBefore(tableInfo) {
    const tablesData = await this._getTablesData();
    if (!tablesData.includes(tableInfo)) {
      throw new Error(`${tableInfo.tableId} not in known tables. Where did you get that?`);
    }

    let {month: earlierMonth, year: earlierYear} = tableInfo;
    earlierYear -= 1;

    const earlierInfo = tablesData
      .find(choice => choice.year === earlierYear && choice.month === earlierMonth);
    return earlierInfo || null;
  }
}

/**
 * Get a list of extractable HTTPArchive raw LHR tables.
 * Currently does not return the old half-month tables (e.g. only
 * returns `2018_02_01_mobile`, not `2018_02_15_mobile`).
 * @param {BigQuery} bigQuery
 * @param {HaTableInfo['sourceDataset']} source
 * @return {Promise<Array<string>>}
 */
async function getAvailableHaTableIds(bigQuery, {haProjectId, haDatasetId}) {
  assertValidProjectId(haProjectId);
  assertValidBigQueryId(haDatasetId);

  const tableQuery = `SELECT table_id
    FROM \`${haProjectId}.${haDatasetId}.__TABLES__\`
    WHERE ENDS_WITH(table_id, 'mobile')`;

  const [tables] = await bigQuery.query({
    query: tableQuery,
  });

  return tables
    .map(t => t.table_id)
    .filter(id => !id.endsWith('15_mobile'));
}
