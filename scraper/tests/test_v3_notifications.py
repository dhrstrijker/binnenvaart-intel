from v3.notifications import dispatch_outbox_notifications_v3


def test_dispatch_outbox_notifications_sends_and_marks_sent(monkeypatch):
    sent_payload = {}

    monkeypatch.setattr(
        "v3.notifications.load_outbox_pending",
        lambda limit=200: [
            {
                "id": "o1",
                "run_id": "r1",
                "source": "galle",
                "event_id": "e1",
                "event_type": "inserted",
                "payload": {"_source_id": "s1", "_new_price": 12345},
                "created_at": "2026-02-11T10:00:00Z",
            }
        ],
    )
    monkeypatch.setattr(
        "v3.notifications.load_vessels_by_source_ids",
        lambda source, source_ids: {
            source_id: {
                "id": "v1",
                "name": "MS Test",
                "source": source,
                "source_id": source_id,
                "price": 12345,
                "url": "https://example.com",
                "type": "Motorvrachtschip",
                "length_m": 80,
                "width_m": 9.5,
                "build_year": 2000,
                "tonnage": 1200,
                "status": "active",
            }
            for source_id in source_ids
        },
    )

    def _send(stats, changes):
        sent_payload["stats"] = stats
        sent_payload["changes"] = changes
        return {
            "failed_sends": 0,
            "successful_sends": 1,
            "history_write_failures": 0,
            "blocked_reason": None,
        }

    monkeypatch.setattr("v3.notifications.send_personalized_notifications", _send)
    monkeypatch.setattr("v3.notifications.mark_outbox_sent", lambda ids: sent_payload.setdefault("sent_ids", ids))
    monkeypatch.setattr("v3.notifications.mark_outbox_failed", lambda ids, error: sent_payload.setdefault("failed", (ids, error)))

    result = dispatch_outbox_notifications_v3()

    assert result["sent"] == 1
    assert sent_payload["stats"]["inserted"] == 1
    assert sent_payload["sent_ids"] == ["o1"]
    assert "failed" not in sent_payload



def test_dispatch_outbox_notifications_marks_failed_on_send_error(monkeypatch):
    failed_payload = {}

    monkeypatch.setattr(
        "v3.notifications.load_outbox_pending",
        lambda limit=200: [
            {
                "id": "o1",
                "run_id": "r1",
                "source": "galle",
                "event_id": "e1",
                "event_type": "inserted",
                "payload": {"_source_id": "s1"},
                "created_at": "2026-02-11T10:00:00Z",
            }
        ],
    )
    monkeypatch.setattr(
        "v3.notifications.load_vessels_by_source_ids",
        lambda source, source_ids: {
            source_id: {
                "id": "v1",
                "name": "MS Test",
                "source": source,
                "source_id": source_id,
                "price": 12345,
                "url": "https://example.com",
                "type": "Motorvrachtschip",
                "length_m": 80,
                "width_m": 9.5,
                "build_year": 2000,
                "tonnage": 1200,
                "status": "active",
            }
            for source_id in source_ids
        },
    )
    monkeypatch.setattr("v3.notifications.send_personalized_notifications", lambda *_args, **_kwargs: (_ for _ in ()).throw(RuntimeError("boom")))
    monkeypatch.setattr("v3.notifications.mark_outbox_sent", lambda _ids: None)
    monkeypatch.setattr("v3.notifications.mark_outbox_failed", lambda ids, error: failed_payload.setdefault("failed", (ids, error)))

    result = dispatch_outbox_notifications_v3()

    assert result["failed"] == 1
    assert failed_payload["failed"][0] == ["o1"]


def test_dispatch_outbox_notifications_marks_failed_when_report_has_send_failures(monkeypatch):
    failed_payload = {}

    monkeypatch.setattr(
        "v3.notifications.load_outbox_pending",
        lambda limit=200: [
            {
                "id": "o1",
                "run_id": "r1",
                "source": "galle",
                "event_id": "e1",
                "event_type": "inserted",
                "payload": {"_source_id": "s1"},
                "created_at": "2026-02-11T10:00:00Z",
            }
        ],
    )
    monkeypatch.setattr(
        "v3.notifications.load_vessels_by_source_ids",
        lambda source, source_ids: {
            source_id: {
                "id": "v1",
                "name": "MS Test",
                "source": source,
                "source_id": source_id,
                "price": 12345,
                "url": "https://example.com",
                "type": "Motorvrachtschip",
                "length_m": 80,
                "width_m": 9.5,
                "build_year": 2000,
                "tonnage": 1200,
                "status": "active",
            }
            for source_id in source_ids
        },
    )
    monkeypatch.setattr(
        "v3.notifications.send_personalized_notifications",
        lambda *_args, **_kwargs: {
            "failed_sends": 1,
            "successful_sends": 0,
            "history_write_failures": 0,
            "blocked_reason": None,
        },
    )
    monkeypatch.setattr("v3.notifications.mark_outbox_sent", lambda _ids: None)
    monkeypatch.setattr(
        "v3.notifications.mark_outbox_failed",
        lambda ids, error: failed_payload.setdefault("failed", (ids, error)),
    )

    result = dispatch_outbox_notifications_v3()

    assert result["failed"] == 1
    assert failed_payload["failed"][0] == ["o1"]
    assert "failed send" in failed_payload["failed"][1]


def test_dispatch_outbox_notifications_marks_failed_when_api_key_missing(monkeypatch):
    failed_payload = {}

    monkeypatch.setattr(
        "v3.notifications.load_outbox_pending",
        lambda limit=200: [
            {
                "id": "o1",
                "run_id": "r1",
                "source": "galle",
                "event_id": "e1",
                "event_type": "inserted",
                "payload": {"_source_id": "s1"},
                "created_at": "2026-02-11T10:00:00Z",
            }
        ],
    )
    monkeypatch.setattr(
        "v3.notifications.load_vessels_by_source_ids",
        lambda source, source_ids: {
            source_id: {
                "id": "v1",
                "name": "MS Test",
                "source": source,
                "source_id": source_id,
                "price": 12345,
                "url": "https://example.com",
                "type": "Motorvrachtschip",
                "length_m": 80,
                "width_m": 9.5,
                "build_year": 2000,
                "tonnage": 1200,
                "status": "active",
            }
            for source_id in source_ids
        },
    )
    monkeypatch.setattr(
        "v3.notifications.send_personalized_notifications",
        lambda *_args, **_kwargs: {
            "failed_sends": 0,
            "successful_sends": 0,
            "history_write_failures": 0,
            "blocked_reason": "missing_api_key",
        },
    )
    monkeypatch.setattr("v3.notifications.mark_outbox_sent", lambda _ids: None)
    monkeypatch.setattr(
        "v3.notifications.mark_outbox_failed",
        lambda ids, error: failed_payload.setdefault("failed", (ids, error)),
    )

    result = dispatch_outbox_notifications_v3()

    assert result["failed"] == 1
    assert failed_payload["failed"][0] == ["o1"]
    assert "missing_api_key" in failed_payload["failed"][1]
