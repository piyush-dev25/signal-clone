from tests.live import connect, open_dm, ping, users  # noqa: F401  (users is a fixture)


def typing(ws, conversation_id, is_typing=True):
    ws.send_json({"type": "typing", "data": {"conversation_id": conversation_id, "is_typing": is_typing}})


def typing_events(ws):
    return [e["data"] for e in ping(ws) if e["type"] == "typing"]


def test_typing_is_relayed_to_other_members_only(live_client, users):
    priya, rahul = users["priya"], users["rahul"]
    conv = open_dm(live_client, priya, rahul)
    with connect(live_client, priya) as p_tab1, connect(live_client, priya) as p_tab2, connect(live_client, rahul) as r:
        for ws in (p_tab1, p_tab2, r):
            ping(ws)
        typing(p_tab1, conv, True)
        ping(p_tab1)  # the typing event has been handled once the pong arrives
        assert typing_events(r) == [{"conversation_id": conv, "user_id": priya["id"], "is_typing": True}]
        assert typing_events(p_tab2) == []  # never echoed to the typist's other tabs
        assert typing_events(p_tab1) == []

        typing(p_tab1, conv, False)
        ping(p_tab1)
        assert typing_events(r) == [{"conversation_id": conv, "user_id": priya["id"], "is_typing": False}]


def test_typing_from_non_member_is_ignored(live_client, users):
    priya, rahul, meera = users["priya"], users["rahul"], users["meera"]
    conv = open_dm(live_client, priya, rahul)
    with connect(live_client, rahul) as r, connect(live_client, meera) as m:
        ping(r)
        typing(m, conv, True)
        ping(m)
        assert typing_events(r) == []


def test_malformed_typing_is_ignored(live_client, users):
    priya, rahul = users["priya"], users["rahul"]
    conv = open_dm(live_client, priya, rahul)
    with connect(live_client, priya) as p, connect(live_client, rahul) as r:
        ping(r)
        for data in [None, {}, {"conversation_id": str(conv), "is_typing": True}, {"conversation_id": conv, "is_typing": "yes"}]:
            p.send_json({"type": "typing", "data": data})
        ping(p)  # still connected and responsive
        assert typing_events(r) == []
