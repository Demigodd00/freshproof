# FreshProof reviewer links

- App: https://demigodd00.github.io/freshproof/
- Source: https://github.com/Demigodd00/freshproof
- Logo: https://demigodd00.github.io/freshproof/freshproof-logo.png
- StudioNet contract: https://explorer-studio.genlayer.com/address/0xcC85C4B00c590b430a3fEBD8E579183062Fe8A61
- Finalized receipt and onchain-state record: https://github.com/Demigodd00/freshproof/blob/main/deployments/studionet-demo.json
- CI: https://github.com/Demigodd00/freshproof/actions/workflows/checks.yml

To review without a wallet, open the app, choose **Live StudioNet**, inspect the two `closed paid` epochs, and click **Verify pinned evidence** on each. The verifier re-fetches raw GitHub bytes at frozen commits, recomputes SHA-256 and the exact record-ID delta, and compares those values with finalized onchain reads. Epoch 1 is a 12-record baseline; epoch 2 has one addition and one correction. The validator `PASS` verdicts, deadline closes, and withdrawals are independently linked by the public receipt record. The contract's fixed reward is 0.001 test GEN per epoch.

The demo used disposable StudioNet accounts and faucet GEN. It demonstrates the funded and paid path, not independent adoption, production economics, or the factual truth of the illustrative river readings. Failed-review and refund paths are tested in direct mode but are not part of this hosted receipt sequence. The browser verifier checks structural evidence; it does not replay GenLayer validator inference. No external submission or resubmission is implied by these links.
