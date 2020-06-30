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

// Check values of Boost's `ibeta_derivative` implementation using double
// precision (same as JS).
// https://www.boost.org/doc/libs/1_73_0/libs/math/doc/html/math_toolkit/sf_beta/beta_derivative.html

using NumberType = double;
// Other options for checking with extended precision:
// #include <boost/multiprecision/cpp_bin_float.hpp> // float128.hpp doesn't
// work in Clang. using NumberType = boost::multiprecision::cpp_bin_float_50;
// using NumberType = long double;

int main(int argc, char** argv) {
  // Parameters for the derivative of the regularized incomplete beta function.
  NumberType a = 0;
  NumberType b = 0;
  NumberType x = 0;

  try {
    namespace po = boost::program_options;
    po::options_description desc("Options");
    desc.add_options()("help,h", "print help message")(
        "a,a", po::value<NumberType>(&a)->required(), "parameter a")(
        "b,b", po::value<NumberType>(&b)->required(), "parameter b")(
        "x,x", po::value<NumberType>(&x)->required(), "parameter x");

    po::positional_options_description pos_options;
    pos_options.add("a", 1).add("b", 1).add("x", 1);

    po::variables_map vm;
    po::store(po::command_line_parser(argc, argv)
                  .options(desc)
                  .positional(pos_options)
                  .run(),
              vm);

    if (vm.count("help")) {
      std::cout << "Calculate ∂/∂x I_x(a, b) in double precision.\n"
                << "Usage:\n"
                << "  " << argv[0] << " <a> <b> <x>\n"
                << "  " << argv[0] << " --help\n";
      return 1;
    }

    // Notify about missing arg(s) after --help.
    po::notify(vm);
  } catch (std::exception& e) {
    std::cerr << "Error: " << e.what() << "\n";
    return 1;
  }

  std::cerr << "ibeta_derivative(" << a << ", " << b << ", " << x << ")\n";

  std::cout
      // Make sure enough digits are printed.
      << std::setprecision(std::numeric_limits<NumberType>::max_digits10)
      << boost::math::ibeta_derivative(a, b, x) << "\n";
}
