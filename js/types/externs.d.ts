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

// Common types that are easier to declare in typescript syntax than jsdoc.

import {Dataset, Table} from '@google-cloud/bigquery';

// Can't do readonly and document each property in jsdoc.
// Note: 'Info' is used as a suffix to differentiate from the BigQuery client library `Table` type.
/**
 * Indexing data about a raw-LHR-containing table (such as a table in the HTTP
 * Archive dataset). The only requirement is that the table have a `report`
 * string column containing stringified LHRs. 
 */
export interface LhrTableInfo {
  /** The id of the table in the source dataset. */
  readonly tableId: string;
  /** The id of the table once extracted. */
  readonly extractedTableId: string;
  /**
   * The source BigQuery project and dataset. Usually the HTTP Archive, but can
   * be overridden for testing or to use another dataset of LHRs. Only strings
   * because only query permissions required, not project or write access.
   */
  readonly sourceDataset: {
    /** The project ID to query (e.g. `httparchive`). */
    readonly projectId: string;
    /** The dataset ID to query (e.g. `lighthouse`). */
    readonly datasetId: string;
  };
  /** The dataset of the extracted form of this table or where that table will be created. */
  readonly extractedDataset: Dataset;
  /** The extracted form of this table, or `undefined` if it hasn't been queried or created yet. */
  readonly extractedTable?: Table;
}
