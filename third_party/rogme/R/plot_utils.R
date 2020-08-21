# Copyright (c) <2016-2018> <Guillaume Rousselet, Rand Wilcox>
# Copyright 2020 Google LLC
# MIT License

# Modified from https://github.com/GRousselet/rogme/blob/6582a8af4269be3773f111b57ce787892884b912/R/plot_utils.R

#' Add bars marking deciles to ggplot object created in the style of
#' \code{\link{rogme::plot_scat2}}. Modified from the original plot_hd_bars to
#' use deciles from the sf result rather than recomputing (which is slow and
#' causes alignment errors when sub-sampling data for display).
#' @param p A ggplot object in the style returned by \code{\link{rogme::plot_scat2}}.
#' @param sf A shift function for the 2 groups illustrated in p.
#' @param q_col Colour of the bars
#' @param q_width Length of the bars
#' @param q_size Thickness of the bars, except for the median
#' @param md_size Thickness of the median bar
#' @param alpha Alpha transparency
#' @param add_lab If TRUE, add labels for differences between extreme quantiles - default = FALSE
#'
#' @return A ggplot object
plotStackedDecileBars <- function(p,
                                  sf = sf,
                                  q_col = "grey21",
                                  q_width = 0.5,
                                  q_size = 0.5,
                                  md_size = 1,
                                  alpha = 1,
                                  add_lab = FALSE) {
  # create new variables ----------------------------------------
  g1 <- sf[[2]] # group 1 decile values
  g2 <- sf[[3]] # group 2 decile values
  q_seq <- sf[[1]]
  qn <- length(q_seq)
  # Make all bars q_size except the median (which is md_size).
  size_seq <- c(
    rep(q_size, floor(qn / 2)),
    md_size,
    rep(q_size, floor(qn / 2))
  )

  for (d in 1:qn) {
    # Group 1 (on top).
    p <- p + ggplot2::annotate(
      "segment",
      x = 2 - q_width / 2,
      xend = 2 + q_width / 2,
      y = g1[d],
      yend = g1[d],
      colour = q_col,
      alpha = alpha,
      size = size_seq[[d]]
    )

    # Group 2 (on bottom).
    p <- p + ggplot2::annotate(
      "segment",
      x = 1 - q_width / 2,
      xend = 1 + q_width / 2,
      y = g2[d],
      yend = g2[d],
      colour = q_col,
      alpha = alpha,
      size = size_seq[[d]]
    )
  }

  # Add labels for p10, p50, p90 deciles above top group.
  if (add_lab) {
    for (d in c(1, ceiling(qn / 2), qn)) {
      p <- p + ggplot2::annotate(
        "label",
        x = 2 + q_width / 2,
        y = g1[d],
        vjust = -0.1, # on top and bump up a little
        label = paste0("p", d, "0"), # p10, p50, p90
        fill = q_col,
        colour = "white",
        fontface = "bold",
        alpha = 0.5
      )
    }
  }

  return(p)
}

#' Add a single set of bars marking deciles to ggplot object.
#' @param p A ggplot object in the style returned by \code{\link{rogme::plot_scat2}}.
#' @param q Quantile information from rogme::quantiles_pbci
#' @param q_col Colour of the bars
#' @param q_width Length of the bars
#' @param q_size Thickness of the bars, except for the median
#' @param md_size Thickness of the median bar
#' @param alpha Alpha transparency
#' @param add_lab If TRUE, add labels for differences between extreme quantiles - default = FALSE
#'
#' @return A ggplot object
plotDecileBars <- function(p,
                           q = q,
                           q_col = "grey21",
                           q_width = 0.5,
                           q_size = 0.5,
                           md_size = 1,
                           alpha = 1,
                           add_lab = FALSE) {
  deciles <- q[[2]]
  q_seq <- q[[1]]
  qn <- length(q_seq)
  size_seq <- c(
    rep(q_size, floor(qn / 2)),
    md_size,
    rep(q_size, floor(qn / 2))
  )

  for (d in 1:qn) {
    # group 1 (on top)
    p <- p + ggplot2::annotate("segment",
      x = 1 - q_width / 2,
      xend = 1 + q_width / 2,
      y = deciles[d],
      yend = deciles[d],
      colour = q_col,
      alpha = alpha,
      size = size_seq[[d]]
    )
  }

  # add labels for p10, p50, p90 deciles above top group.
  if (add_lab) {
    for (d in c(1, ceiling(qn / 2), qn)) {
      p <- p + ggplot2::annotate("label",
        x = 1 + q_width / 2,
        y = deciles[d],
        vjust = -0.1, # on top and bump up a little
        label = paste0("p", d, "0"), # p10, p50, p90
        fill = q_col,
        colour = "white",
        fontface = "bold",
        alpha = 0.5
      )
    }
  }

  return(p)
}



