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

import {
  getQuantileDeciles,
  getPrettyPrintedQuatileData,
} from '../../../js/estimators/quantiles-pbci.js';
import {PROJECT_ROOT} from '../../../js/module-utils.js';

// Path for a temporary generated test file. Always deleted at end of test run.
const tmpTestFilePath = PROJECT_ROOT + '/tests/fixtures/test-file-2525-99-to-2525-98.csv';

// Generate simple test data.
let zeroHundredTestCsv = 'base,compare\n';
for (let i = 0; i < 100; i++) {
  zeroHundredTestCsv += `0,${i + 0.5}\n`;
}

const zeroToHundredTestExpected = [
  /* eslint-disable max-len */
  {q: 0.1, difference: 10.00000000169774, ciLower: 5.867913759497463, ciUpper: 16.41215963286512},
  {q: 0.2, difference: 19.999999999999986, ciLower: 13.47006646664097, ciUpper: 28.13900612777301},
  {q: 0.3, difference: 30.000000000000007, ciLower: 22.091027101974216, ciUpper: 39.25585278590675},
  {q: 0.4, difference: 40, ciLower: 31.261436199030612, ciUpper: 49.260974509061086},
  {q: 0.5, difference: 50.000000000000014, ciLower: 40.71517388911529, ciUpper: 59.28314001754497},
  {q: 0.6, difference: 60.00000000000001, ciLower: 50.975714350956245, ciUpper: 68.95212256806707},
  {q: 0.7, difference: 70.00000000000004, ciLower: 61.194989558634816, ciUpper: 77.87019459445091},
  {q: 0.8, difference: 79.99999999999994, ciLower: 71.78142268566322, ciUpper: 86.50370440971682},
  {q: 0.9, difference: 89.99999999830226, ciLower: 83.6722175500943, ciUpper: 94.27073629790513},
  /* eslint-enable max-len */
];

// Simple test expectations if non-random seed.
const zeroToHundredTestExpectedCsv =
`q,difference,ciLower,ciUpper
0.1,10.00000000169774,5.867913759497463,16.41215963286512
0.2,19.999999999999986,13.47006646664097,28.13900612777301
0.3,30.000000000000007,22.091027101974216,39.25585278590675
0.4,40,31.261436199030612,49.260974509061086
0.5,50.000000000000014,40.71517388911529,59.28314001754497
0.6,60.00000000000001,50.975714350956245,68.95212256806707
0.7,70.00000000000004,61.194989558634816,77.87019459445091
0.8,79.99999999999994,71.78142268566322,86.50370440971682
0.9,89.99999999830226,83.6722175500943,94.27073629790513\n`;

/**
 * Returns the cache files, if any, in the same directory as pathname.
 * @param {string} pathname
 * @return {Array<string>}
 */
function getCacheFiles(pathname) {
  const dirname = path.dirname(pathname);
  const needle = /^quantiles-pbci(?:-\d{4}-\d{2}-to-\d{4}-\d{2})?\.[a-f0-9]*\.csv$/;
  const cacheFiles = fs.readdirSync(dirname)
      .filter(filename => needle.exec(filename));

  return cacheFiles;
}

