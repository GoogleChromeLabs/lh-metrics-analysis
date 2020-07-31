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

#' Format a number for display (thousands separator, truncated fractional part).
#' @param num The number to format.
formatNumber <- function(num) {
  return(format(num, nsmall = 1, big.mark = ","))
}

#' Print the elapsed time between `start` and `end`, formatted and in
#' milliseconds.
#' @param start A start time as POSIXct (e.g. from `Sys.time()`).
#' @param end An end time as POSIXct (e.g. from `Sys.time()`).
printElapsedTime <- function(start, end) {
  ms <- as.numeric(difftime(end, start, units = "secs")) * 1000
  formatted <- formatNumber(round(ms, 2))
  message(paste0("  complete in ", formatted, "ms"))
}

#' Load the needed two-column CSV file and do some validation that the data
#' seems usable.
#' @param filename The path to the CSV file.
#' @return A data frame with numeric columns `base` and `compare`.
loadFile <- function(filename) {
  if (!file.exists(filename)) {
    stop(paste0("unable to find file '", filename, "'"))
  }
  message(paste0("loading file '", filename, "'..."))
  data <- utils::read.csv(filename, header = TRUE, sep = ",")

  # Validate data.
  if (!identical(names(data), c("base", "compare"))) {
    stop("Columns must be named 'base' and 'compare'")
  }
  if (!is.numeric(data$base) || !is.numeric(data$compare)) {
    stop("Columns must contain only numeric values")
  }
  if (anyNA(data$base) || anyNA(data$compare)) {
    stop("Columns must not have missing or NaN entries")
  }
  message("loaded.")

  return(data)
}

#' Take the paired columns in `data` and return a subset of it (without
#' replacement) of size `sample_size`. If the `sample_size` is larger than the
#' number of rows in `data` (or `sample_size` is `Inf`), data is returned
#' unchanged.
#' @param data A data frame with numeric columns `base` and `compare`.
#' @param sample_size The size of the sample to take from `data`.
#' @return A data frame with numeric columns `base` and `compare` of length `min(nrow(data), sample_size)`.
sampleDataIfNeeded <- function(data, sample_size = Inf) {
  # Set the rand seed so results are reproducible.
    set.seed(7)

  # Sample data if requested, keeping pairs together.
  if (is.finite(sample_size) && sample_size < length(data$base)) {
    capped_sample_size <- min(sample_size, length(data$base))
    data_sampled <- data[sample(nrow(data), capped_sample_size), ]

    message(paste(
      "using",
      formatNumber(length(data_sampled$base)),
      "out of",
      formatNumber(length(data$base)),
      "pairs"
    ))
  } else {
    message(paste("using full", formatNumber(length(data$base)), "pairs"))
    data_sampled <- data
  }

  return(data_sampled)
}

run <- function() {
  doc <- "Run shift function to find the deciles of differences between the two columns of the input
          file. Output written as csv to stdout.
  Usage:
      rogme_shift_function_bin.R <input> [options]
      
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
  data <- loadFile(arguments$input)
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