# =================================================================================
#' Add bars marking quantiles + links between quantiles to ggplot object created
#' in the style of \code{\link{rogme::plot_scat2}}.
#'
#' @param p A ggplot object in the style returned by \code{\link{rogme::plot_scat2}}.
#' Used in README to demonstrate the shift function.
#' @param sf A shift function for the 2 groups illustrated in p.
#' @param q_col Colour of the bars
#' @param q_width Length of the bars
#' @param q_size Thickness of the bars, except for the median
#' @param md_size Thickness of the median bar
#' @param link_col Colour of the links between quantiles - default "darkviolet"
#'   for negative differences, "darkorange2" for postivie differences, q_col for
#'   zero difference
#' @param reverse_link_colors If TRUE, reverses the association of link_col with
#'   positive/negative - default = FALSE.
#' @param link_alpha Alpha transparency of the links between quantiles - default
#'   c(0.4, 1), maximum value for the median, decreasing towards the lowest
#'   value for the extreme quantiles.
#' @param add_rect Add rectangle marking the location of the quantiles in group 2.
#' @param rect_alpha Alpha transparency for the rectangle.
#' @param rect_col Colour for the rectangle
#' @param add_lab If TRUE, add labels on the extreme quantiles for the
#'   differences at that point - default = FALSE
#' @param labres Number of decimals for the labels - default = 2
#' @param label_unit String units for the labels - default = ""
#' @param text_size Size of the labels - default = 5
#' @param label_multiplier A multiplier that scales the labeled numbers on the
#'   plot without affecting the underlying data - default = 1.
#'
#' @export
plotDecileLinks <- function(p,
                            sf = sf,
                            q_col = "grey21",
                            q_width = 0.5,
                            q_size = 0.5,
                            md_size = 1,
                            link_col = c("darkviolet", q_col, "darkorange2"),
                            reverse_link_colors = FALSE,
                            link_alpha = c(0.4, 1),
                            add_rect = FALSE,
                            rect_alpha = NULL,
                            rect_col = NULL,
                            add_lab = FALSE,
                            labres = 2,
                            label_unit = "",
                            text_size = 5,
                            label_multiplier = 1) {
  if (reverse_link_colors) {
    link_col <- rev(link_col)
  }

  p <- plotStackedDecileBars(
    p,
    sf = sf,
    q_col = q_col,
    q_width = q_width,
    q_size = q_size,
    md_size = md_size,
    alpha = 1,
    add_lab = add_lab
  )

  # extract vectors from shift function -------------------------
  g1 <- sf[[2]] # group 1 deciles
  g2 <- sf[[3]] # group 2 deciles
  diff <- sf[[4]] # differences

  # create new variables ----------------------------------------
  # Scale and round value for display. Do first to not get ±0 on a label.
  label_values <- round(diff * label_multiplier, labres)
  # Convert sign into index into link_col
  diff_sign <- sign(label_values) + 2
  q_seq <- sf[[1]]
  qn <- length(q_seq)
  # Stair step counting from 1 up (by 1s) to midpoint, then back down to 1
  deco <- c(
    seq(1, floor(qn / 2) + 1),
    seq(floor(qn / 2), 1)
  )
  # Alpha value gradient from link_alpha[1] to link_alpha[2]. Indexed by deco.
  alpha_seq <- seq(
    link_alpha[1],
    link_alpha[2],
    length.out = floor(qn / 2) + 1
  )
  # Make all lines q_size except the median (which is md_size).
  line_size <- c(
    rep(q_size, floor(qn / 2)),
    md_size,
    rep(q_size, floor(qn / 2))
  )

  # add links ---------------------------------------------------
  for (d in 1:qn) {
    p <- p + ggplot2::annotate(
      "segment",
      # Start at top (group 1).
      x = 2 - q_width / 2,
      y = g1[d],
      # End at bottom (group 2)
      xend = 1 + q_width / 2,
      yend = g2[d],
      colour = link_col[diff_sign[d]],
      alpha = alpha_seq[deco[d]],
      size = line_size[d]
    )
  }

  # Add rectangle.
  if (add_rect == TRUE) {
    if (is.null(rect_alpha)) {
      rect_alpha <- 0.2
    }
    # TODO(bckenny): rect_col is unused
    if (is.null(rect_col)) {
      rect_col <- "grey30"
    }
    p <- p + ggplot2::annotate(
      "rect",
      xmin = 0.4,
      xmax = 1.25,
      ymin = g2[1],
      ymax = g2[qn],
      alpha = rect_alpha
    )
  }

  # Add labels for differences between extreme deciles and median.
  if (add_lab == TRUE) {
    for (d in c(1, ceiling(qn / 2), qn)) {
      label_value = label_values[d]
      # Add explicit sign for display.
      if (label_value < 0) {
        label_sign <- "-"
      } else if (label_value > 0) {
        label_sign <- "+"
      } else {
        label_sign <- ""
      }

      p <- p + ggplot2::annotate(
        "label",
        x = 1.5 - 0.1 * abs(q_seq[d] - 0.5),
        y = min(g1[d], g2[d]) + abs(g1[d] - g2[d]) / 2,
        label = paste0(label_sign, abs(label_value), label_unit),
        fill = link_col[diff_sign[d]],
        colour = "white",
        fontface = "bold",
        alpha = alpha_seq[deco[d]]
      )
    }
  }
  return(p)
}
# =================================================================================

