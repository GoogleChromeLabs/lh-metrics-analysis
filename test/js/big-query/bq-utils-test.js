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

import {assertValidProjectId, assertValidBigQueryId, assertValidColumnName, getUuidTableSuffix} from
  '../../../js/big-query/bq-utils.js';

describe('BigQuery Utilities', () => {
  describe('#assertValidProjectId', () => {
    const validProjectId = 'lh-metrics-analysis';

    it('accepts a valid project id', () => {
      assert.doesNotThrow(() => assertValidProjectId(validProjectId));
    });

    it('throws for empty project ids', () => {
      assert.throws(() => assertValidProjectId(''), /^Error: invalid GCloud project id ''$/);
      // @ts-expect-error - undefined not allowed as string input
      assert.throws(() => assertValidProjectId(undefined),
          /^Error: invalid GCloud project id 'undefined'$/);
      // @ts-expect-error - null not allowed as string input
      assert.throws(() => assertValidProjectId(null), /^Error: invalid GCloud project id 'null'$/);
    });

    it('throws for project ids that end in a hyphen', () => {
      assert.throws(() => assertValidProjectId(`${validProjectId}-`),
          /^Error: invalid GCloud project id 'lh-metrics-analysis-'$/);
    });

    it('throws for project ids that start with a number', () => {
      assert.throws(() => assertValidProjectId(`0${validProjectId}`),
          /^Error: invalid GCloud project id '0lh-metrics-analysis'$/);
    });

    it('throws for project ids containing an invalid character', () => {
      assert.throws(() => assertValidProjectId(`${validProjectId}-))((-${validProjectId}`),
          /^Error: invalid GCloud project id 'lh-metrics-analysis-\)\)\(\(-lh-metrics-analysis'$/);
    });
  });

  describe('#assertValidBigQueryId', () => {
    const validTableId = '2020_05_01_mobile';

    it('accepts a valid id', () => {
      assert.doesNotThrow(() => assertValidBigQueryId(validTableId));
    });

    it('throws for empty ids', () => {
      assert.throws(() => assertValidBigQueryId(''), /^Error: invalid BigQuery id ''$/);
      // @ts-expect-error - undefined not allowed as string input
      assert.throws(() => assertValidBigQueryId(undefined),
          /^Error: invalid BigQuery id 'undefined'$/);
      // @ts-expect-error - null not allowed as string input
      assert.throws(() => assertValidBigQueryId(null), /^Error: invalid BigQuery id 'null'$/);
    });

    it('throws for ids that contain hyphens', () => {
      assert.throws(() => assertValidBigQueryId('lh-metrics-analysis'),
          /^Error: invalid BigQuery id 'lh-metrics-analysis'$/);
    });

    it('throws for ids containing an invalid character', () => {
      assert.throws(() => assertValidBigQueryId(`${validTableId}-))((-${validTableId}`),
          /^Error: invalid BigQuery id '2020_05_01_mobile-\)\)\(\(-2020_05_01_mobile'$/);
    });
  });

  describe('#assertValidColumnName', () => {
    it('accepts a valid name', () => {
      assert.doesNotThrow(() => assertValidColumnName('lcp_value'));
    });

    it('accepts a valid name starting with an underscore', () => {
      assert.doesNotThrow(() => assertValidColumnName('_lcp_value'));
    });

    it('throws for non-strings', () => {
      // @ts-expect-error - undefined not allowed as string input
      assert.throws(() => assertValidColumnName(undefined),
          /^Error: BigQuery column name must be a string$/);
      // @ts-expect-error - null not allowed as string input
      assert.throws(() => assertValidColumnName(null),
          /^Error: BigQuery column name must be a string$/);
      // @ts-expect-error - number not allowed as string input
      assert.throws(() => assertValidColumnName(5),
          /^Error: BigQuery column name must be a string$/);
    });

    it('throws for an empty string', () => {
      assert.throws(() => assertValidColumnName(''),
          /^Error: invalid BigQuery column name length \(''\)$/);
    });

    it('throws for a too-long string', () => {
      assert.throws(() => assertValidColumnName('asdf'.repeat(33)),
          /^Error: invalid BigQuery column name length \('(?:asdf){33}'\)$/);
    });

    it('throws for names with invalid prefixes', () => {
      assert.throws(() => assertValidColumnName('_TABLE_lcp_value'),
          /^Error: invalid BigQuery column name prefix \('_TABLE_lcp_value'\)$/);
      assert.throws(() => assertValidColumnName('_FILE_lcp_value'),
          /^Error: invalid BigQuery column name prefix \('_FILE_lcp_value'\)$/);
      assert.throws(() => assertValidColumnName('_PARTITIONlcp_value'),
          /^Error: invalid BigQuery column name prefix \('_PARTITIONlcp_value'\)$/);
    });

    it('throws for a name starting with a number', () => {
      assert.throws(() => assertValidColumnName('0lcp_value'),
          /^Error: invalid characters in BigQuery column name \('0lcp_value'\)$/);
    });

    it('throws for ids containing an invalid character', () => {
      assert.throws(() => assertValidColumnName('lcp_)value'),
          /^Error: invalid characters in BigQuery column name \('lcp_\)value'\)$/);
      assert.throws(() => assertValidColumnName(`lcp'_value`),
          /^Error: invalid characters in BigQuery column name \('lcp'_value'\)$/);
    });
  });

  describe('#getUuidTableSuffix', () => {
    it('creates a UUID suffix (though with underscores instead of hyphens)', () => {
      // From https://stackoverflow.com/a/14166194 but with '_'.
      const uuidv4Regex = /[a-f0-9]{8}_[a-f0-9]{4}_4[a-f0-9]{3}_[89aAbB][a-f0-9]{3}_[a-f0-9]{12}/;

      const uuidSuffix = getUuidTableSuffix();
      assert.ok(uuidv4Regex.test(uuidSuffix), `**${uuidSuffix}**`);
    });

    it('creates a suffix that creates a still-valid table name', () => {
      const uuidSuffix = getUuidTableSuffix();
      const suffixedTableName = `2020_05_01_mobile_${uuidSuffix}`;
      assert.doesNotThrow(() => assertValidBigQueryId(suffixedTableName));
    });
  });
});
