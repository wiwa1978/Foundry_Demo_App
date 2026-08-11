"""Tests for outbound URL scheme validation.

Image URLs are read from provider responses, so an unvalidated `urlopen` would let a
malicious or misconfigured provider trigger local file reads via `file://`.
"""

from urllib.request import Request

import pytest

from app.infrastructure.azure.foundry.clients import azure_openai_endpoint, openai_base_url
from app.infrastructure.azure.foundry.http import (
    SafeHTTPSRedirectHandler,
    build_checked_request,
    open_checked_url,
)
from app.infrastructure.azure.foundry.images import _extract_generated_image
from app.infrastructure.azure.foundry.realtime import _normalize_realtime_endpoint

REJECTED_URLS = (
    "file:///etc/passwd",
    "file://C:/Windows/win.ini",
    "ftp://example.com/payload",
    "gopher://example.com/",
    "http://example.com/insecure",
    "/etc/passwd",
    "",
)


@pytest.mark.parametrize("url", REJECTED_URLS)
def test_open_checked_url_rejects_non_https(url):
    with pytest.raises(ValueError, match="non-HTTPS URL"):
        open_checked_url(url, timeout=1)


@pytest.mark.parametrize("url", REJECTED_URLS)
def test_build_checked_request_rejects_non_https(url):
    with pytest.raises(ValueError, match="non-HTTPS URL"):
        build_checked_request(url, method="POST")


def test_build_checked_request_allows_https():
    request = build_checked_request(
        "https://example.com/v1/images",
        data=b"{}",
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    assert request.full_url == "https://example.com/v1/images"
    assert request.get_method() == "POST"


def test_redirect_handler_rejects_redirect_to_http():
    handler = SafeHTTPSRedirectHandler()
    request = Request("https://provider.example/image")

    with pytest.raises(ValueError, match="non-HTTPS URL"):
        handler.redirect_request(request, None, 302, "Found", {}, "http://provider.example/image")


def test_redirect_handler_keeps_credentials_on_same_origin():
    handler = SafeHTTPSRedirectHandler()
    request = Request(
        "https://provider.example/image",
        headers={"Authorization": "Bearer token", "Cookie": "session=secret"},
    )

    redirected = handler.redirect_request(
        request,
        None,
        302,
        "Found",
        {},
        "https://provider.example/rendered",
    )

    assert redirected is not None
    assert redirected.get_header("Authorization") == "Bearer token"
    assert redirected.get_header("Cookie") == "session=secret"


def test_redirect_handler_strips_credentials_across_origins():
    handler = SafeHTTPSRedirectHandler()
    request = Request(
        "https://provider.example/image",
        headers={
            "Authorization": "Bearer token",
            "Cookie": "session=secret",
            "X-Request-ID": "request-1",
        },
    )

    redirected = handler.redirect_request(
        request,
        None,
        302,
        "Found",
        {},
        "https://cdn.example/rendered",
    )

    assert redirected is not None
    assert redirected.get_header("Authorization") is None
    assert redirected.get_header("Cookie") is None
    assert redirected.get_header("X-request-id") == "request-1"


@pytest.mark.parametrize(
    "endpoint",
    (
        "http://example.com",
        "http:example.com",
        "https:example.com",
        "ftp://example.com",
        "file:///tmp/x",
    ),
)
def test_provider_clients_reject_non_https_endpoints(endpoint):
    with pytest.raises(RuntimeError, match="HTTPS"):
        openai_base_url(endpoint)
    with pytest.raises(RuntimeError, match="HTTPS"):
        azure_openai_endpoint(endpoint)


def test_realtime_endpoint_rejects_http():
    with pytest.raises(RuntimeError, match="https://"):
        _normalize_realtime_endpoint("http://example.com/openai/v1")


def test_extract_generated_image_refuses_file_url_from_provider():
    """A provider-supplied `file://` URL must not be fetched."""
    payload = {"data": [{"url": "file:///etc/passwd"}]}

    with pytest.raises(ValueError, match="non-HTTPS URL"):
        _extract_generated_image(payload)


def test_extract_generated_image_prefers_inline_base64():
    payload = {"data": [{"b64_json": "aGVsbG8=", "mime_type": "image/png"}]}

    assert _extract_generated_image(payload) == ("aGVsbG8=", "image/png")
