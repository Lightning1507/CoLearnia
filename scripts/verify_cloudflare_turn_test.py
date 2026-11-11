"""Checks that authentication-only results cannot count as expiry verification."""

import argparse
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
    def run_probe(self, accepted, auth_only=False):
        args = argparse.Namespace(ttl=14400, delay=840, auth_only=auth_only)
        output = io.StringIO()
        with patch.dict(probe.os.environ, {
            "TURN_KEY_ID": "fixture-key", "TURN_KEY_API_TOKEN": "fixture-token"
        }), patch.object(probe.urllib.request, "urlopen", return_value=ApiResponse()), \
                patch.object(probe, "allocate", side_effect=[
                    {"accepted": value} for value in accepted
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

    def test_wrong_password_accepted_fails_even_in_auth_only(self):
        result, _, _ = self.run_probe([True, True], auth_only=True)
        self.assertEqual(result, 1)

    def test_expiry_gate_fails_when_either_old_credential_still_works(self):
        result, _, _ = self.run_probe([True, False, False, False, True, False, True])
        self.assertEqual(result, 1)

    def test_expiry_gate_requires_fresh_control(self):
        result, _, _ = self.run_probe([True, False, False, False, False, False, False])
        self.assertEqual(result, 1)

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


if __name__ == "__main__":
    unittest.main()
