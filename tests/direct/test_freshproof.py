from datetime import datetime, timezone
from pathlib import Path
import hashlib
import json


CONTRACT = Path(__file__).resolve().parents[2] / "contracts" / "FreshProof.py"
SDK = "v0.2.16"
REWARD = 10**15
START = int(datetime(2026, 10, 12, 1, 0, tzinfo=timezone.utc).timestamp())
RULE = "Every material addition, correction and removal must be identified by record ID and explained with the relevant old and new values."


def addr(account):
    return "0x" + account.hex()


def release(period, records, changes):
    body = json.dumps(
        {"version": 1, "period": period, "title": f"Release {period}", "records": records, "changes": changes},
        separators=(",", ":"),
    )
    return body, hashlib.sha256(body.encode()).hexdigest()


def deploy(vm, direct_deploy, sponsor, publisher):
    vm.warp("2026-10-12T00:00:00Z")
    vm.sender = sponsor
    return direct_deploy(
        str(CONTRACT), addr(publisher), "Demigodd00", "freshproof", "evidence/demo/release.json",
        RULE, START, 3600, 600, 3, REWARD, sdk_version=SDK,
    )


def fund(contract, vm, sponsor):
    vm.sender = sponsor
    vm.value = 3 * REWARD
    contract.fund()
    vm.value = 0


def submit(contract, vm, publisher, epoch, commit, body):
    vm.sender = publisher
    contract.submit(epoch, commit, hashlib.sha256(body.encode()).hexdigest())
    vm.mock_web(
        rf"raw\.githubusercontent\.com/Demigodd00/freshproof/{commit}/evidence/demo/release\.json",
        {"status": 200, "body": body},
    )


