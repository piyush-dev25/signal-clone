import re

_SEPARATORS = re.compile(r"[\s\-().]")
_E164 = re.compile(r"\+\d{8,15}")


_INDIA = "+91"
_INDIA_NATIONAL = re.compile(r"[1-9]\d{9}")


def normalize_phone(raw: str) -> str:
    """Return "+<digits>" (8-15 digits). A leading + and country code are required.

    +91 numbers must have exactly 10 national digits and no trunk 0, so "+91 098..."
    can't become a second account for the same number.
    """
    phone = _SEPARATORS.sub("", raw)
    if not _E164.fullmatch(phone):
        raise ValueError("Phone number must include a country code, e.g. +91 98765 43210")
    if phone.startswith(_INDIA) and not _INDIA_NATIONAL.fullmatch(phone[len(_INDIA) :]):
        raise ValueError("Indian numbers must have 10 digits and must not start with 0")
    return phone
