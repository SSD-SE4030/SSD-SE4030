# Fresh native ZAP report

Evaluated HEAD: 2aa4b8f4a0a923c6e54ac092fe6ad20ec48556d7, with preserved local UI edits (see hashes).
Date: Friday, 16 October 2026 at 19:03:08 GMT+5:30.

ICare_ZAP_Fresh_Report.pdf and .html are direct ZAP 2.17.0 native traditional-pdf/traditional-html exports, filtered to the isolated target/context. This README and run-summary.json are independently authored notes. The earlier reports are preserved unchanged.

Targeted tests: 52/52 passed. Native passive alert TYPES: {"High":1,"Medium":3,"Low":1,"Informational":1}. Total passive instances: 39. These count different evidence categories; passing targeted tests does not clear dependency/CSP alerts.

Assets from the new frontend build were requested in this scan, so scan coverage differs from the older report. Library-version alerts do not establish exploitability in each actual use context. Timestamps can be code constants. CSP is present but permissive. See run-summary.json for triage and limitations.

No shared databases or original demo order were changed. All positive mutations used synthetic disposable fixtures. No external integrations, spider or active scan. Sanitized HTTP exchanges are mapped to actual ZAP History IDs. Reproduction scripts refuse nonempty assessment databases; they do not load the existing backend .env. Native sessions are not distributed because they contain synthetic authentication requests.

Security source/dependencies were not modified during this scan. Backend security.test.js passed 11 tests; this is not a claim that all local test files were executed. The frontend was rebuilt. Assessment containers/data are removed after report export; see cleanup.json.
