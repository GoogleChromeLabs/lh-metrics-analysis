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

#' A CLI frontend to rogme's `shift_function_calc.R`, both the original found
#' there and the forked version tweaked for speed. See those files for details.
#' Mostly used for testing since the JS ports (e.g. shiftdhd.js) are used
#' instead.

source("third_party/rogme/R/faster_shift_function_calc.R")
source("R/utils.R")

run <- function() {
  doc <- "Run shift function to find the deciles of differences between the two columns of the input
          file. Output written as csv to stdout.
  Usage:
      rogme-shift-function-bin.R <input> [options]
      
  Options:
      -h, --help  Show this screen.
      -n=<size>, --sample-size=<size>  Subsample size of input; use \"Inf\" for no subsampling
                                      [default: Inf]
      -m=<method>, --method=<method>  Select the method of computation, either \"original\" rogme
                                      implementation or \"faster\" [default: faster]

  Arguments:
      input  two-column csv of paired numbers. Column names must be 'base' and 'compare'.
  "
  arguments <- docopt::docopt(doc)

  sample_size <- round(as.numeric(arguments$sample_size))
  data <- loadBaseCompareCsvFile(arguments$input)
  data_sampled <- sampleDataIfNeeded(data, sample_size)

  method <- arguments$method
  if (!is.element(method, c("original", "faster"))) {
    stop(paste0("'--method' must be 'original' or 'faster' (found '", method, "')"))
  }

  message(paste0("calculating shift function (", method, ")..."))
  sf_start_time <- Sys.time()
  # Can use a higher nboot, but Wilcox finds default 200 usually sufficient.
  sf_nboot <- 200
  # Again set the rand seed so results are reproducible.
  set.seed(2)

  if (method == "faster") {
    sf <- shiftdhd_forked(
      x = data_sampled$compare,
      y = data_sampled$base,
      x_name = "compare",
      y_name = "base",
      nboot = sf_nboot
    )
  } else if (method == "original") {
    # Use original rogme data setup and processing.
    sf_df <- rogme::mkt2(data_sampled$base, data_sampled$compare, group_labels = c("base", "compare"))
    sf_order <- list(c("compare", "base")) # Set order compare-base.
    sf <- rogme::shiftdhd(
      data = sf_df,
      formula = obs ~ gr,
      todo = sf_order,
      nboot = sf_nboot
    )[[1]]
  }

  sf_end_time <- Sys.time()
  message("shift function complete")
  printElapsedTime(sf_start_time, sf_end_time)

  # Write to stdout.
  utils::write.csv(sf, file = stdout(), row.names = FALSE, quote = FALSE)
}

run()
