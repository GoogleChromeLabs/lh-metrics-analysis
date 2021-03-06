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

import path from 'path';
import {fileURLToPath} from 'url';

/**
 * Fill-in for __filename in modules.
 *
 * `import.meta` can be passed in from a module regardless of tsc warnings that
 * `--module` is required.
 * @param {ImportMeta} importMeta
 * @return {string}
 */
function filename(importMeta) {
  return fileURLToPath(importMeta.url);
}

/**
 * Fill-in for __dirname in modules.
 *
 * `import.meta` can be passed in from a module regardless of tsc warnings that
 * `--module` is required.
 * @param {ImportMeta} importMeta
 * @return {string}
 */
function dirname(importMeta) {
  return path.dirname(fileURLToPath(importMeta.url));
}

// @ts-expect-error - we can use import.meta with --module=commonjs, trust me :)
const importMeta = import.meta;
const PROJECT_ROOT = path.resolve(dirname(importMeta) + '/..');

export {
  filename,
  dirname,
  PROJECT_ROOT,
};
