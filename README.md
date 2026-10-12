# FreshProof

FreshProof is a GenLayer-native **public-data change covenant**. A sponsor funds a fixed number of publication epochs. A named publisher commits immutable GitHub snapshots of a public data feed. Each later snapshot must disclose material additions, corrections, and removals relative to the last accepted snapshot. Validators independently fetch the pinned snapshots and decide whether the accompanying plain-language change log faithfully explains the changes. Fixed contract rules, never the model, assign each epoch's GEN payment or refund.

This is a standalone Project app, not a contract-only demo. It includes a sponsor/publisher workspace, public release timeline and diff inspector, wallet transactions, native contract, read-only verifier, tests, deployment records, and reviewer documentation. A source-verified, funded [StudioNet covenant](https://explorer-studio.genlayer.com/address/0xcC85C4B00c590b430a3fEBD8E579183062Fe8A61) has completed two release epochs, including validator reviews, fixed payouts, and withdrawals. The [public proof record](deployments/studionet-demo.json) links the finalized transactions and reads.

## Distinction from DatasetBond and Eligibility Judge

DatasetBond evaluates a commissioned dataset delivery once against five quality dimensions. Eligibility Judge qualifies contest entries against a frozen rulebook. FreshProof has a different unit of accountability: **the transition between consecutive public releases**. It never scores a delivery, ranks entrants, or adjudicates a buyer's dataset commission. A sponsor purchases a schedule of honest change disclosures; a publisher can earn one fixed amount per epoch only if that epoch's release history is transparent.

## Reviewable MVP

- A sponsor can create a covenant from the app, freezing the publisher, public GitHub repository and manifest path, semantic disclosure rule, epoch cadence, and fixed per-epoch reward. The source and wallet transaction are tracked without an automatic retry; funding is a separate transaction.
- The publisher submits a commit-pinned release and SHA-256 digest. Anyone can invoke its review.
- Deterministic checks compute the exact record-ID delta. An intelligent GenLayer transaction judges whether the change log faithfully describes that delta; validators independently refetch both snapshots and agree on the material decision.
- A finalization-safe close credits the publisher for a passing epoch or refunds the sponsor for a failed/missed one. Credits are pulled by their owner.
- A public verifier re-fetches snapshots and shows what was recorded onchain versus what is independently reproducible.

This is a StudioNet test-GEN product, not a guarantee that the underlying public data is true. It checks whether changes are disclosed faithfully within the frozen scope. The funded demo used two disposable test accounts and faucet GEN; it proves the app's contract workflow, not independent adoption or the factual accuracy of the sample river data. The browser verifier independently reproduced the pinned bytes, structural deltas, and onchain counts for both epochs. Failed-review and refund branches have direct-mode test coverage but have not been exercised in this hosted StudioNet demo.

The app will not enable post-deployment signing merely because its own create action returned a hash. The transaction must finalize and the onchain contract source must match the exact source published with this app. This lets a sponsor continue with a newly created covenant without a manual repository edit. A separately published deployment record is still required before presenting any particular covenant as the canonical public demo. Unmatched addresses remain read-only.

## Local checks

```text
genvm-lint check contracts/FreshProof.py --json
python -m pytest tests/direct -q
glsim --port 4000 --validators 5 --no-browser
gltest tests/integration/test_local_deployment.py -v -s --network localnet
cd site
pnpm install
pnpm test
pnpm build
```

See the [review-readiness report](docs/REVIEW_READINESS.md), [submission links](docs/SUBMISSION.md), [architecture](docs/ARCHITECTURE.md), [evidence format](docs/EVIDENCE_FORMAT.md), and [two commit-pinned live-demo releases](docs/DEMO.md).
