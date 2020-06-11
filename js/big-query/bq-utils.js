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
 * @fileoverview Utilities for common, simple BigQuery things.
 */

import {v4 as uuidv4} from 'uuid';

/**
 * Asserts valid Google Cloud project id (though a project with this id may not
 * exist). Google Cloud project ids can have "lowercase letters, digits, or
 * hyphens. It must start with a lowercase letter and end with a letter or number."
 * @see https://cloud.google.com/resource-manager/reference/rest/v1/projects#resource:-project
 * @param {string} id
 */
function assertValidProjectId(id) {
  if (typeof id !== 'string' || !/^[a-z][a-z0-9-]*[a-z0-9]$/.test(id)) {
    throw new Error(`invalid GCloud project id '${id}'`);
  }
}

/**
 * Asserts valid BigQuery dataset or table id (though a dataset or table with
 * this id may not exist).
 * BigQuery dataset and table ids can include letters, numbers, and underscores.
 * @see https://cloud.google.com/bigquery/docs/datasets#dataset-naming
 * @param {string} id
 */
function assertValidBigQueryId(id) {
  if (typeof id !== 'string' || !/^\w+$/.test(id)) {
    throw new Error(`invalid BigQuery id '${id}'`);
  }
}

/**
 * Asserts valid BigQuery column name (though a column with this name may not
 * exist).
 * A BigQuery column name "must contain only letters (a-z, A-Z), numbers
 * (0-9), or underscores (_), and it must start with a letter or underscore. The
 * maximum column name length is 128 characters. A column name cannot use any of
 * the following prefixes: `_TABLE_`, `_FILE_`, or `_PARTITION`."
 * @see https://cloud.google.com/bigquery/docs/schemas#column_names
 * @param {string} name
 */
function assertValidColumnName(name) {
  if (typeof name !== 'string') {
    throw new Error('BigQuery column name must be a string');
  }
  if (name.length === 0 || name.length > 128) {
    throw new Error(`invalid BigQuery column name length ('${name}')`);
  }
  if (name.startsWith('_TABLE_') || name.startsWith('_FILE_') || name.startsWith('_PARTITION')) {
    throw new Error(`invalid BigQuery column name prefix ('${name}')`);
  }
  if (!/^[a-zA-Z_]\w*$/.test(name)) {
    throw new Error(`invalid characters in BigQuery column name ('${name}')`);
  }
}

/**
 * Returns a random UUID suffix suitable to append to a BigQuery table name (the
 * hyphens have been replaced with underscores).
 * @return {string}
 */
function getUuidTableSuffix() {
  const bqUuid = uuidv4().replace(/-/g, '_');
  assertValidBigQueryId(bqUuid);

  return bqUuid;
}

export {
  assertValidProjectId,
  assertValidBigQueryId,
  assertValidColumnName,
  getUuidTableSuffix,
};
