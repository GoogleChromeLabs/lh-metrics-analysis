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
 * @fileoverview Types for the `xorshift` npm module.
 */

declare class XorShift {
  constructor(seed: [number, number, number, number]);

  // hack to get a typed `.constructor` on XorShift instances.
  // see https://github.com/Microsoft/TypeScript/issues/5989#issuecomment-163066313
  ['constructor']: typeof XorShift;

  /** Returns a 64bit random number as a 2x32bit array. */
  randomint(): [number, number];

  /** Returns a random number normalized [0, 1), just like Math.random(). */
  random(): number;
}

declare const defaultXorShift: XorShift;

declare module 'xorshift' {
  export = defaultXorShift;
}
