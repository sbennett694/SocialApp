# SocialApp AI Limits

This document defines **hard limits** for AI assistants working on SocialApp.

These limits exist to prevent architectural drift, hallucinated systems, and unnecessary refactors.

If a request would violate these limits, the AI must ask for clarification instead of improvising.

---

# 1. Do Not Invent New Core Entities

AI assistants must not introduce new core entities unless explicitly requested.

Current known entities:

User  
Club  
Project  
Milestone  
Task  
FeedEvent  
ClubHistoryEvent  
Notification  
ClubEvent  

Do not propose new entities such as:

Activity  
Timeline  
GroupEvent  
EventRSVP  
Attendance  

unless explicitly requested in a prompt.

---

# 2. Do Not Introduce New Global Routes

The backend API structure should remain consistent with existing patterns.

Avoid introducing routes like:

/events  
/activity  
/timeline  

unless the architecture documents explicitly require them.

Club-scoped routes should remain preferred.

Example:

/clubs/:clubId/events

---

# 3. Do Not Redesign Existing Systems

AI assistants must not redesign:

Club governance model  
Notification system  
ClubHistory system  
Project ownership model  

These systems are already implemented and considered stable.

---

# 4. Do Not Expand Prompt Scope

When implementing prompts:

- do not add unrelated features
- do not refactor unrelated files
- do not modify seed systems unless requested
- do not introduce new architecture layers

Focus only on the prompt's requested behavior.

---

# 5. Avoid Premature Feature Expansion

Do not add advanced features unless explicitly requested.

Examples of prohibited early expansions:

RSVP systems  
attendance tracking  
calendar recurrence  
event reminders  
feed projections from events  

These may be added in later phases.

---

# 6. Respect Prompt Sequencing

Prompts execute sequentially.

Example sequence:

056 – Club Events Design  
056B – ClubEvent Backend Foundation  
056C – Events Tab UI  
056D – Home Upcoming Events Card  

AI assistants must not invent new prompt numbers or skip prompt stages.

---

# 7. When Uncertain, Ask

If a task conflicts with these limits:

Stop and ask for clarification instead of guessing.

---

# End of AI Limits