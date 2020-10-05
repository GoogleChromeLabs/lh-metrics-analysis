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
 * A class that maintains a concurrency pool to coordinate many jobs that should
 * only be run `concurrencyLimit` at a time.
 * API inspired by http://bluebirdjs.com/docs/api/promise.map.html, but
 * independent callers of `concurrentMap()` share the same concurrency limit.
 */
class ConcurrentMapper {
  /**
   * @type {Set<Promise<unknown>>}
   * @private
   */
  _promisePool = new Set();

  /**
   * The limits of all currently running jobs. There will be duplicates.
   * @type {Array<number>}
   * @private
   */
  _allConcurrencyLimits = [];

  /**
   * @type {number}
   * @private
   */
  _defaultConcurrency

  /**
   * Default `concurrency` limit is `Infinity`.
   * @param {number} defaultConcurrency Set a default concurrency limit for all calls that don't specify it.
   */
  constructor(defaultConcurrency = Infinity) {
    this._defaultConcurrency = defaultConcurrency;
  }

  /**
   * Runs callbackfn on `values` in parallel, at a max of `concurrency` at a
   * time. Resolves to an array of the results or rejects with the first
   * rejected result. Default `concurrency` limit is `Infinity`.
   * @template T, U
   * @param {Array<T>} values
   * @param {(value: T, index: number, array: Array<T>) => Promise<U>} callbackfn
   * @param {{concurrency: number}} [options]
   * @return {Promise<Array<U>>}
   */
  static async map(values, callbackfn, options) {
    const cm = new ConcurrentMapper();
    return cm.pooledMap(values, callbackfn, options);
  }

  /**
   * Returns whether there are fewer running jobs than the minimum current
   * concurrency limit and the proposed new `concurrencyLimit`.
   * @private
   * @param {number} concurrencyLimit
   */
  _canRunMoreAtLimit(concurrencyLimit) {
    return this._promisePool.size < concurrencyLimit &&
        this._promisePool.size < Math.min(...this._allConcurrencyLimits);
  }

  /**
   * Add a job to pool.
   * @private
   * @param {Promise<unknown>} job
   * @param {number} concurrencyLimit
   */
  _addJob(job, concurrencyLimit) {
    this._promisePool.add(job);
    this._allConcurrencyLimits.push(concurrencyLimit);
  }

  /**
   * Remove a job from pool.
   * @private
   * @param {Promise<unknown>} job
   * @param {number} concurrencyLimit
   */
  _removeJob(job, concurrencyLimit) {
    this._promisePool.delete(job);

    const limitIndex = this._allConcurrencyLimits.indexOf(concurrencyLimit);
    if (limitIndex === -1) {
      throw new Error('No current limit found for finishing job');
    }
    this._allConcurrencyLimits.splice(limitIndex, 1);
  }

  /**
   * Runs callbackfn on `values` in parallel, at a max of `concurrency` at
   * a time across all callers on this instance. Resolves to an array of the
   * results (for each caller separately) or rejects with the first rejected
   * result. Default `concurrency` limit is `Infinity` unless set in the
   * constructor.
   * @template T, U
   * @param {Array<T>} values
   * @param {(value: T, index: number, array: Array<T>) => Promise<U>} callbackfn
   * @param {{concurrency?: number}} [options]
   * @return {Promise<Array<U>>}
   */
  async pooledMap(values, callbackfn, options) {
    const concurrency = options?.concurrency ?? this._defaultConcurrency;
    const result = [];

    for (let i = 0; i < values.length; i++) {
      // Wait until concurrency allows another run.
      while (!this._canRunMoreAtLimit(concurrency)) {
        // Unconditionally catch since we only care about our own failures
        // (caught in the Promise.all below), not other callers.
        await Promise.race(this._promisePool).catch(() => {});
      }

      // innerPromise removes itself from the pool and resolves on return from callback.
      const innerPromise = callbackfn(values[i], i, values)
        .finally(() => this._removeJob(innerPromise, concurrency));

      this._addJob(innerPromise, concurrency);
      result.push(innerPromise);
    }

    return Promise.all(result);
  }

  /**
   * Runs callbackfn with `args` in parallel to other callers on this instance,
   * at a max of the default concurrency of this ConcurrentMapper across all
   * callers. Note that the default concurrency limit is `Infinity` unless
   * otherwise set in the constructor.
   * @template {Array<any>} T
   * @template U
   * @param {(...args: T) => Promise<U>} callbackfn
   * @param {T} args
   * @return {Promise<U>}
   */
  async pooledCall(callbackfn, ...args) {
    // TODO(bckenny): would be nice to be able to adjust concurrency, but makes
    // for an annoying interface. Could make a `getPooledCall(options)`?
    const fn = () => callbackfn(...args);
    const nestedResult = await this.pooledMap([undefined], fn);
    return nestedResult[0];
  }
}

export {
  ConcurrentMapper,
};
