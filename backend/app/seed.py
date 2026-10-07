"""Demo data, run on every boot. Idempotent: does nothing once any user exists.

All timestamps are relative to "now" so the app looks fresh after every (ephemeral) deploy.
Users, contacts and direct chats go through the same services as the API; groups and
messages are written with the ORM until their services exist (Phases 3 and 5).
"""

from dataclasses import dataclass, field
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import utcnow
from app.models import Conversation, ConversationMember, Message, User
from app.services.contacts import add_contact
from app.services.conversations import get_or_create_direct
from app.services.users import get_or_create_by_phone, update_profile

# key, phone, display name, avatar, last seen (minutes ago)
USERS = [
    ("priya", "+919876543210", "Priya Sharma", None, 5),
    ("rahul", "+919812345678", "Rahul Verma", None, 2),
    ("ananya", "+919898989898", "Ananya Iyer", "preset:owl", 10),
    ("vikram", "+919845012345", "Vikram Singh", "preset:rocket", 26 * 60 - 34),
    ("meera", "+919900112233", "Meera Nair", "preset:sunflower", 30),
    ("arjun", "+919731234567", "Arjun Mehta", None, 45),
]

# owner -> [(contact, nickname)]
CONTACTS = {
    "priya": [("rahul", None), ("ananya", None), ("vikram", "Vikky"), ("meera", None), ("arjun", None)],
    "rahul": [("priya", None), ("ananya", None), ("arjun", None)],
    "ananya": [("priya", None), ("rahul", None), ("meera", None)],
}

SYSTEM = object()  # marks a system message in a script


@dataclass
class Thread:
    members: list[str]
    # (sender, text or SYSTEM, minutes ago); oldest first
    messages: list[tuple[str, object, float]]
    group_name: str | None = None
    admins: list[str] = field(default_factory=list)
    # member -> how many trailing messages they have not read / not received
    unread: dict[str, int] = field(default_factory=dict)
    undelivered: dict[str, int] = field(default_factory=dict)
    # (message index, quoted message index)
    reply: tuple[int, int] | None = None


def _session(start_min: float, lines: list[tuple[str, str]], gap: float = 1.5) -> list[tuple[str, str, float]]:
    """A burst of messages starting `start_min` minutes ago, `gap` minutes apart."""
    return [(sender, text, start_min - i * gap) for i, (sender, text) in enumerate(lines)]


DAY = 24 * 60

