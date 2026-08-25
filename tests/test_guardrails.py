from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from app.application.chat_errors import guardrail_error_details, public_provider_error
from app.application.chat_guardrails import guardrail_variants
from app.application.conversation_messages import build_model_history
from app.application.foundry_deployments import (
    get_deployment_guardrail_policy,
    get_model_router_routing,
    list_foundry_deployments,
    update_model_router_routing,
)
from app.application.foundry_guardrails import (
    LOOSE_GUARDRAIL_POLICY_NAME,
    PII_FILTER_NAMES,
    STRICT_GUARDRAIL_POLICY_NAME,
    SYSTEM_GUARDRAIL_POLICY_COPIES,
    create_custom_comparison_guardrails,
    create_system_guardrail_policy_copies,
    guardrail_policy_exists,
    list_guardrail_policies,
)
from app.domain.identity import UserScope
from app.domain.models import DEPLOYMENT_DEFAULT_GUARDRAIL, ModelSettings
from app.infrastructure.azure.foundry.chat import complete_chat, stream_chat
from app.infrastructure.persistence.models import settings_from_record

USER_SCOPE = UserScope(tenant_id="tenant-1", user_id="user-1")
MANAGEMENT_GATEWAY = MagicMock()


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


def test_provider_message_is_preserved_for_policy_diagnostics():
    error = ProviderError(
        {
            "error": {
                "code": "invalid_request_error",
                "message": "The selected RAI policy cannot be applied to this deployment.",
            }
        }
    )

    assert public_provider_error("Model request", error) == (
        "Model request failed: The selected RAI policy cannot be applied to this deployment."
    )


