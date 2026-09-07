"""Company / project upload path layout for S3-friendly folders."""

import src.config
import src.tenant_paths as tenant_paths


class _FakeProjectStore:
    def __init__(self, project):
        self._project = project

    def get(self, project_id):
        if self._project and self._project.get("project_id") == project_id:
            return self._project
        return None


class _FakeOrgStore:
    def __init__(self, org):
        self._org = org

    def get_org(self, org_id):
        if self._org and self._org.get("org_id") == org_id:
            return self._org
        return None


def test_company_project_upload_path(monkeypatch, tmp_path):
    data = tmp_path / "data"
    monkeypatch.setattr(src.config, "DATA_DIR", data)
    monkeypatch.setattr(tenant_paths, "DATA_DIR", data)

    project = {
        "project_id": "abc123def4567890",
        "name": "Tower A",
        "slug": "tower-a",
        "org_id": "org1",
    }
    org = {"org_id": "org1", "name": "Ahmad", "slug": "ahmad"}

    monkeypatch.setattr(
        "src.project_store.get_project_store",
        lambda: _FakeProjectStore(project),
    )
    monkeypatch.setattr(
        "src.org_store.get_org_store",
        lambda: _FakeOrgStore(org),
    )

    path = tenant_paths.project_type_dir("abc123def4567890", "document")
    assert path == data / "companies" / "ahmad" / "tower-a" / "documents"
    assert (data / "companies" / "ahmad" / "tower-a" / ".coair-project-id").is_file()

    key = tenant_paths.s3_upload_key_for_local(str(path / "contract.pdf"))
    assert key == "uploads/companies/ahmad/tower-a/documents/contract.pdf"


def test_slug_collision_disambiguates(monkeypatch, tmp_path):
    data = tmp_path / "data"
    monkeypatch.setattr(src.config, "DATA_DIR", data)
    monkeypatch.setattr(tenant_paths, "DATA_DIR", data)

    owned = data / "companies" / "ahmad" / "tower-a"
    owned.mkdir(parents=True)
    (owned / ".coair-project-id").write_text("firstproject0001", encoding="utf-8")

    project = {
        "project_id": "secondproject0002",
        "name": "Tower A",
        "slug": "tower-a",
        "org_id": "org1",
    }
    org = {"org_id": "org1", "name": "Ahmad", "slug": "ahmad"}
    monkeypatch.setattr(
        "src.project_store.get_project_store",
        lambda: _FakeProjectStore(project),
    )
    monkeypatch.setattr(
        "src.org_store.get_org_store",
        lambda: _FakeOrgStore(org),
    )

    company, project_slug = tenant_paths.resolve_company_project_slugs(
        "secondproject0002"
    )
    assert company == "ahmad"
    assert project_slug == "tower-a-secondpr"
