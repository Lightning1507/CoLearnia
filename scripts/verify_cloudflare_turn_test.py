"""Checks that authentication-only results cannot count as expiry verification."""

import argparse
import hashlib
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location(
    "turn_probe", Path(__file__).with_name("verify-cloudflare-turn.py")
)
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)


class ApiResponse:
    status = 201

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def read(self):
        return json.dumps({"iceServers": [{
            "username": "fixture-user", "credential": "fixture-password"
        }]}).encode()


class VerificationTest(unittest.TestCase):
    def run_probe(self, accepted, auth_only=False, diagnostic=False):
        args = argparse.Namespace(ttl=14400, delay=840, auth_only=auth_only, diagnostic=diagnostic)
        output = io.StringIO()
        with patch.dict(probe.os.environ, {
            "TURN_KEY_ID": "fixture-key", "TURN_KEY_API_TOKEN": "fixture-token"
        }), patch.object(probe.urllib.request, "urlopen", return_value=ApiResponse()), \
                patch.object(probe, "allocate", side_effect=[
                    value if isinstance(value, dict) else
                    {"accepted": value, **({} if value else {"turnCode": 401})}
                    for value in accepted
                ]), patch.object(probe.time, "sleep") as sleep, \
                patch.object(probe.time, "monotonic", return_value=0), \
                contextlib.redirect_stdout(output):
            result = probe.verify(args)
        return result, [json.loads(line) for line in output.getvalue().splitlines()], sleep

    def test_auth_only_explicitly_does_not_verify_expiry(self):
        result, events, sleep = self.run_probe([True, False], auth_only=True)
        self.assertEqual(result, 0)
        summary = next(event for event in events if event["event"] == "result")
        self.assertEqual(summary["scope"], "authentication")
        self.assertFalse(summary["expiryVerified"])
        self.assertEqual(summary["credentialTtlSeconds"], 14400)
        sleep.assert_not_called()

    def test_diagnostic_continues_but_does_not_pass_an_unconfirmed_baseline(self):
        result, events, sleep = self.run_probe([
            True, {"accepted": False, "turnCode": 400},
            False, False, False, False, True], diagnostic=True)
        self.assertEqual(result, 2)
        self.assertEqual(len([e for e in events if e["event"] == "expiry"]), 2)
        self.assertTrue(any(e["event"] == "baseline-warning" for e in events))
        summary = next(e for e in events if e["event"] == "result")
        self.assertFalse(summary["expiryVerified"])
        self.assertEqual(summary["reason"], "baseline-authentication-unconfirmed")
        self.assertEqual(sleep.call_count, 2)

    def test_diagnostic_reports_old_credentials_still_accepted(self):
        result, events, _ = self.run_probe([
            True, {"accepted": False, "turnCode": 400},
            True, True, True, True, True], diagnostic=True)
        self.assertEqual(result, 1)
        summary = next(e for e in events if e["event"] == "result")
        self.assertEqual(summary["status"], "failed")
        self.assertFalse(summary["expiryVerified"])

    def test_diagnostic_does_not_allow_an_accepted_wrong_password(self):
        result, _, sleep = self.run_probe([True, True], diagnostic=True)
        self.assertEqual(result, 1)
        sleep.assert_not_called()

    def test_diagnostic_and_auth_only_are_mutually_exclusive(self):
        with patch.object(probe.sys, "argv", ["verify-cloudflare-turn.py", "--diagnostic", "--auth-only"]), \
                contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as error:
            probe.main()
        self.assertEqual(error.exception.code, 2)

    def test_long_term_auth_message_integrity_matches_rfc5769_section_2_4(self):
        # Public STUN test vector, not a Cloudflare credential.
        username = "マトリックス".encode()
        realm = b"example.org"
        nonce = b"f//499k954d6OL34oL9FSTvy64sA"
        password = b"TheMatrIX"  # Already normalized as specified by the vector.
        key = hashlib.md5(username + b":" + realm + b":" + password).digest()
        packet = probe.message(1, [probe.attribute(6, username),
            probe.attribute(0x15, nonce), probe.attribute(0x14, realm)],
            bytes.fromhex("78ad3433c6ad72c029da412e"), key)
        self.assertEqual(packet[-20:].hex(), "f67024656dd64a3e02b8e0712e85c9a28ca89666")
        self.assertEqual(int.from_bytes(packet[2:4], "big"), 96)

    def test_wrong_password_accepted_fails_even_in_auth_only(self):
        result, _, _ = self.run_probe([True, True], auth_only=True)
        self.assertEqual(result, 1)

    def test_expiry_gate_fails_when_either_old_credential_still_works(self):
        result, _, _ = self.run_probe([True, False, False, False, True, False, True])
        self.assertEqual(result, 1)

    def test_expiry_gate_requires_fresh_control(self):
        result, _, _ = self.run_probe([True, False, False, False, False, False, False])
        self.assertEqual(result, 2)

    def test_expiry_gate_accepts_rejection_with_working_fresh_control(self):
        result, _, _ = self.run_probe([True, False, False, False, False, False, True])
        self.assertEqual(result, 0)

    def test_default_is_four_hours_without_auth_only_bypass(self):
        with patch.object(probe.sys, "argv", ["verify-cloudflare-turn.py"]), \
                patch.object(probe, "verify", return_value=0) as verify:
            self.assertEqual(probe.main(), 0)
        args = verify.call_args.args[0]
        self.assertEqual(args.ttl, 14400)
        self.assertFalse(args.auth_only)

    def test_quota_rejection_is_not_expiry_even_when_fresh_control_works(self):
        quota = {"accepted": False, "turnCode": 486}
        result, events, _ = self.run_probe([True, False, quota, quota, quota, quota, True])
        self.assertNotEqual(result, 0)
        summary = next(event for event in events if event["event"] == "result")
        self.assertEqual(summary["status"], "inconclusive")
        self.assertFalse(summary["expiryVerified"])

    def test_unknown_and_non_authentication_errors_are_inconclusive(self):
        for code in [None, 400, 403, 437, 438, 441, 442, 486, 500, 508]:
            with self.subTest(code=code):
                rejection = {"accepted": False, "turnCode": code}
                result, events, _ = self.run_probe([
                    True, False, False, False, rejection, rejection, True])
                self.assertNotEqual(result, 0)
                self.assertEqual(
                    next(event["status"] for event in events if event["event"] == "result"),
                    "inconclusive")

    def test_only_one_auth_rejection_is_not_enough_when_other_result_is_quota(self):
        result, events, _ = self.run_probe([
            True, False, False, False, False, {"accepted": False, "turnCode": 486}, True])
        self.assertEqual(result, 2)
        summary = next(event for event in events if event["event"] == "result")
        self.assertFalse(summary["expiryVerified"])

    def test_wrong_password_quota_or_bad_request_is_not_authentication_proof(self):
        for code in [400, 486, 508, None]:
            with self.subTest(code=code):
                result, events, sleep = self.run_probe([
                    True, {"accepted": False, "turnCode": code}], auth_only=True)
                self.assertEqual(result, 2)
                summary = next(event for event in events if event["event"] == "result")
                self.assertEqual(summary["status"], "inconclusive")
                sleep.assert_not_called()


if __name__ == "__main__":
    unittest.main()
