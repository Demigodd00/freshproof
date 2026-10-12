"""Run a resumable, funded FreshProof acceptance cycle on hosted StudioNet.

This uses two disposable StudioNet-only signers. Their keys stay in an ignored
local file; only addresses, hashes, and finalized reads enter the public proof.
Never submit a second write while a prior transaction outcome is uncertain.
"""

from __future__ import annotations

import base64
import hashlib
import json
import time
from datetime import datetime, timezone
from pathlib import Path

from eth_account import Account
from genlayer_py import create_client
from genlayer_py.assertions import tx_execution_succeeded
from genlayer_py.chains import studionet
from genlayer_py.types import TransactionHashVariant, TransactionStatus


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "contracts" / "FreshProof.py"
PRIVATE = ROOT / "deployments" / "private-freshproof-demo.json"
PROOF = ROOT / "deployments" / "studionet-demo.json"
RULE = (
    "For every material correction or removal, the change log must identify "
    "the record ID and explain how the previous value differs from the new "
    "value and why the change was made."
)
REWARD = 10**15
PERIOD = 600
GRACE = 120
EPOCHS = 2
RELEASES = {
    1: ("7d7ec78dbfab99a67261e54aef594d61ae126b5c", "06ecbb32f795422c32535d1fb4fd9c387c3cad6a024456e31ad36ac324339d17"),
    2: ("405f77c2b0e7fae8df8f5af1765d1843fe5a8b82", "93894653266d2b1bbb966d49e15d9386de6fb431e67d1df233dc2fb61d84a186"),
}


