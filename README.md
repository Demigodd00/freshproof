# FreshProof

FreshProof is a GenLayer-native **public-data change covenant**. A sponsor funds a fixed number of publication epochs. A named publisher commits immutable GitHub snapshots of a public data feed. Each later snapshot must disclose material additions, corrections, and removals relative to the last accepted snapshot. Validators independently fetch the pinned snapshots and decide whether the accompanying plain-language change log faithfully explains the changes. Fixed contract rules, never the model, assign each epoch's GEN payment or refund.

This is a standalone Project app, not a contract-only demo. It includes a sponsor/publisher workspace, public release timeline and diff inspector, wallet transactions, native contract, read-only verifier, tests, deployment records, and reviewer documentation. The contract is not deployed yet; until a deployment record and finalized receipts exist, the interface must identify examples as demonstrations.

## Distinction from DatasetBond and Eligibility Judge

DatasetBond evaluates a commissioned dataset delivery once against five quality dimensions. Eligibility Judge qualifies contest entries against a frozen rulebook. FreshProof has a different unit of accountability: **the transition between consecutive public releases**. It never scores a delivery, ranks entrants, or adjudicates a buyer's dataset commission. A sponsor purchases a schedule of honest change disclosures; a publisher can earn one fixed amount per epoch only if that epoch's release history is transparent.

## Reviewable MVP

- A sponsor freezes publisher, public GitHub repository and manifest path, semantic disclosure rule, epoch cadence, and fixed per-epoch reward.
- The publisher submits a commit-pinned release and SHA-256 digest. Anyone can invoke its review.
- Deterministic checks compute the exact record-ID delta. An intelligent GenLayer transaction judges whether the change log faithfully describes that delta; validators independently refetch both snapshots and agree on the material decision.
- A finalization-safe close credits the publisher for a passing epoch or refunds the sponsor for a failed/missed one. Credits are pulled by their owner.
- A public verifier re-fetches snapshots and shows what was recorded onchain versus what is independently reproducible.

This is a StudioNet test-GEN product, not a guarantee that the underlying public data is true. It checks whether changes are disclosed faithfully within the frozen scope. The repository does not claim live behavior: the verified-deployment record is intentionally empty, and a local GLSim integration smoke test is currently marked expected-failure because GLSim 0.29.2 intermittently fails storage allocation and returns an empty ABI for this contract. A finalized StudioNet lifecycle is still required before submission-readiness claims.

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

See [architecture](docs/ARCHITECTURE.md) and [evidence format](docs/EVIDENCE_FORMAT.md).
