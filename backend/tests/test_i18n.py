import datetime as dt

from app import i18n

D = (dt.date.today() + dt.timedelta(days=60)).isoformat()


def test_accept_language_parsing():
    assert i18n.from_accept_language("en-US,en;q=0.9,pt-BR;q=0.8") == "en"
    assert i18n.from_accept_language("fr-FR, pt;q=0.5, en;q=0.4") == "pt-BR"
    assert i18n.from_accept_language("pt-BR;q=0.1, en;q=0.9") == "en"
    assert i18n.from_accept_language("fr, de") is None
    assert i18n.from_accept_language("") is None


def test_messages_have_same_keys():
    assert set(i18n.MESSAGES["pt-BR"]) == set(i18n.MESSAGES["en"])


def test_error_detail_follows_accept_language(client):
    en = client.get("/api/trips/999", headers={"accept-language": "en"})
    pt = client.get("/api/trips/999", headers={"accept-language": "pt-BR"})
    default = client.get("/api/trips/999")
    assert en.json()["detail"] == "Not found"
    assert pt.json()["detail"] == "Não encontrado"
    assert default.json()["detail"] == "Não encontrado"  # NOTIFLY_LANGUAGE defaults to pt-BR


def test_validation_message_translated(client):
    q = {"trip_type": "one_way", "segments": [{"origins": ["  "], "destinations": ["LIS"], "date": D}]}
    r = client.post("/api/search", json=q, headers={"accept-language": "en"})
    assert r.status_code == 422 and "Enter at least one airport" in str(r.json()["detail"])


def test_places_localized(client):
    en = client.get("/api/airports", params={"q": "new york"}, headers={"accept-language": "en"}).json()
    pt = client.get("/api/airports", params={"q": "nova york"}, headers={"accept-language": "pt-BR"}).json()
    assert en[0]["type"] == "city" and en[0]["name"] == "New York (all airports)"
    assert en[0]["country"] == "United States"
    assert pt[0]["name"] == "Nova York (todos os aeroportos)" and pt[0]["country"] == "Estados Unidos"
    # country names match in any language
    assert client.get("/api/airports", params={"q": "united states"}).json()


def test_lang_does_not_leak_between_requests(client):
    client.get("/api/trips/999", headers={"accept-language": "en"})
    assert i18n.current_lang() == "pt-BR"
