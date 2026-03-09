This file provides context only. Canonical architecture is defined in docs/architecture.md.

# SocialApp AI Context

This document provides architectural and project context for AI assistants working on SocialApp.

This file should be read together with:

docs/AI_RULES.md

AI_CONTEXT explains the **current system state**.
AI_RULES defines **how AI must behave while working on the system**.

---

# Canonical Architecture Documents

The authoritative system design lives in:

docs/architecture.md  
docs/data-model.md  

If implementation details conflict with assumptions in this AI context file, the architecture documents take precedence.

---

# Product Philosophy

SocialApp is **not designed as a traditional social media platform**.

Primary focus:

- collaboration
- accountability
- clubs
- projects
- real-world progress

The feed exists only as **derived activity**, not as the core product experience.

---

# Current Core Systems

The following systems are implemented:

Club governance system  
Club history audit timeline  
Project ↔ club linking lifecycle  
Notification system  
Seed data system for deterministic dev environment  
Creator accountability for club-owned projects

---

# Core Entities

Current backend entities:

User  
Club  
Project  
Milestone  
Task  
FeedEvent  
ClubHistoryEvent  
Notification  

Upcoming entity:

ClubEvent

---

# Club Governance Model

Clubs use structured roles:

Founder  
Owner  
Moderator  
Member  

Important rule:

Founder is **immutable identity only**, not an operational role.

Operational permissions belong to:

Owner  
Moderator  

---

# Club History System

Clubs maintain an append-only governance timeline:

ClubHistoryEvent

Examples include:

CLUB_CREATED  
OWNERSHIP_TRANSFERRED  
MODERATOR_ADDED  
PROJECT_CREATED_FOR_CLUB  

---

# Project Ownership Model

Projects can be owned by:

User  
Club  

Creator accountability is preserved using:

Project.createdBy

This ensures club-owned projects still show who created them.

---

# Notification Philosophy

Notifications are intentionally minimal.

They should only trigger for **personally meaningful events**, such as:

ownership transferred to you  
role changes affecting you  
project request approvals/rejections  

Avoid notification spam.

---

# Development Environment

Local stack:

React Native mobile frontend  
Node / Express backend  
In-memory store  
Deterministic seed data  

The dev environment is intentionally designed to be:

reproducible  
resettable  
fast to iterate on  

---

# Current Feature Work

Active feature area:

Club Events / Calendar system

New entity:

ClubEvent

This will support coordination within clubs such as:

meetings  
build sessions  
game nights  
planning sessions  
demo events  

ClubEvent will be implemented as a **canonical entity**, not a feed post.

---

# Event System Direction

Events should follow this model:

ClubEvent (source of truth)

Derived projections may later include:

FeedEvent  
Notifications  
ClubHistoryEvent  

But the canonical data remains the event entity.

---

# Current Prompt Sequence

056 – Club Events design  
056B – ClubEvent backend foundation  
056C – Events tab UI  
056D – Home upcoming events card  

Prompts execute sequentially.

AI must not invent new prompt numbers.

---

# AI Assistant Expectations

When assisting development:

- follow docs/AI_RULES.md
- avoid redesigning architecture
- respect existing prompt sequence
- keep implementation scope small and incremental