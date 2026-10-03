#!/usr/bin/env python3
"""Собирает цены Google Flights на каждый день периода и пишет public/data/google.json.

Запуск: .venv/bin/python scripts/google_flights.py
Период, города и белый список читаются из config.js.
"""
import json
import re
import sys
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from fast_flights import FlightQuery, Passengers, create_query, get_flights

ROOT = Path(__file__).resolve().parent.parent
CONFIG = (ROOT / "config.js").read_text(encoding="utf-8")
OUT = ROOT / "public" / "data" / "google.json"

ORIGIN = re.search(r"origin:\s*'([A-Z]{3})'", CONFIG).group(1)
DESTINATION = re.search(r"destination:\s*'([A-Z]{3})'", CONFIG).group(1)
MONTHS = re.findall(r"'(\d{4}-\d{2})'", re.search(r"months:\s*\[([^\]]*)\]", CONFIG).group(1))
MAX_TRANSFERS = int(re.search(r"maxTransfers:\s*(\d+)", CONFIG).group(1))


def block(name):
    m = re.search(name + r":\s*\{(.*?)\n  \}", CONFIG, re.S)
    return dict(re.findall(r"'?([A-Z0-9]{2})'?:\s*'([^']+)'", m.group(1))) if m else {}


AIRLINES = block("airlines")          # код -> название, белый список
PARTNERS = block("partnerAirlines")   # код -> название, партнёры внутри Бразилии

# Названия из Google Flights -> код IATA
NAME_TO_CODE = {
    "emirates": "EK", "qatar airways": "QR", "turkish airlines": "TK", "etihad airways": "EY", "etihad": "EY",
    "ethiopian airlines": "ET", "ethiopian": "ET", "aeroflot": "SU", "latam": "LA", "latam brasil": "JJ", "gol": "G3",
    "azul": "AD", "american airlines": "AA", "tap air portugal": "TP", "air france": "AF", "klm": "KL",
    "lufthansa": "LH", "swiss": "LX", "iberia": "IB", "royal air maroc": "AT", "air europa": "UX", "ita airways": "AZ",
    "pegasus": "PC", "ajet": "VF", "flydubai": "FZ", "air arabia": "G9", "egyptair": "MS", "air china": "CA",
    "china eastern": "MU", "china southern": "CZ", "avianca": "AV", "copa airlines": "CM", "united": "UA",
    "delta": "DL", "british airways": "BA", "oman air": "WY", "gulf air": "GF", "saudia": "SV", "azerbaijan airlines": "J2",
    "uzbekistan airways": "HY", "air astana": "KC", "pobeda": "DP", "s7 airlines": "S7", "ural airlines": "U6",
}


def code_of(name):
    key = name.strip().lower()
    if key in NAME_TO_CODE:
        return NAME_TO_CODE[key]
    for k, v in NAME_TO_CODE.items():
        if k in key:
            return v
    return name.strip()[:2].upper()


def iso(dt):
    (y, m, d), (hh, mm) = dt["date"], dt["time"]
    return f"{y:04d}-{m:02d}-{d:02d}T{hh:02d}:{mm:02d}:00"


