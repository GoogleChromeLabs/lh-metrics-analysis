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

/* eslint-disable max-len */

/**
 * @fileoverview The expected results from extracting sampled HTTP Archive
 * tables in `extract-from-ha-tables-test.js`.
 */
// {lh_version: 'null', requested_url: 'null', final_url: 'null', runtime_error_code: null, fcp_value: null, fmp_value: null, lcp_value: null, mpfid_value: null, si_value: null, tbt_value: null, tti_value: null},

/** @type {Record<string, Array<{lh_version: string, requested_url: string, final_url: string, runtime_error_code: string|null, [p: string]: string|number|null}>>} */
const expectations = {
  // TTI is 'consistently-interactive' until 3.0.0.
  // FCP is found under FMP's extendedInfo
  '2017_06_01_mobile': [
    {lh_version: '2.0.0', requested_url: 'http://www.aliexpress.com/', final_url: 'https://m.aliexpress.com/?tracelog=wwwhome2mobilesitehome', runtime_error_code: null, chrome_version: null, fcp_value: null, fmp_value: -3878.6, lcp_value: null, mpfid_value: null, si_value: 5556, tbt_value: null, tti_value: null},
    {lh_version: '2.0.0', requested_url: 'http://www.google.co.in/', final_url: 'https://www.google.co.in/?gws_rd=ssl', runtime_error_code: null, chrome_version: null, fcp_value: 2041.85, fmp_value: 2041.9, lcp_value: null, mpfid_value: null, si_value: 2065, tbt_value: null, tti_value: 2041.865},
  ],
  '2017_08_01_mobile': [
    {lh_version: '2.3.0', requested_url: 'http://www.tmall.com/', final_url: 'https://www.tmall.com/', runtime_error_code: null, chrome_version: '60.0.3112.78', fcp_value: null, fmp_value: -607.6, lcp_value: null, mpfid_value: null, si_value: 901, tbt_value: null, tti_value: null},
    {lh_version: '2.3.0', requested_url: 'http://www.wikipedia.org/', final_url: 'https://www.wikipedia.org/', runtime_error_code: null, chrome_version: '60.0.3112.78', fcp_value: 1566.807, fmp_value: 1778, lcp_value: null, mpfid_value: null, si_value: 1942, tbt_value: null, tti_value: 1991.048},
  ],
  '2017_11_01_mobile': [
    {lh_version: '2.5.0', requested_url: 'http://www.google.com/', final_url: 'https://www.google.com/?gws_rd=ssl', runtime_error_code: null, chrome_version: '62.0.3202.75', fcp_value: 1839.081, fmp_value: 1839.1, lcp_value: null, mpfid_value: null, si_value: 2082, tbt_value: null, tti_value: 3473.111},
    {lh_version: '2.5.0', requested_url: 'http://www.tmall.com/', final_url: 'https://www.tmall.com/', runtime_error_code: null, chrome_version: '62.0.3202.75', fcp_value: null, fmp_value: -4205.8, lcp_value: null, mpfid_value: null, si_value: 519, tbt_value: null, tti_value: null},
  ],
  // 3.0: TTI moved to 'interactive'
  // 3.0: FCP now top-level
  // 3.0: initialUrl -> requestedUrl
  // 3.0: url -> finalUrl
  // 3.0 speed-index-metric -> speed-index
  // 3.0: lantern by default
  // https://developers.google.com/web/tools/lighthouse/v3/migration#lhr
  '2018_07_01_mobile': [
    {lh_version: '3.0.0', requested_url: 'http://www.baidu.com/', final_url: 'http://www.baidu.com/', runtime_error_code: null, chrome_version: '67.0.3396.99', fcp_value: 2905.272, fmp_value: 2905.279, lcp_value: null, mpfid_value: null, si_value: 3694, tbt_value: null, tti_value: null},
    {lh_version: '3.0.1', requested_url: 'http://www.ifbappliances.com/', final_url: 'https://www.ifbappliances.com/', runtime_error_code: null, chrome_version: '67.0.3396.99', fcp_value: 6308.493, fmp_value: 9901.451, lcp_value: null, mpfid_value: null, si_value: 14654, tbt_value: null, tti_value: 26097.91899999994},
    {lh_version: '3.0.1', requested_url: 'http://www.movenowthinklater.com/', final_url: 'http://www.movenowthinklater.com/', runtime_error_code: null, chrome_version: '67.0.3396.99', fcp_value: null, fmp_value: 1846.921, lcp_value: null, mpfid_value: null, si_value: 2410, tbt_value: null, tti_value: null},
    {lh_version: '3.0.0', requested_url: 'http://www.wikipedia.org/', final_url: 'https://www.wikipedia.org/', runtime_error_code: null, chrome_version: '67.0.3396.99', fcp_value: 2085.854, fmp_value: 2085.856, lcp_value: null, mpfid_value: null, si_value: 2568, tbt_value: null, tti_value: 2663.969},
  ],
  '2018_09_01_mobile': [
    {lh_version: '3.0.3', requested_url: 'http://ekc.com.ua/', final_url: 'http://ekc.com.ua/', runtime_error_code: null, chrome_version: '68.0.3440.106', fcp_value: 1529.924, fmp_value: 1529.928, lcp_value: null, mpfid_value: null, si_value: 1544, tbt_value: null, tti_value: 1529.924},
    {lh_version: '3.1.1', requested_url: 'http://worldcup.kenh14.vn/', final_url: 'http://worldcup.kenh14.vn/', runtime_error_code: null, chrome_version: '69.0.3497.81', fcp_value: 2294.09, fmp_value: 2375.207, lcp_value: null, mpfid_value: null, si_value: 4476, tbt_value: null, tti_value: 9730.373},
    {lh_version: '3.1.0', requested_url: 'https://eyefinityew.com/', final_url: 'https://eyefinityew.com/', runtime_error_code: null, chrome_version: '69.0.3497.81', fcp_value: 5139.263, fmp_value: 5139.263, lcp_value: null, mpfid_value: null, si_value: 10211, tbt_value: null, tti_value: 18334.147},
    {lh_version: '3.1.0', requested_url: 'https://glogangworldwide.com/', final_url: 'https://glogangworldwide.com/', runtime_error_code: null, chrome_version: '69.0.3497.81', fcp_value: 2845.38, fmp_value: 3545.285, lcp_value: null, mpfid_value: null, si_value: 15584, tbt_value: null, tti_value: null},
    {lh_version: '3.0.3', requested_url: 'https://redbeanphp.com/', final_url: 'https://redbeanphp.com/index.php', runtime_error_code: null, chrome_version: '68.0.3440.106', fcp_value: 3793.744, fmp_value: null, lcp_value: null, mpfid_value: null, si_value: 4798, tbt_value: null, tti_value: 6587.693},
    {lh_version: '3.1.1', requested_url: 'https://rules.pch.com/', final_url: 'https://rules.pch.com/', runtime_error_code: null, chrome_version: '69.0.3497.81', fcp_value: null, fmp_value: null, lcp_value: null, mpfid_value: null, si_value: null, tbt_value: null, tti_value: null},
  ],
  // 3.2: lhr.runtimeError added (NO_ERROR code for no error case)
  '2018_10_01_mobile': [
    {lh_version: '3.2.1', requested_url: 'http://bernardsboe.ss5.sharpschool.com/', final_url: 'http://bernardsboe.ss5.sharpschool.com/', runtime_error_code: 'FAILED_DOCUMENT_REQUEST', chrome_version: '69.0.3497.100', fcp_value: 36.904, fmp_value: 36.904, lcp_value: null, mpfid_value: null, si_value: 13631, tbt_value: null, tti_value: 23297.349},
    {lh_version: '3.2.0', requested_url: 'http://dlibra.kul.pl/', final_url: 'http://dlibra.kul.pl/', runtime_error_code: null, chrome_version: '69.0.3497.100', fcp_value: 24778.548, fmp_value: 24823.099, lcp_value: null, mpfid_value: null, si_value: 25210, tbt_value: null, tti_value: null},
    {lh_version: '3.2.1', requested_url: 'http://free.discoverancestry.com/', final_url: 'http://free.discoverancestry.com/index.jhtml', runtime_error_code: null, chrome_version: '69.0.3497.100', fcp_value: 1741.62, fmp_value: null, lcp_value: null, mpfid_value: null, si_value: 1931, tbt_value: null, tti_value: 1741.62},
    {lh_version: '3.2.0', requested_url: 'http://tzart.tmsh.tc.edu.tw/', final_url: 'http://tzart.tmsh.tc.edu.tw/', runtime_error_code: 'FAILED_DOCUMENT_REQUEST', chrome_version: '69.0.3497.100', fcp_value: 22.454, fmp_value: 1316.405, lcp_value: null, mpfid_value: null, si_value: 6119, tbt_value: null, tti_value: 8610.038},
    {lh_version: '3.2.0', requested_url: 'http://webstore.quiltropolis.net/', final_url: 'http://webstore.quiltropolis.net/', runtime_error_code: null, chrome_version: '69.0.3497.100', fcp_value: 746.075, fmp_value: 1251.45, lcp_value: null, mpfid_value: null, si_value: 1291, tbt_value: null, tti_value: 1205.293},
    {lh_version: '3.2.1', requested_url: 'http://www1.vghtc.gov.tw/', final_url: 'http://www1.vghtc.gov.tw/', runtime_error_code: 'FAILED_DOCUMENT_REQUEST', chrome_version: '69.0.3497.100', fcp_value: 45.338, fmp_value: 45.338, lcp_value: null, mpfid_value: null, si_value: 46, tbt_value: null, tti_value: null},
    {lh_version: '3.2.1', requested_url: 'https://blog.kloud.com.au/', final_url: 'https://blog.kloud.com.au/', runtime_error_code: null, chrome_version: '69.0.3497.100', fcp_value: 2839.521, fmp_value: 10211.105, lcp_value: null, mpfid_value: null, si_value: 6733, tbt_value: null, tti_value: 25796.353},
    {lh_version: '3.2.0', requested_url: 'https://www.brown-forman.com/', final_url: 'https://www.brown-forman.com/', runtime_error_code: 'ERRORED_DOCUMENT_REQUEST', chrome_version: '69.0.3497.100', fcp_value: 41.408, fmp_value: 2685.768, lcp_value: null, mpfid_value: null, si_value: 34311, tbt_value: null, tti_value: null},
  ],
  // 4.0.0-alpha.1 accidentally pushed to @latest, so 4.0.0-alpha.2-3.2.1 is really 3.2.1
  // see https://github.com/GoogleChrome/lighthouse/releases/tag/v4.0.0-alpha.2-3.2.1
  '2019_01_01_mobile': [
    {lh_version: '3.2.1', requested_url: 'http://portaldatransparencia.com.br/', final_url: 'http://portaldatransparencia.com.br/', runtime_error_code: null, chrome_version: '71.0.3578.98', fcp_value: null, fmp_value: null, lcp_value: null, mpfid_value: null, si_value: null, tbt_value: null, tti_value: null},
    {lh_version: '4.0.0', requested_url: 'http://umbrasileironaamerica.com/', final_url: 'http://umbrasileironaamerica.com/', runtime_error_code: 'PROTOCOL_TIMEOUT', chrome_version: '71.0.3578.98', fcp_value: 5384.271, fmp_value: 5822.216, lcp_value: null, mpfid_value: null, si_value: 18128, tbt_value: null, tti_value: 15679.729},
    {lh_version: '4.0.0', requested_url: 'http://worldslargestmatrix.com/', final_url: 'http://worldslargestmatrix.com/', runtime_error_code: 'PROTOCOL_TIMEOUT', chrome_version: '71.0.3578.98', fcp_value: null, fmp_value: null, lcp_value: null, mpfid_value: null, si_value: null, tbt_value: null, tti_value: null},
    {lh_version: '4.0.0', requested_url: 'http://www.countylineadult.com/', final_url: 'http://www.countylineadult.com/', runtime_error_code: null, chrome_version: '71.0.3578.98', fcp_value: 1790.619, fmp_value: 1790.632, lcp_value: null, mpfid_value: null, si_value: 1834, tbt_value: null, tti_value: 1790.619},
    {lh_version: '3.2.1', requested_url: 'http://www.smarbet.net/', final_url: 'http://www.smarbet.net/', runtime_error_code: 'FAILED_DOCUMENT_REQUEST', chrome_version: '71.0.3578.98', fcp_value: null, fmp_value: null, lcp_value: null, mpfid_value: null, si_value: null, tbt_value: null, tti_value: null},
    {lh_version: '3.2.1', requested_url: 'https://anydayrose.com/', final_url: 'https://anydayrose.com/', runtime_error_code: 'FAILED_DOCUMENT_REQUEST', chrome_version: '71.0.3578.98', fcp_value: 4356.721, fmp_value: 6009.429, lcp_value: null, mpfid_value: null, si_value: 14431, tbt_value: null, tti_value: 25621.6520000076},
    {lh_version: '4.0.0', requested_url: 'https://otkritka-ok.ru/', final_url: 'https://otkritka-ok.ru/', runtime_error_code: null, chrome_version: '71.0.3578.98', fcp_value: 3498.755, fmp_value: 3738.003, lcp_value: null, mpfid_value: null, si_value: 5393, tbt_value: null, tti_value: null},
    {lh_version: '3.2.1', requested_url: 'https://www.paiementpasseport-cotedivoire.com/', final_url: 'https://www.paiementpasseport-cotedivoire.com/', runtime_error_code: null, chrome_version: '71.0.3578.98', fcp_value: 1300.872, fmp_value: 1300.882, lcp_value: null, mpfid_value: null, si_value: 1366, tbt_value: null, tti_value: 1300.872},
  ],
  // 4.2: mpfid added
  // 4.2: NO_ERROR runtimeErrors no longer in LHR
  // 5.0: rawValue -> numericValue
  '2019_05_01_mobile': [
    {lh_version: '5.0.0', requested_url: 'http://ex.belpost.by/', final_url: 'http://ex.belpost.by/', runtime_error_code: null, chrome_version: '74.0.3729.131', fcp_value: 4506.659, fmp_value: 5801.259, lcp_value: null, mpfid_value: 21.593, si_value: 5024, tbt_value: null, tti_value: 4506.659},
    {lh_version: '4.3.1', requested_url: 'http://tripleagency.co.kr/', final_url: 'http://tripleagency.co.kr/', runtime_error_code: 'PROTOCOL_TIMEOUT', chrome_version: '74.0.3729.131', fcp_value: 2881.697, fmp_value: 3807.628, lcp_value: null, mpfid_value: 133.752, si_value: 6743, tbt_value: null, tti_value: 12831.456},
    {lh_version: '4.3.0', requested_url: 'http://www.angusfuneralhomes.com/', final_url: 'http://www.angusfuneralhomes.com/', runtime_error_code: null, chrome_version: '74.0.3729.131', fcp_value: 1494.922, fmp_value: 1494.924, lcp_value: null, mpfid_value: 16, si_value: 1600, tbt_value: null, tti_value: 1494.922},
    {lh_version: '4.3.0', requested_url: 'http://www.educacaopublica.rj.gov.br/', final_url: 'http://www.educacaopublica.rj.gov.br/', runtime_error_code: null, chrome_version: '74.0.3729.108', fcp_value: null, fmp_value: null, lcp_value: null, mpfid_value: null, si_value: null, tbt_value: null, tti_value: null},
    {lh_version: '5.0.0', requested_url: 'http://www.ic-parking.com/', final_url: 'http://www.ic-parking.com/', runtime_error_code: null, chrome_version: '74.0.3729.131', fcp_value: 1851.066, fmp_value: 1851.068, lcp_value: null, mpfid_value: 16, si_value: 4219, tbt_value: null, tti_value: 1851.066},
    {lh_version: '4.3.1', requested_url: 'http://www.slovensky-kras.eu/', final_url: 'http://www.slovensky-kras.eu/info/', runtime_error_code: null, chrome_version: '74.0.3729.131', fcp_value: 6811.532, fmp_value: 7621.838, lcp_value: null, mpfid_value: 239.401, si_value: 12872, tbt_value: null, tti_value: null},
    {lh_version: '4.3.1', requested_url: 'https://eu.knoxnews.com/', final_url: 'https://www.knoxnews.com/', runtime_error_code: 'PROTOCOL_TIMEOUT', chrome_version: '74.0.3729.131', fcp_value: 3953.119, fmp_value: 8314.009, lcp_value: null, mpfid_value: 380.417, si_value: null, tbt_value: null, tti_value: 30110.885},
    {lh_version: '4.3.0', requested_url: 'https://giropay.sskm.de/', final_url: 'https://www.giropay.de/kaeufer/', runtime_error_code: 'FAILED_DOCUMENT_REQUEST', chrome_version: '74.0.3729.108', fcp_value: 9522.719, fmp_value: 11640.154, lcp_value: null, mpfid_value: 65.666, si_value: 9990, tbt_value: null, tti_value: 11623.384},
    {lh_version: '5.0.0', requested_url: 'https://pszow.nieruchomosci-online.pl/', final_url: 'https://pszow.nieruchomosci-online.pl/', runtime_error_code: 'PROTOCOL_TIMEOUT', chrome_version: '74.0.3729.131', fcp_value: 5261.07, fmp_value: 6061.916, lcp_value: null, mpfid_value: 1009.449, si_value: 7888, tbt_value: null, tti_value: 11059.3729999847},
    {lh_version: '4.3.1', requested_url: 'https://rosavzw.be/', final_url: 'https://rosavzw.be/site/', runtime_error_code: null, chrome_version: '74.0.3729.131', fcp_value: 3839.834, fmp_value: 3839.835, lcp_value: null, mpfid_value: 164.857, si_value: 6744, tbt_value: null, tti_value: 10304.752},
    {lh_version: '4.3.0', requested_url: 'https://server-part.ru/', final_url: 'https://server-part.ru/', runtime_error_code: 'PROTOCOL_TIMEOUT', chrome_version: '74.0.3729.108', fcp_value: 7917.799, fmp_value: 75276.739, lcp_value: null, mpfid_value: 22138.881, si_value: 8228, tbt_value: null, tti_value: null},
    {lh_version: '5.0.0', requested_url: 'https://yamaha.vidi.ua/', final_url: 'https://yamaha.vidi.ua/ru/', runtime_error_code: 'PROTOCOL_TIMEOUT', chrome_version: '74.0.3729.131', fcp_value: 4382.131, fmp_value: 7390.599, lcp_value: null, mpfid_value: 133.504, si_value: 52292, tbt_value: null, tti_value: null},
  ],
  // 5.2.0: TBT added
  '2019_09_01_mobile': [
    {lh_version: '5.3.0', requested_url: 'http://www.cosmic-iwater.com/', final_url: 'http://www.cosmic-iwater.com/', runtime_error_code: null, chrome_version: '77.0.3865.75', fcp_value: 3444.841, fmp_value: 4755.939, lcp_value: null, mpfid_value: 717.438, si_value: 4052, tbt_value: 2315.585, tti_value: 12489.838},
    {lh_version: '5.4.0', requested_url: 'http://www.palavraefamilia.org.br/', final_url: 'http://www.palavraefamilia.org.br/', runtime_error_code: 'NO_FCP', chrome_version: '77.0.3865.90', fcp_value: null, fmp_value: null, lcp_value: null, mpfid_value: null, si_value: null, tbt_value: null, tti_value: null},
    {lh_version: '5.2.0', requested_url: 'https://54hsl.com/', final_url: 'https://54hsl.com/', runtime_error_code: null, chrome_version: '76.0.3809.132', fcp_value: 2853.189, fmp_value: 2853.19, lcp_value: null, mpfid_value: 16, si_value: 2859, tbt_value: 0, tti_value: 2853.189},
    {lh_version: '5.2.0', requested_url: 'https://antwoorden.eindexamens.nu/', final_url: 'https://antwoorden.eindexamens.nu/', runtime_error_code: null, chrome_version: '76.0.3809.132', fcp_value: 3709.382, fmp_value: 3709.383, lcp_value: null, mpfid_value: 314.139, si_value: 4496, tbt_value: null, tti_value: null},
    {lh_version: '5.3.0', requested_url: 'https://edgewaterhs.ocps.net/', final_url: 'https://edgewaterhs.ocps.net/', runtime_error_code: null, chrome_version: '77.0.3865.75', fcp_value: 6519.058, fmp_value: 9857.009, lcp_value: null, mpfid_value: 829.517, si_value: 16565, tbt_value: null, tti_value: null},
    {lh_version: '5.2.0', requested_url: 'https://forum.canadianwoodworking.com/', final_url: 'https://forum.canadianwoodworking.com/', runtime_error_code: 'CHROME_INTERSTITIAL_ERROR', chrome_version: '76.0.3809.132', fcp_value: 2955.531, fmp_value: 2955.533, lcp_value: null, mpfid_value: 2440.217, si_value: 3112, tbt_value: 4533.12, tti_value: 11683.364},
    {lh_version: '5.2.0', requested_url: 'https://kuplusrazu.ru/', final_url: 'https://kuplusrazu.ru/', runtime_error_code: 'CHROME_INTERSTITIAL_ERROR', chrome_version: '76.0.3809.132', fcp_value: null, fmp_value: null, lcp_value: null, mpfid_value: null, si_value: null, tbt_value: null, tti_value: null},
    {lh_version: '5.4.0', requested_url: 'https://selfservice.loc.edu/', final_url: 'https://selfservice.loc.edu/', runtime_error_code: 'FAILED_DOCUMENT_REQUEST', chrome_version: '77.0.3865.90', fcp_value: 1687.067, fmp_value: 1687.067, lcp_value: null, mpfid_value: 16, si_value: 1436, tbt_value: 0, tti_value: 1687.067},
    {lh_version: '5.4.0', requested_url: 'https://www.ead.pr.gov.br/', final_url: 'https://www.ead.pr.gov.br/', runtime_error_code: null, chrome_version: '77.0.3865.90', fcp_value: 7444.016, fmp_value: 7444.016, lcp_value: null, mpfid_value: 89.437, si_value: 10259, tbt_value: 39.437, tti_value: 14477.826},
    {lh_version: '5.3.0', requested_url: 'https://www.kwcu.or.kr:444/', final_url: 'https://www.kwcu.or.kr:444/', runtime_error_code: 'CHROME_INTERSTITIAL_ERROR', chrome_version: '77.0.3865.75', fcp_value: 6318.286, fmp_value: 6318.286, lcp_value: null, mpfid_value: 115.33, si_value: 19107, tbt_value: 179.959, tti_value: 19028.736},
    {lh_version: '5.4.0', requested_url: 'https://www.mcdonalds360.sk/', final_url: 'https://www.mcdonalds360.sk/', runtime_error_code: null, chrome_version: '77.0.3865.90', fcp_value: 4191.923, fmp_value: 4191.923, lcp_value: null, mpfid_value: 485.548, si_value: 5820, tbt_value: null, tti_value: null},
    {lh_version: '5.3.0', requested_url: 'https://yegitek.meb.gov.tr/', final_url: 'https://yegitek.meb.gov.tr/', runtime_error_code: 'CHROME_INTERSTITIAL_ERROR', chrome_version: '77.0.3865.75', fcp_value: null, fmp_value: null, lcp_value: null, mpfid_value: null, si_value: null, tbt_value: null, tti_value: null},
  ],
  // 5.5: LCP added to metrics auditDetails
  '2020_01_01_mobile': [
    // Weird: temporarily reverted and had some error-filled 2.9.1 runs
    {lh_version: '5.6.0', requested_url: 'http://cametvblog.com/', final_url: 'http://cametvblog.com/category/blog/', runtime_error_code: null, chrome_version: '65.0.3325.146', fcp_value: 2526.516, fmp_value: 3067.872, lcp_value: null, mpfid_value: 459.349, si_value: 5041, tbt_value: 1816.7720000000008, tti_value: 16955.511},
    {lh_version: '5.6.0', requested_url: 'http://ebid.kr.or.kr/', final_url: 'http://ebid.kr.or.kr/', runtime_error_code: 'PROTOCOL_TIMEOUT', chrome_version: '65.0.3325.146', fcp_value: 14030.271, fmp_value: 14030.277, lcp_value: null, mpfid_value: 75.783, si_value: 17539, tbt_value: 40.71499999999651, tti_value: 33616.432},
    {lh_version: '2.9.1', requested_url: 'https://sport-setka.ru/', final_url: 'https://sport-setka.ru/', runtime_error_code: null, chrome_version: '79.0.3945.88', fcp_value: null, fmp_value: null, lcp_value: null, mpfid_value: null, si_value: null, tbt_value: null, tti_value: null},
    {lh_version: '5.6.0', requested_url: 'https://treizemondial.fr/', final_url: 'https://treizemondial.fr/', runtime_error_code: 'NO_FCP', chrome_version: '65.0.3325.146', fcp_value: null, fmp_value: null, lcp_value: null, mpfid_value: null, si_value: null, tbt_value: null, tti_value: null},
    {lh_version: '5.6.0', requested_url: 'https://www.credy24.ge/', final_url: 'https://www.credy24.ge/', runtime_error_code: null, chrome_version: '65.0.3325.146', fcp_value: 4649.547, fmp_value: 4649.551, lcp_value: null, mpfid_value: 644.88, si_value: 4729, tbt_value: null, tti_value: null},
  ],
  // 6.0: LCP added as metric
  // 6.0: CLS added as metric
  '2020_05_01_mobile': [
    {lh_version: '6.0.0', requested_url: 'http://www.pronutiva.com.br/', final_url: 'http://www.pronutiva.com.br/', runtime_error_code: 'PROTOCOL_TIMEOUT', chrome_version: '81.0.4044.138', fcp_value: 11609.79, fmp_value: 11609.79, lcp_value: 22322.855, mpfid_value: 326.915, si_value: 12935, tbt_value: 324.3740000000016, tti_value: 22297.699},
    {lh_version: '6.0.0', requested_url: 'http://www.reginacaeli.be/', final_url: 'http://www.reginacaeli.be/index.php?id=100', runtime_error_code: null, chrome_version: '81.0.4044.138', fcp_value: 3305.875, fmp_value: 3305.875, lcp_value: 3981.872, mpfid_value: 41.271, si_value: 3820, tbt_value: 0, tti_value: 3305.875},
    {lh_version: '5.6.0', requested_url: 'https://portal.warta.pl/', final_url: 'https://portal.warta.pl/auth/login?service=https://portal.warta.pl/sso/', runtime_error_code: 'CHROME_INTERSTITIAL_ERROR', chrome_version: '81.0.4044.129', fcp_value: 2447.653, fmp_value: 2447.653, lcp_value: 2448, mpfid_value: 61.881, si_value: 4150, tbt_value: 11.880999999999858, tti_value: 3292.1450000076293},
    {lh_version: '5.6.0', requested_url: 'https://spicysol.com/', final_url: 'https://spicysol.com/', runtime_error_code: null, chrome_version: '81.0.4044.129', fcp_value: 4787.858, fmp_value: 4787.858, lcp_value: null, mpfid_value: 454.014, si_value: 12277, tbt_value: null, tti_value: null},
    {lh_version: '6.0.0', requested_url: 'https://www.colorssmuky.cz/', final_url: 'https://www.colorssmuky.cz/', runtime_error_code: null, chrome_version: '81.0.4044.138', fcp_value: 4364.566, fmp_value: 4364.566, lcp_value: 53222.972, mpfid_value: 77.54, si_value: 6658, tbt_value: null, tti_value: null},
    {lh_version: '6.0.0', requested_url: 'https://www.elinux.org/', final_url: 'https://www.elinux.org/', runtime_error_code: 'NO_FCP', chrome_version: '81.0.4044.138', fcp_value: null, fmp_value: null, lcp_value: null, mpfid_value: null, si_value: null, tbt_value: null, tti_value: null},
    {lh_version: '5.6.0', requested_url: 'https://www.jovenesweb.com/', final_url: 'https://www.jovenesweb.com/', runtime_error_code: null, chrome_version: '81.0.4044.129', fcp_value: 2501.414, fmp_value: 2501.414, lcp_value: 6363, mpfid_value: 527.044, si_value: 8047, tbt_value: 3292.267000000001, tti_value: 11746.96},
    {lh_version: '5.6.0', requested_url: 'https://www.placasonline.com.br/', final_url: 'https://www.placasonline.com.br/', runtime_error_code: 'ERRORED_DOCUMENT_REQUEST', chrome_version: '81.0.4044.129', fcp_value: null, fmp_value: null, lcp_value: null, mpfid_value: null, si_value: null, tbt_value: null, tti_value: null},
  ],
};

export default expectations;
