import socket
import ipaddress
from typing import Optional
from urllib.parse import urlparse
import httpx
from ddgs import DDGS
import trafilatura
from bs4 import BeautifulSoup
from langchain_core.tools import tool

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)


def _is_ip_blocked(ip_str: str) -> bool:
    """Check if an IP address is private, loopback, link-local, or reserved."""
    try:
        ip = ipaddress.ip_address(ip_str)
        return (
            ip.is_private
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_reserved
            or ip.is_multicast
            or ip.is_unspecified
        )
    except ValueError:
        return True


def _check_ssrf(url: str) -> Optional[str]:
    """Validate URL scheme and resolve host to ensure no private/internal IPs are accessed."""
    try:
        parsed = urlparse(url)
    except Exception:
        return "Invalid URL format."

    if parsed.scheme not in ("http", "https"):
        return "Only http and https URLs are allowed."

    hostname = parsed.hostname
    if not hostname:
        return "Invalid URL: missing hostname."

    if hostname.lower() in ("localhost", "127.0.0.1", "::1"):
        return "This URL is not allowed"

    try:
        addr_info = socket.getaddrinfo(hostname, None)
        for item in addr_info:
            ip = item[4][0]
            if _is_ip_blocked(ip):
                return "This URL is not allowed"
    except socket.gaierror:
        return "Could not resolve hostname."
    except Exception as exc:
        return f"URL security check failed: {str(exc)}"

    return None


@tool
def web_search(query: str) -> str:
    """Search the internet for current information, news, or anything you are not sure about."""
    if not query or not query.strip():
        return "Search query cannot be empty."

    try:
        results = list(DDGS().text(query.strip(), max_results=5))
        if not results:
            return f"No search results found for: {query}"

        formatted = []
        for i, item in enumerate(results, 1):
            title = item.get("title", "Untitled")
            href = item.get("href", "")
            body = item.get("body", "").strip()
            formatted.append(f"{i}. {title}\nURL: {href}\nSnippet: {body}")

        return "\n\n".join(formatted)
    except Exception as exc:
        return f"Search error encountered: {str(exc)}"


@tool
def fetch_url(url: str) -> str:
    """Open a web page link and read its main text content. Use when the user shares a URL."""
    if not url or not url.strip():
        return "URL cannot be empty."

    target_url = url.strip()

    # SSRF Protection Check
    block_reason = _check_ssrf(target_url)
    if block_reason:
        return block_reason

    try:
        headers = {"User-Agent": USER_AGENT}
        with httpx.Client(
            max_redirects=3,
            follow_redirects=True,
            timeout=10.0,
            headers=headers
        ) as client:
            resp = client.get(target_url)

            if resp.status_code == 404:
                return f"Error: Page not found (HTTP 404) at {target_url}"
            if resp.status_code in (401, 403):
                return f"Error: Access blocked or forbidden (HTTP {resp.status_code}) at {target_url}"
            if resp.is_error:
                return f"Error: Failed to fetch page (HTTP {resp.status_code}) at {target_url}"

            html_content = resp.text

            # Extract clean main text with trafilatura
            extracted = trafilatura.extract(html_content)

            # Fallback to BeautifulSoup if trafilatura extracts nothing
            if not extracted or not extracted.strip():
                soup = BeautifulSoup(html_content, "html.parser")
                # Remove scripts and styles
                for element in soup(["script", "style", "noscript", "header", "footer"]):
                    element.decompose()
                extracted = soup.get_text(separator=" ", strip=True)

            if not extracted or not extracted.strip():
                return f"Error: Page content at {target_url} was empty or could not be parsed."

            # Truncate to about 8000 characters
            if len(extracted) > 8000:
                extracted = extracted[:8000].rstrip() + "\n\n[content truncated]"

            return extracted

    except httpx.TimeoutException:
        return f"Error: Request timed out while trying to fetch {target_url}"
    except httpx.TooManyRedirects:
        return f"Error: Too many redirects while trying to fetch {target_url}"
    except httpx.RequestError as req_err:
        return f"Error: Network issue while fetching {target_url}: {str(req_err)}"
    except Exception as exc:
        return f"Error fetching {target_url}: {str(exc)}"


TOOLS = [web_search, fetch_url]
