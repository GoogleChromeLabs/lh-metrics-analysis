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
 * @fileoverview Functions that create and manage LhrTableInfo instances,
 * providing the info needed to query them and their extracted form.
 */

/** @typedef {import('@google-cloud/bigquery').Dataset} Dataset */
/** @typedef {import('@google-cloud/bigquery').Table} Table */
/** @typedef {import('../types/externs').LhrTableInfo} LhrTableInfo */

import {assertValidProjectId, assertValidBigQueryId} from './bq-utils.js';

/**
 * Returns a standard extracted table ID for the source tableId.
 * @param {string} sourceTableId
 * @param {LhrTableInfo['sourceDataset']} sourceDataset
 * @return {string}
 */
function getExtractedTableId(sourceTableId, sourceDataset) {
  // Standard prefix + source dataset id.
  return `lh_extract_${sourceDataset.datasetId}_${sourceTableId}`;
}

/**
 * Create an object that represents an available table of LHRs, both in a
 * "source" form of full JSON LHRs stored as string blobs and as an "extracted"
 * table filled with values pulled from the "source".
 * - `sourceDataset` is the project and dataset where raw LHRs are found.
 * - `extractedDataset` is the dataset where the breakdown of values from the
 *    full LHRs will be stored in extracted tables.
 * @param {string} sourceTableId
 * @param {LhrTableInfo['sourceDataset']} sourceDataset
 * @param {Dataset} extractedDataset
 * @return {LhrTableInfo}
 */
export function createLhrTableInfo(sourceTableId, sourceDataset, extractedDataset) {
  const {projectId, datasetId} = sourceDataset;
  const extractedTableId = getExtractedTableId(sourceTableId, sourceDataset);

  const lhrTableInfo = {
    tableId: sourceTableId,
    extractedTableId,
    sourceDataset: {
      projectId,
      datasetId,
    },
    extractedDataset,
  };

  // Fail early on invalid ids.
  assertValidLhrTableInfo(lhrTableInfo);
  return lhrTableInfo;
}

/**
 * Asserts that the strings in the given lhrTableInfo are valid identifiers.
 * Does not do a live check of provided tables and datasets, so even if valid-
 * looking, the IDs may not point to any real and/or valid sources of data.
 * @param {LhrTableInfo} lhrTableInfo
 */
export function assertValidLhrTableInfo(lhrTableInfo) {
  assertValidBigQueryId(lhrTableInfo.tableId);
  assertValidBigQueryId(lhrTableInfo.extractedTableId);

  const {sourceDataset} = lhrTableInfo;
  assertValidProjectId(sourceDataset.projectId);
  assertValidBigQueryId(sourceDataset.datasetId);

  if (lhrTableInfo.extractedTable) {
    const actualExtractedId = lhrTableInfo.extractedTable.id;
    if (lhrTableInfo.extractedTableId !== actualExtractedId) {
      // eslint-disable-next-line max-len
      throw new Error(`extractedTable '${actualExtractedId}' did not match expected id '${lhrTableInfo.extractedTableId}'`);
    }
  }
}

/**
 * Add a reference to the table extracted from the given LHR table for faster
 * future operations. Does some basic, local checks that `extractedTable` is the
 * extracted form of `lhrTableInfo`, then temporarily breaks `LhrTableInfo`
 * readonlyness to add `extractedTable` to `lhrTableInfo`.
 * @param {LhrTableInfo} lhrTableInfo
 * @param {Table} extractedTable
 */
export function addExtractedToLhrTable(lhrTableInfo, extractedTable) {
  // Checks are a little strict until there's a need for relaxing them.
  // For now, don't allow re-adding a table. Check first next time.
  if (lhrTableInfo.extractedTable) {
    throw new Error('tableInfo already has an `extractedTable`');
  }

  // Require creating by the same dataset JS instance, not just same BQ dataset.
  if (extractedTable.dataset !== lhrTableInfo.extractedDataset) {
    throw new Error('`extractedTable` from a different dataset than the one in `tableInfo`');
  }

  if (lhrTableInfo.extractedTableId !== extractedTable.id) {
    // eslint-disable-next-line max-len
    throw new Error(`extractedTable '${extractedTable.id}' did not match expected id '${lhrTableInfo.extractedTableId}'`);
  }

  // @ts-expect-error - break readonly to add `extractedTable`.
  lhrTableInfo.extractedTable = extractedTable;
}
