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

import {CsvParser} from '../../js/csv-parser.js';
import {PROJECT_ROOT} from '../../js/module-utils.js';

describe('CsvParser', () => {
  describe('#getToken()', () => {
    it('tokenizes a basic example with eol and eof flags', () => {
      const tokenizer = new CsvParser('a,b\nc');
      assert.strictEqual(tokenizer.getToken(), 'a');
      assert.strictEqual(tokenizer.eol, false);
      assert.strictEqual(tokenizer.eof, false);

      assert.strictEqual(tokenizer.getToken(), 'b');
      assert.strictEqual(tokenizer.eol, true);
      assert.strictEqual(tokenizer.eof, false);

      assert.strictEqual(tokenizer.getToken(), 'c');
      assert.strictEqual(tokenizer.eol, true);
      assert.strictEqual(tokenizer.eof, true);
    });

    it('handles requesting tokens past the text', () => {
      const tokenizer = new CsvParser('a');
      assert.strictEqual(tokenizer.getToken(), 'a');
      assert.strictEqual(tokenizer.eol, true);
      assert.strictEqual(tokenizer.eof, true);

      assert.strictEqual(tokenizer.getToken(), '');
      assert.strictEqual(tokenizer.eol, true);
      assert.strictEqual(tokenizer.eof, true);
    });
  });

  describe('parseRows()', () => {
    it('parses basic examples', () => {
      assert.deepStrictEqual(CsvParser.parseRows('1,2\n'), [
        ['1', '2'],
      ]);
      assert.deepStrictEqual(CsvParser.parseRows('ab,cde\nfgh,ijkl'), [
        ['ab', 'cde'],
        ['fgh', 'ijkl'],
      ]);
    });

    it('parses basic quoted examples', () => {
      assert.deepStrictEqual(CsvParser.parseRows('"1"'), [
        ['1'],
      ]);
      assert.deepStrictEqual(CsvParser.parseRows('"ab",cde\n'), [
        ['ab', 'cde'],
      ]);
      assert.deepStrictEqual(CsvParser.parseRows('xx,yyy\n"zzz","000"'), [
        ['xx', 'yyy'],
        ['zzz', '000'],
      ]);
    });

    it('parses empty fields', () => {
      assert.deepStrictEqual(CsvParser.parseRows('11,,2\n'), [
        ['11', '', '2'],
      ]);
      assert.deepStrictEqual(CsvParser.parseRows(',a\n,bbb'), [
        ['', 'a'],
        ['', 'bbb'],
      ]);
    });

    it('parses empty fields at the end of a line', () => {
      assert.deepStrictEqual(CsvParser.parseRows('1,2b,\n3,4ac,'), [
        ['1', '2b', ''],
        ['3', '4ac', ''],
      ]);
      assert.deepStrictEqual(CsvParser.parseRows('"""abc""",'), [
        ['"abc"', ''],
      ]);
    });

    it('parses empty fields at the end of a file with or without an ending new line', () => {
      const first = '1,2b,\n3,4ac,';
      assert.deepStrictEqual(CsvParser.parseRows(first), CsvParser.parseRows(first + '\n'));

      const second = '"""abc""",';
      assert.deepStrictEqual(CsvParser.parseRows(second), CsvParser.parseRows(second + '\n'));
    });

    it('parses quoted empty fields', () => {
      assert.deepStrictEqual(CsvParser.parseRows('1,"",2\n'), [
        ['1', '', '2'],
      ]);
      assert.deepStrictEqual(CsvParser.parseRows('"",a1b\n"",2c3'), [
        ['', 'a1b'],
        ['', '2c3'],
      ]);
    });

    it('parses quoted examples with escaped values', () => {
      assert.deepStrictEqual(CsvParser.parseRows('"1"""'), [
        ['1"'],
      ]);
      assert.deepStrictEqual(CsvParser.parseRows('"abc123\n"""'), [
        ['abc123\n"'],
      ]);
      assert.deepStrictEqual(CsvParser.parseRows('"1""""","2\r"'), [
        ['1""', '2\r'],
      ]);
      assert.deepStrictEqual(CsvParser.parseRows('xy,"jk\r\n"\n"zzz","321"'), [
        ['xy', 'jk\r\n'],
        ['zzz', '321'],
      ]);
    });

    it('handles the empty string as zero rows', () => {
      assert.deepStrictEqual(CsvParser.parseRows(''), []);
    });

    it('navigates end of line issues with one row', () => {
      assert.deepStrictEqual(CsvParser.parseRows('\n'), [
        [''],
      ]);
      assert.deepStrictEqual(CsvParser.parseRows('1'), [
        ['1'],
      ]);
      assert.deepStrictEqual(CsvParser.parseRows('a\n'), [
        ['a'],
      ]);
      assert.deepStrictEqual(CsvParser.parseRows('222,'), [
        ['222', ''],
      ]);
      assert.deepStrictEqual(CsvParser.parseRows('bbb,\n'), [
        ['bbb', ''],
      ]);
      assert.deepStrictEqual(CsvParser.parseRows(','), [
        ['', ''],
      ]);
      assert.deepStrictEqual(CsvParser.parseRows(',\n'), [
        ['', ''],
      ]);
    });

    it('navigates end of line issues with two rows', () => {
      assert.deepStrictEqual(CsvParser.parseRows('1\n2'), [
        ['1'],
        ['2'],
      ]);
      assert.deepStrictEqual(CsvParser.parseRows('a\nb\n'), [
        ['a'],
        ['b'],
      ]);
      assert.deepStrictEqual(CsvParser.parseRows('11,\n22,'), [
        ['11', ''],
        ['22', ''],
      ]);
      assert.deepStrictEqual(CsvParser.parseRows('aa,\nbb,\n'), [
        ['aa', ''],
        ['bb', ''],
      ]);
      assert.deepStrictEqual(CsvParser.parseRows(',\n,'), [
        ['', ''],
        ['', ''],
      ]);
      assert.deepStrictEqual(CsvParser.parseRows(',\n,\n'), [
        ['', ''],
        ['', ''],
      ]);
    });

    it('parses all types of newlines', () => {
      assert.deepStrictEqual(CsvParser.parseRows('1,2,3\n4,5,6\n7,8,9\n'), [
        ['1', '2', '3'],
        ['4', '5', '6'],
        ['7', '8', '9'],
      ]);
      assert.deepStrictEqual(CsvParser.parseRows('a,b,c\r\nd,e,f\r\ng,h,i\r\n'), [
        ['a', 'b', 'c'],
        ['d', 'e', 'f'],
        ['g', 'h', 'i'],
      ]);
      assert.deepStrictEqual(CsvParser.parseRows('z,y,x\rw,v,u\rt,s,r\r'), [
        ['z', 'y', 'x'],
        ['w', 'v', 'u'],
        ['t', 's', 'r'],
      ]);
    });

    /**
     * Use the first row as headers, and subsequent rows to records using
     * headers as keys.
     * @param {Array<Array<string>>} rows
     * @return {Array<Record<string, string>>}
     */
    function parsedRowsToRecords(rows) {
      if (rows.length < 2) {
        return [];
      }

      const headers = rows[0];
      const records = rows.slice(1).map(row => {
        /** @type {Array<[string, string]>} */
        const entries = row.map((value, index) => {
          return [headers[index], value];
        });
        return Object.fromEntries(entries);
      });

      return records;
    }

    describe('csv-spectrum tests', () => {
      // Get the `csv-spectrum` csv and result json files manually.
      // Module only provides an old-fashioned node callback and mocha won't let
      // us dynamically make tests after an async load.
      const csvSpectrumRoot = PROJECT_ROOT + '/node_modules/csv-spectrum';
      const csvFilenames = fs.readdirSync(`${csvSpectrumRoot}/csvs/`)
        .filter(filename => filename.endsWith('csv'))
        .map(filename => `${csvSpectrumRoot}/csvs/${filename}`);
      const jsonFilenames = fs.readdirSync(`${csvSpectrumRoot}/json/`)
        .filter(filename => filename.endsWith('json'))
        .map(filename => `${csvSpectrumRoot}/json/${filename}`);

      for (const csvFilename of csvFilenames) {
        const testName = path.basename(csvFilename, '.csv');
        const jsonFilename = jsonFilenames.find(f => f.endsWith(`${testName}.json`));
        assert.ok(jsonFilename, `JSON expectation for ${testName}.csv not found`);

        it(`csv-spectrum test: ${testName}`, () => {
          const csvContent = fs.readFileSync(csvFilename, 'utf-8');
          const jsonContent = fs.readFileSync(jsonFilename, 'utf-8');

          const parsedRows = CsvParser.parseRows(csvContent);
          const parsedRecords = parsedRowsToRecords(parsedRows);
          const expectedRecords = JSON.parse(jsonContent);
          assert.deepStrictEqual(parsedRecords, expectedRecords);
        });
      }
    });
  });

  describe('parseToNumericRecords', () => {
    it('parses a basic example', () => {
      const parsedRecords = CsvParser.parseToNumericRecords('c1,c2\n1,2\n3,4', ['c1', 'c2']);
      assert.deepStrictEqual(parsedRecords, [
        {c1: 1, c2: 2},
        {c1: 3, c2: 4},
      ]);
    });

    it('parses the basic example with quotes', () => {
      const parsedRecords = CsvParser.parseToNumericRecords('c1,"c2"\n"1",2\n3,"4"', ['c1', 'c2']);
      assert.deepStrictEqual(parsedRecords, [
        {c1: 1, c2: 2},
        {c1: 3, c2: 4},
      ]);
    });

    it('parses the basic example with an ending newline', () => {
      const parsedRecords = CsvParser.parseToNumericRecords('c1,c2\n1,2\n3,4\n', ['c1', 'c2']);
      assert.deepStrictEqual(parsedRecords, [
        {c1: 1, c2: 2},
        {c1: 3, c2: 4},
      ]);
    });

    it('parses the basic example with an different newlines', () => {
      const parsedRecords = CsvParser.parseToNumericRecords('c1,c2\r\n1,2\r3,4\n', ['c1', 'c2']);
      assert.deepStrictEqual(parsedRecords, [
        {c1: 1, c2: 2},
        {c1: 3, c2: 4},
      ]);
    });

    it('throws if fewer column headers than expected', () => {
      assert.throws(() => {
        CsvParser.parseToNumericRecords('c1\n1\n3', ['c1', 'c2']);
      }, /^Error: header row cut off before expected 'c2' column$/);
    });

    it('throws if columns have different names than those declared', () => {
      assert.throws(() => {
        CsvParser.parseToNumericRecords('aaa,bbb\n1,2\n3,4', ['c1', 'c2']);
      }, /^Error: column 0 must be named 'c1' \('aaa' found\)$/);
    });

    it('throws if there are more column headers than those declared', () => {
      assert.throws(() => {
        CsvParser.parseToNumericRecords('c1,c2,c3\n1,2,3\n4,5,6', ['c1', 'c2']);
      }, /^Error: CSV must have only expected 'c1,c2' columns$/);
    });

    it('throws if a row is missing a value', () => {
      assert.throws(() => {
        CsvParser.parseToNumericRecords('c1,c2,c3\n1,2,3\n4,,6', ['c1', 'c2', 'c3']);
      }, /^Error: missing value in column 'c2', row 2$/);
    });

    it('throws if a row has a non-numeric value in it', () => {
      assert.throws(() => {
        CsvParser.parseToNumericRecords('c1,c2,c3\n1,2,3\n4,5,ccc', ['c1', 'c2', 'c3']);
      }, /^Error: bad value 'ccc' in column 'c3', row 2$/);
    });

    it('throws if a row has a NaN in it', () => {
      assert.throws(() => {
        CsvParser.parseToNumericRecords('c1,c2,c3\nNaN,2,3\n4,5,6', ['c1', 'c2', 'c3']);
      }, /^Error: bad value 'NaN' in column 'c1', row 1$/);
    });

    it('throws if a row does not have all its columns', () => {
      assert.throws(() => {
        CsvParser.parseToNumericRecords('c1,c2,c3\n1,2,3\n4', ['c1', 'c2', 'c3']);
      }, /^Error: row 2 is shorter than expected 3 columns$/);
    });

    it('throws if a row has more than the expected number of columns', () => {
      assert.throws(() => {
        CsvParser.parseToNumericRecords('c1,c2,c3\n1,2,3,17\n4,5,6', ['c1', 'c2', 'c3']);
      }, /^Error: row 1 is longer than expected 3 columns$/);
    });
  });
});
