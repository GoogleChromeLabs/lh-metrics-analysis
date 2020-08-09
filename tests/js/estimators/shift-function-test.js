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
import fs from 'fs';
import path from 'path';

import {getShiftCsv, getPrettyPrintedShiftData} from '../../../js/estimators/shift-function.js';
import {PROJECT_ROOT} from '../../../js/module-utils.js';

// Path for a temporary generated test file. Always deleted at end of test run.
const tmpTestFilePath = PROJECT_ROOT + '/tests/fixtures/test-file-2525-99-to-2525-98.csv';

// Simple test data.
let zeroHundredTestCsv = 'base,compare\n';
for (let i = 0; i < 100; i++) {
  zeroHundredTestCsv += `0,${i + 0.5}\n`;
}

// Simple test expectations if non-random seed.
const zeroToHundredTestExpected =
`q,base,compare,difference,ci_lower,ci_upper
0.1,0,10.00000000169774,10.00000000169774,2.6376276787763526,17.36237232461913
0.2,0,19.999999999999986,19.999999999999986,9.199497314209058,30.800502685790914
0.3,0,30.000000000000007,30.000000000000007,17.424605533578074,42.57539446642194
0.4,0,40,40,27.419849872070067,52.58015012792993
0.5,0,50.000000000000014,50.000000000000014,37.3820818103623,62.61791818963773
0.6,0,60.00000000000001,60.00000000000001,47.557865710113084,72.44213428988692
0.7,0,70.00000000000004,70.00000000000004,58.539500702034275,81.46049929796581
0.8,0,79.99999999999994,79.99999999999994,69.9324477574252,90.06755224257469
0.9,0,89.99999999830226,89.99999999830226,82.3291911855664,97.67080881103811\n`;

/**
 * Returns the cache files, if any, in the same directory as pathname.
 * @param {string} pathname
 * @return {Array<string>}
 */
function getCacheFiles(pathname) {
  const dirname = path.dirname(pathname);
  const needle = /^shiftdhd(?:-\d{4}-\d{2}-to-\d{4}-\d{2})?\.[a-f0-9]*\.csv$/;
  const cacheFiles = fs.readdirSync(dirname)
      .filter(filename => filename.match(needle));

  return cacheFiles;
}