#' Add difference labels to shift function.
#'
#' Add labels of quantile difference values to one or more shift function plots.
#' Used in the README.md file to illustrate the shift function. Assumes an odd
#' number of quantiles with the median in the middle.
#'
#' @param p A list of ggplot objects generated by \code{\link{plot_sf}} or \code{\link{plot_pbsf}}.
#' @param sf A list of data frames generated by \code{\link{shifthd}},
#'   \code{\link{shiftdhd}}, \code{\link{shifthd_pbci}} or
#'   \code{\link{shiftdhd_pbci}}.
#' @param labres Number of decimales for the labels - default = 2.
#' @param link_col Label colours for negative and positive values.
#' @param link_alpha Alpha transparency of the labels - default = continuum between 0.4 and 1.
#' @param y_lab_nudge Amount by which to nudge the labels along the y axis.
#' @param text_size Text size - default = 5
#' @param label_unit String units for the labels - default = ""
#'
#' @export
addSfLabels <- function(p,
                        sf,
                        labres = 2,
                        link_col = c("darkviolet", "darkorange2"),
                        link_alpha = c(0.4, 1),
                        y_lab_nudge = 0,
                        text_size = 5,
                        label_unit = "") {
  # check p and sf have same length
  if (length(p) != length(sf)) {
    stop("p and sf must have the same length")
  }
  # check p input is a list
  if (!is.list(p)) {
    stop("p must be a list")
  }
  # check sf input is a list of data frames
  if (!is.list(sf)) {
    stop("sf must be a list")
  }
  for (pc in 1:length(sf)) {
    if (!is.data.frame(sf[[pc]])) {
      stop("input sf list must contain data.frames")
    }
  }
  plist <- vector("list", length(p)) # declare list of plot objects
  for (pc in 1:length(sf)) {
    # extract vectors from shift function -------------------------
    if (names(sf[[pc]][1]) == "q") { # pbci shift function
      dec <- sf[[pc]][[1]]
      g1 <- sf[[pc]][[2]] # group 1 quantiles
      g2 <- sf[[pc]][[3]] # group 2 quantiles
      nq <- length(g1)
      deco <- c(seq(1, floor(nq / 2) + 1), seq(floor(nq / 2), 1)) # code of deciles
      alpha_seq <- seq(link_alpha[1], link_alpha[2], length.out = floor(nq / 2) + 1)
    } else { # pbse shift function
      dec <- seq(1, 9, 1) / 10
      g1 <- sf[[pc]][[1]] # group 1 deciles
      g2 <- sf[[pc]][[2]] # group 2 deciles
      deco <- c(seq(1, 5), seq(4, 1)) # code of deciles
      alpha_seq <- seq(link_alpha[1], link_alpha[2], length.out = 5)
    }
    diff <- sf[[pc]]$difference # differences
    lo <- sf[[pc]]$ci_lower # lower confidence intervals
    hi <- sf[[pc]]$ci_upper # upper confidence intervals

    # create new variables ----------------------------------------
    diff_sign <- (sign(diff) > 0) + 1 # difference signs c(-1,1) -> c(1,2)

    # add labels for alternating deciles
    for (d in seq(1, length(dec), by = 2)) {
      if (diff[d] < 0) { # negative difference
        y <- hi[d]
        vjust <- 0 - y_lab_nudge
      } else { # positive difference
        y <- lo[d]
        vjust <- 1 + y_lab_nudge
      }
      p[[pc]] <- p[[pc]] + ggplot2::annotate("label",
        x = g1[d],
        y = y,
        vjust = vjust,
        label = paste0("p", d, "0"), # paste0(round(diff[d],labres), label_unit),
        fill = link_col[diff_sign[d]],
        colour = "white",
        fontface = "bold",
        alpha = alpha_seq[deco[d]],
        size = text_size
      )
    } # quantile loop
  } # loop for list of ggplot objects
  return(p)
}
