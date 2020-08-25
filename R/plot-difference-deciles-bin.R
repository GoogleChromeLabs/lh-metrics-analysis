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

#' A CLI frontend for making a plot of the difference between two dependent
#' samples in the style of rogme. Plots a scatterplot of the difference
#' distribution with deciles indicated.

# --- see examples in https://github.com/GRousselet/rogme/ for inspiration

# Load a plot_utils that has been modified from the one provided in rogme.
source("third_party/rogme/R/plot_utils.R")
source("R/utils.R")

# Disable Rplots.pdf generation.
pdf(NULL)

#' Get the quantiles result for the given file using the `quantiles-pbci.js`
#' utility.
#' @param filename The path to the CSV file.
#' @return A data frame with the expected quantile results.
quantiles_pbci <- function(filename) {
  q_str <- system2(
    "node",
    args = c("js/estimators/quantiles-pbci.js", "-i", filename),
    stdout = TRUE,
  )
  sf <- readr::read_csv(q_str)

  # Fix js-style names
  names(sf)[names(sf) == "ciLower"] <- "ci_lower"
  names(sf)[names(sf) == "ciUpper"] <- "ci_upper"

  return(sf)
}

#' Plots a scatterplot of the differences between the paired data1 and data2.
#' Deciles are marked on top of the scatterplot.
#' Adapted from https://github.com/GRousselet/rogme/blob/6582a8af4269be3773f111b57ce787892884b912/docs/dep_gps.md#stripchart-of-differences
#'
#' @param differences Numeric vector of the difference of two samples.
#' @param quantiles The quantiles_pbci results.
#' @param title A title for the plot.
#' @param y_limits A c(ymin, ymax) numeric vector for the limits of the y scale.
#' @param label_multiplier A multiplier that scales the labeled numbers on the
#'   plot without affecting the underlying data - default = 1.
plotDifferenceScatterplot <- function(differences,
                                      quantiles,
                                      title = "Paired Differences",
                                      y_limits = NULL,
                                      label_multiplier = 1) {
  # Transform to
  # group | value
  # --    | --
  # diff  | 1
  # diff  | 2
  # diff  | 3
  # diff  | 4
  df <- tibble::tibble(differences)
  data <- tidyr::pivot_longer(df, everything(), names_to = "group")

  diffplot <- ggplot2::ggplot(
    data,
    ggplot2::aes_string(x = "group", y = "value", fill = "group", colour = "group", shape = "group")
  ) +
    # dotted line at 0
    ggplot2::geom_abline(intercept = 0, slope = 0, linetype = 2) +
    ggbeeswarm::geom_quasirandom(
      # TODO(bckenny): iterate on look
      # method = "tukeyDense",
      alpha = 1,
      shape = 21,
      colour = "grey10",
      fill = "grey90",
      size = 2,
      width = 0.2,
      stroke = 0.5,
    ) +
    ggplot2::theme_bw() +
    ggplot2::theme(
      legend.position = "none",
      axis.ticks.y = ggplot2::element_line(colour = "white"),
      axis.text.x = ggplot2::element_text(size = 14),
      axis.text.y = ggplot2::element_blank(),
      axis.title.x = ggplot2::element_text(size = 16, face = "bold"),
      axis.title.y = ggplot2::element_blank(),
      plot.title = ggplot2::element_text(colour = "black", size = 20),
      panel.grid.minor.x = ggplot2::element_blank()
    ) +

    # Use single axis label as title.
    ggplot2::xlab("") +
    ggplot2::ylab(title) +

    # Distribution going left/right instead of top to bottom.
    ggplot2::coord_flip() +
    ggplot2::scale_y_continuous(
      # Don't display data outside of `y_limits`.
      limits = y_limits,
      # Still plot to edge to not imply there's no more data.
      expand = c(0, 0),
      # Cosmetically scale labeled numbers.
      labels = function(x) x * label_multiplier
    )

  # Percentile less than 0
  # TODO(bckenny): move somewhere else (report?)
  percentile <- ecdf(differences)
  message(paste0("percentile ≤0: ", round(percentile(0) * 100, 1), "%"))

  # overlay decile markers
  diffplot <- plotDecileBars(
    diffplot,
    q = quantiles,
    q_col = "black",
    q_width = 0.5,
    q_size = 0.5,
    md_size = 1.5,
    add_lab = TRUE,
  )

  return(diffplot)
}

run <- function() {
  doc <- "Generate a scatterplot of the difference of two dependent samples,
          with deciles indicated. Plot is written to disk at the given output
          path.
  Usage:
      plot-dependent-shift-bin.R [options] <input> <output>
      
  Options:
      -h, --help  Show this screen.
      -n=<size>, --sample-size=<size>   Sample input for plotting before the heat death of the
                                        universe; use \"Inf\" for no sampling (not advised)
                                        [default: 4000]
      -b=<name>, --base-name=<name>     Plot label for the base data [default: Group 1]
      -c=<name>, --compare-name=<name>  Plot label for the compare data [default: Group 2]
      --metric-name=<name>              Metric name for plot label [default: unknown]
      --unit=<unit>                     Optional units for display in plot label
      --label-multiplier=<multiplier>   A multiplier that scales the labeled numbers on the plot,
                                        like axis ticks. Used for e.g. scaling a score from [0, 1]
                                        to [0, 100] without having to alter the actual data
                                        [default: 1]
      --clip-percentile=<value>         Clip this percentile off both ends of the difference plot to
                                        not be dominated by long tails [default: 7]
      --image-size=<size>               Image width and height, in pixels [default: 1200]


  Arguments:
      input   two-column csv of paired numbers. Column names must be 'base' and 'compare'
      output  output file path
  "
  arguments <- docopt::docopt(doc)

  sample_size <- round(as.numeric(arguments$sample_size))
  data <- loadBaseCompareCsvFile(arguments$input)
  differences <- data$compare - data$base

  data_sampled <- sampleDataIfNeeded(data, sample_size)
  differences_sampled <- data_sampled$compare - data_sampled$base

  quantiles <- quantiles_pbci(arguments$input)

  title <- paste(
    arguments$compare_name,
    "-",
    arguments$base_name,
    "per-site",
    arguments$metric_name,
    "changes"
  )

  # Add units to title if requested.
  unit <- if (is.null(arguments$unit)) "" else arguments$unit
  unit_suffix <- ""
  if (nchar(unit)) {
    unit_suffix <- paste0(" (", unit, ")")
  }
  title <- paste0(title, unit_suffix)

  label_multiplier <- round(as.numeric(arguments$label_multiplier))

  # TODO(bckenny): pick a better way of doing this
  # TODO(bckenny): should it be percentile included instead?
  # Clip to not emphasize long tails.
  y_cutoff <- as.numeric(arguments$clip_percentile) / 100
  scatter_y_limits <- c(quantile(differences, y_cutoff), quantile(differences, 1 - y_cutoff))

  dpi <- 150
  image_size <- round(as.numeric(arguments$image_size) / dpi)

  plot <- plotDifferenceScatterplot(
    differences_sampled,
    quantiles,
    title = title,
    y_limits = scatter_y_limits,
    label_multiplier = label_multiplier
  )
  print(plot)
  ggplot2::ggsave(
    filename = arguments$output,
    units = "in",
    dpi = dpi,
    width = image_size,
    height = image_size
  )
}

run()
