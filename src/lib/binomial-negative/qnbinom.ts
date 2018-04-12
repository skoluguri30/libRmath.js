/* GNUv3 License

Copyright (c) Jacob K. F. Bogers <jkfbogers@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

*/

import * as debug from 'debug';

import {
  ML_ERR_return_NAN,
  R_DT_0,
  R_DT_1,
  R_Q_P01_boundaries
} from '../common/_general';

import { NumberW } from '../common/toms708';

import { R_DT_qIv } from '../exp/expm1';
import { qnorm } from '../normal/qnorm';
import { multiplexer } from '../r-func';
import { pnbinom } from './pnbinom';

const {
  isNaN: ISNAN,
  POSITIVE_INFINITY: ML_POSINF,
  EPSILON: DBL_EPSILON
} = Number;

const { max: fmax2, sqrt, floor, round: R_forceint } = Math;

const printer_do_search = debug('do_search');

function do_search(
  y: number,
  z: NumberW,
  p: number,
  n: number,
  pr: number,
  incr: number
): number {
  printer_do_search(
    'start: y:%d, z:%o, p:%d, n:%d, pr:%d, incr:%d',
    y,
    z,
    p,
    n,
    pr,
    incr
  );
  if (z.val >= p) {
    //* search to the left
    while (true) {
      if (
        y === 0 ||
        (z.val = pnbinom(
          y - incr,
          n,
          pr,
          true, ///log_p,
          false
        )) < p
      ) {
        printer_do_search('exit1');
        return y;
      }
      y = fmax2(0, y - incr);
    } //while
  } else {
    // search to the right

    while (true) {
      y = y + incr;
      if (
        (z.val = pnbinom(
          y,
          n,
          pr, //l._t.
          true,
          false
        )) >= p
      ) {
        printer_do_search('exit2');
        return y;
      }
    } //while
  } //if
}

const printer_qnbinom = debug('qnbinom');

export function qnbinom<T>(
  pp: T,
  size: number,
  prob: number,
  lower_tail: boolean,
  log_p: boolean
): T {
  return multiplexer(pp)(p => {
    let P;
    let Q;
    let mu;
    let sigma;
    let gamma;
    let y;

    const z = new NumberW(0);

    if (ISNAN(p) || ISNAN(size) || ISNAN(prob)) {
      return NaN;
    }

    /* this happens if specified via mu, size, since
       prob == size/(size+mu)
    */
    if (prob === 0 && size === 0) return 0;

    if (prob <= 0 || prob > 1 || size < 0) {
      return ML_ERR_return_NAN(printer_qnbinom);
    }

    if (prob === 1 || size === 0) return 0;

    let rc = R_Q_P01_boundaries(lower_tail, log_p, p, 0, ML_POSINF);
    if (rc !== undefined) {
      return rc;
    }
    Q = 1.0 / prob;
    P = (1.0 - prob) * Q;
    mu = size * P;
    sigma = sqrt(size * P * Q);
    gamma = (Q + P) / sigma;

    /* Note : "same" code in qpois.c, qbinom.c, qnbinom.c --
     * FIXME: This is far from optimal [cancellation for p ~= 1, etc]: */
    if (!lower_tail || log_p) {
      p = R_DT_qIv(
        lower_tail,
        log_p,
        p
      ); /* need check again (cancellation!): */
      if (p === R_DT_0(lower_tail, log_p)) return 0;
      if (p === R_DT_1(lower_tail, log_p)) return ML_POSINF;
    }
    /* temporary hack --- FIXME --- */
    if (p + 1.01 * DBL_EPSILON >= 1) return ML_POSINF;

    /* y := approx.value (Cornish-Fisher expansion) :  */
    z.val = qnorm(p, 0, 1, /*lower_tail*/ true, /*log_p*/ false);
    y = R_forceint(mu + sigma * (z.val + gamma * (z.val * z.val - 1) / 6));

    z.val = pnbinom(y, size, prob, /*lower_tail*/ true, /*log_p*/ false);

    /* fuzz to ensure left continuity: */
    p *= 1 - 64 * DBL_EPSILON;

    /* If the C-F value is not too large a simple search is OK */
    if (y < 1e5) return do_search(y, z, p, size, prob, 1);
    /* Otherwise be a bit cleverer in the search */
    {
      let incr = floor(y * 0.001);
      let oldincr;
      do {
        oldincr = incr;
        y = do_search(y, z, p, size, prob, incr);
        incr = fmax2(1, floor(incr / 100));
      } while (oldincr > 1 && incr > y * 1e-15);
      return y;
    }
  }) as any;
}

export function qnbinom_mu<T>(
  pp: T,
  size: number,
  mu: number,
  lower_tail: boolean,
  log_p: boolean
): T {
  return qnbinom(pp, size, /* prob = */ size / (size + mu), lower_tail, log_p);
}
