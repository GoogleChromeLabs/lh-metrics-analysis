# lh-metrics-analysis [![CI Status](https://github.com/googlechromelabs/lh-metrics-analysis/workflows/CI/badge.svg)](https://github.com/googlechromelabs/lh-metrics-analysis/actions?query=workflow%3ACI) [![Coverage Status](https://img.shields.io/codecov/c/github/googlechromelabs/lh-metrics-analysis)](https://codecov.io/gh/googlechromelabs/lh-metrics-analysis/branch/master)

Tools to analyze trends in HTTP Archive's Lighthouse data.

This is not an officially supported Google product.

### Setup

- `yarn`
- Enable BigQuery and setup a Google Cloud [service account](https://cloud.google.com/iam/docs/service-accounts)
- Download a [service account key](https://cloud.google.com/iam/docs/creating-managing-service-account-keys)
- set [`GOOGLE_APPLICATION_CREDENTIALS` to that path](https://cloud.google.com/docs/authentication/production#finding_credentials_automatically) for it to be used automatically