def test_lists_only_custom_policies_as_selectable():
    config = SimpleNamespace(
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
    gateway = MagicMock()
    gateway.create_client.return_value = client

    with patch(
        "app.application.foundry_guardrails.load_admin_config",
        return_value=config,
    ):
        policies = list_guardrail_policies(gateway)

    assert [policy["name"] for policy in policies] == [
        "Microsoft.DefaultV2",
        "strict-demo",
    ]
    assert policies[0]["is_selectable"] is False
    assert policies[1]["is_selectable"] is True


def test_creates_selectable_copies_of_system_policies():
    config = SimpleNamespace(
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
    gateway = MagicMock()
    gateway.create_client.return_value = client

    with patch(
        "app.application.foundry_guardrails.load_admin_config",
        return_value=config,
    ):
        policies = create_system_guardrail_policy_copies(gateway)

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


def test_policy_copy_creation_preserves_existing_copies():
    config = SimpleNamespace(
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
    gateway = MagicMock()
    gateway.create_client.return_value = client

    with patch(
        "app.application.foundry_guardrails.load_admin_config",
        return_value=config,
    ):
        policies = create_system_guardrail_policy_copies(gateway)

    assert len(policies) == 4
    client.rai_policies.create_or_update.assert_not_called()


def test_creates_loose_and_strict_custom_guardrails():
    config = SimpleNamespace(
        is_configured=True,
        subscription_id="subscription",
        resource_group="group",
        account_name="account",
    )
    client = MagicMock()
    client.rai_policies.create_or_update.side_effect = [
        _policy(LOOSE_GUARDRAIL_POLICY_NAME, "UserManaged"),
        _policy(STRICT_GUARDRAIL_POLICY_NAME, "UserManaged"),
    ]
    gateway = MagicMock()
    gateway.create_client.return_value = client

    with patch(
        "app.application.foundry_guardrails.load_admin_config",
        return_value=config,
    ):
        policies = create_custom_comparison_guardrails(gateway)

    assert [policy["name"] for policy in policies] == [
        LOOSE_GUARDRAIL_POLICY_NAME,
        STRICT_GUARDRAIL_POLICY_NAME,
    ]
    created_names = [
        call.kwargs["rai_policy_name"]
        for call in client.rai_policies.create_or_update.call_args_list
    ]
    assert created_names == [LOOSE_GUARDRAIL_POLICY_NAME, STRICT_GUARDRAIL_POLICY_NAME]
    loose_filters = client.rai_policies.create_or_update.call_args_list[0].kwargs[
        "rai_policy"
    ]["properties"]["contentFilters"]
    strict_filters = client.rai_policies.create_or_update.call_args_list[1].kwargs[
        "rai_policy"
    ]["properties"]["contentFilters"]
    hate_prompt_loose = next(
        item
        for item in loose_filters
        if item["name"] == "Hate" and item["source"] == "Prompt"
    )
    hate_prompt_strict = next(
        item
        for item in strict_filters
        if item["name"] == "Hate" and item["source"] == "Prompt"
    )
    jailbreak_strict = next(item for item in strict_filters if item["name"] == "Jailbreak")
    pii_filters = [
        item
        for item in strict_filters
        if item["name"].startswith("PII_") and item["enabled"]
    ]
    task_filters = [
        item
        for item in strict_filters
        if item["name"] == "Task Adherence" and item["enabled"]
    ]
    assert hate_prompt_loose == {
        "name": "Hate",
        "source": "Prompt",
        "enabled": True,
        "blocking": True,
        "severityThreshold": "High",
    }
    assert hate_prompt_strict == {
        "name": "Hate",
        "source": "Prompt",
        "enabled": True,
        "blocking": True,
        "severityThreshold": "Low",
    }
    assert jailbreak_strict["enabled"] is True
    assert jailbreak_strict["blocking"] is True
    assert {item["source"] for item in pii_filters} == {"Prompt", "Completion"}
    assert {item["name"] for item in pii_filters} == set(PII_FILTER_NAMES)
    assert all(item["blocking"] for item in pii_filters)
    assert {item["source"] for item in task_filters} == {"Prompt", "Completion"}
    assert all(item["blocking"] for item in task_filters)


def test_policy_validation_rejects_system_policy():
    policies = [
        {"name": "Microsoft.DefaultV2", "is_selectable": False},
        {"name": "strict-demo", "is_selectable": True},
        {"name": "FoundryChat-Microsoft-DefaultV2", "is_selectable": True},
    ]
    gateway = MagicMock()

    with patch(
        "app.application.foundry_guardrails.list_guardrail_policies",
        return_value=policies,
    ):
        assert guardrail_policy_exists(gateway, "strict-demo") is True
        assert guardrail_policy_exists(gateway, "Microsoft.DefaultV2") is False
        assert guardrail_policy_exists(gateway, "FoundryChat-Microsoft-DefaultV2") is True


def test_lists_usable_foundry_deployments():
    config = SimpleNamespace(
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
    gateway = MagicMock()
    gateway.create_client.return_value = client

    with patch(
        "app.application.foundry_deployments.load_admin_config",
        return_value=config,
    ):
        deployments = list_foundry_deployments(gateway)

    assert [deployment["name"] for deployment in deployments] == ["gpt-a", "gpt-b"]
    assert deployments[1]["model_name"] == "gpt-5"
    client.deployments.list.assert_called_once_with(
        resource_group_name="group",
        account_name="account",
    )


def test_reads_policy_assigned_to_deployment():
    config = SimpleNamespace(
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
    gateway = MagicMock()
    gateway.create_client.return_value = client

    with patch(
        "app.application.foundry_deployments.load_admin_config",
        return_value=config,
    ):
        policy = get_deployment_guardrail_policy(gateway, "gpt-demo")

    assert policy == {
        "deployment_name": "gpt-demo",
        "policy_name": "Microsoft.DefaultV2",
    }
    client.deployments.get.assert_called_once_with(
        resource_group_name="group",
        account_name="account",
        deployment_name="gpt-demo",
    )



def test_reads_model_router_routing_mode():
    config = SimpleNamespace(
        is_configured=True,
        subscription_id="subscription",
        resource_group="group",
        account_name="account",
    )
    client = MagicMock()
    client.deployments.get.return_value = SimpleNamespace(
        name="model-router",
        properties=SimpleNamespace(routing=SimpleNamespace(mode="quality")),
    )
    gateway = MagicMock()
    gateway.create_client.return_value = client

    with patch(
        "app.application.foundry_deployments.load_admin_config",
        return_value=config,
    ):
        routing = get_model_router_routing(gateway, "model-router")

    assert routing == {"deployment_name": "model-router", "mode": "quality"}


def test_updates_model_router_routing_mode_preserving_deployment_shape():
    config = SimpleNamespace(
        is_configured=True,
        subscription_id="subscription",
        resource_group="group",
        account_name="account",
    )
    deployment = SimpleNamespace(
        name="model-router",
        sku=SimpleNamespace(name="GlobalStandard", capacity=10),
        properties=SimpleNamespace(
            model=SimpleNamespace(format="OpenAI", name="model-router", version="2025-11-18"),
            version_upgrade_option="OnceNewDefaultVersionAvailable",
            rai_policy_name="Microsoft.DefaultV2",
            routing=SimpleNamespace(mode="balanced"),
        ),
    )
    updated = SimpleNamespace(
        name="model-router",
        properties=SimpleNamespace(routing=SimpleNamespace(mode="cost")),
    )
    poller = MagicMock()
    poller.result.return_value = updated
    client = MagicMock()
    client.deployments.get.return_value = deployment
    client.deployments.begin_create_or_update.return_value = poller
    gateway = MagicMock()
    gateway.create_client.return_value = client

    with patch(
        "app.application.foundry_deployments.load_admin_config",
        return_value=config,
    ):
        routing = update_model_router_routing(gateway, "model-router", "cost")

    assert routing == {"deployment_name": "model-router", "mode": "cost"}
    resource = client.deployments.begin_create_or_update.call_args.args[3]
    assert resource["properties"]["routing"] == {"mode": "cost"}
    assert resource["properties"]["model"]["name"] == "model-router"
    assert resource["properties"]["raiPolicyName"] == "Microsoft.DefaultV2"

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
            "model": "gpt-5.4-mini",
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
    assert result["routed_model"] == "gpt-5.4-mini"
    assert result["guardrail_results"]["content_filter_results"]



@patch("app.infrastructure.azure.foundry.chat.create_openai_client")
@patch("app.infrastructure.azure.foundry.chat.create_project_openai_client")
@patch("app.infrastructure.azure.foundry.chat.load_settings")
def test_model_router_stream_uses_project_responses(
    mock_settings,
    mock_project_client_context,
    mock_openai_client_context,
):
    mock_settings.return_value = SimpleNamespace(is_configured=True, endpoint="endpoint")
    response = SimpleNamespace(
        output_text="router answer",
        usage=SimpleNamespace(prompt_tokens=4, completion_tokens=2, total_tokens=6),
        model_dump=lambda mode: {
            "model": "gpt-5.4-mini-2026-03-17",
            "output_text": "router answer",
        },
    )
    client = MagicMock()
    client.responses.create.return_value = response
    mock_project_client_context.return_value.__enter__.return_value = client

    events = list(
        stream_chat(
            model="model-router",
            prompt="hello",
            api_surface="responses",
            system_prompt="",
            temperature=0.7,
            top_p=1,
            max_tokens=100,
            reasoning_effort="medium",
        )
    )

    mock_openai_client_context.assert_not_called()
    request = client.responses.create.call_args.kwargs
    assert "stream" not in request
    assert request["reasoning"] == {"effort": "medium"}
    assert events[-1]["content"] == "router answer"
    assert events[-1]["routed_model"] == "gpt-5.4-mini-2026-03-17"


@patch("app.infrastructure.azure.foundry.chat.create_openai_client")
@patch("app.infrastructure.azure.foundry.chat.load_settings")
def test_model_router_stream_uses_non_streaming_chat_completion(
    mock_settings,
    mock_client_context,
):
    mock_settings.return_value = SimpleNamespace(is_configured=True, endpoint="endpoint")
    response = SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(content="router answer"))],
        usage=SimpleNamespace(prompt_tokens=4, completion_tokens=2, total_tokens=6),
        model_dump=lambda mode: {
            "model": "gpt-5.4-mini-2026-03-17",
            "choices": [{"message": {"content": "router answer"}}],
        },
    )
    client = MagicMock()
    client.chat.completions.create.return_value = response
    mock_client_context.return_value.__enter__.return_value = client

    events = list(
        stream_chat(
            model="model-router",
            prompt="hello",
            api_surface="chat_completions",
            system_prompt="",
            temperature=0.7,
            top_p=1,
            max_tokens=100,
        )
    )

    request = client.chat.completions.create.call_args.kwargs
    assert "stream" not in request
    assert {event["type"] for event in events} == {
        "foundry_request",
        "delta",
        "foundry_response",
        "completed",
    }
    assert "temperature" not in request
    assert "top_p" not in request
    assert events[-1]["content"] == "router answer"
    assert events[-1]["routed_model"] == "gpt-5.4-mini-2026-03-17"


@patch("app.infrastructure.azure.foundry.chat.create_mai_openai_client")
@patch("app.infrastructure.azure.foundry.chat.create_openai_client")
@patch("app.infrastructure.azure.foundry.chat.load_settings")
def test_mai_thinking_chat_uses_mai_endpoint_without_sampling(
    mock_settings,
    mock_openai_client_context,
    mock_mai_client_context,
):
    mock_settings.return_value = SimpleNamespace(is_configured=True, endpoint="endpoint")
    response = SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(content="reasoned answer"))],
        usage=None,
        model_dump=lambda mode: {
            "choices": [{"message": {"content": "reasoned answer"}}]
        },
    )
    mai_client = MagicMock()
    mai_client.chat.completions.create.return_value = response
    mock_mai_client_context.return_value.__enter__.return_value = mai_client

    result = complete_chat(
        model="MAI-THINKIN-1",
        prompt="hello",
        api_surface="chat_completions",
        system_prompt="",
        temperature=0.7,
        top_p=1,
        max_tokens=100,
        repetition_penalty=1.2,
        reasoning_effort="high",
    )

    mock_openai_client_context.assert_not_called()
    request = mai_client.chat.completions.create.call_args.kwargs
    assert request["model"] == "MAI-THINKIN-1"
    assert request["max_completion_tokens"] == 100
    assert "temperature" not in request
    assert "top_p" not in request
    assert "frequency_penalty" not in request
    assert result["content"] == "reasoned answer"


