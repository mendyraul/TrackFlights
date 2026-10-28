import importlib.util
import io
import json
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("health_probe", Path(__file__).with_name("check-ingestion-health.py"))
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)


class Response(io.BytesIO):
    status = 200


class ProbeTests(unittest.TestCase):
    def fetcher(self, ready, data):
        rows = iter((ready, data))

        def fetch(request, timeout):
            self.assertEqual(timeout, 10)
            self.assertIn("/api/healthz/", request.full_url)
            return Response(json.dumps(next(rows)).encode())
        return fetch

    def test_legacy_env_only_readiness_does_not_pass(self):
        rows = probe.check("https://example.invalid", self.fetcher({"status": "ready"}, {"freshness": "live"}))
        self.assertFalse(rows[0]["healthy"])

    def test_live_and_quiet_receivers_are_distinguished(self):
        for state in ("live", "silent"):
            rows = probe.check("https://example.invalid", self.fetcher({"database": "reachable"}, {"freshness": state}))
            self.assertTrue(all(row["healthy"] for row in rows))
            self.assertEqual(rows[1]["state"], state)

    def test_stale_and_unreachable_fail(self):
        rows = probe.check("https://example.invalid", self.fetcher({"database": "reachable"}, {"freshness": "offline"}))
        self.assertFalse(rows[1]["healthy"])

        def unavailable(*args, **kwargs):
            raise OSError("transport failure")
        self.assertFalse(any(row["healthy"] for row in probe.check("https://example.invalid", unavailable)))


if __name__ == "__main__":
    unittest.main()
