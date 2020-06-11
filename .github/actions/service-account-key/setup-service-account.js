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

// From https://github.com/GoogleCloudPlatform/github-actions/blob/810967113855592107304fe445a26e8822800b1a/setup-gcloud/src/setup-gcloud.ts
// with non-service-account-saving code stripped out.

import fs from 'fs';
import path from 'path';

import * as core from '@actions/core';
import {v4 as uuidv4} from 'uuid';

/**
 * Save service account JSON key to disk, then save path to
 * `GOOGLE_APPLICATION_CREDENTIALS`.
 * @return {void}
 */
function run() {
  const workspace = process.env.GITHUB_WORKSPACE;
  if (!workspace) {
    throw new Error('Missing GITHUB_WORKSPACE. Make sure using at least @v2 of actions/checkout');
  }

  const serviceAccountKey = core.getInput('service_account_key', {required: true});

  // Handle base64-encoded credentials
  let serviceAccountJson = serviceAccountKey;
  if (!serviceAccountKey.trim().startsWith('{')) {
    serviceAccountJson = Buffer.from(serviceAccountKey, 'base64').toString();
  }

  // Only use valid JSON.
  try {
    serviceAccountJson = JSON.stringify(JSON.parse(serviceAccountJson), null, 2);
  } catch (error) {
    throw new Error('service_account_key was not valid JSON');
  }

  const credentialsPath = path.join(workspace, uuidv4());
  fs.writeFileSync(credentialsPath, serviceAccountJson);

  core.exportVariable('GOOGLE_APPLICATION_CREDENTIALS', credentialsPath);
  core.info('Successfully exported Default Application Credentials');
}

try {
  run();
} catch (error) {
  core.setFailed(error.message);
}
