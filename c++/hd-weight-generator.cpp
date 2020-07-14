// Copyright 2020 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

#include <boost/math/special_functions/beta.hpp>
#include <boost/program_options.hpp>
#include <iostream>
#include <stdexcept>

// Use the Boost `ibeta` implementation to generate an array of weights for the
// Harrell-Davis quantile estimator.
//
// For an array `v` of length `l` and quantile `q`,
//   v[i] = I_x1(a, b) - I_x0(a, b)
// where
//   x0 = i / l
//   x1 = (i + 1) / l
//   a = l * q
//   b = l * (1 - q)
//   and I_x() is the regularized beta function.
//
// Harrell, F., & Davis, C. (1982). A New Distribution-Free Quantile Estimator.
// Biometrika, 69(3), 635-640. doi:10.2307/2335999
//
// By default, gives a tab-seperated-values (tsv) output on stdout, but can also
// output raw doubles as bytes, so can be piped as input to another program
// (e.g. into a JS TypedArray).

using ExtendedDouble = long double;
// Other options for checking with extended precision, but little difference
// unless comparison also in extended precision. Note: no float128.hpp in Clang.
// #include <boost/multiprecision/cpp_bin_float.hpp>
// using ExtendedDouble = boost::multiprecision::cpp_bin_float_50;

int main(int argc, char** argv) {
  int arr_length = 0;
  ExtendedDouble quantile = 0;

  // Output tab separated if true, binary if not.
  bool output_tsv = true;

  try {
    namespace po = boost::program_options;
    po::options_description desc("Options");
    desc.add_options()("help,h", "print help message")(
        "length,l", po::value<int>(&arr_length)->required(),
        "length of the target array")(
        "quantile,q", po::value<ExtendedDouble>(&quantile)->required(),
        "quantile to use")(
        "format,f", po::value<std::string>()->default_value("tsv"),
        "Output format: either 'tsv' or 'bin'. Defaults to 'tsv'.");

    po::variables_map vm;
    po::store(po::parse_command_line(argc, argv, desc), vm);

    if (vm.count("help")) {
      std::cout << "Print a Harrell-Davis quantile estimator weight array.\n"
                << desc << "\n";
      return 1;
    }

    if (vm.count("format")) {
      std::string output_format = vm["format"].as<std::string>();
      if (output_format == "bin") {
        output_tsv = false;
      } else if (output_format != "tsv") {
        throw po::validation_error(po::validation_error::invalid_option_value,
                                   "format");
      }
    }

    // Ensure we have > double precision.
    int max_digits_10 = std::numeric_limits<ExtendedDouble>::max_digits10;
    if (max_digits_10 < 21) {
      throw std::runtime_error(
          "Insuffient precision available for calculation");
    }

    // Notify about missing arg(s) after --help, checking --format, etc.
    po::notify(vm);
  } catch (std::exception& e) {
    std::cerr << "Error: " << e.what() << "\n";
    return 1;
  }

  if (output_tsv) {
    // Column headers for tsv.
    std::cout << "index\tvalue"
              << "\n";
    // Make sure enough digits of the upcoming numbers are printed.
    std::cout << std::setprecision(
        std::numeric_limits<ExtendedDouble>::max_digits10);
  }

  ExtendedDouble a = arr_length * quantile;
  ExtendedDouble b = arr_length * (1 - quantile);
  ExtendedDouble total = 0;

  for (int i = 0; i < arr_length; i++) {
    ExtendedDouble start =
        boost::math::ibeta(a, b, i / (ExtendedDouble)arr_length);
    ExtendedDouble end =
        boost::math::ibeta(a, b, (i + 1) / (ExtendedDouble)arr_length);
    ExtendedDouble value = end - start;
    total += value;

    if (output_tsv) {
      std::cout << i << "\t" << value << "\n";
    } else {
      // Only write doubles (not higher precision) to stdout so they can be
      // imported in JS.
      // Uncomment for boost::multiprecision.
      // double d_value = value.convert_to<double>();
      double d_value = (double)value;
      std::cout.write(reinterpret_cast<char*>(&d_value), sizeof d_value);
    }
  }

  if (output_tsv) {
    std::cerr << std::setprecision(
                     std::numeric_limits<ExtendedDouble>::max_digits10)
              << "Complete with a total of " << std::setprecision(20) << total
              << "\n";
  }
}
