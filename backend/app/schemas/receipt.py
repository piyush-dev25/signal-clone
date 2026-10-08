from pydantic import BaseModel, Field


class ReadIn(BaseModel):
    message_id: int = Field(ge=0)


class ReadOut(BaseModel):
    """The reader's cursors after the call."""

    conversation_id: int
    last_read: int
    last_delivered: int
