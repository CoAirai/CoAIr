from copy import deepcopy
import unittest

from _support import ROOT, load

check = load("account_check_fixture", ROOT / "deploy/azure/account_check.py")


class AccountCheckTests(unittest.TestCase):
    def setUp(self):
        self.account = {"id": "subscription", "tenantId": "company", "state": "Enabled"}
        self.providers = {key: "Registered" for key in check.PROVIDERS}
        self.skus = [{"name": "Standard_D4as_v5", "locations": ["germanywestcentral"],
                      "family": "standardDASv5Family", "capabilities": [{"name": "vCPUs", "value": "4"}],
                      "restrictions": [], "locationInfo": [{"location": "germanywestcentral", "zones": ["1", "2"]}]}]
        self.usage = [{"name": {"value": name}, "limit": 8, "currentValue": 2}
                      for name in ["cores", "standardDASv5Family"]]

    def assess(self, **kwargs):
        return check.assess(self.account, self.providers, self.skus, self.usage,
                            tenant="company", subscription="subscription", region="germanywestcentral",
                            size="Standard_D4as_v5", **kwargs)

    def test_readiness_does_not_claim_policy_billing_capacity_or_acceptance(self):
        report = self.assess()
        self.assertTrue(report["read_only_prerequisites_passed"])
        self.assertFalse(report["ready_to_create_resources"])
        self.assertFalse(report["resources_created"])
        self.assertTrue(report["manual_gates_pending"])

    def test_wrong_tenant_and_disabled_subscription_are_blocked(self):
        self.account.update(tenantId="university", state="Disabled")
        blockers = self.assess()["blockers"]
        self.assertIn("subscription_or_tenant_mismatch", blockers)
        self.assertIn("subscription_not_enabled", blockers)

    def test_regional_and_family_quotas_are_independent(self):
        for index in [0, 1]:
            with self.subTest(index=index):
                original = deepcopy(self.usage)
                self.usage[index]["currentValue"] = 6
                report = self.assess()
                self.assertFalse(report["read_only_prerequisites_passed"])
                self.assertTrue(any(b.startswith("insufficient_vcpu_quota:") for b in report["blockers"]))
                self.usage = original

    def test_planned_second_vm_counts_towards_both_quotas(self):
        self.assertFalse(self.assess(count=2)["read_only_prerequisites_passed"])

    def test_missing_provider_sku_and_quota_are_not_silently_accepted(self):
        self.providers["Microsoft.Storage"] = "NotRegistered"
        self.usage.pop()
        self.assertIn("provider_not_registered:Microsoft.Storage", self.assess()["blockers"])
        self.assertIn("quota_unknown:standarddasv5family", self.assess()["blockers"])
        self.skus = []
        self.assertIn("vm_sku_missing_or_ambiguous", self.assess()["blockers"])

    def test_subscription_location_restriction_blocks_even_with_quota(self):
        self.skus[0]["restrictions"] = [{"type": "Location", "values": ["germanywestcentral"]}]
        self.assertIn("vm_sku_restricted_for_subscription", self.assess()["blockers"])

    def test_zone_restriction_does_not_block_a_different_allowed_zone(self):
        self.skus[0]["restrictions"] = [{"type": "Zone", "restrictionInfo": {"locations": ["germanywestcentral"], "zones": ["1"]}}]
        self.assertTrue(self.assess(zone="2")["read_only_prerequisites_passed"])
        self.assertIn("vm_zone_restricted_for_subscription", self.assess(zone="1")["blockers"])
        self.assertIn("vm_zone_not_advertised", self.assess(zone="3")["blockers"])
