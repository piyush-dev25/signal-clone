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


class BadRequest(ServiceError):
    status_code = 400


class NotFound(ServiceError):
    status_code = 404
    detail = "Not found"


class Conflict(ServiceError):
    status_code = 409
    detail = "Already exists"
