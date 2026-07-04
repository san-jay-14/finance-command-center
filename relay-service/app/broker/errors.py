class BrokerError(Exception):
    """Base for all errors an adapter surfaces to callers."""


class BrokerAuthError(BrokerError):
    """Login or session-refresh failed — bad credentials, expired/invalid TOTP,
    missing config, etc.
    """


class BrokerAPIError(BrokerError):
    """An authenticated call to the broker failed for a reason other than auth."""
