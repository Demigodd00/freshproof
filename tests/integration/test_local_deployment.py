"""Deploy and inspect FreshProof with real GLSim consensus.

Payable funding and live web/LLM review are intentionally reserved for a
StudioNet smoke test; GLSim 0.29.2 does not reliably forward transaction value.
"""

import json
import time
from pathlib import Path

import pytest
from gltest import get_contract_factory
from gltest.accounts import create_accounts
from gltest.assertions import tx_execution_succeeded
from gltest.types import TransactionStatus
from gltest.utils import extract_contract_address


CONTRACT = Path(__file__).resolve().parents[2] / "contracts" / "FreshProof.py"


@pytest.mark.xfail(reason="GLSim 0.29.2 intermittently fails storage allocation and returns an empty contract ABI", strict=True)
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
    contract = factory.build_contract(address, account=sponsor)
    state = contract.get_state(args=[]).call()
    assert state["sponsor"] == sponsor.address.lower()
    assert state["publisher"] == publisher.address.lower()
    assert state["repo"] == "Demigodd00/freshproof"
    assert state["manifest_path"] == "evidence/demo/release.json"
    assert state["epoch_count"] == "3"
    assert state["reward_atto"] == str(reward)
    assert state["funded"] is False
    assert contract.get_epoch(args=[1]).call()["state"] == "OPEN"