def test_history_keeps_guardrail_variants_separate():
    def message(role, content, variant=None):
        return SimpleNamespace(
            role=role,
            content=content,
            model="gpt-demo" if role == "assistant" else None,
            error=None,
            guardrail_variant=variant,
            guardrail_policy_name=None,
        )

    repository = MagicMock()
    repository.list_messages.return_value = [
        message("user", "question"),
        message("assistant", "default answer", "baseline"),
        message("assistant", "guarded answer", "guarded"),
        message("assistant", "legacy answer"),
    ]

    baseline = build_model_history(repository, USER_SCOPE, "conversation", "gpt-demo", "baseline")
    guarded = build_model_history(repository, USER_SCOPE, "conversation", "gpt-demo", "guarded")
    standard = build_model_history(repository, USER_SCOPE, "conversation", "gpt-demo")

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
    settings = settings_from_record(
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


def test_history_follows_policy_name_when_slots_change():
    def message(role, content, variant=None, policy_name=None):
        return SimpleNamespace(
            role=role,
            content=content,
            model="gpt-demo" if role == "assistant" else None,
            error=None,
            guardrail_variant=variant,
            guardrail_policy_name=policy_name,
        )

    repository = MagicMock()
    repository.list_messages.return_value = [
        message("user", "question"),
        message("assistant", "strict answer", "policy_1", "strict-demo"),
        message("assistant", "lenient answer", "policy_2", "lenient-demo"),
    ]

    strict = build_model_history(
        repository,
        USER_SCOPE,
        "conversation",
        "gpt-demo",
        "policy_2",
        "strict-demo",
    )

    assert [item["content"] for item in strict] == ["question", "strict answer"]
