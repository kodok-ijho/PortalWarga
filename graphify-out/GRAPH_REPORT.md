# Graph Report - docs/production/n8n-workflows  (2026-08-01)

## Corpus Check
- Corpus is ~8,127 words - fits in a single context window. You may not need a graph.

## Summary
- 84 nodes · 81 edges · 3 communities
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Payment Monitoring
- User Administration API
- Event API

## God Nodes (most connected - your core abstractions)
1. `jsonHeaders` - 1 edges
2. `eventsWebhook` - 1 edges
3. `extractBearerToken` - 1 edges
4. `tokenPresent` - 1 edges
5. `verifyAppJwt` - 1 edges
6. `validateAppClaims` - 1 edges
7. `claimsValid` - 1 edges
8. `fetchActorProfile` - 1 edges
9. `authorizeActor` - 1 edges
10. `actorAuthorized` - 1 edges

## Surprising Connections (you probably didn't know these)
- None detected - all connections are within the same source files.

## Import Cycles
- None detected.

## Communities (3 total, 0 thin omitted)

### Community 0 - "Payment Monitoring"
Cohesion: 0.05
Nodes (39): adminAuthorized, authorizeAdmin, buildDriveResult, buildUploadFailure, claimsValid, deleteFile, endScheduled, extractToken (+31 more)

### Community 1 - "User Administration API"
Cohesion: 0.08
Nodes (25): actorAuthorized, authorizeActor, buildAuditRow, buildRejectResponse, claimsValid, extractBearerToken, fetchActorProfile, fetchTargetProfile (+17 more)

### Community 2 - "Event API"
Cohesion: 0.11
Nodes (17): actorAuthorized, authorizeActor, buildEventList, claimsValid, eventsWebhook, extractBearerToken, fetchActorProfile, fetchAssignments (+9 more)

## Knowledge Gaps
- **81 isolated node(s):** `jsonHeaders`, `eventsWebhook`, `extractBearerToken`, `tokenPresent`, `verifyAppJwt` (+76 more)
  These have ≤1 connection - possible missing edges or undocumented components.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What connects `jsonHeaders`, `eventsWebhook`, `extractBearerToken` to the rest of the system?**
  _81 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Payment Monitoring` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
- **Should `User Administration API` be split into smaller, more focused modules?**
  _Cohesion score 0.07692307692307693 - nodes in this community are weakly interconnected._
- **Should `Event API` be split into smaller, more focused modules?**
  _Cohesion score 0.1111111111111111 - nodes in this community are weakly interconnected._