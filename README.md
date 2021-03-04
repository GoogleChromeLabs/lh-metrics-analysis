# lh-metrics-analysis [![CI Status](https://github.com/googlechromelabs/lh-metrics-analysis/workflows/CI/badge.svg)](https://github.com/googlechromelabs/lh-metrics-analysis/actions?query=workflow%3ACI) [![Coverage Status](https://img.shields.io/codecov/c/github/googlechromelabs/lh-metrics-analysis)](https://codecov.io/gh/googlechromelabs/lh-metrics-analysis/branch/master)

Tools to analyze trends in HTTP Archive's Lighthouse data.

This is not an officially supported Google product.

### Setup

- `yarn`
- Enable BigQuery and set up a Google Cloud [service account](https://cloud.google.com/iam/docs/service-accounts)
- Download a [service account key](https://cloud.google.com/iam/docs/creating-managing-service-account-keys)
- set `GOOGLE_APPLICATION_CREDENTIALS` to the key file's path for it [to be used automatically](https://cloud.google.com/docs/authentication/production#finding_credentials_automatically)

### Testing

To be able to run the tests:
- create a `test_lh_extract` dataset in your BigQuery project
- make the service account from above at least a [`BigQuery Job User`](https://cloud.google.com/bigquery/docs/access-control#bigquery)
- give the service account [`BigQuery Data Editor`](https://cloud.google.com/bigquery/docs/access-control#bigquery) access to _just_ (or at least) the `test_lh_extract` dataset
- consider limiting the BigQuery quota to the test account, just in case, though this may require creating a separate Cloud project used only for testing.

Service accounts should be given the minimum permissions needed. For more about the service account roles, see the [BigQuery predefined roles docs](https://cloud.google.com/bigquery/docs/access-control#bigquery).

---

## Monthly reports on HTTP Archive Lighthouse results

### 2020
- [**July 2020**](2020-07/report.md)
- [**August 2020**](2020-08/report.md)
- [**September 2020**](2020-09/report.md)
- [**October 2020**](2020-10/report.md)
- [**November 2020**](2020-11/report.md)
- [**December 2020**](2020-12/report.md)

### 2021
- [**January 2021**](2021-01/report.md)
- [**February 2021**](2021-02/report.md)
