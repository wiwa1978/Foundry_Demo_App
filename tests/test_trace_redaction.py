from app.foundry_client import redact_foundry_trace


def test_trace_redaction_removes_sensitive_content():
    trace = {
        "model": "gpt-test",
        "prompt": "private prompt",
        "messages": [{"role": "user", "content": "private history"}],
        "usage": {"total_tokens": 10},
    }

    redacted = redact_foundry_trace(trace)

    assert redacted == {
        "model": "gpt-test",
        "prompt": "[redacted]",
        "messages": "[redacted]",
        "usage": {"total_tokens": 10},
    }
