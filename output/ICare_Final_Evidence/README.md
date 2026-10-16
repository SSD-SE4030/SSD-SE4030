# Final ICare VIVA-01 through VIVA-12 verification

Exactly 12 original vulnerabilities were manually retested through actual OWASP
ZAP 2.17.0, using new synthetic Alice/Bob/admin accounts and a disposable MongoDB
container. Results: 12 PASS, 0 FAIL, 0 NOT VERIFIED. There are 44 manual HTTP
requests within those 12 cases and 9 additional passive frontend coverage requests.
All 53 actual requests are mapped to authentic numeric ZAP History IDs.

## Which files are authored and which are native

- `../ICare_Final_12_Vulnerabilities_ZAP_Report.pdf`: independently authored
  academic manual verification report, generated from the captured evidence.
- `../ICare_Final_ZAP_Native_Report.pdf` and `.html`: genuine target-filtered
  ZAP traditional-pdf/traditional-html exports. No manual results were inserted
  as automatic alerts. No credentials were found in the distributed exports.
- `../ICare_Final_12_Test_Results.csv`: exactly 12 manual-result rows.
- `cases.json`: original/expected/actual results, state checks and timestamps.
- `http-exchanges.json`: sanitized responses, roles, methods, endpoints and IDs.
- `zap-history-mapping.json`: authentic History IDs linked using a unique
  X-ICare-Evidence header, method, endpoint and returned status.
- `source-snapshot.json`: HEAD, branch, remote reference, uncommitted Git status,
  SHA-256 source and compiled-build hashes. `source-unchanged.json` verifies the
  evaluated application/build was unchanged by testing.
- `reference-reports.json`: exact paths, hashes and page extracts of the provided
  academic report and the two earlier retest reports. Earlier passes were not
  reused as proof of this run.

## Isolation and cleanup

The child backend used an empty runtime directory and a restricted environment;
it did not load the existing backend .env. MongoDB was a new labelled container
published only on 127.0.0.1:27028, with tmpfs database/config storage. A random
database name and zero initial collections were checked before model import or
fixture creation. External integrations were disabled. No seed route, real email,
payment provider, external OAuth, shared database or original demo record was used.

Only the two assessment-owned labelled containers were removed after export.
Assessment ports 4021/8091/27028 were confirmed closed. See cleanup.json and
container-isolation.json. Cached images remain installed.

## Replay prerequisites

Replay only with approval for fresh disposable infrastructure and the same
source/dependency snapshot. `configure-zap.mjs` restricts passive scanning to
http://host.docker.internal:4021 (Docker's alias for the dedicated local backend).
Run `verify-final12.mjs` only with the recorded fresh MongoDB/ZAP ports available.
It refuses a nonempty database and generates ephemeral secrets. External-service
environment settings remain empty. No spider/active scan is started.

An initial mapping check encountered unsent status-0 site-tree placeholders.
`recover-evidence.mjs` resolved the index using actual unique request markers;
it made no application requests and no database writes. See indexing-note.json.
The replay harness has the placeholder exclusion applied.

`export-zap.mjs` calls the actual reports API. It writes separate native HTML/PDF
names inside the scanner container to avoid the PDF renderer replacing its HTML
temporary file. Copy those outputs before deleting assessment containers.
`build-final-report.py` requires the previously approved temporary PDF libraries
and cleanup evidence; it authors the academic PDF/CSV, not the native ZAP PDF.

## Important limits

Passing these 12 original cases does not establish complete application security.
Native output still includes JS-library and permissive-CSP alerts; timestamp
signatures need context and informational auth/session/SPA alerts are not exploits.
Library advisory applicability was not independently demonstrated. Historical card
records/backups, concurrent reset/payment races, external integrations and full
browser workflows were not verified or changed. Native sessions are not included
because they contain synthetic credentials; sanitized evidence is distributed.
