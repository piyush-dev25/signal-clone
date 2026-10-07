import pytest

from app.services.phone import normalize_phone


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("+919876543210", "+919876543210"),
        ("+91 98765-43210", "+919876543210"),
        ("+1 (415) 555-0100", "+14155550100"),
        ("+44.20.7946.0958", "+442079460958"),
        ("  +61 412 345 678 ", "+61412345678"),
    ],
)
def test_normalizes_valid_numbers(raw, expected):
    assert normalize_phone(raw) == expected


@pytest.mark.parametrize(
    "raw",
    [
        "9876543210",  # no country code
        "0091 98765 43210",  # 00 prefix is not accepted
        "+91 98765 4321a",  # letters
        "+1234567",  # 7 digits: too short
        "+1234567890123456",  # 16 digits: too long
        "++919876543210",
        "+",
        "",
    ],
)
def test_rejects_invalid_numbers(raw):
    with pytest.raises(ValueError):
        normalize_phone(raw)


def test_india_accepts_ten_digit_national_number():
    assert normalize_phone("+91 98765 43210") == "+919876543210"


@pytest.mark.parametrize(
    "raw",
    [
        "+91 098765 43210",  # trunk 0 would otherwise create a duplicate account
        "+91 98765 4321",  # 9 digits
        "+91 98765 432100",  # 11 digits
    ],
)
def test_india_rejects_leading_zero_and_wrong_length(raw):
    with pytest.raises(ValueError):
        normalize_phone(raw)


def test_other_country_codes_keep_8_to_15_digit_rule():
    # Neither the 10-digit length nor the no-leading-0 rule applies outside +91.
    assert normalize_phone("+44 020 7946 0958") == "+4402079460958"
    assert normalize_phone("+1 415 555 0100") == "+14155550100"


def test_india_leading_zero_is_422_at_the_api(client):
    res = client.post("/auth/request-otp", json={"phone": "+91 098765 43210"})
    assert res.status_code == 422
    res = client.post("/auth/request-otp", json={"phone": "+91 98765 43210"})
    assert res.status_code == 200
