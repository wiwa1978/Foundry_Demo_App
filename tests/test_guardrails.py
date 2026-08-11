from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from app.application.chat import (
    guardrail_error_details,
    guardrail_variants,
    public_provider_error,
)
from app.application.conversations import build_model_history
from app.application.foundry_admin import (
    SYSTEM_GUARDRAIL_POLICY_COPIES,
    create_system_guardrail_policy_copies,
    get_deployment_guardrail_policy,
    guardrail_policy_exists,
    list_foundry_deployments,
    list_guardrail_policies,
)
from app.application.models import (
    DEPLOYMENT_DEFAULT_GUARDRAIL,
    ModelSettings,
    _document_to_settings,
)
from app.domain.identity import UserScope
from app.infrastructure.azure.foundry.chat import complete_chat

USER_SCOPE = UserScope(tenant_id="tenant-1", user_id="user-1")


class ProviderError(Exception):
    def __init__(self, body):
        super().__init__("Provider request failed")
        self.body = body


def _policy(name: str, policy_type: str) -> SimpleNamespace:
    return SimpleNamespace(
        id=f"/raiPolicies/{name}",
        name=name,
        properties=SimpleNamespace(
            type=policy_type,
            mode="Blocking",
            base_policy_name="Microsoft.Default",
        ),
    )


def test_content_filter_error_is_reported_as_a_blocked_request():
    error = ProviderError(
        {
            "message": "The response was filtered.",
            "code": "content_filter",
            "content_filters": {"violence": {"filtered": True, "severity": "medium"}},
        }
    )

    assert public_provider_error("Model request", error) == (
        "Request blocked by the configured content safety policy. Modify your prompt and try again."
    )
    assert guardrail_error_details(error) == error.body


def test_nested_content_filter_error_is_reported_as_a_blocked_request():
    error = ProviderError({"error": {"code": "content_filter"}})

    assert public_provider_error("Model stream", error).startswith("Request blocked")


def test_other_provider_errors_remain_generic():
    error = ProviderError({"code": "rate_limit_exceeded"})

    assert public_provider_error("Model request", error) == (
        "Model request failed. Try again later."
    )


@patch("app.application.foundry_admin._create_management_client")
@patch("app.application.foundry_admin.load_admin_config")
def test_lists_only_custom_policies_as_selectable(mock_config, mock_client):
    mock_config.return_value = SimpleNamespace(
        is_configured=True,
        subscription_id="subscription",
        resource_group="group",
        account_name="account",
    )
    client = MagicMock()
    client.rai_policies.list.return_value = [
        _policy("Microsoft.DefaultV2", "SystemManaged"),
        _policy("strict-demo", "UserManaged"),
    ]
    mock_client.return_value = client

    policies = list_guardrail_policies()

    assert [policy["name"] for policy in policies] == [
        "Microsoft.DefaultV2",
        "strict-demo",
    ]
    assert policies[0]["is_selectable"] is False
    assert policies[1]["is_selectable"] is True


@patch("app.application.foundry_admin._create_management_client")
@patch("app.application.foundry_admin.load_admin_config")
def test_creates_selectable_copies_of_system_policies(mock_config, mock_client):
    mock_config.return_value = SimpleNamespace(
        is_configured=True,
        subscription_id="subscription",
        resource_group="group",
        account_name="account",
    )
    default = _policy("Microsoft.Default", "SystemManaged")
    default.properties.content_filters = [
        SimpleNamespace(
            name="Hate",
            source="Prompt",
            enabled=True,
            blocking=True,
            severity_threshold="Medium",
        )
    ]
    default_v2 = _policy("Microsoft.DefaultV2", "SystemManaged")
    default_v2.properties.content_filters = []
    client = MagicMock()
    client.rai_policies.list.return_value = [default, default_v2]
    client.rai_policies.create_or_update.side_effect = [
        _policy(copy_name, "UserManaged") for copy_name in SYSTEM_GUARDRAIL_POLICY_COPIES.values()
    ]
    mock_client.return_value = client

    policies = create_system_guardrail_policy_copies()

    assert [policy["name"] for policy in policies] == [
        "FoundryChat-Microsoft-Default",
        "FoundryChat-Microsoft-DefaultV2",
        "Microsoft.Default",
        "Microsoft.DefaultV2",
    ]
    assert all(
        policy["is_selectable"] for policy in policies if policy["name"].startswith("FoundryChat-")
    )
    first_call = client.rai_policies.create_or_update.call_args_list[0]
    assert first_call.kwargs["rai_policy_name"] == "FoundryChat-Microsoft-Default"
    assert first_call.kwargs["rai_policy"]["properties"] == {
        "basePolicyName": "Microsoft.Default",
        "mode": "Blocking",
        "contentFilters": [
            {
                "name": "Hate",
                "source": "Prompt",
                "enabled": True,
                "blocking": True,
                "severityThreshold": "Medium",
            }
        ],
    }


