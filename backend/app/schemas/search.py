from pydantic import BaseModel

from app.schemas.contact import ContactOut
from app.schemas.conversation import ConversationOut


class SearchOut(BaseModel):
    contacts: list[ContactOut]
    conversations: list[ConversationOut]