# Priya and Rahul: the long conversation (100+ messages over five days) for pagination.
LONG_CHAT = (
    _session(5 * DAY, [
        ("rahul", "Did you see the match last night?"),
        ("priya", "Only the last 5 overs, I was stuck in a meeting"),
        ("rahul", "Those were the only overs that mattered honestly"),
        ("priya", "That last six was unreal"),
        ("rahul", "I jumped so hard my neighbour knocked on the wall"),
        ("priya", "😂 classic"),
        ("rahul", "Are you watching the next one?"),
        ("priya", "Sunday? Yes, if I finish this release"),
        ("rahul", "Come over, I'll order biryani"),
        ("priya", "Now you're talking"),
        ("rahul", "Bring the speaker though, mine died"),
        ("priya", "Done 👍"),
    ])
    + _session(4 * DAY + 300, [
        ("priya", "Quick question, which laptop did you get last year?"),
        ("rahul", "The 14 inch one with 32 GB RAM"),
        ("priya", "Is it still holding up?"),
        ("rahul", "Battery is a bit worse but otherwise great"),
        ("rahul", "Why, upgrading?"),
        ("priya", "Mine takes two minutes to open the IDE now"),
        ("rahul", "That's a cry for help"),
        ("priya", "Office won't replace it until March"),
        ("rahul", "Wait for the sale next week, prices drop a lot"),
        ("priya", "Good idea, I'll hold off"),
        ("rahul", "Send me the links before you buy anything"),
        ("priya", "Will do"),
    ])
    + _session(4 * DAY - 120, [
        ("rahul", "Mom is asking if you're coming for Diwali dinner"),
        ("priya", "Of course! Tell aunty I'll bring the gulab jamun"),
        ("rahul", "She'll be thrilled, she still talks about last year's batch"),
        ("priya", "Haha that was my mom's recipe, I just carried the box"),
        ("rahul", "Shh, nobody needs to know"),
        ("priya", "What time?"),
        ("rahul", "Around 7, puja first"),
        ("priya", "Perfect"),
        ("rahul", "Arjun is coming too"),
        ("priya", "Ooh haven't seen him in ages"),
    ])
    + _session(3 * DAY + 600, [
        ("priya", "Help, my code review has 46 comments"),
        ("rahul", "Who reviewed it?"),
        ("priya", "The new staff engineer"),
        ("rahul", "Ah. Thorough guy"),
        ("priya", "Half of them are about naming"),
        ("rahul", "Pick your battles. Fix the naming, push back on the rest"),
        ("priya", "That's actually solid advice"),
        ("rahul", "I've been there, trust me"),
        ("priya", "Okay fixing them one by one"),
        ("rahul", "Put on some lo-fi, it helps"),
        ("priya", "Already on 🎧"),
    ])
    + _session(3 * DAY - 60, [
        ("rahul", "Have you started the series I told you about?"),
        ("priya", "Watched 3 episodes yesterday"),
        ("rahul", "And?"),
        ("priya", "The plot twist in episode 2!!"),
        ("rahul", "Right?? Wait till you get to 5"),
        ("priya", "No spoilers please"),
        ("rahul", "My lips are sealed 🤐"),
        ("priya", "I might finish it this weekend"),
        ("rahul", "Then we discuss over coffee"),
        ("priya", "Deal"),
    ])
    + _session(2 * DAY + 400, [
        ("priya", "Did you pay the electricity bill for the flat?"),
        ("rahul", "Not yet, the app keeps failing"),
        ("priya", "Try the website, it worked for me last month"),
        ("rahul", "Okay trying now"),
        ("rahul", "Done! ₹2,340"),
        ("priya", "I'll send you my half"),
        ("rahul", "No rush"),
        ("priya", "Sent"),
        ("rahul", "Got it, thanks"),
        ("priya", "Also the plumber is coming Thursday"),
        ("rahul", "I'll be home, I'll let him in"),
        ("priya", "You're a lifesaver"),
    ])
    + _session(2 * DAY - 200, [
        ("rahul", "Gym tomorrow at 6?"),
        ("priya", "6 AM?? Who are you"),
        ("rahul", "New me. Resolution starts now"),
        ("priya", "Let's see how long that lasts"),
        ("rahul", "Have some faith"),
        ("priya", "Fine. 6:30 and you buy breakfast after"),
        ("rahul", "Deal"),
        ("priya", "If you're not there by 6:35 I'm going back to sleep"),
        ("rahul", "Noted 😅"),
    ])
    + _session(DAY + 500, [
        ("rahul", "Okay I survived the gym"),
        ("priya", "Barely. You were groaning on the treadmill"),
        ("rahul", "That was a warm-up groan"),
        ("priya", "Sure it was"),
        ("rahul", "Same time Friday?"),
        ("priya", "Let's do it"),
        ("rahul", "Look at us being responsible adults"),
        ("priya", "Don't jinx it"),
    ])
    + _session(DAY - 300, [
        ("priya", "Do you have Arjun's new number?"),
        ("rahul", "Yeah, he's on Signal now too"),
        ("priya", "Oh nice, I'll add him"),
        ("rahul", "He's planning a trek next month by the way"),
        ("priya", "Already in the group 😄"),
        ("rahul", "Of course you are"),
        ("priya", "Someone has to organise these things"),
        ("rahul", "Our fearless leader"),
        ("priya", "Bow down"),
        ("rahul", "🙇"),
    ])
    + _session(300, [
        ("priya", "Are we still on for the movie tonight?"),
        ("rahul", "Yes! 9:15 show"),
        ("priya", "I booked seats in row F"),
        ("rahul", "Perfect, middle seats?"),
        ("priya", "Yep, F7 and F8"),
        ("rahul", "Popcorn is on me"),
        ("priya", "Caramel please"),
        ("rahul", "Obviously"),
        ("priya", "Meet at the entrance at 9?"),
        ("rahul", "See you there"),
    ])
    + _session(12, [
        ("priya", "Leaving office now"),
        ("rahul", "Traffic is crazy on the ring road, take the metro"),
        ("priya", "Good call"),
        ("rahul", "I'm already here btw"),
        ("rahul", "Got the popcorn 🍿"),
        ("rahul", "Where are you?"),
    ], gap=1.4)
)

