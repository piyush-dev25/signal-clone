class ServiceError(Exception):
    """Business-rule failure; mapped to an HTTP response by the handler in app.main."""

    status_code = 400
    detail = "Bad request"

    def __init__(self, detail: str | None = None) -> None:
        super().__init__(detail or self.detail)
        if detail:
            self.detail = detail


class InvalidOtp(ServiceError):
    status_code = 400
    detail = "Invalid verification code"