describe('Shift Function', () => {
  after(() => {
    // Delete test file if it exists.
    if (fs.existsSync(tmpTestFilePath)) {
      fs.unlinkSync(tmpTestFilePath);
    }

    // Delete cache file if it exists.
    const cacheFiles = getCacheFiles(tmpTestFilePath);
    assert.notStrictEqual(cacheFiles.length, 0,
        `no cache file in ${path.dirname(tmpTestFilePath)} found`);
    for (const cacheFile of cacheFiles) {
      fs.unlinkSync(`${path.dirname(tmpTestFilePath)}/${cacheFile}`);
    }
  });

  it('calculates the shift function from sample data', async () => {
    fs.writeFileSync(tmpTestFilePath, zeroHundredTestCsv);

    const beforeNumCacheFiles = getCacheFiles(tmpTestFilePath).length;
    const shiftCsv = await getShiftCsv(tmpTestFilePath, {quiet: true});
    const afterNumCacheFiles = getCacheFiles(tmpTestFilePath).length;
    assert.strictEqual(shiftCsv, zeroToHundredTestExpected);
    assert.strictEqual(afterNumCacheFiles, beforeNumCacheFiles + 1);
  });

  it('reads from cache if calculating from the same sample data', async () => {
    fs.writeFileSync(tmpTestFilePath, zeroHundredTestCsv);

    const beforeNumCacheFiles = getCacheFiles(tmpTestFilePath).length;
    const shiftCsv = await getShiftCsv(tmpTestFilePath, {quiet: true});
    const afterNumCacheFiles = getCacheFiles(tmpTestFilePath).length;
    assert.strictEqual(shiftCsv, zeroToHundredTestExpected);
    assert.strictEqual(afterNumCacheFiles, beforeNumCacheFiles, 'a new cache file were generated');
  });

  it('calculates the shift function with random seed without caching', async () => {
    fs.writeFileSync(tmpTestFilePath, zeroHundredTestCsv);
    const relativePath = path.relative(PROJECT_ROOT, tmpTestFilePath);

    const beforeNumCacheFiles = getCacheFiles(tmpTestFilePath).length;
    const shiftCsv = await getShiftCsv(relativePath, {useRandomSeed: true, quiet: true});
    const afterNumCacheFiles = getCacheFiles(tmpTestFilePath).length;
    assert.notStrictEqual(shiftCsv, zeroToHundredTestExpected);
    assert.strictEqual(afterNumCacheFiles, beforeNumCacheFiles, 'a new cache file were generated');
  });

  it('calculates the shift function and creates a new cache if nboot is changed', async () => {
    fs.writeFileSync(tmpTestFilePath, zeroHundredTestCsv);

    const beforeNumCacheFiles = getCacheFiles(tmpTestFilePath).length;
    const shiftCsv = await getShiftCsv(tmpTestFilePath, {quiet: true, nboot: 1});
    const afterNumCacheFiles = getCacheFiles(tmpTestFilePath).length;
    assert.notStrictEqual(shiftCsv, zeroToHundredTestExpected);
    assert.strictEqual(afterNumCacheFiles, beforeNumCacheFiles + 1,
        'a new cache file was not generated');
  });

  describe('base,compare csv parsing', () => {
    it('throws if csv does not have an initial `base` column', async () => {
      const testCsv = 'bernard,compare\n5,15';
      fs.writeFileSync(tmpTestFilePath, testCsv);

      await assert.rejects(async () => {
        return getShiftCsv(tmpTestFilePath, {quiet: true});
      }, /^Error: First column must be named 'base' \('bernard' found\)$/);
    });

    it('throws if csv does not have a second `compare` column', async () => {
      const testCsv = 'base,othercolumn\n5,15';
      fs.writeFileSync(tmpTestFilePath, testCsv);

      await assert.rejects(async () => {
        return getShiftCsv(tmpTestFilePath, {quiet: true});
      }, /^Error: Second column must be named 'compare' \('othercolumn' found\)$/);
    });

    it('throws if csv has a third column', async () => {
      const testCsv = 'base,compare,third\n5,15,22';
      fs.writeFileSync(tmpTestFilePath, testCsv);

      await assert.rejects(async () => {
        return getShiftCsv(tmpTestFilePath, {quiet: true});
      }, /^Error: CSV must have only 'base' and 'compare' columns$/);
    });

    it('throws if csv has a NaN in the base column', async () => {
      const testCsv = 'base,compare\n5,15\nNaN,22\n1,2\n';
      fs.writeFileSync(tmpTestFilePath, testCsv);

      await assert.rejects(async () => {
        return getShiftCsv(tmpTestFilePath, {quiet: true});
      }, /^Error: bad 'base' value 'NaN'$/);
    });

    it('throws if a row has a missing base value', async () => {
      const testCsv = 'base,compare\n5,15\n,3\n1,2\n';
      fs.writeFileSync(tmpTestFilePath, testCsv);

      await assert.rejects(async () => {
        return getShiftCsv(tmpTestFilePath, {quiet: true});
      }, /^Error: missing 'base' value$/);
    });

    it('throws if a row has a missing compare value', async () => {
      const testCsv = 'base,compare\n5,15\n1,\n1,2\n';
      fs.writeFileSync(tmpTestFilePath, testCsv);

      await assert.rejects(async () => {
        return getShiftCsv(tmpTestFilePath, {quiet: true});
      }, /^Error: missing 'compare' value$/);
    });

    it('throws if csv has a NaN in the compare column', async () => {
      const testCsv = 'base,compare\n5,NaN\n1,22\n1,2\n';
      fs.writeFileSync(tmpTestFilePath, testCsv);

      await assert.rejects(async () => {
        return getShiftCsv(tmpTestFilePath, {quiet: true});
      }, /^Error: bad 'compare' value 'NaN'$/);
    });

    it('throws if a row is missing a value', async () => {
      const testCsv = 'base,compare\n5,15\n1\n1,2\n';
      fs.writeFileSync(tmpTestFilePath, testCsv);

      await assert.rejects(async () => {
        return getShiftCsv(tmpTestFilePath, {quiet: true});
      }, /^Error: line shorter than two columns$/);
    });

    it('throws if a row is three values long', async () => {
      const testCsv = 'base,compare\n5,15\n1,2,3\n1,2\n';
      fs.writeFileSync(tmpTestFilePath, testCsv);

      await assert.rejects(async () => {
        return getShiftCsv(tmpTestFilePath, {quiet: true});
      }, /^Error: line longer than two columns$/);
    });
  });

  describe('input validation', () => {
    describe('inputPath', () => {
      it('throws on non-string inputPath', async () => {
        /** @type string} */
        // @ts-expect-error - intentionally type breaking for test.
        const inputPath = 555;

        await assert.rejects(async () => {
          return getShiftCsv(inputPath, {quiet: true});
        }, /^Error: supplied path '555' must be a string$/);
      });

      it('throws on inputPath to a file that does not end in `.csv`', async () => {
        const inputPath = 'test-data.json';

        await assert.rejects(async () => {
          return getShiftCsv(inputPath, {quiet: true});
        }, /^Error: file 'test-data\.json' doesn't appear to be a csv file$/);
      });

      it('throws on inputPath to a file that does not exist', async () => {
        const inputPath = 'not-a-real-file.csv';

        await assert.rejects(async () => {
          return getShiftCsv(inputPath, {quiet: true});
        // eslint-disable-next-line max-len
        }, /^Error: Unable to locate 'not-a-real-file\.csv'.*not-a-real-file\.csv\n.*lh-metrics-analysis\/not-a-real-file.csv$/s);
      });
    });

    describe('nboot', () => {
      before(() => {
        // Write something so these don't fail on invalid file.
        fs.writeFileSync(tmpTestFilePath, zeroHundredTestCsv);
      });

      it('throws on invalid nboot type', async () => {
        /** @type {{nboot: number, quiet: true}} */
        // @ts-expect-error - intentionally type breaking for test.
        const options = {nboot: true, quiet: true};

        await assert.rejects(async () => getShiftCsv(tmpTestFilePath, options),
            /^Error: invalid nboot value \('true'\)$/);
      });

      it('throws on invalid numeric nboots', async () => {
        await assert.rejects(async () => {
          return getShiftCsv(tmpTestFilePath, {nboot: NaN, quiet: true});
        }, /^Error: nboot value \('NaN'\) is not a positive integer$/);

        await assert.rejects(async () => {
          return getShiftCsv(tmpTestFilePath, {nboot: -1, quiet: true});
        }, /^Error: nboot value \('-1'\) is not a positive integer$/);

        await assert.rejects(async () => {
          return getShiftCsv(tmpTestFilePath, {nboot: 2.5, quiet: true});
        }, /^Error: nboot value \('2\.5'\) is not a positive integer$/);

        await assert.rejects(async () => {
          return getShiftCsv(tmpTestFilePath, {nboot: '2 nboots', quiet: true});
        }, /^Error: nboot value \('2 nboots'\) is not a positive integer$/);
      });
    });
  });

  describe('getPrettyPrintedShiftData', () => {
    it('pretty prints shift function results', () => {
      const shiftData = [
        /* eslint-disable max-len */
        {q: 0.1, base: 11.1111111, compare: 12.345, difference: 1.2338889, ciLower: 1.111, ciUpper: 2.222},
        {q: 0.2, base: 22.2222222, compare: 67.891, difference: 45.6687778, ciLower: 40.0001, ciUpper: 49.9999},
        /* eslint-enable max-len */
      ];
      const prettyPrinted = getPrettyPrintedShiftData(shiftData);
      assert.strictEqual(prettyPrinted,
        '| p10 | 11.1 | 12.3 | 1.2ms (95% CI [1.1, 2.2]) |\n' +
        '| p20 | 22.2 | 67.9 | 45.7ms (95% CI [40, 50]) |\n');
    });
  });
});