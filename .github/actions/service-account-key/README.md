<!--
 Copyright 2020 Google LLC

 Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in
 compliance with the License. You may obtain a copy of the License at

        https://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software distributed under the License
 is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
 implied. See the License for the specific language governing permissions and limitations under the
 License.
-->

# service-account-key

_Based on the `service_account_key` handling in **[GoogleCloudPlatform/github-actions/setup-gcloud](https://github.com/GoogleCloudPlatform/github-actions/tree/810967113855592107304fe445a26e8822800b1a/setup-gcloud)** (with all the Google Cloud SDK parts removed) for actions using the Google Cloud client libraries (and don't need the full SDK). If you're doing real Google Cloud stuff, you should probably use the real actions from that repo._

Ths action takes a Google Cloud [service account key](https://cloud.google.com/iam/docs/service-accounts) JSON saved in a [GitHub secret](https://help.github.com/en/actions/configuring-and-managing-workflows/creating-and-storing-encrypted-secrets), writes it to a file in the actions workspace, and puts the filepath in the `GOOGLE_APPLICATION_CREDENTIALS` environment variable so it's available to Google Cloud client libraries as [Application Default Credentials](https://cloud.google.com/docs/authentication/production#finding_credentials_automatically).


## Dev

- `yarn`
- `yarn build`

## Setup
- use [`actions/checkout@v2`](https://github.com/actions/checkout) in your action: exporting default credentials requires `@v2`. The `@v1` tag is not supported and will not work.
- set up a [Google Cloud service account](https://cloud.google.com/iam/docs/creating-managing-service-accounts).
- get the service account key which will be used for authentication. The json file should be
  - [created](https://cloud.google.com/iam/docs/creating-managing-service-account-keys) and downloaded,
  - encoded as a Base64 string (eg. `cat my-key.json | base64` on a mac), and
  - stored as a Github [secret](https://help.github.com/en/actions/automating-your-workflow-with-github-actions/creating-and-using-encrypted-secrets) (e.g. `GCP_SA_KEY`).

## Usage

```yaml
steps:
- uses: actions/checkout@v2
- uses: brendankenny/github-actions/service-account-key@master
  with:
    service_account_key: ${{ secrets.GCP_SA_KEY }}
- run: npm run cloud-testy-thing
```

## Inputs

- `service_account_key` (required): The name of the service-account-key secret.
