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

import fs from 'fs';
import path from 'path';

import {PROJECT_ROOT} from '../../module-utils.js';

/**
 * Project-local credentials for ease of development.
 */
const defaultCredentials = {
  projectId: 'lh-metrics-analysis',
  keyFilename: './js/big-query/auth/sa-key-lh-metrics-analysis.json',
};

/**
 * Gets credentials for Google Cloud. If `GOOGLE_APPLICATION_CREDENTIALS` is
 * set, defers to that, otherwise uses a local service account key.
 */
function getCredentials() {
  // If env variable already set, defer to it.
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return undefined;
  }

  // If `defaultCredentials` won't work, emit a better error message.
  const defaultKeyFilepath = path.resolve(PROJECT_ROOT, defaultCredentials.keyFilename);
  if (!fs.existsSync(defaultKeyFilepath)) {
    // eslint-disable-next-line max-len
    throw new Error(`Google Cloud default credentials not found. Set GOOGLE_APPLICATION_CREDENTIALS to a usable service-account key path`);
  }

  return defaultCredentials;
}

/**
 * `undefined` if GOOGLE_APPLICATION_CREDENTIALS is set and should be used,
 * otherwise defaults to a usable set of credentials.
 * @type {undefined | {projectId: string, keyFilename: string}}
 */
export default getCredentials();