@patch("app.application.foundry_admin._create_management_client")
@patch("app.application.foundry_admin.load_admin_config")
def test_policy_copy_creation_preserves_existing_copies(mock_config, mock_client):
    mock_config.return_value = SimpleNamespace(
        is_configured=True,
        subscription_id="subscription",
        resource_group="group",
        account_name="account",
    )
    existing = [
        _policy(source_name, "SystemManaged") for source_name in SYSTEM_GUARDRAIL_POLICY_COPIES
    ] + [_policy(copy_name, "UserManaged") for copy_name in SYSTEM_GUARDRAIL_POLICY_COPIES.values()]
    client = MagicMock()
    client.rai_policies.list.return_value = existing
    mock_client.return_value = client

    policies = create_system_guardrail_policy_copies()

    assert len(policies) == 4
    client.rai_policies.create_or_update.assert_not_called()


@patch("app.application.foundry_admin.list_guardrail_policies")
def test_policy_validation_rejects_system_policy(mock_list):
    mock_list.return_value = [
        {"name": "Microsoft.DefaultV2", "is_selectable": False},
        {"name": "strict-demo", "is_selectable": True},
        {"name": "FoundryChat-Microsoft-DefaultV2", "is_selectable": True},
    ]

    assert guardrail_policy_exists("strict-demo") is True
    assert guardrail_policy_exists("Microsoft.DefaultV2") is False
    assert guardrail_policy_exists("FoundryChat-Microsoft-DefaultV2") is True


@patch("app.application.foundry_admin._create_management_client")
@patch("app.application.foundry_admin.load_admin_config")
def test_lists_usable_foundry_deployments(mock_config, mock_client):
    mock_config.return_value = SimpleNamespace(
        is_configured=True,
        subscription_id="subscription",
        resource_group="group",
        account_name="account",
    )
    client = MagicMock()
    client.deployments.list.return_value = [
        SimpleNamespace(
            name="gpt-b",
            properties=SimpleNamespace(
                provisioning_state="Succeeded",
                model=SimpleNamespace(name="gpt-5", version="2026-01-01"),
            ),
        ),
        SimpleNamespace(
            name="failed-model",
            properties=SimpleNamespace(
                provisioning_state="Failed",
                model=SimpleNamespace(name="gpt-4o", version="2024-11-20"),
            ),
        ),
        SimpleNamespace(
            name="gpt-a",
            properties=SimpleNamespace(
                provisioning_state="Succeeded",
                model=SimpleNamespace(name="gpt-4o", version="2024-11-20"),
            ),
        ),
    ]
    mock_client.return_value = client

    deployments = list_foundry_deployments()

    assert [deployment["name"] for deployment in deployments] == ["gpt-a", "gpt-b"]
    assert deployments[1]["model_name"] == "gpt-5"
    client.deployments.list.assert_called_once_with(
        resource_group_name="group",
        account_name="account",
    )


@patch("app.application.foundry_admin._create_management_client")
@patch("app.application.foundry_admin.load_admin_config")
def test_reads_policy_assigned_to_deployment(mock_config, mock_client):
    mock_config.return_value = SimpleNamespace(
        is_configured=True,
        subscription_id="subscription",
        resource_group="group",
        account_name="account",
    )
    client = MagicMock()
    client.deployments.get.return_value = SimpleNamespace(
        name="gpt-demo",
        properties=SimpleNamespace(rai_policy_name="Microsoft.DefaultV2"),
    )
    mock_client.return_value = client

    policy = get_deployment_guardrail_policy("gpt-demo")

    assert policy == {
        "deployment_name": "gpt-demo",
        "policy_name": "Microsoft.DefaultV2",
    }
    client.deployments.get.assert_called_once_with(
        resource_group_name="group",
        account_name="account",
        deployment_name="gpt-demo",
    )