def minutes_between(a, b):
    return int((datetime.fromisoformat(b) - datetime.fromisoformat(a)).total_seconds() // 60)


def normalize(item, day, link):
    legs = [l if isinstance(l, dict) else l.__dict__ for l in item["flights"]]
    legs = [
        {
            "from": (l["from_airport"]["code"] if isinstance(l["from_airport"], dict) else l["from_airport"].code),
            "to": (l["to_airport"]["code"] if isinstance(l["to_airport"], dict) else l["to_airport"].code),
            "dep": iso(l["departure"] if isinstance(l["departure"], dict) else l["departure"].__dict__),
            "arr": iso(l["arrival"] if isinstance(l["arrival"], dict) else l["arrival"].__dict__),
        }
        for l in legs
    ]
    names = list(item["airlines"])
    carriers = [code_of(n) for n in names]
    main = carriers[0] if carriers else "??"
    transfers = max(len(legs) - 1, 0)
    reason, detail = None, None
    if main not in AIRLINES:
        reason = "airline"
    else:
        foreign = next((c for c in carriers if c not in AIRLINES and c not in PARTNERS), None)
        if foreign:
            reason, detail = "partner", foreign
        elif transfers > MAX_TRANSFERS:
            reason = "transfers"
    all_names = dict(AIRLINES)
    all_names.update(PARTNERS)
    return {
        "date": day,
        "returnDate": None,
        "price": int(round(item["price"])),
        "airline": main,
        "airlineName": all_names.get(main) or names[0] if names else main,
        "transfers": transfers,
        "returnTransfers": None,
        "durationMin": minutes_between(legs[0]["dep"], legs[-1]["arr"]) if legs else None,
        "originAirport": legs[0]["from"] if legs else ORIGIN,
        "destinationAirport": legs[-1]["to"] if legs else DESTINATION,
        "departureAt": legs[0]["dep"] if legs else f"{day}T00:00:00",
        "returnAt": None,
        "hubs": [l["to"] for l in legs[:-1]],
        "returnHubs": [],
        "carriers": list(dict.fromkeys(carriers)),
        "carrierNames": names,
        "convenient": False,
        "foundAt": int(time.time() * 1000),
        "link": link,
        "allowed": reason is None,
        "reason": reason,
        "reasonDetail": detail,
        "reasonDetailName": (dict(AIRLINES, **PARTNERS).get(detail) or names[carriers.index(detail)]) if detail else None,
        "source": "google",
    }


def fetch_day(day, attempts=3):
    q = create_query(
        flights=[FlightQuery(date=day, from_airport=ORIGIN, to_airport=DESTINATION, max_stops=MAX_TRANSFERS)],
        trip="one-way", passengers=Passengers(adults=1), language="ru", currency="RUB",
    )
    link = q.url()
    last = None
    for i in range(attempts):
        try:
            res = get_flights(q)
            items = [r if isinstance(r, dict) else r.__dict__ for r in res]
            return [normalize(it, day, link) for it in items if it.get("price")], link, None
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(3 * (i + 1))
    return [], link, f"{type(last).__name__}: {last}"


def days_of(ym):
    y, m = map(int, ym.split("-"))
    d = date(y, m, 1)
    while d.month == m:
        yield d.isoformat()
        d += timedelta(days=1)


def main():
    only = sys.argv[1:]  # для отладки можно передать конкретные даты
    all_days = only or [d for ym in MONTHS for d in days_of(ym)]
    today = date.today().isoformat()
    out_days, errors = {}, []
    previous = json.loads(OUT.read_text()) if OUT.exists() else {}
    for i, day in enumerate(all_days, 1):
        if day < today:
            continue
        offers, link, err = fetch_day(day)
        if err:
            errors.append({"date": day, "error": err})
            # оставляем вчерашние данные по этому дню, если были
            if day in previous.get("days", {}):
                out_days[day] = previous["days"][day]
            print(f"[{i}/{len(all_days)}] {day}: ошибка {err}", flush=True)
        else:
            offers.sort(key=lambda o: o["price"])
            allowed = [o for o in offers if o["allowed"]]
            fastest = sorted(allowed, key=lambda o: o["durationMin"] or 10**9)[:5]
            options = sorted({id(o): o for o in allowed[:10] + fastest}.values(), key=lambda o: o["price"])
            out_days[day] = {
                "best": allowed[0] if allowed else None,
                "fastest": fastest[0] if fastest else None,
                "options": options,
                "cheapestAny": offers[0] if offers else None,
                "total": len(offers),
                "allowedCount": len(allowed),
                "link": link,
            }
            print(f"[{i}/{len(all_days)}] {day}: {len(offers)} билетов, подходят {len(allowed)}"
                  + (f", лучший {allowed[0]['airlineName']} {allowed[0]['price']} ₽" if allowed else ""), flush=True)
        time.sleep(1.5)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({
        "source": "Google Flights",
        "fetchedAt": int(datetime.now(timezone.utc).timestamp() * 1000),
        "adults": 1,
        "months": MONTHS,
        "days": out_days,
        "errors": errors,
    }, ensure_ascii=False), encoding="utf-8")
    print(f"Готово: {len(out_days)} дней, ошибок {len(errors)} → {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