def test_release_history_pass_and_fixed_credits(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = deploy(direct_vm, direct_deploy, direct_alice, direct_bob)
    fund(contract, direct_vm, direct_alice)
    direct_vm.warp("2026-10-12T01:10:00Z")
    baseline, _ = release(1, [{"id": "route-1", "value": "Open 07:00-21:00"}], [])
    submit(contract, direct_vm, direct_bob, 1, "a" * 40, baseline)
    contract.review(1)
    assert contract.get_epoch(1)["verdict"] == "PASS"
    assert direct_vm.run_validator(leader_result=direct_vm._captured_validators[-1][0]) is True
    direct_vm.warp("2026-10-12T02:11:00Z")
    contract.close(1)
    assert contract.get_credit(addr(direct_bob)) == str(REWARD)

    updated, _ = release(
        2,
        [{"id": "route-1", "value": "Open 06:00-22:00"}],
        [{"id": "route-1", "kind": "corrected", "reason": "Hours changed from 07:00-21:00 to 06:00-22:00 after a timetable revision."}],
    )
    submit(contract, direct_vm, direct_bob, 2, "b" * 40, updated)
    direct_vm.mock_llm("Assess a public dataset CHANGE DISCLOSURE", '{"decision":"PASS"}')
    contract.review(2)
    assert direct_vm.run_validator(leader_result=direct_vm._captured_validators[-1][0]) is True
    assert contract.get_epoch(2)["corrected"] == "1"
    assert contract.get_epoch(2)["baseline_epoch"] == "1"
    direct_vm.warp("2026-10-12T03:11:00Z")
    contract.close(2)
    assert contract.get_credit(addr(direct_bob)) == str(2 * REWARD)
    assert contract.get_state()["total_credited"] == str(2 * REWARD)


def test_silent_removal_fails_and_refunds_sponsor(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = deploy(direct_vm, direct_deploy, direct_alice, direct_bob)
    fund(contract, direct_vm, direct_alice)
    direct_vm.warp("2026-10-12T01:10:00Z")
    baseline, _ = release(1, [{"id": "route-1", "value": "Open"}], [])
    submit(contract, direct_vm, direct_bob, 1, "a" * 40, baseline)
    contract.review(1)
    direct_vm.warp("2026-10-12T02:11:00Z")
    contract.close(1)

    removed, _ = release(2, [], [])
    submit(contract, direct_vm, direct_bob, 2, "b" * 40, removed)
    contract.review(2)
    assert contract.get_epoch(2)["verdict"] == "FAIL"
    assert contract.get_epoch(2)["removed"] == "1"
    direct_vm.warp("2026-10-12T03:11:00Z")
    contract.close(2)
    assert contract.get_credit(addr(direct_alice)) == str(REWARD)


def test_missed_epoch_and_authorization(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    contract = deploy(direct_vm, direct_deploy, direct_alice, direct_bob)
    with direct_vm.expect_revert("not_funded"):
        direct_vm.sender = direct_bob
        contract.submit(1, "a" * 40, "b" * 64)
    fund(contract, direct_vm, direct_alice)
    direct_vm.sender = direct_charlie
    with direct_vm.expect_revert("only_publisher"):
        contract.submit(1, "a" * 40, "b" * 64)
    direct_vm.warp("2026-10-12T02:11:00Z")
    contract.close(1)
    assert contract.get_epoch(1)["state"] == "MISSED"
    assert contract.get_credit(addr(direct_alice)) == str(REWARD)


def test_wrong_digest_cannot_be_passed(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = deploy(direct_vm, direct_deploy, direct_alice, direct_bob)
    fund(contract, direct_vm, direct_alice)
    direct_vm.warp("2026-10-12T01:10:00Z")
    body, _ = release(1, [{"id": "route-1", "value": "Open"}], [])
    direct_vm.sender = direct_bob
    contract.submit(1, "a" * 40, "f" * 64)
    direct_vm.mock_web(r"raw\.githubusercontent\.com/Demigodd00/freshproof/", {"status": 200, "body": body})
    with direct_vm.expect_revert("manifest_digest_mismatch"):
        contract.review(1)
    assert contract.get_epoch(1)["state"] == "SUBMITTED"


def test_late_review_cannot_turn_expired_epoch_into_payment(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = deploy(direct_vm, direct_deploy, direct_alice, direct_bob)
    fund(contract, direct_vm, direct_alice)
    direct_vm.warp("2026-10-12T01:10:00Z")
    body, _ = release(1, [{"id": "route-1", "value": "Open"}], [])
    submit(contract, direct_vm, direct_bob, 1, "a" * 40, body)
    direct_vm.warp("2026-10-12T02:11:00Z")
    with direct_vm.expect_revert("review_window_closed"):
        contract.review(1)
    contract.close(1)
    assert contract.get_epoch(1)["state"] == "CLOSED_REFUNDED"
    assert contract.get_credit(addr(direct_alice)) == str(REWARD)


def test_next_release_uses_last_paid_baseline_after_missed_epoch(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = deploy(direct_vm, direct_deploy, direct_alice, direct_bob)
    fund(contract, direct_vm, direct_alice)
    direct_vm.warp("2026-10-12T01:10:00Z")
    original, _ = release(1, [{"id": "route-1", "value": "Open"}], [])
    submit(contract, direct_vm, direct_bob, 1, "a" * 40, original)
    contract.review(1)
    direct_vm.warp("2026-10-12T02:11:00Z")
    contract.close(1)
    direct_vm.warp("2026-10-12T03:11:00Z")
    contract.close(2)
    direct_vm.warp("2026-10-12T03:12:00Z")
    updated, _ = release(3, [{"id": "route-1", "value": "Open"}, {"id": "route-2", "value": "New"}],
                         [{"id": "route-2", "kind": "added", "reason": "A new route-2 timetable was published."}])
    submit(contract, direct_vm, direct_bob, 3, "c" * 40, updated)
    assert contract.get_epoch(3)["baseline_epoch"] == "1"
    direct_vm.mock_llm("Assess a public dataset CHANGE DISCLOSURE", '{"decision":"PASS"}')
    contract.review(3)
    assert contract.get_epoch(3)["added"] == "1"


def test_failed_release_can_be_corrected_once_with_prior_attempt_visible(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = deploy(direct_vm, direct_deploy, direct_alice, direct_bob)
    fund(contract, direct_vm, direct_alice)
    direct_vm.warp("2026-10-12T01:10:00Z")
    original, _ = release(1, [{"id": "route-1", "value": "Open"}], [])
    submit(contract, direct_vm, direct_bob, 1, "a" * 40, original)
    contract.review(1)
    direct_vm.warp("2026-10-12T02:11:00Z")
    contract.close(1)
    failed, _ = release(2, [], [])
    submit(contract, direct_vm, direct_bob, 2, "b" * 40, failed)
    contract.review(2)
    assert contract.get_epoch(2)["verdict"] == "FAIL"
    corrected, _ = release(2, [], [{"id": "route-1", "kind": "removed",
                                   "reason": "Route-1 was retired after its service ended."}])
    submit(contract, direct_vm, direct_bob, 2, "c" * 40, corrected)
    entry = contract.get_epoch(2)
    assert entry["revision"] == "2"
    assert entry["prior_commit_sha"] == "b" * 40
    assert entry["prior_verdict"] == "FAIL"
    with direct_vm.expect_revert("revision_limit"):
        contract.submit(2, "d" * 40, "f" * 64)
