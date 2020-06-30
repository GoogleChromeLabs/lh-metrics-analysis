cmake_minimum_required(VERSION 3.15)
project(BoostSpecialFunctions)

# Default to Release.
IF(NOT CMAKE_BUILD_TYPE)
  SET(CMAKE_BUILD_TYPE Release)
ENDIF(NOT CMAKE_BUILD_TYPE)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED True)

# work around brew Boost install issue:
# https://github.com/boostorg/boost_install/issues/13
set(Boost_USE_MULTITHREADED FALSE)

# Add boost include paths and libraries.
find_package(Boost 1.72 COMPONENTS program_options REQUIRED)
include_directories(SYSTEM ${Boost_INCLUDE_DIR})
link_directories(${Boost_LIBRARY_DIRS})

# Add the executables.
add_executable(hd-weight-generator hd-weight-generator.cpp)
target_link_libraries(hd-weight-generator ${Boost_LIBRARIES})

add_executable(ibeta-derivative-check ibeta-derivative-check.cpp)
target_link_libraries(ibeta-derivative-check ${Boost_LIBRARIES})