THREADS = [
    Thread(
        members=["priya", "rahul"],
        messages=LONG_CHAT,
        unread={"priya": 3},  # Rahul's last three
    ),
    Thread(
        group_name="Weekend Trek",
        members=["priya", "rahul", "ananya", "vikram"],
        admins=["priya"],
        messages=[("priya", SYSTEM, 2 * DAY)]
        + _session(2 * DAY - 2, [
            ("priya", "Made a group for the Rajmachi trek so we stop losing messages"),
            ("vikram", "Finally 🙌"),
            ("ananya", "Which weekend are we thinking?"),
            ("priya", "The 18th? Weather looks clear"),
            ("rahul", "Works for me"),
        ], gap=3)
        + _session(2 * DAY - 200, [
            ("vikram", "I can drive, the car fits five"),
            ("ananya", "Should we start at 5 AM to beat the heat?"),
            ("priya", "5 AM sounds right. I'll book the homestay for Saturday night"),
            ("rahul", "I'll bring the first aid kit and the stove"),
            ("ananya", "Who's getting snacks?"),
            ("vikram", "Me, obviously"),
        ], gap=4)
        + _session(40, [
            ("priya", "Homestay confirmed! ₹900 each"),
            ("rahul", "Sending my share now"),
            ("ananya", "Do we need sleeping bags?"),
            ("rahul", "They provide mattresses, just bring a sheet"),
            ("rahul", "Also carry a headlamp, the last stretch is dark"),
        ], gap=7),
        unread={"priya": 4, "ananya": 2, "vikram": 5},
        undelivered={"vikram": 5},
    ),
    Thread(
        members=["priya", "meera"],
        messages=_session(80, [
            ("meera", "Hey! Are you free for a call this week?"),
            ("priya", "Sure, what's up?"),
            ("meera", "Thinking of switching teams and wanted your take"),
            ("priya", "Of course. Thursday evening works"),
            ("meera", "Perfect, 6 PM?"),
            ("priya", "Done, I'll send an invite"),
            ("meera", "Thank you so much 🙏"),
            ("priya", "Anytime"),
        ], gap=5)
        + _session(42, [
            ("meera", "Also, did you finish the book for club?"),
            ("meera", "I'm only halfway, no spoilers on Sunday!"),
        ], gap=2),
        unread={"priya": 2},
    ),
    Thread(
        members=["priya", "ananya"],
        messages=_session(200, [
            ("ananya", "Morning! Can you share the slides from Monday's review?"),
            ("priya", "Sure, give me a minute"),
            ("priya", "Sent them to your work email"),
            ("ananya", "Got them, thanks!"),
            ("ananya", "Is the deadline still Friday?"),
            ("priya", "Moved to next Wednesday"),
            ("ananya", "Phew, that helps a lot"),
            ("ananya", "Lunch today?"),
            ("priya", "Yes! The new South Indian place?"),
            ("ananya", "Yes! Heard their dosa is amazing 😄"),
            ("ananya", "12:30 at the lobby?"),
            ("priya", "See you there"),
        ], gap=6),
        reply=(5, 4),  # "Moved to next Wednesday" quotes "Is the deadline still Friday?"
        unread={"ananya": 1},  # Priya's last message: delivered, not read
    ),
    Thread(
        group_name="Book Club",
        members=["meera", "priya", "ananya", "arjun"],
        admins=["meera"],
        messages=[("meera", SYSTEM, 6 * DAY)]
        + _session(6 * DAY - 5, [
            ("meera", "Welcome to the book club! First pick: The Midnight Library"),
            ("ananya", "Love it, I've wanted to read that one"),
            ("arjun", "Ordering a copy today"),
        ], gap=10)
        + _session(3 * DAY, [
            ("priya", "Halfway through. The concept is so good"),
            ("meera", "Right? The chapter about the glacier got me"),
            ("arjun", "I'm only on chapter 4, no spoilers 🙈"),
        ], gap=30)
        + _session(320, [
            ("meera", "Meetup on Sunday at Third Wave, 11 AM?"),
            ("ananya", "I'm in"),
            ("priya", "Works for me"),
            ("arjun", "I'll try to finish by then"),
            ("meera", "Great, I'll reserve the corner table"),
            ("priya", "Bringing my annotated copy 📚"),
        ], gap=4),
        unread={"arjun": 3},
    ),
    Thread(
        members=["rahul", "arjun"],
        messages=_session(190, [
            ("arjun", "Bro, are you joining Priya's trek?"),
            ("rahul", "Yes, already in the group"),
            ("arjun", "I'm not added yet"),
            ("rahul", "I'll ask her to add you"),
            ("arjun", "Thanks man"),
            ("rahul", "Do you have trekking shoes?"),
            ("arjun", "Old ones, might need new ones"),
            ("rahul", "Decathlon has a sale this week"),
            ("arjun", "Going there tomorrow then"),
            ("rahul", "👍"),
        ], gap=3),
    ),
    Thread(
        members=["priya", "vikram"],
        messages=_session(26 * 60, [
            ("vikram", "Do you still have my power bank?"),
            ("priya", "Oh no, yes! It's in my bag"),
            ("vikram", "Haha no worries"),
            ("vikram", "Bring it on the trek"),
            ("priya", "Will do, sorry!"),
            ("vikram", "Also can you send the homestay contact?"),
            ("priya", "Sure, one sec"),
            ("priya", "Shanti Homestay, +91 98200 12345"),
            ("vikram", "Thanks!"),
            ("priya", "Let me know if they ask for an advance"),
        ], gap=4),
        undelivered={"vikram": 1},  # Priya's last message: sent only
        unread={"vikram": 1},
    ),
]


