from typing import Any
from urllib.parse import urlparse
from urllib.request import HTTPRedirectHandler, Request, build_opener

ALLOWED_REQUEST_SCHEMES = frozenset({"https"})
_CREDENTIAL_HEADERS = frozenset({"authorization", "cookie", "cookie2", "proxy-authorization"})


def _checked_url(url: str) -> str:
    """Reject non-HTTPS URLs before opening them."""
    parsed = urlparse(url)
    scheme = parsed.scheme.lower()
    if scheme not in ALLOWED_REQUEST_SCHEMES or not parsed.hostname:
        raise ValueError(f"Refusing to open a non-HTTPS URL with scheme '{scheme or 'none'}'.")
    return url


def _origin(url: str) -> tuple[str, str, int | None]:
    parsed = urlparse(url)
    return parsed.scheme.lower(), (parsed.hostname or "").casefold(), parsed.port or 443


class SafeHTTPSRedirectHandler(HTTPRedirectHandler):
    """Allow only HTTPS redirects and keep credentials on the original origin."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        _checked_url(newurl)
        redirected = super().redirect_request(req, fp, code, msg, headers, newurl)
        if redirected is not None and _origin(req.full_url) != _origin(redirected.full_url):
            for header in tuple(redirected.headers) + tuple(redirected.unredirected_hdrs):
                if header.lower() in _CREDENTIAL_HEADERS:
                    redirected.remove_header(header)
        return redirected


_HTTPS_OPENER = build_opener(SafeHTTPSRedirectHandler())
urlopen = _HTTPS_OPENER.open


def build_checked_request(
    url: str,
    *,
    data: bytes | None = None,
    headers: dict[str, str] | None = None,
    method: str = "GET",
) -> Request:
    """Build an outbound request, rejecting non-HTTPS URLs."""
    return Request(  # noqa: S310 - scheme validated by _checked_url
        _checked_url(url),
        data=data,
        headers=headers or {},
        method=method,
    )


def open_checked_url(target: str | Request, *, timeout: int) -> Any:
    """Open an HTTPS URL after validating direct and provider-supplied targets."""
    url = target if isinstance(target, str) else target.full_url
    _checked_url(url)
    return urlopen(target, timeout=timeout)
