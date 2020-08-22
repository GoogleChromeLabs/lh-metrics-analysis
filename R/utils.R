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

# TODO(bckenny): switch to readr
#' Load the needed two-column CSV file and do some validation that the data
#' seems usable.
#' @param filename The path to the CSV file.
#' @return A data frame with numeric columns `base` and `compare`.
loadBaseCompareCsvFile <- function(filename) {
  if (!file.exists(filename)) {
    stop(paste0("unable to find file '", filename, "'"))
  }
  message(paste0("loading file '", filename, "'..."))
  data <- readr::read_csv(filename)

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
