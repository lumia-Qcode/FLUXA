"""Network helpers shared by research and image retrieval.

On networks whose IPv6 route is broken, every request to a dual-stack host (Wikipedia,
Wikimedia Commons, OpenAlex) first waits ~21 s for the IPv6 connect to time out before
trying IPv4. That made the image fetcher's short timeout fail on every call, so slides
silently got generic stock photos. Ordering IPv4 addresses first keeps IPv6-only hosts
reachable while avoiding the stall.
"""

import socket

_original_getaddrinfo = socket.getaddrinfo
_installed = False


def _ipv4_first_getaddrinfo(*args, **kwargs):
    infos = _original_getaddrinfo(*args, **kwargs)
    return sorted(infos, key=lambda info: 0 if info[0] == socket.AF_INET else 1)


def prefer_ipv4() -> None:
    """Install the IPv4-first resolver once per process (idempotent)."""
    global _installed
    if _installed:
        return
    socket.getaddrinfo = _ipv4_first_getaddrinfo
    _installed = True


USER_AGENT = "FluxaResearch/2.0 (academic presentation research; contact via project repository)"
