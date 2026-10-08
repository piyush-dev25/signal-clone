import time

import pytest

from app.config import settings
from app.models import User
from tests.live import connect, open_dm, ping, users  # noqa: F401  (users is a fixture)

GRACE = 0.1


@pytest.fixture(autouse=True)
def short_grace(monkeypatch):
    monkeypatch.setattr(settings, "presence_grace_seconds", GRACE)


def presence_events(ws):
    return [e["data"] for e in ping(ws) if e["type"] == "presence"]


def after_grace():
    time.sleep(GRACE * 4)


def online_flag(client, viewer, user_id):
    convs = client.get("/conversations", headers=viewer["headers"]).json()
    return next(m["online"] for c in convs for m in c["members"] if m["user_id"] == user_id)


def test_online_on_connect_and_offline_after_grace(live_client, users, db):
    priya, rahul = users["priya"], users["rahul"]
    open_dm(live_client, priya, rahul)
    with connect(live_client, priya) as p:
        ping(p)
        with connect(live_client, rahul) as r:
            ping(r)
            [online] = presence_events(p)
            assert online == {"user_id": rahul["id"], "online": True, "last_seen": None}
            assert online_flag(live_client, priya, rahul["id"]) is True
        assert presence_events(p) == []  # not yet: still inside the grace period
        after_grace()
        [offline] = presence_events(p)
        assert offline["user_id"] == rahul["id"] and offline["online"] is False
        assert offline["last_seen"].endswith("Z")
        assert online_flag(live_client, priya, rahul["id"]) is False

    db.expire_all()
    assert db.get(User, rahul["id"]).last_seen is not None


def test_quick_reconnect_does_not_flicker(live_client, users):
    priya, rahul = users["priya"], users["rahul"]
    open_dm(live_client, priya, rahul)
    with connect(live_client, priya) as p:
        with connect(live_client, rahul) as r:
            ping(r)
        with connect(live_client, rahul) as r:  # e.g. a page refresh
            ping(r)
            after_grace()
            ping(p)  # the first "online" from the original connect
            assert presence_events(p) == []  # no offline, and no second online
        after_grace()
        assert [e["online"] for e in presence_events(p)] == [False]


def test_two_tabs_stay_online_until_both_close(live_client, users):
    priya, rahul = users["priya"], users["rahul"]
    open_dm(live_client, priya, rahul)
    with connect(live_client, priya) as p:
        ping(p)
        with connect(live_client, rahul) as tab1:
            ping(tab1)
            assert [e["online"] for e in presence_events(p)] == [True]
            with connect(live_client, rahul) as tab2:
                ping(tab2)
                assert presence_events(p) == []  # a second tab announces nothing
            after_grace()
            assert presence_events(p) == []  # one tab still open
            assert online_flag(live_client, priya, rahul["id"]) is True
        after_grace()
        assert [e["online"] for e in presence_events(p)] == [False]


def test_presence_only_reaches_people_who_share_a_conversation(live_client, users):
    priya, rahul, meera = users["priya"], users["rahul"], users["meera"]
    open_dm(live_client, priya, rahul)
    with connect(live_client, meera) as m:
        ping(m)
        with connect(live_client, rahul) as r:
            ping(r)
        after_grace()
        assert presence_events(m) == []