def save(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")


def transaction_hash(value) -> str:
    if isinstance(value, str):
        return value if value.startswith("0x") else "0x" + value
    return "0x" + bytes(value).hex()


def finalized(client, hash_: str, *, system: bool = False) -> dict:
    receipt = client.wait_for_transaction_receipt(
        hash_, status=TransactionStatus.FINALIZED, interval=5000, retries=180,
        full_transaction=True,
    )
    if receipt.get("status_name", receipt.get("statusName")) != TransactionStatus.FINALIZED.value:
        raise RuntimeError(f"Not finalized: {hash_}")
    if not system and not tx_execution_succeeded(receipt):
        raise RuntimeError(f"Finalized with execution error: {hash_}: {receipt.get('consensus_data')}")
    return receipt


def step(proof: dict, client, name: str, send, *, system: bool = False) -> dict:
    known = proof["transactions"].get(name)
    if known is None:
        if proof.get("inflight"):
            raise RuntimeError(
                f"An earlier {proof['inflight']} write has no recorded hash. "
                "Inspect account activity before any retry."
            )
        proof["inflight"] = name
        save(PROOF, proof)
        known = transaction_hash(send())
        proof["transactions"][name] = known
        proof.pop("inflight", None)
        save(PROOF, proof)
        print(f"{name}: submitted {known}", flush=True)
    receipt = finalized(client, known, system=system)
    print(f"{name}: FINALIZED {known}", flush=True)
    return receipt


def read(client, contract: str, method: str, args: list) -> dict | str:
    return client.read_contract(
        address=contract, function_name=method, args=args,
        transaction_hash_variant=TransactionHashVariant.LATEST_FINAL,
    )


def verify_source(client, address: str) -> str:
    response = client.provider.make_request("gen_getContractCode", [address])
    encoded = response.get("result")
    if not isinstance(encoded, str):
        raise RuntimeError("Onchain source unavailable")
    deployed = base64.b64decode(encoded, validate=True).decode("utf-8").replace("\r\n", "\n")
    local = SOURCE.read_text(encoding="utf-8").replace("\r\n", "\n")
    if deployed != local:
        raise RuntimeError("Onchain source differs from the local release")
    return hashlib.sha256(local.encode("utf-8")).hexdigest()


def wait_until(timestamp: int, label: str) -> None:
    while time.time() <= timestamp:
        left = max(1, int(timestamp - time.time()) + 1)
        print(f"{label}: waiting {left}s for the real StudioNet deadline", flush=True)
        time.sleep(min(30, left))


def main() -> None:
    if PRIVATE.exists():
        secrets = json.loads(PRIVATE.read_text(encoding="utf-8"))
        sponsor = Account.from_key(secrets["sponsor"])
        publisher = Account.from_key(secrets["publisher"])
    else:
        sponsor, publisher = Account.create(), Account.create()
        save(PRIVATE, {"sponsor": sponsor.key.hex(), "publisher": publisher.key.hex()})
    if PROOF.exists():
        proof = json.loads(PROOF.read_text(encoding="utf-8"))
    else:
        proof = {
            "network": "GenLayer StudioNet", "chainId": 61999,
            "fixtureNotice": "Controlled demo with disposable test accounts and faucet GEN; not independent adoption or factual data validation.",
            "sponsor": sponsor.address, "publisher": publisher.address,
            "startUnix": int(time.time()) + 300,
            "periodSeconds": PERIOD, "graceSeconds": GRACE,
            "rewardAtto": str(REWARD), "transactions": {},
        }
        save(PROOF, proof)
    if (proof["sponsor"], proof["publisher"]) != (sponsor.address, publisher.address):
        raise RuntimeError("Private accounts do not match the public proof record")
    sponsor_client = create_client(chain=studionet, account=sponsor)
    publisher_client = create_client(chain=studionet, account=publisher)

    step(proof, sponsor_client, "faucet", lambda: sponsor_client.fund_account(sponsor.address, 10**16), system=True)
    if int(sponsor_client.get_balance(sponsor.address)) < EPOCHS * REWARD:
        raise RuntimeError("Sponsor faucet balance is insufficient")

    if "deploy" not in proof["transactions"] and int(time.time()) + 60 >= proof["startUnix"]:
        # A missed start is safer than rewriting frozen terms after deployment.
        proof["startUnix"] = int(time.time()) + 300
        save(PROOF, proof)
    receipt = step(proof, sponsor_client, "deploy", lambda: sponsor_client.deploy_contract(
        code=SOURCE.read_text(encoding="utf-8"), account=sponsor,
        args=[publisher.address, "Demigodd00", "freshproof", "evidence/demo/release.json",
              RULE, proof["startUnix"], PERIOD, GRACE, EPOCHS, REWARD],
    ))
    if "address" not in proof:
        for key in ("tx_data_decoded", "data"):
            value = receipt.get(key)
            if isinstance(value, dict) and value.get("contract_address"):
                proof["address"] = value["contract_address"]
                break
        if "address" not in proof:
            raise RuntimeError("Finalized deploy receipt has no contract address")
        save(PROOF, proof)
    contract = proof["address"]
    proof["sourceSha256"] = verify_source(sponsor_client, contract)
    save(PROOF, proof)
    state = read(sponsor_client, contract, "get_state", [])
    if (state["sponsor"], state["publisher"], int(state["start_unix"])) != (
        sponsor.address.lower(), publisher.address.lower(), proof["startUnix"]
    ):
        raise RuntimeError("Finalized covenant state does not match the frozen test terms")

    step(proof, sponsor_client, "fund", lambda: sponsor_client.write_contract(
        address=contract, function_name="fund", args=[], value=EPOCHS * REWARD,
    ))
    if not read(sponsor_client, contract, "get_state", [])["funded"]:
        raise RuntimeError("Pool not funded in finalized state")

    for epoch in (1, 2):
        wait_until(proof["startUnix"] + (epoch - 1) * PERIOD - 1, f"epoch {epoch} opens")
        commit, digest = RELEASES[epoch]
        step(proof, publisher_client, f"submit{epoch}", lambda epoch=epoch, commit=commit, digest=digest: publisher_client.write_contract(
            address=contract, function_name="submit", args=[epoch, commit, digest],
        ))
        submitted = read(sponsor_client, contract, "get_epoch", [epoch])
        if submitted["state"] != "SUBMITTED" or submitted["commit_sha"] != commit:
            raise RuntimeError(f"Epoch {epoch} submission missing from finalized state")
        step(proof, sponsor_client, f"review{epoch}", lambda epoch=epoch: sponsor_client.write_contract(
            address=contract, function_name="review", args=[epoch],
        ))
        reviewed = read(sponsor_client, contract, "get_epoch", [epoch])
        proof[f"review{epoch}"] = reviewed
        save(PROOF, proof)
        if reviewed["state"] != "REVIEWED_PASS" or reviewed["verdict"] != "PASS":
            raise RuntimeError(f"Epoch {epoch} was not approved by GenLayer validators")
        if epoch == 2 and (reviewed["corrected"], reviewed["added"], reviewed["baseline_epoch"]) != ("1", "1", "1"):
            raise RuntimeError("Corrected release delta does not match expected counts")
        wait_until(proof["startUnix"] + epoch * PERIOD + GRACE, f"epoch {epoch} closes")
        step(proof, sponsor_client, f"close{epoch}", lambda epoch=epoch: sponsor_client.write_contract(
            address=contract, function_name="close", args=[epoch],
        ))
        closed = read(sponsor_client, contract, "get_epoch", [epoch])
        proof[f"close{epoch}"] = closed
        save(PROOF, proof)
        if closed["state"] != "CLOSED_PAID":
            raise RuntimeError(f"Epoch {epoch} did not settle as paid")
        if int(read(sponsor_client, contract, "get_credit", [publisher.address])) < REWARD:
            raise RuntimeError("Expected publisher credit is missing")
        step(proof, publisher_client, f"withdraw{epoch}", lambda: publisher_client.write_contract(
            address=contract, function_name="withdraw", args=[],
        ))
        if read(sponsor_client, contract, "get_credit", [publisher.address]) != "0":
            raise RuntimeError("Publisher credit did not clear after withdrawal")
    final = read(sponsor_client, contract, "get_state", [])
    if final["total_credited"] != str(EPOCHS * REWARD) or final["total_withdrawn"] != str(EPOCHS * REWARD):
        raise RuntimeError("Final fixed settlement totals do not match")
    proof["final"] = final
    proof["completedAt"] = datetime.now(timezone.utc).isoformat()
    save(PROOF, proof)
    print(f"COMPLETE {contract}", flush=True)


if __name__ == "__main__":
    main()
