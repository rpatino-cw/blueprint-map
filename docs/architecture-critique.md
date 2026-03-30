# Blueprint Map — Architecture Critique

**Date:** 2026-03-30
**Status:** Action items tracked below

## Priority Issues

| # | Issue | Status | Severity |
|---|-------|--------|----------|
| 1 | No parser tests | IN PROGRESS | High |
| 2 | Script loading — no onerror handler | TODO | Medium |
| 3 | No error boundary around parse/render | TODO | Medium |
| 4 | State management undocumented | TODO | Low |
| 5 | No staging gate (push = deploy) | TODO | Low |

## Minor Items

- [ ] Add favicon
- [ ] Self-host Google Fonts (corp firewall risk)
- [ ] Add sanitized domain knowledge docs
- [ ] Add minimal package.json with npm test
- [ ] Note in UI that API key is stored in localStorage only
- [ ] Make PNG export scale configurable (currently hardcoded 2x)

## Architecture Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Simplicity | A | Zero deps, ~95 KB total, works offline |
| Correctness | B- | Parser works but no tests to prove it |
| Resilience | C | No error handling, no fallbacks |
| Deployability | B | GitHub Pages works, no staging gate |
| Maintainability | B | Well-structured passes, no tests/docs |
| Scalability | C+ | SVG will choke on 5000+ rack sites |
| Security | B+ | API key client-only, no backend, no PII |
