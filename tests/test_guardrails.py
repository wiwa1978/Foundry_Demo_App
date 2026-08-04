from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from app.conversation_store import build_model_history
from app.foundry_admin import guardrail_policy_exists, list_guardrail_policies
from app.foundry_client import complete_chat


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


@patch("app.foundry_admin._create_management_client")
@patch("app.foundry_admin.load_admin_config")
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


@patch("app.foundry_admin.list_guardrail_policies")
def test_policy_validation_rejects_system_policy(mock_list):
    mock_list.return_value = [
        {"name": "Microsoft.DefaultV2", "is_selectable": False},
        {"name": "strict-demo", "is_selectable": True},
    ]

    assert guardrail_policy_exists("strict-demo") is True
    assert guardrail_policy_exists("Microsoft.DefaultV2") is False


@patch("app.foundry_client._create_openai_client")
@patch("app.foundry_client.load_settings")
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


@patch("app.conversation_store.get_conversation_messages")
def test_history_keeps_guardrail_variants_separate(mock_messages):
    def message(role, content, variant=None):
        return SimpleNamespace(
            role=role,
            content=content,
            model="gpt-demo" if role == "assistant" else None,
            error=None,
            guardrail_variant=variant,
        )

    mock_messages.return_value = [
        message("user", "question"),
        message("assistant", "default answer", "baseline"),
        message("assistant", "guarded answer", "guarded"),
        message("assistant", "legacy answer"),
    ]

    baseline = build_model_history("conversation", "gpt-demo", "baseline")
    guarded = build_model_history("conversation", "gpt-demo", "guarded")
    standard = build_model_history("conversation", "gpt-demo")

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
