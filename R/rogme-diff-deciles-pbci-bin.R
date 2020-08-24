# Copyright 2020 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

#' A CLI frontend to rogme's `quantiles_pbci` in `stats.R`. See that file for
#' details. Mostly used for testing since the JS port is used instead.

source("R/utils.R")

run <- function() {
  doc <- "Compute percentile bootstrap confidence intervals of deciles estimated using the
          Harrell-Davis estimator. Output written as csv to stdout.
  Usage:
      rogme-diff-quantiles-pbci-bin.R <input> [options]
      
  Options:
      -h, --help  Show this screen.
      -n=<size>, --sample-size=<size>  Subsample size of input; use \"Inf\" for no subsampling
                                       [default: Inf]
      -b=<count>, --nboot=<count>      Number of bootstrap samples [default: 2000]

  Arguments:
      input  two-column csv of paired numbers. Column names must be 'base' and 'compare'.
  "
  arguments <- docopt::docopt(doc)

  sample_size <- round(as.numeric(arguments$sample_size))
  data <- loadBaseCompareCsvFile(arguments$input)
  data_sampled <- sampleDataIfNeeded(data, sample_size)

  nboot <- as.numeric(arguments$nboot)

  message("calculating deciles...")
  dec_start_time <- Sys.time()
  # Set the rand seed so results are reproducible.
  set.seed(2)

  differences <- data_sampled$compare - data_sampled$base
  deciles <- rogme::quantiles_pbci(differences, nboot = nboot)

  dec_end_time <- Sys.time()
  printElapsedTime(dec_start_time, dec_end_time)

  # Standardize on shift-like column names.
  colnames(deciles) <- c("q", "difference", "ci_lower", "ci_upper")

  # Write to stdout.
  cat(readr::format_csv(deciles))
}

run()