def _cursor(ids: list[int], missing: int) -> int:
    """Id of the last message before the trailing `missing` ones (0 if none)."""
    index = len(ids) - 1 - missing
    return ids[index] if index >= 0 else 0


def run_seed(db: Session) -> bool:
    """Seed demo data into an empty database. Returns False (and does nothing) otherwise."""
    if db.scalar(select(User.id).limit(1)) is not None:
        return False
    now = utcnow()

    def ago(minutes: float) -> datetime:
        return now - timedelta(minutes=minutes)

    users: dict[str, User] = {}
    for key, phone, name, avatar, last_seen_min in USERS:
        user, _ = get_or_create_by_phone(db, phone)
        update_profile(db, user, {"display_name": name, "avatar": avatar})
        user.created_at = ago(30 * DAY)
        user.last_seen = ago(last_seen_min)
        users[key] = user
    db.commit()

    for owner, entries in CONTACTS.items():
        for contact_key, nickname in entries:
            add_contact(db, users[owner], users[contact_key].phone, nickname)

    conversations: list[Conversation] = []
    for thread in THREADS:
        created = ago(thread.messages[0][2] + 1)
        if thread.group_name is None:
            a, b = (users[k] for k in thread.members)
            conversation = get_or_create_direct(db, a, b.id)
        else:
            creator = users[thread.admins[0]]
            conversation = Conversation(type="group", name=thread.group_name, created_by=creator.id)
            db.add(conversation)
            db.flush()
            db.add_all(
                ConversationMember(
                    conversation_id=conversation.id,
                    user_id=users[k].id,
                    role="admin" if k in thread.admins else "member",
                )
                for k in thread.members
            )
        conversation.created_at = created
        for member in db.scalars(
            select(ConversationMember).where(ConversationMember.conversation_id == conversation.id)
        ):
            member.joined_at = created
        conversations.append(conversation)
    db.commit()

    # Insert every message in global time order so ids are chronological across conversations
    # (the conversation list orders by latest message id).
    scheduled = []
    for t_index, thread in enumerate(THREADS):
        for m_index, (sender, text, minutes) in enumerate(thread.messages):
            scheduled.append((ago(minutes), t_index, m_index, sender, text))
    scheduled.sort(key=lambda item: (item[0], item[1], item[2]))

    by_thread: dict[int, dict[int, Message]] = {i: {} for i in range(len(THREADS))}
    for created_at, t_index, m_index, sender, text in scheduled:
        thread, conversation = THREADS[t_index], conversations[t_index]
        is_system = text is SYSTEM
        message = Message(
            conversation_id=conversation.id,
            sender_id=users[sender].id,
            type="system" if is_system else "text",
            body=None if is_system else text,
            meta=(
                {"action": "group_created", "actor_id": users[sender].id, "name": thread.group_name}
                if is_system
                else None
            ),
            created_at=created_at,
        )
        db.add(message)
        db.flush()  # assign the id now, in time order
        by_thread[t_index][m_index] = message

    for t_index, thread in enumerate(THREADS):
        messages = by_thread[t_index]
        if thread.reply:
            message_index, quoted_index = thread.reply
            messages[message_index].reply_to_id = messages[quoted_index].id
        ids = [messages[i].id for i in range(len(thread.messages))]
        for member in db.scalars(
            select(ConversationMember).where(ConversationMember.conversation_id == conversations[t_index].id)
        ):
            key = next(k for k, u in users.items() if u.id == member.user_id)
            read = _cursor(ids, thread.unread.get(key, 0))
            delivered = _cursor(ids, thread.undelivered.get(key, 0))
            member.last_read_message_id = read
            member.last_delivered_message_id = max(delivered, read)
    db.commit()
    return True
