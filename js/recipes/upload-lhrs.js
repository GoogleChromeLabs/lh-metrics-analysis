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
 * @fileoverview A simple script to upload a set of LHRs to a bigQuery table.
 * Uses the LHR results format from the current Lighthouse gcp-collection/
 * scripts. Everything is hardcoded, see TODOs for improving performance.
 */

import fs from 'fs';
import {strict as assert} from 'assert';

// TODO(bckenny): use createRequire() for cjs deps when supported by tsc.
import BQModule from '@google-cloud/bigquery';
const {BigQuery} = BQModule;

import credentials from '../big-query/auth/credentials.js';
import {PROJECT_ROOT} from '../module-utils.js';

const dataPath = PROJECT_ROOT + '/10k-results/data/';
const datasetId = 'manual_runs';
const tableId = '2020_10_my_table_name';

async function run() {
  const lhrFilenames = fs.readdirSync(dataPath)
    .filter(dirname => fs.lstatSync(`${dataPath}/${dirname}`).isDirectory())
    .map(dirname => `${dataPath}/${dirname}/0/lhr.json`);

  const bigQuery = new BigQuery(credentials);
  const targetDataset = bigQuery.dataset(datasetId);
  const targetTable = targetDataset.table(tableId);

  const [exists] = await targetTable.exists();
  if (!exists) {
    throw new Error(`Table '${datasetId}.${tableId}' does not exist.`);
  }

  const totalCount = lhrFilenames.length;
  console.warn(`uploading ${totalCount} LHRs...`);

  // TODO(bckenny): probably considerably faster to do x rows at a time.
  let index = 0;
  for (const lhrFilename of lhrFilenames) {
    if (index % 100 === 0) {
      console.warn(`${index} / ${totalCount} uploaded`);
    }
    index++;

    const lhr = fs.readFileSync(lhrFilename, 'utf-8');
    assert(lhr.length > 10_000, `${lhrFilename} is a short lhr for some reason`);

    // TODO(bckenny): could delete some of the big/unimportant parts
    // lhr = JSON.parse(lhr);
    // lhr.i18n = {};
    // delete lhr.audits['screenshot-thumbnails'];
    // delete lhr.audits['screenshot-thumbnails'];
    // TODO(bckenny): or just get rid of pretty spacing in JSON?

    await targetTable.insert({report: lhr});
  }
}

run(); // eslint-disable-line @typescript-eslint/no-floating-promises
