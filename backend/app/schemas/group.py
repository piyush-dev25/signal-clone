from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints, field_validator

GroupName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=50)]


def _distinct(ids: list[int]) -> list[int]:
    if len(set(ids)) != len(ids):
        raise ValueError("Each person can only be listed once")
    return ids


class CreateGroupIn(BaseModel):
    name: GroupName
    member_ids: list[int] = Field(min_length=1)

    _unique = field_validator("member_ids")(_distinct)


class RenameIn(BaseModel):
    name: GroupName


class AddMembersIn(BaseModel):
    user_ids: list[int] = Field(min_length=1)

    _unique = field_validator("user_ids")(_distinct)


class RoleIn(BaseModel):
    role: Literal["admin", "member"]
