# SocialApp MVP Blueprint (Positivity + No Politics)

This document translates product requirements into a concrete implementation blueprint for local-first development and later AWS deployment.

## Core principles
- Hobby-focused and constructive by design.
- Political content and extremism are prohibited.
- Discovery should prioritize friendly/helpful interactions, not argument-heavy dynamics.

## Relationship model
- **Follow**: one-way relationship.
- **Close Circle**: invite + acceptance required.
- Feed visibility depends on post `visibility`:
  - `FOLLOWERS`
  - `CLOSE_CIRCLE`
  - `CLUB`
  - `PROJECT`
  - `PUBLIC` (optional)

## Interaction model
- Positive reactions only:
  - `INSPIRED`, `HELPFUL`, `BEAUTIFUL`, `MADE_ME_SMILE`, `GREAT_IDEA`
- Threaded conversation types:
  - `COMMENTS`, `QUESTIONS`, `THANK_YOU`, `SUGGESTIONS`
- Reply-depth guardrails:
  - non-close-circle users can post top-level comments
  - deeper replies restricted by relationship policy

## Clubs + Projects
- Clubs are category-controlled from an allowed taxonomy.
- Projects allow free-text titles but require category binding.
- Projects can be shared into clubs.

## Moderation
- Block political/extremism content at submission-time where clear.
- Report reasons:
  - `POLITICAL_CONTENT`, `EXTREMISM_OR_HATE`, `HARASSMENT`, `OFF_TOPIC`, `SPAM`
- Soft actions first:
  - `HIDE_FROM_DISCOVERY`, `CONTENT_WARNING`, `TEMP_SUSPEND`, `BAN`, `RESTORE`

## Discovery (MVP)
- Clubs (chronological)
- New creators
- Today’s Wins
- Search by category/club/project

## Implementation sequencing (recommended)
1. Domain schema + policy layer (visibility, reply-depth)
2. Controlled category + tag seed data
3. Follow + close-circle APIs
4. Club + project APIs
5. Threaded comments + reactions
6. Reports + moderation action log + admin queue
7. Discovery endpoints
