//  Copyright John Maddock 2006-7, 2013-14.
//  Copyright Paul A. Bristow 2007, 2013-14.
//  Copyright Nikhar Agrawal 2013-14
//  Copyright Christopher Kormanyos 2013-14
//  Copyright 2020 Google LLC

//  Use, modification and distribution are subject to the
//  Boost Software License, Version 1.0. (See accompanying file
//  LICENSE_1_0.txt or copy at http://www.boost.org/LICENSE_1_0.txt)

/**
 * @fileoverview A JS port of Boost's `ibeta_derivative`. This file combines the
 * implementation from across `beta.hpp`, `gamma.hpp`, and `lanczos.hpp` in
 * `special_functions/` and `tools/rational.hpp`, specialized for type `double`
 * to match JS.
 *
 * See each function for info and original source location.
 */

// Lanczos Coefficients for N=13 G=6.024680040776729583740234375
// Note that Boost converted to a full rational for the approximation instead of
// the usual partial fractions. See
// https://www.boost.org/doc/libs/1_72_0/libs/math/doc/html/math_toolkit/lanczos.html#math_toolkit.lanczos.choosing_the_right_parameters
const lanczosG = 6.024680040776729583740234375;
const num = [
  56906521.91347156388090791033559122686859,
  103794043.1163445451906271053616070238554,
  86363131.28813859145546927288977868422342,
  43338889.32467613834773723740590533316085,
  14605578.08768506808414169982791359218571,
  3481712.15498064590882071018964774556468,
  601859.6171681098786670226533699352302507,
  75999.29304014542649875303443598909137092,
  6955.999602515376140356310115515198987526,
  449.9445569063168119446858607650988409623,
  19.51992788247617482847860966235652136208,
  0.5098416655656676188125178644804694509993,
  0.006061842346248906525783753964555936883222,
];
const denom = [
  0,
  39916800,
  120543840,
  150917976,
  105258076,
  45995730,
  13339535,
  2637558,
  357423,
  32670,
  1925,
  66,
  1,
];

// Boost (double) logarithmic limits.
const LOG_MAX_VALUE = 88;
const LOG_MIN_VALUE = -708;

/**
 * From Boost double-precision Lanczos approximation. Impl is primarily
 * `lanczos13m53::lanczos_sum_expG_scaled` and `evaluate_rational` with the given coefficients.
 * In testing, JS implementation has always been within a few ulps of the SSE2
 * intrinsics version used by Boost.
 * @see https://github.com/boostorg/math/blob/3cc1ebef5e5ece525770692907e7d10df84ec5a4/include/boost/math/tools/rational.hpp
 * @see https://github.com/boostorg/math/blob/3cc1ebef5e5ece525770692907e7d10df84ec5a4/include/boost/math/special_functions/detail/lanczos_sse2.hpp
 * @param {number} z
 * @return {number}
 */
function lanczosSumExpGScaled(z) {
  const count = num.length;

  const lim = 4.76886e+25; // By experiment, the largest x for which the SSE2 code does not go bad.

  // Normal Horner's method.
  // TODO(bckenny): unroll and inline num/denom?
  if (z <= lim) {
    let s1 = num[count - 1];
    let s2 = denom[count - 1];
    for (let i = count - 2; i >= 0; i--) {
      s1 *= z;
      s2 *= z;
      s1 += num[i];
      s2 += denom[i];
    }

    return s1 / s2;
  }

  /* c8 ignore next 19 */
  // ignoring because we're never going to be looking at 10e25 `a` or `b`.

  // Otherwise, "the polynomials are evaluated in reverse order as polynomials
  // in 1/z: this avoids unnecessary numerical overflow when the coefficients
  // are large".
  // Note: this approach is used by `evaluate_rational` for all z > 1 (which
  // would be all uses in this file), but diverges too much from the Boost
  // native double path, so using the same `lim` as there.
  z = 1 / z;
  let s1 = num[0];
  let s2 = denom[0];
  for (let i = 1; i < count; i++) {
    s1 *= z;
    s2 *= z;
    s1 += num[i];
    s2 += denom[i];
  }

  return s1 / s2;
}

