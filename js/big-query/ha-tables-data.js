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
 * @fileoverview A class that lazily queries the available HTTPArchive
 * Lighthouse monthly tables.
 */

/** @typedef {import('@google-cloud/bigquery').BigQuery} BigQuery */
/** @typedef {Readonly<{year: number, month: number, tableId: string, extractedTableId: string}>} HaTableInfo */

/**
 * Returns a standard extracted table ID for the given date. Month is
 * assumed to be in [1, 12], not [0, 11] as is usual in JS dates.
 * @param {{year: number, month: number}} tableInfo
 */
function getExtractedTableId({year, month}) {
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
   * @param {BigQuery} bigQuery
   */
  constructor(bigQuery) {
    this._bigQuery = bigQuery;
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
   * Retrieve available HTTP Archive run tables, sorted chronologically starting
   * with the most recent.
   * @return {Promise<Array<HaTableInfo>>}
   * @private
   */
  async _getTablesData() {
    if (this._tablesData) {
      return this._tablesData;
    }

    const tableIds = await getAvailableHaTableIds(this._bigQuery);

    this._tablesData = tableIds
      // Put most recent first.
      .sort().reverse()
      // And map to tableInfo objects.
      .map(tableId => {
        const result = /(?<year>\d{4})_(?<month>\d{2})/.exec(tableId);
        if (result === null || !result.groups) throw new Error(`Invalid HA table name ${tableId}`);

        const year = Number.parseInt(result.groups.year);
        const month = Number.parseInt(result.groups.month);
        const extractedTableId = getExtractedTableId({year, month});

        return {
          year,
          month,
          tableId,
          extractedTableId,
        };
      });

    return this._tablesData;
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
      throw new Error(`${tableInfo.extractedTableId} not in known tables. Where did you get that?`);
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
      throw new Error(`${tableInfo.extractedTableId} not in known tables. Where did you get that?`);
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
 * @return {Promise<Array<string>>}
 */
async function getAvailableHaTableIds(bigQuery) {
  const tableQuery = `SELECT table_id
    FROM \`httparchive.lighthouse.__TABLES__\`
    WHERE ENDS_WITH(table_id, 'mobile')`;

  const [tables] = await bigQuery.query({
    query: tableQuery,
  });

  return tables
    .map(t => t.table_id)
    .filter(id => !id.endsWith('15_mobile'));
}
