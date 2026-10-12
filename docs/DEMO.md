# Two immutable example releases

The dedicated FreshProof repository contains a genuinely versioned sample feed. These are **illustrative Git evidence**, not a claim that the covenant has been deployed or that a validator reviewed it onchain.

| Release | Full commit | Raw manifest SHA-256 | Structural delta |
| --- | --- | --- | --- |
| Epoch 1 baseline | `7d7ec78dbfab99a67261e54aef594d61ae126b5c` | `06ecbb32f795422c32535d1fb4fd9c387c3cad6a024456e31ad36ac324339d17` | 12 initial records; change log empty by design |
| Epoch 2 correction | `405f77c2b0e7fae8df8f5af1765d1843fe5a8b82` | `93894653266d2b1bbb966d49e15d9386de6fb431e67d1df233dc2fb61d84a186` | `river_level` corrected; `rainfall` added |

The hashes above are SHA-256 of the exact Git blob bytes at `evidence/demo/release.json`, not Git blob object IDs. The public source links are:

- [Baseline manifest](https://raw.githubusercontent.com/Demigodd00/freshproof/7d7ec78dbfab99a67261e54aef594d61ae126b5c/evidence/demo/release.json)
- [Corrected manifest](https://raw.githubusercontent.com/Demigodd00/freshproof/405f77c2b0e7fae8df8f5af1765d1843fe5a8b82/evidence/demo/release.json)

The app's live verifier uses the same kind of full-commit raw URL and digest check, but takes the expected digests and commit IDs from a **finalized onchain record**, not this document. This sample is intentionally about publication transparency and does not establish that its river readings are factual.
