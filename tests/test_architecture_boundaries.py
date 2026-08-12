import ast
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
APP_ROOT = PROJECT_ROOT / "app"


def _imports(path: Path) -> set[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    modules: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            modules.update(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            modules.add(node.module)
    return modules


def _assert_no_imports(root: Path, forbidden: tuple[str, ...]) -> None:
    violations: list[str] = []
    for path in root.rglob("*.py"):
        for module in _imports(path):
            if module in forbidden or module.startswith(tuple(f"{name}." for name in forbidden)):
                violations.append(f"{path.relative_to(PROJECT_ROOT)} -> {module}")
    assert not violations, "Forbidden dependency direction:\n" + "\n".join(violations)


def test_domain_depends_on_no_outer_layers() -> None:
    _assert_no_imports(
        APP_ROOT / "domain",
        ("app.api", "app.application", "app.infrastructure"),
    )


def test_application_depends_on_no_api_or_infrastructure() -> None:
    _assert_no_imports(
        APP_ROOT / "application",
        ("app.api", "app.infrastructure"),
    )


def test_application_contains_no_repository_service_locator_calls() -> None:
    violations: list[str] = []
    for path in (APP_ROOT / "application").rglob("*.py"):
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        for node in ast.walk(tree):
            if (
                isinstance(node, ast.Call)
                and isinstance(node.func, ast.Name)
                and node.func.id == "get_repositories"
            ):
                violations.append(str(path.relative_to(PROJECT_ROOT)))
    assert not violations, "Application service locator calls: " + ", ".join(violations)