/**
 * Returns the derivative of the regularized incomplete beta function with
 * parameters `a` and `b` at `x`.
 * @see https://github.com/boostorg/math/blob/3cc1ebef5e5ece525770692907e7d10df84ec5a4/include/boost/math/special_functions/beta.hpp
 * @param {number} a
 * @param {number} b
 * @param {number} x
 * @return {number}
 */
function ibetaDerivative(a, b, x) {
  // start with the usual error checks:
  if (a <= 0) {
    // eslint-disable-next-line max-len
    throw new Error(`The argument a to the incomplete beta function must be greater than zero (got a=${a}).`);
  }
  if (b <= 0) {
    // eslint-disable-next-line max-len
    throw new Error(`The argument b to the incomplete beta function must be greater than zero (got b=${b}).`);
  }
  if ((x < 0) || (x > 1)) {
    // eslint-disable-next-line max-len
    throw new Error(`Parameter x outside the range [0,1] in the incomplete beta function (got x=${x}).`);
  }

  // Now the corner cases:
  if (x === 0) {
    if (a > 1) {
      return 0;
    } else if (a === 1) {
      return 1;
    } else {
      throw new Error(`An x value of ${x} is not supported if a is less than 1 (got a=${a}).`);
    }
  } else if (x === 1) {
    if (b > 1) {
      return 0;
    } else if (b === 1) {
      return 1;
    } else {
      throw new Error(`An x value of ${x} is not supported if b is less than 1 (got b=${b}).`);
    }
  }

  // Now the regular case:
  const y = (1 - x) * x;
  return ibetaPowerTerms(a, b, x, 1 - x, 1 / y);
}

/**
 * Compute the leading power terms in the incomplete Beta:
 *
 * (x^a)(y^b)/Beta(a,b)
 *
 * Almost all of the error in the incomplete beta comes from this
 * function: particularly when a and b are large. Computing large
 * powers are *hard* though, and using logarithms just leads to
 * horrendous cancellation errors.
 * @see https://github.com/boostorg/math/blob/3cc1ebef5e5ece525770692907e7d10df84ec5a4/include/boost/math/special_functions/beta.hpp
 * @param {number} a
 * @param {number} b
 * @param {number} x
 * @param {number} y
 * @param {number} prefix
 * @return {number}
 */
