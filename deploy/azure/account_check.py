"""Read-only Azure CLI checks before buying/provisioning Coair resources.
Supports the selected individual or organization-owned subscription.

No login, account switch, provider registration, quota request, role grant or
resource creation. Subscription and tenant must be specified explicitly.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
import json
import shutil
import subprocess
import uuid


PROVIDERS = ("Microsoft.Compute", "Microsoft.Network", "Microsoft.Storage")
MANUAL_GATES = (
    "billing_activation_and_payment_method",
    "effective_deployment_and_role_assignment_permissions",
    "azure_policy_allowed_regions_skus_tags_and_network_rules",
    "actual_vm_capacity_in_selected_region_or_zone",
    "blob_network_rules_rbac_and_explicit_internet_egress",
    "qualified_images_and_complete_consistent_data_restore",
    "application_acceptance_and_reconciled_rollback",
)


def assess(account, providers, skus, usage, *, tenant, subscription, region, size, count=1, zone=None):
    blockers = []
    if account.get("id", "").lower() != subscription.lower() or account.get("tenantId", "").lower() != tenant.lower():
        blockers.append("subscription_or_tenant_mismatch")
    if account.get("state") != "Enabled":
        blockers.append("subscription_not_enabled")
    for namespace in PROVIDERS:
        if providers.get(namespace) != "Registered":
            blockers.append(f"provider_not_registered:{namespace}")
    matches = [row for row in skus if row.get("name") == size and region in row.get("locations", [])]
    quota = []
    if len(matches) != 1:
        blockers.append("vm_sku_missing_or_ambiguous")
    else:
        sku = matches[0]
        for restriction in sku.get("restrictions", []):
            info = restriction.get("restrictionInfo") or {}
            locations = info.get("locations") or restriction.get("values") or []
            if restriction.get("type") == "Location" and (not locations or region in locations):
                blockers.append("vm_sku_restricted_for_subscription")
            if restriction.get("type") == "Zone" and zone and zone in info.get("zones", []) and (not info.get("locations") or region in info["locations"]):
                blockers.append("vm_zone_restricted_for_subscription")
        if zone:
            zones = [z for info in sku.get("locationInfo", []) if info.get("location") == region for z in info.get("zones", [])]
            if zone not in zones:
                blockers.append("vm_zone_not_advertised")
        capabilities = {row["name"]: row["value"] for row in sku.get("capabilities", [])}
        try:
            needed = int(capabilities["vCPUs"]) * count
            family = sku["family"].lower()
            for key in ("cores", family):
                rows = [row for row in usage if row.get("name", {}).get("value", "").lower() == key]
                if len(rows) != 1:
                    blockers.append(f"quota_unknown:{key}")
                    continue
                available = rows[0]["limit"] - rows[0]["currentValue"]
                quota.append({"name": key, "available_vcpus": available, "required_vcpus": needed})
                if available < needed:
                    blockers.append(f"insufficient_vcpu_quota:{key}")
        except (KeyError, ValueError, TypeError):
            blockers.append("vm_vcpu_or_quota_information_invalid")
    return {"subscription_matches_expected_tenant": "subscription_or_tenant_mismatch" not in blockers,
            "region": region, "vm_size": size, "vm_count": count, "zone": zone,
            "read_only_prerequisites_passed": not blockers, "blockers": sorted(set(blockers)),
            "vcpu_quotas": quota, "manual_gates_pending": list(MANUAL_GATES),
            "ready_to_create_resources": False, "resources_created": False}


def az_json(arguments, subscription):
    result = subprocess.run(["az", *arguments, "--subscription", subscription,
                             "--only-show-errors", "--output", "json"],
                            capture_output=True, text=True, timeout=60, check=False)
    if result.returncode:
        # CLI stderr can include identity details or request URLs. Keep it local.
        raise RuntimeError("azure_cli_read_failed:" + "_".join(arguments[:2]))
    return json.loads(result.stdout)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--subscription", required=True, type=uuid.UUID)
    parser.add_argument("--tenant", required=True, type=uuid.UUID)
    parser.add_argument("--region", default="germanywestcentral")
    parser.add_argument("--vm-size", default="Standard_B2als_v2")
    parser.add_argument("--vm-count", type=int, default=1)
    parser.add_argument("--zone")
    args = parser.parse_args()
    if args.vm_count < 1:
        parser.error("--vm-count must be positive")
    if not shutil.which("az"):
        print(json.dumps({"read_only_prerequisites_passed": False, "blockers": ["azure_cli_not_installed"],
                          "ready_to_create_resources": False, "resources_created": False}))
        return 1
    subscription, tenant = str(args.subscription), str(args.tenant)
    try:
        account = az_json(["account", "show"], subscription)
        if account.get("tenantId", "").lower() != tenant or account.get("id", "").lower() != subscription:
            raise ValueError("subscription_or_tenant_mismatch")
        queries = {namespace: ["provider", "show", "--namespace", namespace] for namespace in PROVIDERS}
        queries["skus"] = ["vm", "list-skus", "--location", args.region, "--size", args.vm_size,
                            "--resource-type", "virtualMachines", "--all"]
        queries["usage"] = ["vm", "list-usage", "--location", args.region]
        with ThreadPoolExecutor(max_workers=5) as pool:
            futures = {key: pool.submit(az_json, query, subscription) for key, query in queries.items()}
            results = {key: future.result() for key, future in futures.items()}
        report = assess(account, {key: results[key].get("registrationState") for key in PROVIDERS},
                        results["skus"], results["usage"], tenant=tenant, subscription=subscription,
                        region=args.region, size=args.vm_size, count=args.vm_count, zone=args.zone)
        print(json.dumps(report, indent=2))
        return 0 if report["read_only_prerequisites_passed"] else 1
    except Exception as exc:
        error = str(exc) if isinstance(exc, (RuntimeError, ValueError)) and str(exc).startswith(("azure_cli_read_failed:", "subscription_or_tenant_mismatch")) else type(exc).__name__
        print(json.dumps({"read_only_prerequisites_passed": False, "blockers": [error],
                          "ready_to_create_resources": False, "resources_created": False}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
