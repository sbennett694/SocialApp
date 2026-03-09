# SocialApp AI Rules

This file defines the operating rules for AI assistants working on SocialApp.

All AI agents (ChatGPT threads, Cline, etc.) must follow these rules.

These rules override suggestions from AI unless explicitly changed by the project owner.

---

# AI Roles

There are three AI roles in this project.

## Architect

Responsible for:
- architecture decisions
- prompt design
- system evolution
- feature sequencing

The Architect defines prompts like:

Prompt-047  
Prompt-051  
Prompt-056B  

Prompt numbering is authoritative.

Other AI must not renumber or redesign prompts.

---

## Implementer

The Implementer (Cline) executes prompts.

Responsibilities:
- implement code
- modify files
- run typecheck/build
- report results

Implementers must not redesign architecture.

---

## Reviewer

Reviewer AI threads:
- review code output
- identify bugs
- confirm architecture alignment

Reviewers must not introduce new architecture directions.

They answer only:

A. Is implementation complete, partial, or broken?  
B. What is the smallest corrective action?  
C. What files are affected?

---

# Product Philosophy

SocialApp is not a traditional social media platform.

Primary focus:
- collaboration
- clubs
- projects
- accountability
- real-world activity

The feed is derived activity, not the core product.

---

# Core Entities

User  
Club  
Project  
Milestone  
Task  
FeedEvent  
ClubHistoryEvent  
Notification  
ClubEvent  

---

# Club Governance

Roles:

Founder  
Owner  
Moderator  
Member  

Rules:

Founder is historical identity only.

Operational authority comes from:

Owner  
Moderator  

Founder alone does not grant administrative permissions.

---

# Club History

Governance actions generate append-only records.

Entity:

ClubHistoryEvent

Examples:

OWNERSHIP_TRANSFERRED  
MODERATOR_ADDED  
PROJECT_CREATED_FOR_CLUB  

---

# Project Ownership

Projects may be owned by:

User  
Club  

Creator accountability is preserved using:

Project.createdBy

---

# Notification Philosophy

Notifications must remain minimal.

Valid examples:
- ownership transferred to you
- role change affecting you
- project request approval/rejection
- direct interaction

Avoid activity spam.

---

# ClubEvent System

Events are a canonical entity.

ClubEvent

Events are not feed posts.

Feed activity may be derived later, but the event entity is the source of truth.

---

# ClubEvent MVP Model

Allowed fields:

id  
clubId  
title  
description (optional)  
startAt  
endAt (optional)  
locationText (optional)  
visibility  
status  
createdBy  
createdAt  
updatedAt  

Visibility values:

CLUB_MEMBERS  
PUBLIC_CLUB  

Status values:

SCHEDULED  
CANCELED  

---

# ClubEvent MVP Constraints

The following features are excluded from MVP:

RSVP  
attendees  
capacity  
reminders  
recurring events  
FeedEvent generation  

These may be implemented in future phases.

---

# Event Permissions

Allowed roles for event creation/editing:

Owner  
Moderator  

Members cannot create events in MVP.

Founder alone does not grant permission.

---

# Event Routes

MVP routes:

GET /clubs/:clubId/events  
POST /clubs/:clubId/events  
PATCH /clubs/:clubId/events/:eventId  
PATCH /clubs/:clubId/events/:eventId/cancel  

Avoid introducing global `/events` routes unless necessary.

---

# Club History Integration

Event lifecycle actions must generate history records:

CLUB_EVENT_CREATED  
CLUB_EVENT_UPDATED  
CLUB_EVENT_CANCELED  

---

# Feed Integration

Feed events must not be generated from events in MVP.

Feed projections may be added later.

---

# Prompt Workflow

Prompts execute sequentially.

Example sequence:

056 – Club Events Design  
056B – ClubEvent Backend Foundation  
056C – Events Tab UI  
056D – Home Upcoming Events Card  

AI assistants must not invent new prompt numbers.

---

# Scope Discipline

When implementing prompts:

- keep scope limited
- avoid unrelated refactors
- avoid seed system changes unless explicitly requested
- avoid architecture redesign

---

# Build Health Rule

Architecture review should only occur when the backend builds successfully.

Example command:

npm --prefix backend run build

Broken builds must be fixed with minimal cleanup.

---

# AI Review Mode

When reviewing Cline output, reviewers should answer only:

A. Is the implementation complete, partial, or broken?  
B. What is the smallest fix required?  
C. Which files are affected?

Reviewers should not redesign the feature unless explicitly asked.

---

# End of AI Rules