function ibetaPowerTerms(a, b, x, y, prefix) {
  const c = a + b;
  // TODO(bckenny): if we only ever use this here, calculate y and prefix internally?

  // combine power terms with Lanczos approximation:
  const agh = a + lanczosG - 0.5;
  const bgh = b + lanczosG - 0.5;
  const cgh = c + lanczosG - 0.5;
  let result = lanczosSumExpGScaled(c) / (lanczosSumExpGScaled(a) * lanczosSumExpGScaled(b));
  result *= prefix;

  // combine with the leftover terms from the Lanczos approximation:
  result *= Math.sqrt(bgh / Math.E);
  result *= Math.sqrt(agh / cgh);

  // l1 and l2 are the base of the exponents minus one:
  let l1 = (x * b - y * agh) / agh;
  let l2 = (y * a - x * bgh) / bgh;

  // Handle tricky cases first.
  if (Math.min(Math.abs(l1), Math.abs(l2)) < 0.2) {
    // when the base of the exponent is very near 1 we get really
    // gross errors unless extra care is taken:
    if ((l1 * l2 > 0) || (Math.min(a, b) < 1)) {
      // This first branch handles the simple cases where either:
      //
      // * The two power terms both go in the same direction
      //   (towards zero or towards infinity).  In this case if either
      //   term overflows or underflows, then the product of the two must
      //   do so also.
      // * Alternatively if one exponent is less than one, then we
      //   can't productively use it to eliminate overflow or underflow
      //   from the other term.  Problems with spurious overflow/underflow
      //   can't be ruled out in this case, but it is *very* unlikely
      //   since one of the power terms will evaluate to a number close to 1.
      if (Math.abs(l1) < 0.1) {
        result *= Math.exp(a * Math.log1p(l1));
      } else {
        result *= Math.pow((x * cgh) / agh, a);
      }

      if (Math.abs(l2) < 0.1) {
        result *= Math.exp(b * Math.log1p(l2));
      } else {
        result *= Math.pow((y * cgh) / bgh, b);
      }

      return result;
    } else if (Math.max(Math.abs(l1), Math.abs(l2)) < 0.5) {
      // Both exponents are near one and both the exponents are
      // greater than one and, further, these two
      // power terms tend in opposite directions (one towards zero,
      // the other towards infinity), so we have to combine the terms
      // to avoid any risk of overflow or underflow.
      //
      // We do this by moving one power term inside the other, we have:
      //
      //    (1 + l1)^a * (1 + l2)^b
      //  = ((1 + l1)*(1 + l2)^(b/a))^a
      //  = (1 + l1 + l3 + l1*l3)^a   ;  l3 = (1 + l2)^(b/a) - 1
      //                                    = exp((b/a) * log(1 + l2)) - 1
      //
      // The tricky bit is deciding which term to move inside :-)
      // By preference we move the larger term inside, so that the
      // size of the largest exponent is reduced.  However, that can
      // only be done as long as l3 (see above) is also small.
      const smallA = a < b;
      const ratio = b / a;
      if ((smallA && (ratio * l2 < 0.1)) || (!smallA && (l1 / ratio > 0.1))) {
        let l3 = Math.expm1(ratio * Math.log1p(l2));
        l3 = l1 + l3 + l3 * l1;
        l3 = a * Math.log1p(l3);
        result *= Math.exp(l3);
      } else {
        let l3 = Math.expm1(Math.log1p(l1) / ratio);
        l3 = l2 + l3 + l3 * l2;
        l3 = b * Math.log1p(l3);
        result *= Math.exp(l3);
      }

      return result;
    } else if (Math.abs(l1) < Math.abs(l2)) {
      // First base near 1 only:
      let l = a * Math.log1p(l1) + b * Math.log((y * cgh) / bgh);
      if (l <= LOG_MIN_VALUE || l >= LOG_MAX_VALUE) {
        l += Math.log(result);
        if (l >= LOG_MAX_VALUE) {
          throw new Error('Overflow');
        }
        result = Math.exp(l);
      } else {
        result *= Math.exp(l);
      }

      return result;
    } else {
      // Second base near 1 only:
      let l = b * Math.log1p(l2) + a * Math.log((x * cgh) / agh);
      if (l <= LOG_MIN_VALUE || l >= LOG_MAX_VALUE) {
        l += Math.log(result);
        if (l >= LOG_MAX_VALUE) {
          throw new Error('Overflow');
        }
        result = Math.exp(l);
      } else {
        result *= Math.exp(l);
      }
      return result;
    }
  }

  // general case:
  const b1 = (x * cgh) / agh;
  const b2 = (y * cgh) / bgh;
  l1 = a * Math.log(b1);
  l2 = b * Math.log(b2);
  if (l1 >= LOG_MAX_VALUE || l1 <= LOG_MIN_VALUE || l2 >= LOG_MAX_VALUE || l2 <= LOG_MIN_VALUE) {
    // Oops, under/overflow, sidestep if we can:
    if (a < b) {
      const p1 = Math.pow(b2, b / a);
      const l3 = a * (Math.log(b1) + Math.log(p1));
      if (l3 < LOG_MAX_VALUE && l3 > LOG_MIN_VALUE) {
        result *= Math.pow(p1 * b1, a);
        return result;
      } else {
        l2 += l1 + Math.log(result);
        if (l2 >= LOG_MAX_VALUE) {
          throw new Error('Overflow');
        }
        return Math.exp(l2);
      }
    } else {
      const p1 = Math.pow(b1, a / b);
      const l3 = (Math.log(p1) + Math.log(b2)) * b;
      if (l3 < LOG_MAX_VALUE && l3 > LOG_MIN_VALUE) {
        result *= Math.pow(p1 * b2, b);
        return result;
      } else {
        l2 += l1 + Math.log(result);
        if (l2 >= LOG_MAX_VALUE) {
          throw new Error('Overflow');
        }
        return Math.exp(l2);
      }
    }
  }

  // finally the normal case:
  result *= Math.pow(b1, a) * Math.pow(b2, b);
  return result;
}

export {
  ibetaDerivative,
};
