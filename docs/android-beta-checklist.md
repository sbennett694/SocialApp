# Android-First Beta Hardening Checklist

## Product/Policy
- [ ] Community guidelines published in-app and on web landing page
- [ ] “No political content” examples shown in composer/help UI
- [ ] Appeal flow copy drafted for false positives

## App Quality
- [ ] Empty/loading/error states verified on feed + create post
- [ ] Offline/network error behavior verified
- [ ] Crash reporting added (Sentry or equivalent)

## Moderation
- [ ] Political term list reviewed and expanded
- [ ] Moderation decision logging enabled (reason, term match, timestamp)
- [ ] Regression tests for obvious bypass patterns (spacing, hashtags, casing)

## Backend/Security
- [ ] Dev/prod environment separation verified
- [ ] Auth mode switched from `mock` to Cognito in integration branch
- [ ] API authorization checks enabled for write endpoints

## Cost Controls
- [ ] AWS budget alerts set to $10/$25/$40/$50
- [ ] CloudWatch log retention set to 7–14 days in dev
- [ ] S3 lifecycle rule active for stale media assets

## Release Readiness
- [ ] Android internal testing build distributed
- [ ] Smoke test pass: sign-in, feed, create post, moderation block
- [ ] Rollback plan documented