describe('Quantiles PBCI', () => {
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

  it('calculates quantiles from sample data', async () => {
    fs.writeFileSync(tmpTestFilePath, zeroHundredTestCsv);

    const beforeCacheFiles = getCacheFiles(tmpTestFilePath);
    const quantileResults = await getQuantileDeciles(tmpTestFilePath, {quiet: true});
    const afterCacheFiles = getCacheFiles(tmpTestFilePath);
    assert.deepStrictEqual(quantileResults, zeroToHundredTestExpected);
    assert.strictEqual(afterCacheFiles.length, beforeCacheFiles.length + 1);

    // We know from length assertion there is one.
    const newCacheFile = afterCacheFiles.filter(f => !beforeCacheFiles.includes(f))[0];
    const cachePath = `${path.dirname(tmpTestFilePath)}/${newCacheFile}`;
    const savedCsv = fs.readFileSync(cachePath, 'utf-8');
    assert.strictEqual(savedCsv, zeroToHundredTestExpectedCsv);
  });

  it('reads from cache if calculating from the same sample data', async () => {
    fs.writeFileSync(tmpTestFilePath, zeroHundredTestCsv);

    const beforeNumCacheFiles = getCacheFiles(tmpTestFilePath).length;
    const quantileResults = await getQuantileDeciles(tmpTestFilePath, {quiet: true});
    const afterNumCacheFiles = getCacheFiles(tmpTestFilePath).length;
    assert.deepStrictEqual(quantileResults, zeroToHundredTestExpected);
    assert.strictEqual(afterNumCacheFiles, beforeNumCacheFiles, 'a new cache file was generated');
  });

  it('calculates quantiles with random seed without caching', async () => {
    fs.writeFileSync(tmpTestFilePath, zeroHundredTestCsv);
    const relativePath = path.relative(PROJECT_ROOT, tmpTestFilePath);

    const beforeNumCacheFiles = getCacheFiles(tmpTestFilePath).length;
    const quantileResults = await getQuantileDeciles(relativePath,
        {useRandomSeed: true, quiet: true});
    const afterNumCacheFiles = getCacheFiles(tmpTestFilePath).length;
    assert.notDeepStrictEqual(quantileResults, zeroToHundredTestExpected);
    assert.strictEqual(afterNumCacheFiles, beforeNumCacheFiles, 'a new cache file was generated');
  });

  it('calculates quantiles and creates a new cache if nboot is changed', async () => {
    fs.writeFileSync(tmpTestFilePath, zeroHundredTestCsv);

    const beforeNumCacheFiles = getCacheFiles(tmpTestFilePath).length;
    const quantileResults = await getQuantileDeciles(tmpTestFilePath, {quiet: true, nboot: 1});
    const afterNumCacheFiles = getCacheFiles(tmpTestFilePath).length;
    assert.notDeepStrictEqual(quantileResults, zeroToHundredTestExpected);
    assert.strictEqual(afterNumCacheFiles, beforeNumCacheFiles + 1,
        'a new cache file was not generated');
  });

  describe('base,compare csv parsing', () => {
    it('throws if csv does not have an initial `base` column', async () => {
      const testCsv = 'bernard,compare\n5,15';
      fs.writeFileSync(tmpTestFilePath, testCsv);

      await assert.rejects(async () => {
        return getQuantileDeciles(tmpTestFilePath, {quiet: true});
      }, /^Error: First column must be named 'base' \('bernard' found\)$/);
    });

    it('throws if csv does not have a second `compare` column', async () => {
      const testCsv = 'base,othercolumn\n5,15';
      fs.writeFileSync(tmpTestFilePath, testCsv);

      await assert.rejects(async () => {
        return getQuantileDeciles(tmpTestFilePath, {quiet: true});
      }, /^Error: Second column must be named 'compare' \('othercolumn' found\)$/);
    });

    it('throws if csv has a third column', async () => {
      const testCsv = 'base,compare,third\n5,15,22';
      fs.writeFileSync(tmpTestFilePath, testCsv);

      await assert.rejects(async () => {
        return getQuantileDeciles(tmpTestFilePath, {quiet: true});
      }, /^Error: CSV must have only 'base' and 'compare' columns$/);
    });

    it('throws if csv has a NaN in the base column', async () => {
      const testCsv = 'base,compare\n5,15\nNaN,22\n1,2\n';
      fs.writeFileSync(tmpTestFilePath, testCsv);

      await assert.rejects(async () => {
        return getQuantileDeciles(tmpTestFilePath, {quiet: true});
      }, /^Error: bad 'base' value 'NaN'$/);
    });

    it('throws if a row has a missing base value', async () => {
      const testCsv = 'base,compare\n5,15\n,3\n1,2\n';
      fs.writeFileSync(tmpTestFilePath, testCsv);

      await assert.rejects(async () => {
        return getQuantileDeciles(tmpTestFilePath, {quiet: true});
      }, /^Error: missing 'base' value$/);
    });

    it('throws if a row has a missing compare value', async () => {
      const testCsv = 'base,compare\n5,15\n1,\n1,2\n';
      fs.writeFileSync(tmpTestFilePath, testCsv);

      await assert.rejects(async () => {
        return getQuantileDeciles(tmpTestFilePath, {quiet: true});
      }, /^Error: missing 'compare' value$/);
    });

    it('throws if csv has a NaN in the compare column', async () => {
      const testCsv = 'base,compare\n5,NaN\n1,22\n1,2\n';
      fs.writeFileSync(tmpTestFilePath, testCsv);

      await assert.rejects(async () => {
        return getQuantileDeciles(tmpTestFilePath, {quiet: true});
      }, /^Error: bad 'compare' value 'NaN'$/);
    });

    it('throws if a row is missing a value', async () => {
      const testCsv = 'base,compare\n5,15\n1\n1,2\n';
      fs.writeFileSync(tmpTestFilePath, testCsv);

      await assert.rejects(async () => {
        return getQuantileDeciles(tmpTestFilePath, {quiet: true});
      }, /^Error: line shorter than two columns$/);
    });

    it('throws if a row is three values long', async () => {
      const testCsv = 'base,compare\n5,15\n1,2,3\n1,2\n';
      fs.writeFileSync(tmpTestFilePath, testCsv);

      await assert.rejects(async () => {
        return getQuantileDeciles(tmpTestFilePath, {quiet: true});
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
          return getQuantileDeciles(inputPath, {quiet: true});
        }, /^Error: supplied path '555' must be a string$/);
      });

      it('throws on inputPath to a file that does not end in `.csv`', async () => {
        const inputPath = 'test-data.json';

        await assert.rejects(async () => {
          return getQuantileDeciles(inputPath, {quiet: true});
        }, /^Error: file 'test-data\.json' doesn't appear to be a csv file$/);
      });

      it('throws on inputPath to a file that does not exist', async () => {
        const inputPath = 'not-a-real-file.csv';

        await assert.rejects(async () => {
          return getQuantileDeciles(inputPath, {quiet: true});
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

        await assert.rejects(async () => getQuantileDeciles(tmpTestFilePath, options),
            /^Error: invalid nboot value \('true'\)$/);
      });

      it('throws on invalid numeric nboots', async () => {
        await assert.rejects(async () => {
          return getQuantileDeciles(tmpTestFilePath, {nboot: NaN, quiet: true});
        }, /^Error: nboot value \('NaN'\) is not a positive integer$/);

        await assert.rejects(async () => {
          return getQuantileDeciles(tmpTestFilePath, {nboot: -1, quiet: true});
        }, /^Error: nboot value \('-1'\) is not a positive integer$/);

        await assert.rejects(async () => {
          return getQuantileDeciles(tmpTestFilePath, {nboot: 2.5, quiet: true});
        }, /^Error: nboot value \('2\.5'\) is not a positive integer$/);

        await assert.rejects(async () => {
          return getQuantileDeciles(tmpTestFilePath, {nboot: '2 nboots', quiet: true});
        }, /^Error: nboot value \('2 nboots'\) is not a positive integer$/);
      });
    });
  });

  describe('getPrettyPrintedQuatileData', () => {
    const quantileData = [
      /* eslint-disable max-len */
      {q: 0.1, difference: 1.2338889, ciLower: 1.111, ciUpper: 2.222},
      {q: 0.2, difference: 45.6687778, ciLower: 40.0001, ciUpper: 49.9999},
      /* eslint-enable max-len */
    ];

    it('pretty prints quantile results', () => {
      const prettyPrinted = getPrettyPrintedQuatileData(quantileData);
      assert.strictEqual(prettyPrinted,
        '| deciles | change |\n' +
        '| --- | --- |\n' +
        '| p10 | +1.2 _(95% CI [1.1, 2.2])_ |\n' +
        '| p20 | +45.7 _(95% CI [40, 50])_ |\n');
    });

    it('pretty prints quantile results with customization options', () => {
      const options = {
        digits: 2,
        unit: 'ms',
        multiplier: 100,
      };
      const prettyPrinted = getPrettyPrintedQuatileData(quantileData, options);
      assert.strictEqual(prettyPrinted,
        '| deciles | change |\n' +
        '| --- | --- |\n' +
        '| p10 | +123.39ms _(95% CI [111.1, 222.2])_ |\n' +
        '| p20 | +4,566.88ms _(95% CI [4,000.01, 4,999.99])_ |\n');
    });
  });
});
