# Review readiness — 12 October 2026

FreshProof is publicly accessible at [the standalone app](https://demigodd00.github.io/freshproof/). The [source repository](https://github.com/Demigodd00/freshproof) is public. A square [1024×1024 PNG logo](../site/public/freshproof-logo.png) is available for a submission form. The app intentionally labels its example ledger as illustrative rather than onchain proof.

## Verified now

- GenVM lint passes with a concrete pinned runner; seven direct-mode contract tests and eight frontend tests pass.
- The GitHub Pages build is published from this dedicated repository. CI also runs lint, direct-mode tests, frontend tests, and a production build.
- Both [commit-pinned example manifests](DEMO.md) are publicly retrievable and match their documented SHA-256 digests.
- A [StudioNet smoke deployment](../deploy/smoke.json) finalized with GenVM execution **SUCCESS**, and the integration test read its frozen state and open first epoch. [Explorer receipt](https://explorer-studio.genlayer.com/tx/0x7162c759cd07548f5205a3fe4d6806f9ef68a7f3850e5810283838e4458ad5cc).

## Still blocking a full project submission

The smoke deployment used a temporary test account and was not funded. `site/public/deployment.json` therefore remains deliberately unverified; the app does not present the smoke address as a complete covenant. There is no finalized StudioNet evidence of the full path: sponsor funding, publisher submission of pinned evidence, validator review, deadline close, and beneficiary withdrawal. The contract requires a minimum one-hour epoch, so an honest paid/refunded settlement cannot be completed instantly. A user-controlled sponsor/publisher wallet pair is needed for the complete public demo.

The GLSim 0.29.2 integration test is not considered proof: its deployment/schema behavior is inconsistent, even though the same deployment-and-read test passed on hosted StudioNet. It is no longer marked expected-failure, so a local failure cannot appear as a passing test. The direct-mode suite remains the fast deterministic logic check.

## Final proof to collect

1. Deploy using the app with a persistent StudioNet sponsor wallet. Verify the finalized execution receipt and onchain source match, then set the canonical address, normalized source SHA-256, and `verified: true` in `site/public/deployment.json`.
2. Fund the exact fixed pool from the sponsor wallet. Use the distinct publisher wallet to submit a full-commit manifest and raw-byte digest during epoch 1, then finalize a review. Keep explorer transaction links and a finalized `get_epoch(1)` read.
3. After the deadline, close epoch 1, confirm the fixed credit, and withdraw. Exercise at least one correction or missed-release case in a later epoch, with finalized receipts.
4. Recheck the public app in both desktop and mobile view with the canonical contract loaded, confirm its public verifier reproduces the stored digest and delta, and only then claim an end-to-end live demo in submission notes.

Do not submit the illustrative release ledger or deployment smoke as proof of a funded, settled covenant.
