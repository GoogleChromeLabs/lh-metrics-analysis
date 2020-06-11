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

declare global {
  /** Recursively makes all properties of T read-only. */
  export type Immutable<T> =
    T extends Function ? T :
    T extends Array<infer R> ? ImmutableArray<R> :
    T extends Map<infer K, infer V> ? ImmutableMap<K, V> :
    T extends Set<infer M> ? ImmutableSet<M> :
    T extends object ? ImmutableObject<T> :
    T

  // Intermediate immutable types. Prefer e.g. Immutable<Set<T>> over direct use.
  type ImmutableArray<T> = ReadonlyArray<Immutable<T>>;
  type ImmutableMap<K, V> = ReadonlyMap<Immutable<K>, Immutable<V>>;
  type ImmutableSet<T> = ReadonlySet<Immutable<T>>;
  type ImmutableObject<T> = {
    readonly [K in keyof T]: Immutable<T[K]>;
  };
}

// empty export to keep file a module
export {}