@patch("app.infrastructure.azure.foundry.chat.create_openai_client")
@patch("app.infrastructure.azure.foundry.chat.load_settings")
def test_guarded_chat_sends_policy_header(mock_settings, mock_client_context):
    mock_settings.return_value = SimpleNamespace(is_configured=True, endpoint="endpoint")
    response = SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(content="guarded answer"))],
        usage=SimpleNamespace(
            prompt_tokens=4,
            completion_tokens=2,
            total_tokens=6,
        ),
        model_dump=lambda mode: {
            "choices": [
                {
                    "message": {"content": "guarded answer"},
                    "content_filter_results": {"violence": {"filtered": False}},
                }
            ]
        },
    )
    client = MagicMock()
    client.chat.completions.create.return_value = response
    mock_client_context.return_value.__enter__.return_value = client

    result = complete_chat(
        model="gpt-demo",
        prompt="hello",
        api_surface="chat_completions",
        system_prompt="",
        temperature=0.7,
        top_p=1,
        max_tokens=100,
        guardrail_policy_name="strict-demo",
    )

    assert client.chat.completions.create.call_args.kwargs["extra_headers"] == {
        "x-policy-id": "strict-demo"
    }
    assert result["guardrail_policy_name"] == "strict-demo"
    assert result["guardrail_results"]["content_filter_results"]


@patch("app.application.conversations.get_conversation_messages")
def test_history_keeps_guardrail_variants_separate(mock_messages):
    def message(role, content, variant=None):
        return SimpleNamespace(
            role=role,
            content=content,
            model="gpt-demo" if role == "assistant" else None,
            error=None,
            guardrail_variant=variant,
            guardrail_policy_name=None,
        )

    mock_messages.return_value = [
        message("user", "question"),
        message("assistant", "default answer", "baseline"),
        message("assistant", "guarded answer", "guarded"),
        message("assistant", "legacy answer"),
    ]

    baseline = build_model_history(USER_SCOPE, "conversation", "gpt-demo", "baseline")
    guarded = build_model_history(USER_SCOPE, "conversation", "gpt-demo", "guarded")
    standard = build_model_history(USER_SCOPE, "conversation", "gpt-demo")

    assert [item["content"] for item in baseline] == [
        "question",
        "default answer",
        "legacy answer",
    ]
    assert [item["content"] for item in guarded] == [
        "question",
        "guarded answer",
        "legacy answer",
    ]
    assert [item["content"] for item in standard] == [
        "question",
        "default answer",
        "legacy answer",
    ]


def test_guardrail_variants_use_two_selected_policies():
    settings = ModelSettings(
        model="gpt-demo",
        guardrail_policy_names=(DEPLOYMENT_DEFAULT_GUARDRAIL, "strict-demo"),
    )

    assert guardrail_variants(settings, True) == [
        ("policy_1", None),
        ("policy_2", "strict-demo"),
    ]
    assert guardrail_variants(settings, False) == [(None, None)]


def test_legacy_guardrail_setting_migrates_to_default_vs_custom():
    settings = _document_to_settings(
        {
            "model": "gpt-demo",
            "api_surface": "responses",
            "modalities": ["text"],
            "system_prompt": "help",
            "temperature": 0.7,
            "top_p": 1,
            "max_tokens": 100,
            "repetition_penalty": 1,
            "guardrails_enabled": True,
            "guardrail_policy_name": "strict-demo",
        }
    )

    assert settings.guardrail_policy_names == (
        DEPLOYMENT_DEFAULT_GUARDRAIL,
        "strict-demo",
    )


@patch("app.application.conversations.get_conversation_messages")
def test_history_follows_policy_name_when_slots_change(mock_messages):
    def message(role, content, variant=None, policy_name=None):
        return SimpleNamespace(
            role=role,
            content=content,
            model="gpt-demo" if role == "assistant" else None,
            error=None,
            guardrail_variant=variant,
            guardrail_policy_name=policy_name,
        )

    mock_messages.return_value = [
        message("user", "question"),
        message("assistant", "strict answer", "policy_1", "strict-demo"),
        message("assistant", "lenient answer", "policy_2", "lenient-demo"),
    ]

    strict = build_model_history(
        USER_SCOPE,
        "conversation",
        "gpt-demo",
        "policy_2",
        "strict-demo",
    )

    assert [item["content"] for item in strict] == ["question", "strict answer"]
