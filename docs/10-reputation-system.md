# ProSocial Reputation System

## Purpose

The ProSocial reputation system recognizes meaningful contributions to the community.

Unlike traditional social media metrics such as likes, followers, and views, reputation in ProSocial is meant to be earned through:
- helping others
- contributing to projects
- completing milestones
- volunteering
- sharing knowledge in context

This system should reinforce the core product philosophy:

**impact > attention**

## Product Goals

1. Reward contribution, not popularity.
2. Create trust signals that help users identify reliable collaborators.
3. Encourage real social interaction by tying recognition to shared work.
4. Make profiles more useful for finding people to work with.
5. Avoid turning the app into a vanity-metric competition.

## Core Components

### 1. Skill Tags
Users can add skill tags to their profile.

Examples:
- coding
- design
- photography
- carpentry
- organizing
- marketing

Skill tags are not reputation by themselves. They are claims of ability or interest.

### 2. Skill Endorsements
Other users can endorse a specific skill.

Recommended v1 rules:
- each user may endorse a given skill for another user once
- endorsement scale is 1 to 3 stars
- endorsers may change their rating later
- endorsements should only be allowed when there is meaningful prior interaction

Examples of meaningful prior interaction:
- shared club membership
- same project participation
- same milestone or task collaboration
- direct volunteer/help interaction

### 3. Contribution Metrics
Profiles should show real activity metrics, such as:
- projects helped
- milestones contributed to
- tasks completed
- volunteer responses
- volunteer accepts
- praises received

These metrics make endorsements more credible by grounding them in visible contribution.

### 4. Praise Tokens
Users can give limited praise to other users.

Recommended v1 rules:
- users receive a finite number of praises per time window
- praise should require a reason or context
- praise should be tied to a contribution, not generic admiration

Example contexts:
- helped on a project
- answered a question
- completed an important milestone
- gave useful feedback
- volunteered when needed

The purpose of praise tokens is to make appreciation meaningful rather than infinite and disposable.

### 5. Impact Summary
Profiles may show an “Impact” section instead of a generic popularity score.

Examples:
- Projects contributed: 8
- People helped: 22
- Volunteer responses: 14
- Praises received: 19
- Milestones completed: 12

This should function as a social trust and contribution summary.

## Guardrails

### Prevent reputation farming
Avoid reward loops such as:
- reciprocal praise trading
- repeated praise between the same two users
- endorsements without meaningful interaction
- spammy micro-contributions purely to inflate metrics

### Keep context visible
Recognition should ideally preserve context:
- what skill was endorsed
- what project or milestone the praise referred to
- what action contributed to the impact total

### Do not over-optimize for gamification
The system should encourage contribution, but should not pressure users into compulsive metric chasing.

## Recommended UX Direction

### Profile Sections
- Skills
- Endorsements
- Impact
- Contributions
- Praise received

### Example Profile Snapshot
- UI Design ★★★ (27 endorsements)
- Photography ★★☆ (15 endorsements)
- Organizing ★★☆ (9 endorsements)

Impact
- Projects helped: 11
- Milestones completed: 19
- Praises received: 32
- Volunteer responses: 14

## Suggested Implementation Order

1. Skill endorsements
2. Contribution metrics
3. Praise tokens
4. Guardrails / anti-abuse rules
5. Impact profile UI

## Testing Philosophy

This feature set needs meaningful tests, not placeholder tests.

Tests should verify:
- data integrity
- eligibility rules
- anti-abuse rules
- aggregation correctness
- visible profile behavior
- correct permission boundaries

Important: tests should use realistic collaboration scenarios rather than trivial mocks whenever possible.
