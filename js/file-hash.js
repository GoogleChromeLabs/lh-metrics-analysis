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

import crypto from 'crypto';
import fs from 'fs';
import stream from 'stream';
import {promisify} from 'util';
const pipeline = promisify(stream.pipeline);

/**
 * Returns a transform stream that tacks the `addendum` string to the end of
 * whatever comes through it. If `addendum` is the empty string, the Transform
 * is equivalent to `stream.PassThrough` (the identity Transform).
 * @param {string} addendum
 * @return {stream.Transform}
 */
function getAppendStream(addendum) {
  const appendData = Buffer.from(addendum);

  const appendStream = new stream.Transform({
    transform(chunk, encoding, callback) {
      // Existing content is unchanged.
      callback(null, chunk);
    },
    flush(callback) {
      // Flush the extra data at the end.
      callback(null, appendData);
    },
  });

  return appendStream;
}

// TODO(bckenny): add a getShortHash for better filenames?
/**
 * Returns the md5 hash of the file at the given path.
 * Allows an optional extra string `addendum` to be included in the hash, the
 * equivalent to appending the string to the file before hashing its contents.
 * Useful for hashing e.g. an input file to some type of processing with any
 * parameters or metadata used to configure that processing.
 * @param {string} filePath
 * @param {string=} addendum
 * @return {Promise<string>}
 */
async function getFileHash(filePath, addendum = '') {
  const inputStream = fs.createReadStream(filePath);
  const appendStream = getAppendStream(addendum);
  const hash = crypto.createHash('md5');

  await pipeline(inputStream, appendStream, hash);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  return hash.read().toString('hex');
}

export {
  getFileHash,
};
