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

/** @typedef {import('../types/externs').LhrTableInfo} LhrTableInfo */

const DEFAULT_HA_SOURCE_PROJECT_ID = 'httparchive';
const DEFAULT_HA_SOURCE_DATASET_ID = 'lighthouse';

/**
 * Regex matching the normal HTTP Archive table ID. Useful for extracting the
 * month and day of the HTTP Archive run.
 */
const tableIdExtractor = /^(?<year>\d{4})_(?<month>\d{2})_\d\d_mobile$/;

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
 * Extracts the year and month from the given HTTP Archive tableId.
 * @param {string} tableId
 * @return {{year: number, month: number}}
 */
export function getTableDate(tableId) {
  const result = tableIdExtractor.exec(tableId);
  if (result === null || !result.groups) throw new Error(`Invalid HA table name ${tableId}`);
  const year = Number.parseInt(result.groups.year);
  const month = Number.parseInt(result.groups.month);

  return {year, month};
}

/**
 * Returns whether the given table info is probably sourced from an HTTP Archive
 * run. If named similarly enough, may give a false positive result.
 * @param {LhrTableInfo} lhrTableInfo
 * @return {boolean}
 */
export function isHttpArchiveTable(lhrTableInfo) {
  return tableIdExtractor.test(lhrTableInfo.tableId);
}

/**
 * Returns a standard extracted table ID for the given HTTP Archive tableId.
 * @param {string} tableId
 * @return {string}
 */
export function getExtractedTableId(tableId) {
  const {year, month} = getTableDate(tableId);
  assertValidYear(year);
  assertValidMonth(month);

  const paddedMonth = String(month).padStart(2, '0');
  return `lh_extract_${year}_${paddedMonth}_01`;
}

export default class HaTablesData {
  /**
   * The list of available HTTP Archive tables, sorted chronologically, starting
   * with the most recent (or null, if they haven't been fetched yet).
   * @type {Array<LhrTableInfo>|null}
   * @private
   */
  _tablesData = null;

  /**
   * @type {BigQuery}
   * @private
   */
  _bigQuery;

  /**
   * @type {LhrTableInfo['sourceDataset']}
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
   * @param {LhrTableInfo['sourceDataset']} [sourceDataset]
   */
  constructor(extractedDataset, sourceDataset) {
    this._extractedDataset = extractedDataset;
    this._bigQuery = extractedDataset.bigQuery;
    this._sourceDataset = this._initAndCheckSourceDataset(sourceDataset);
  }

  /**
   * Get the default HTTP Archive project and dataset IDs, unless overridden.
   * Also asserts that the source IDs are valid so any typos can fail as early
   * as possible.
   * @param {Partial<LhrTableInfo['sourceDataset']>} [sourceOptions]
   * @return {LhrTableInfo['sourceDataset']}
   * @private
   */
  _initAndCheckSourceDataset(sourceOptions = {}) {
    const projectId = sourceOptions.projectId ?? DEFAULT_HA_SOURCE_PROJECT_ID;
    const datasetId = sourceOptions.datasetId ?? DEFAULT_HA_SOURCE_DATASET_ID;

    assertValidProjectId(projectId);
    assertValidBigQueryId(datasetId);

    return {projectId, datasetId};
  }

  /**
   * Retrieve available HTTP Archive run tables, sorted chronologically starting
   * with the most recent.
   * @return {Promise<Array<LhrTableInfo>>}
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
        const {projectId, datasetId} = this._sourceDataset;

        return {
          tableId,
          extractedTableId: getExtractedTableId(tableId),
          sourceDataset: {
            projectId,
            datasetId,
          },
          extractedDataset: this._extractedDataset,
        };
      });

    return this._tablesData;
  }

  /**
   * Retrieve available HTTP Archive run tables, sorted chronologically starting
   * with the most recent.
   * @return {Promise<Array<LhrTableInfo>>}
   */
  async getListOfTables() {
    const tablesData = await this._getTablesData();
    return tablesData.slice();
  }

  /**
   * A convenience method that returns the most recent HTTP Archive table
   * available.
   * @return {Promise<LhrTableInfo>}
   */
  async getLatestTable() {
    const tablesData = await this._getTablesData();
    return tablesData[0];
  }

  /**
   * A convenience method that returns the HTTP Archive table matching the given
   * date, or `null` if no such table exists.
   * @param {{year: number, month: number}} date
   * @return {Promise<LhrTableInfo|null>}
   */
  async getTableWithDate({year, month}) {
    const tablesData = await this._getTablesData();

    const tableInfo = tablesData.find(candidate => {
      const {year: candidateYear, month: candidateMonth} = getTableDate(candidate.tableId);
      return year === candidateYear && month === candidateMonth;
    });

    return tableInfo || null;
  }

  /**
   * Returns the table one month before the given table, or null if one doesn't
   * exist. Month is assumed to be in [1, 12], not [0, 11] as is usual in JS
   * dates.
   * @param {LhrTableInfo} lhrTableInfo
   * @return {Promise<LhrTableInfo|null>}
   */
  async getMonthBefore(lhrTableInfo) {
    const tablesData = await this._getTablesData();
    if (!tablesData.includes(lhrTableInfo)) {
      throw new Error(`${lhrTableInfo.tableId} not a known table. Where did you get that?`);
    }

    let {month, year} = getTableDate(lhrTableInfo.tableId);
    month -= 1;
    if (month === 0) {
      month = 12;
      year -= 1;
    }

    return this.getTableWithDate({year, month});
  }

  /**
   * Returns the table one year before the given table, or null if one doesn't
   * exist.
   * @param {LhrTableInfo} lhrTableInfo
   * @return {Promise<LhrTableInfo|null>}
   */
  async getYearBefore(lhrTableInfo) {
    const tablesData = await this._getTablesData();
    if (!tablesData.includes(lhrTableInfo)) {
      throw new Error(`${lhrTableInfo.tableId} not a known table. Where did you get that?`);
    }

    let {month, year} = getTableDate(lhrTableInfo.tableId);
    year -= 1;

    return this.getTableWithDate({year, month});
  }
}

/**
 * Get a list of extractable HTTPArchive raw LHR tables.
 * Currently does not return the old half-month tables (e.g. only
 * returns `2018_02_01_mobile`, not `2018_02_15_mobile`).
 * @param {BigQuery} bigQuery
 * @param {LhrTableInfo['sourceDataset']} source
 * @return {Promise<Array<string>>}
 */
async function getAvailableHaTableIds(bigQuery, {projectId, datasetId}) {
  assertValidProjectId(projectId);
  assertValidBigQueryId(datasetId);

  const tableQuery = `SELECT table_id
    FROM \`${projectId}.${datasetId}.__TABLES__\`
    WHERE ENDS_WITH(table_id, 'mobile')`;

  const [tables] = await bigQuery.query({
    query: tableQuery,
  });

  return tables
    .map(t => t.table_id)
    .filter(id => !id.endsWith('15_mobile'));
}
