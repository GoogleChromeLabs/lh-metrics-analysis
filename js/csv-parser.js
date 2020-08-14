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
 * Basic CSV parser. Supports RFC 4180 with some additions:
 *  - more line break types (\n, \r, and \r\n)
 *  - each line does not need to contain the same number of fields
 *  - (ambiguous in the RFC) trailing commas always indicate a trailing empty field after them
 * See `CsvParser.parseRows()` for an example using `CsvParser#getToken()`.
 * @see https://tools.ietf.org/html/rfc4180
 */
class CsvParser {
  /** The current character index. */
  cursor = 0;

  /** Whether the most recent token is followed by EOL. */
  eol = false;

  /** @type {string} */
  text;

  /** Whether the most recent token is followed by EOF. */
  eof = false;

  /**
   * @param {string} text
   */
  constructor(text) {
    this.text = text;
    this.eof = this.text.length === 0;
    this.eol = this.eof;
  }

  /**
   * Returns the next CSV token and updates the eol/eof flags to reflect what
   * follows. Tokens following `eof === true` will always be `''`.
   * @return {string}
   */
  getToken() {
    if (this.cursor >= this.text.length) {
      this.eof = true;
      this.eol = true;
      return '';
    }

    this.eol = false;
    const startIndex = this.cursor;
    let c = this.text.charCodeAt(startIndex);
    let token = '';

    if (c === 34) { // `"`
      this.cursor++;
      let encounteredQuote = false;
      for (; this.cursor < this.text.length; this.cursor++) {
        c = this.text.charCodeAt(this.cursor);

        if (c === 34) { // `"`
          // reached a ". Flag it to check if end of token or escaped quote ("").
          encounteredQuote = !encounteredQuote;
        } else {
          if (encounteredQuote) {
            // last character was a quote, this one wasn't. Ending.
            break;
          }
        }
      }

      token = this.text.substring(startIndex + 1, this.cursor - 1).replace(/""/g, '"');
    } else if (c !== 44 && c !== 10 && c !== 13) { // `,` `\n` `\r`
      this.cursor++;
      for (; this.cursor < this.text.length; this.cursor++) {
        c = this.text.charCodeAt(this.cursor);
        if (c === 44 || c === 10 || c === 13) { // `,` `\n` `\r`
          break;
        }
      }
      token = this.text.substring(startIndex, this.cursor);
    }

    // Cursor is at delimiter/new-line/end of file.
    // Check for \r\n and advance to \n if found.
    if (c === 13) { // `\r`
      if (this.cursor + 1 < this.text.length) {
        // NOTE: for ancient platforms using just \r, this wastes a charCodeAt.
        const peekC = this.text.charCodeAt(this.cursor + 1);
        if (peekC === 10) { // `\n`
          this.cursor++;
          c = peekC;
        }
      }
    }

    // Advance to next token.
    this.cursor++;

    // Special case: RFC 4180 allows optional line break at eof, so if it's
    // missing and the last character is a delimiter, *don't* mark as eof so it
    // acts as if there was a line break following this (giving one last empty
    // token for the missing value). e.g. 'a,' gives tokens 'a' and ''.
    const eofDelimiter = this.cursor === this.text.length && c === 44;

    // End of file if we're out of characters to examine.
    this.eof = this.cursor >= this.text.length && !eofDelimiter;
    // End of line if c *was* `\n` or `\r`, or we're at the end of all things.
    this.eol = c === 10 || c === 13 || this.eof;

    return token;
  }

  /**
   * @param {string} text
   * @return {Array<Array<string>>}
   */
  static parseRows(text) {
    const tokenizer = new CsvParser(text);

    const rows = [];
    while (!tokenizer.eof) {
      const row = [];
      do {
        const token = tokenizer.getToken();
        row.push(token);
      } while (!tokenizer.eol && !tokenizer.eof);

      rows.push(row);
    }

    return rows;
  }

  /**
   * A strict CSV parser that constructs an array with rows as its elements,
   * each row transformed into a record with only number values. e.g.
   * `a,b\n1,2\n3,4` -> `[{a: 1, b: 2}, {a: 3, b: 4}]`.
   * Current implementation requires declaring the expected headers ahead of
   * time, allowing for a fully described return type.
   * This implementation is slower and uses considerably more storage, so most
   * useful for smaller CSV files.
   * @template {string} T
   * @param {string} text
   * @param {Array<T>} expectedHeaders
   * @return {Array<Record<T, number>>}
   */
  static parseToNumericRecords(text, expectedHeaders) {
    const tokenizer = new CsvParser(text);

    // Check column headers.
    for (let i = 0; i < expectedHeaders.length; i++) {
      const expectedHeader = expectedHeaders[i];
      if (tokenizer.eol) {
        throw new Error(`header row cut off before expected '${expectedHeader}' column`);
      }

      const headerToken = tokenizer.getToken();
      if (headerToken !== expectedHeader) {
        throw new Error(`column ${i} must be named '${expectedHeader}' ('${headerToken}' found)`);
      }
    }

    if (!tokenizer.eol) {
      throw new Error(`CSV must have only expected '${expectedHeaders.join(',')}' columns`);
    }

    const numberOfColumns = expectedHeaders.length;
    const records = [];
    let rowNumber = 1;
    while (!tokenizer.eof) {
      /** @type {Partial<Record<T, number>>} */
      const record = {};

      for (let i = 0; i < numberOfColumns; i++) {
        const header = expectedHeaders[i];

        const token = tokenizer.getToken();
        if (token.length === 0) {
          throw new Error(`missing value in column '${header}', row ${rowNumber}`);
        }
        const value = Number(token);
        // NOTE: throwing on NaN or Infinity may not make sense in all circumstances.
        if (!Number.isFinite(value)) {
          throw new Error(`bad value '${token}' in column '${header}', row ${rowNumber}`);
        }
        record[header] = value;

        if (i < numberOfColumns - 1 && tokenizer.eol) {
          throw new Error(`row ${rowNumber} is shorter than expected ${numberOfColumns} columns`);
        }
      }

      if (!tokenizer.eol) {
        throw new Error(`row ${rowNumber} is longer than expected ${numberOfColumns} columns`);
      }

      // Since we require all columns to be present, we can be confident in this cast.
      records.push(/** @type {Record<T, number>} */ (record));
      rowNumber++;
    }

    return records;
  }
}

export {
  CsvParser,
};
