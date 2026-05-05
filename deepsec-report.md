# DeepSec Report

- Tool: DeepSec 1.1.13
- Project: vibebook
- Scan run: 20260505160420-e03c04559ddf9613
- Status: completed
- Candidate count: 48
- Critical findings: 0
- High findings: 0
- Medium findings: 0
- Low findings: 0

## Scope

- backend/src/
- frontend/src/

## Issues

No analyzed findings were exported by DeepSec.

## Notes

The native Windows scan hit a DeepSec path separator issue (`Invalid filePath: contains backslash`), so the scan was run successfully from WSL against the same repository. `deepsec export --format json --project-id vibebook --out deepsec-report.json` returned zero findings. The built-in `deepsec report` command requires `deepsec process` before it can emit an analyzed report.
