# Architecture and uniqueness boundary

## Core question

Can a publisher change a public dataset between releases without silently removing or rewriting material records? FreshProof pays for a *verifiable change disclosure*, not for dataset creation or absolute correctness.

## Responsibilities

| Layer | Responsibility |
| --- | --- |
| Browser app | Sponsor/publisher forms, wallet connection, transaction polling, finalized reads, local diff preview, public verifier. It is never authoritative for settlement. |
| GenLayer intelligent contract | Frozen covenant, deposits, epoch deadlines, commit/digest records, independently validated change-log judgment, deterministic credit allocation, withdrawals. |
| Public GitHub | Immutable commit-addressed release manifests. The publisher controls the repo; this proves what was submitted, not that every fact in it is true. |
| GenLayer validators | Independently fetch and hash both releases, derive the exact record-ID/value delta, and assess whether disclosures faithfully explain that delta. Agreement is on decision-bearing fields, not free-form prose. |

## Why it requires GenLayer

A conventional smart contract can hash bytes and compute an exact diff. It cannot reliably decide whether a natural-language explanation is materially faithful to changed records. That narrow semantic judgment is the non-deterministic operation. All amounts, deadlines, roles, and payment branches are deterministic. A validator must not merely check that the leader returned an allowed label; it must repeat the evidence fetch and derive its own result.

## State machine

`UNFUNDED → OPEN → SUBMITTED → REVIEWED_PASS/REVIEWED_FAIL → CLOSED → CREDIT_CLAIMED`

Missing releases close as `MISSED`. A failed review permits one replacement commit before the epoch deadline; the previous revision remains visible. An unavailable source produces no passing review and cannot pay the publisher. The app waits for finalized GenLayer execution before labeling a release reviewed, closed, or paid. Protocol appeals are distinct from application-level correction.

## Anti-recycling tests

1. The main onchain decision compares *two sequential releases*, not one submitted delivery or one contest entry.
2. The app displays a longitudinal release timeline and independently recomputed diffs.
3. Sponsor/publisher roles are a recurring publication covenant, not buyer/provider quality assessment.
4. A silent removal with a plausible but irrelevant explanation must fail; a genuinely documented correction can pass.
5. Missed epochs refund the sponsor without an AI call.

## Trust limits

The publisher can fabricate data in its own repository. FreshProof makes such changes and their explanations auditable; it does not certify the feed's real-world accuracy. No raw arbitrary URLs are accepted for GenVM fetching. The contract constructs raw GitHub URLs from the frozen owner/repository/path and submitted 40-character commit SHA. Manifests are bounded. GEN is StudioNet test value until a separate deployment and security review establish otherwise.

