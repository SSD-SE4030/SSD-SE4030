# ICare after-fix evidence

Only disposable synthetic databases on the dedicated assessment MongoDB container
are used by `verify.mjs`. Existing application `.env` files are not read by the
isolated backend process. The harness refuses a nonempty database and uses a new
random database name on each run, so no cleanup/reset route is needed.

`direct/` contains independent targeted HTTP/database tests, **not ZAP results**.
Top-level test results, when present, contain a fresh equivalent run through the
actual ZAP proxy. Do not add the two run totals together as independent coverage.
All response tokens and reset secrets are redacted in distributed evidence.

Approved infrastructure for this run:

- Docker container `icare-afterfix-mongo-20261016`, image `mongo:latest`, only
  `127.0.0.1:27028` published, tmpfs `/data/db`, no existing host data mounts.
- Official ZAP image `ghcr.io/zaproxy/zaproxy:bare`, scanner container
  `icare-afterfix-zap-20261016`, only `127.0.0.1:8091` published.
- Dedicated child backend on port 4021. ZAP's Docker host alias
  `host.docker.internal:4021` points to this local backend only.
- No spider or active scan is launched. External integrations are empty/disabled.

The official full image download was stopped because it included unnecessary
large browser layers. A Docker Hub mirror attempt was rejected by automatic
approval review and did not execute. Only the approved official GHCR image is
used for the actual scanner.

Replay requires explicit authorization for a fresh disposable container/database,
the recorded installed dependencies, and the same scope configuration. Never
point the harness at shared development or production. No raw ZAP session is
distributed because it would contain synthetic bearer tokens and reset requests.

No existing demo-order correction or historical card-data cleanup was performed.
Source hashes, Git identities and input-PDF hashes are recorded in manifest.json.
The scan context/queue state is recorded in zap-configuration.json. Container
versions, digest and isolation mapping are recorded in docker-environment.json.

After export, the two assessment-owned containers and anonymous volumes were
removed and assessment ports were confirmed closed (cleanup.json). The downloaded
images remain cached. The 53 actual HTTP exchanges are mapped to native ZAP
History IDs in http-exchanges.json; the 11 status-0 site-tree placeholders are
identified in zap-history-index.json and are not counted as transmitted requests.

Native reports were produced with export-zap.mjs using traditional-html and
traditional-pdf, filtered by both target site and context. Initial mapped-port API
troubleshooting caused setup-only connection warnings in global Insights; these
are explained in the assessment and are not application test failures.
