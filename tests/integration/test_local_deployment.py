"""Deploy and inspect FreshProof with GLSim consensus.

Payable funding and live web/LLM review are reserved for a StudioNet smoke
test; GLSim 0.29.2 does not reliably forward transaction value.
"""

import json
import time
from pathlib import Path

from gltest import get_contract_factory
from gltest.accounts import create_accounts
from gltest.assertions import tx_execution_succeeded
from gltest.clients import get_gl_client
from gltest.types import TransactionStatus
from gltest.utils import extract_contract_address


CONTRACT = Path(__file__).resolve().parents[2] / "contracts" / "FreshProof.py"


def test_deploy_and_read_frozen_covenant():
    sponsor, publisher = create_accounts(2)
    start = int(time.time()) + 7200
    reward = 10**15
    factory = get_contract_factory(contract_file_path=CONTRACT)
    receipt = factory.deploy_contract_tx(
        args=[publisher.address, "Demigodd00", "freshproof", "evidence/demo/release.json",
              "Explain every material correction and removal using the relevant before and after values.",
              start, 3600, 600, 3, reward],
        account=sponsor,
        wait_transaction_status=TransactionStatus.FINALIZED,
    )
    assert tx_execution_succeeded(receipt), json.dumps(receipt, default=str, indent=2)
    address = extract_contract_address(receipt)
    print(f"Finalized deployment: hash={receipt['hash']} address={address}")
    # GLSim's schema endpoint may return an empty methods map even after a
    # successful deploy, so call the public view method by its explicit name.
    client = get_gl_client()
    state = client.read_contract(address=address, function_name="get_state", args=[], account=sponsor)
    assert state["sponsor"] == sponsor.address.lower()
    assert state["publisher"] == publisher.address.lower()
    assert state["repo"] == "Demigodd00/freshproof"
    assert state["manifest_path"] == "evidence/demo/release.json"
    assert state["epoch_count"] == "3"
    assert state["reward_atto"] == str(reward)
    assert state["funded"] is False
    assert client.read_contract(address=address, function_name="get_epoch", args=[1], account=sponsor)["state"] == "OPEN"
