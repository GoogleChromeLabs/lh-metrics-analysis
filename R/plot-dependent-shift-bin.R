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

#' A CLI frontend for making a shift-function plot in the style of rogme. Plots
#' scatterplots of the two supplied distributions, stacked vertically, with
#' deciles connected between them.

# --- see examples in https://github.com/GRousselet/rogme/ for inspiration

# Load a plot_utils that has been modified from the one provided in rogme.
source("third_party/rogme/R/plot_utils.R")

# Disable Rplots.pdf generation.
pdf(NULL)

# TODO(bckenny): can share these in a utils file.
#' Format a number for display (thousands separator, truncated fractional part).
#' @param num The number to format.
formatNumber <- function(num) {
  return(format(num, nsmall = 1, big.mark = ","))
}

# TODO(bckenny): switch to readr
#' Load the needed two-column CSV file and do some validation that the data
#' seems usable.
#' @param filename The path to the CSV file.
#' @return A data frame with numeric columns `base` and `compare`.
loadCsvFile <- function(filename) {
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

#' Get the shiftdhd result for the given file using the `shift-function.js`
#' utility.
#' @param filename The path to the CSV file.
#' @return A data frame with the expected shiftdhd results.
shiftdhd <- function(filename) {
  sf_str <- system2(
    "node",
    args = c("js/estimators/shift-function.js", "-i", filename),
    stdout = TRUE,
  )
  sf <- utils::read.csv(text = sf_str, header = TRUE, sep = ",")

  # Fix js-style names
  names(sf)[names(sf) == "ciLower"] <- "ci_lower"
  names(sf)[names(sf) == "ciUpper"] <- "ci_upper"

  return(sf)
}

#' Plots scatterplots of the two supplied distributions, stacked vertically.
#' `base` will appear at the top of the plot.
#'
#' @param base Numeric vector for first distribution.
#' @param compare Numeric vector for second distribution.
#' @param data_labels The axis labels for the two distributions, in order.
#' @param title A title for the plot.
#' @param y_limits A c(ymin, ymax) numeric vector for the limits of the y scale.
#' @param label_multiplier A multiplier that scales the labeled numbers on the
#'   plot without affecting the underlying data - default = 1.
plotStackedScatterplots <- function(base,
                                    compare,
                                    data_labels = c("Base", "Compare"),
                                    title = "",
                                    y_limits = NULL,
                                    label_multiplier = 1) {
  # Transform to
  # group   | value
  # --      | --
  # base    | 1
  # compare | 2
  # base    | 3
  # compare | 4
  df <- tibble::tibble(base, compare)
  data <- tidyr::pivot_longer(df, c("base", "compare"), names_to = "group")

  p <- ggplot2::ggplot(
    data,
    ggplot2::aes_string(
      x = "group",
      y = "value",
      fill = "group",
      colour = "group",
      shape = "group"
    )
  ) +
    ggbeeswarm::geom_quasirandom(
      # TODO(bckenny): iterate on look
      # method = "tukeyDense",
      alpha = 1,
      shape = 21,
      colour = "grey10",
      fill = "grey90"
    ) +
    ggplot2::theme_bw() +
    ggplot2::theme(legend.position = "none") +
    ggplot2::theme(
      axis.title.x = ggplot2::element_text(size = 16, face = "bold"),
      axis.title.y = ggplot2::element_text(size = 16, face = "bold"),
      axis.text.x = ggplot2::element_text(size = 14, hjust = 1),
      axis.text.y = ggplot2::element_text(size = 14)
    ) +

    # Use single axis label as title.
    ggplot2::xlab("") +
    ggplot2::ylab(title) +

    # Distributions at top/bottom instead of left/right.
    ggplot2::coord_flip() +

    # Put base group top.
    ggplot2::scale_x_discrete(
      labels = rev(data_labels),
      limits = rev(c("base", "compare"))
    )

  if (is.null(y_limits)) {
    p <- p + ggplot2::scale_y_continuous(
      # Cosmetically scale labeled numbers.
      labels = function(x) x * label_multiplier
    )
  } else {
    p <- p + ggplot2::scale_y_continuous(
      # Don't display data outside of `y_limits`.
      limits = y_limits,
      # Still plot to edge to not imply there's no more data
      expand = c(0, 0),
      # Cosmetically scale labeled numbers.
      labels = function(x) x * label_multiplier
    )
  }

  return(p)
}

#' Plots scatterplots of the two supplied distributions, stacked vertically,
#' with deciles connected between them. `base` will appear at the top of the
#' plot.
#'
#' @param base Numeric vector for first distribution.
#' @param compare Numeric vector for first distribution.
#' @param data_labels The axis labels for the two distributions, in order.
#' @param sf The shift function
#' @param title A title for the plot.
#' @param y_limits A c(ymin, ymax) numeric vector for the limits of the y scale.
#' @param labres Number of decimals for the labels - default = 2
#' @param label_unit String units for the labels - default = ""
#' @param reverse_link_colors If TRUE, reverses the association of colors with
#'   positive/negative - default = FALSE.
#' @param label_multiplier A multiplier that scales the labeled numbers on the
#'   plot without affecting the underlying data - default = 1.
plotScatterplotWithDeciles <- function(base,
                                       compare,
                                       data_labels = c("Base", "Compare"),
                                       sf,
                                       title = "",
                                       y_limits = NULL,
                                       labres = 2,
                                       label_unit = "",
                                       reverse_link_colors = FALSE,
                                       label_multiplier = 1) {
  scatterPlots <- plotStackedScatterplots(
    base,
    compare,
    data_labels = data_labels,
    title = title,
    y_limits = y_limits,
    label_multiplier = label_multiplier
  )

  plotsWithDeciles <- plotDecileLinks(
    scatterPlots,
    sf,
    q_size = 1,
    md_size = 1.5,
    add_rect = TRUE,
    rect_alpha = 0.1,
    rect_col = "grey50",
    add_lab = TRUE,
    reverse_link_colors = reverse_link_colors,
    labres = labres,
    label_unit = label_unit,
    text_size = 5,
    label_multiplier = label_multiplier
  )

  return(plotsWithDeciles)
}

run <- function() {
  doc <- "Generate a plot of two dependent distributions stacked vertically,
          with deciles and decile differences marked. Plot is written to disk
          and the filename is written to stdout.
  Usage:
      plot-dependent-shift-bin.R [options] <input> <output>
      
  Options:
      -h, --help  Show this screen.
      -n=<size>, --sample-size=<size>   Sample input for plotting before the heat death of the
                                        universe; use \"Inf\" for no sampling (not advised)
                                        [default: 4000]
      -b=<name>, --base-name=<name>     Axis label for the base data [default: Group 1]
      -c=<name>, --compare-name=<name>  Axis label for the compare data [default: Group 2]
      --metric-name=<name>              Metric name for plot label [default: unknown]
      --unit=<unit>                     Optional units for display in plot label
      --max-plotted-value=<value>       Set the max value to be plotted. Outliers beyond this will
                                        not appear on the plot. Defaults to the 99th percentile
      --label-multiplier=<multiplier>   A multiplier that scales the labeled numbers on the plot,
                                        like axis ticks and difference labels. Used for e.g. scaling
                                        a score from [0, 1] to [0, 100] without having to alter the
                                        actual data [default: 1]
      --reverse-diff-colors             If set, reverses colors so a negative difference is marked
                                        as a good change.
      --digits=<d>                      Number of fractional decimal places to round to for display
                                        [default: 1]


  Arguments:
      input   two-column csv of paired numbers. Column names must be 'base' and 'compare'
      output  output file path
  "
  arguments <- docopt::docopt(doc)

  sample_size <- round(as.numeric(arguments$sample_size))
  data <- loadCsvFile(arguments$input)
  data_sampled <- sampleDataIfNeeded(data, sample_size)

  sf <- shiftdhd(arguments$input)

  unit <- if (is.null(arguments$unit)) "" else arguments$unit
  unit_suffix <- ""
  if (nchar(unit)) {
    unit_suffix <- paste0(" (", unit, ")")
  }
  metric_title <- paste0(arguments$metric_name, unit_suffix)

  label_multiplier <- round(as.numeric(arguments$label_multiplier))

  # TODO(bckenny): pick a better way of doing this
  # Keep the far outliers out of the scatterplot.
  if (!is.null(arguments$max_plotted_value)) {
    max_y <- as.numeric(arguments$max_plotted_value)
    scatter_y_limits <- c(0, max_y)
  } else {
    scatter_y_limits <- c(0, quantile(c(data$base, data$compare), 0.99))
  }

  digits <- round(as.numeric(arguments$digits))

  plot <- plotScatterplotWithDeciles(
    data_sampled$base,
    data_sampled$compare,
    data_labels = c(arguments$base_name, arguments$compare_name),
    sf,
    title = metric_title,
    y_limits = scatter_y_limits,
    labres = digits,
    label_unit = unit,
    reverse_link_colors = arguments$reverse_diff_colors,
    label_multiplier = label_multiplier
  )
  print(plot)
  ggplot2::ggsave(filename = arguments$output, dpi = "retina")
}

run()
