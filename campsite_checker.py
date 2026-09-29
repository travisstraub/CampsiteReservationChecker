#!/usr/bin/env python3
"""Poll ReserveCalifornia for campsite availability and send SMS alerts.

Run once (e.g. from cron):     python campsite_checker.py --once
Run as a long-lived service:   python campsite_checker.py
Send a test SMS:               python campsite_checker.py --test-notify

See README.md and config.example.toml for configuration.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import logging
import os
import random
import smtplib
import sys
import time
from dataclasses import dataclass, field
from email.message import EmailMessage
from pathlib import Path

import requests

try:
    import tomllib  # Python 3.11+
except ModuleNotFoundError:  # pragma: no cover
    import tomli as tomllib  # type: ignore[no-redef]

log = logging.getLogger("campsite_checker")

GRID_URL = "https://calirdr.usedirect.com/RDR/rdr/search/grid"
BOOKING_URL = "https://www.reservecalifornia.com/Web/#!park/{park_id}/{facility_id}"
# The grid endpoint is queried in windows of this many days.
WINDOW_DAYS = 30
HEADERS = {
    "Content-Type": "application/json; charset=utf-8",
    "Accept": "application/json",
    "User-Agent": (
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
    ),
}


# --------------------------------------------------------------------------- #
# Configuration
# --------------------------------------------------------------------------- #

@dataclass
class Watch:
    name: str
    facility_id: str
    park_id: str | None
    start_date: dt.date
    end_date: dt.date
    nights: int = 1
    sites: list[str] = field(default_factory=list)
    weekdays: list[int] = field(default_factory=list)  # 0=Mon .. 6=Sun

    @property
    def booking_url(self) -> str:
        if self.park_id:
            return BOOKING_URL.format(park_id=self.park_id, facility_id=self.facility_id)
        return "https://www.reservecalifornia.com/"


def _parse_date(value, default: dt.date) -> dt.date:
    if value is None:
        return default
    if isinstance(value, dt.date):
        return value
    return dt.date.fromisoformat(str(value))


WEEKDAY_NAMES = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]


def _parse_weekdays(values) -> list[int]:
    out = []
    for v in values or []:
        key = str(v).strip().lower()[:3]
        if key not in WEEKDAY_NAMES:
            raise ValueError(f"Unknown weekday {v!r}; use Mon, Tue, ... Sun")
        out.append(WEEKDAY_NAMES.index(key))
    return out


def load_config(path: Path) -> dict:
    with open(path, "rb") as f:
        cfg = tomllib.load(f)

    today = dt.date.today()
    watches = []
    for raw in cfg.get("watch", []):
        watches.append(
            Watch(
                name=raw.get("name", f"Facility {raw['facility_id']}"),
                facility_id=str(raw["facility_id"]),
                park_id=str(raw["park_id"]) if raw.get("park_id") else None,
                start_date=_parse_date(raw.get("start_date"), today),
                end_date=_parse_date(raw.get("end_date"), today + dt.timedelta(days=180)),
                nights=int(raw.get("nights", 1)),
                sites=[str(s) for s in raw.get("sites", [])],
                weekdays=_parse_weekdays(raw.get("arrival_days")),
            )
        )
    if not watches:
        raise ValueError(f"No [[watch]] entries found in {path}")
    cfg["watches"] = watches
    return cfg


# --------------------------------------------------------------------------- #
# ReserveCalifornia API
# --------------------------------------------------------------------------- #

def fetch_grid(session: requests.Session, facility_id: str,
               start: dt.date, end: dt.date) -> dict:
    payload = {
        "FacilityId": facility_id,
        "StartDate": start.strftime("%m-%d-%Y"),
        "EndDate": end.strftime("%m-%d-%Y"),
        "IsADA": False,
        "MinVehicleLength": 0,
        "UnitCategoryId": 0,
        "UnitTypesGroupIds": [],
        "SleepingUnitId": 0,
        "InSeasonOnly": False,
        "WebOnly": True,
        "UnitSort": "orderby",
    }
    resp = session.post(GRID_URL, headers=HEADERS, data=json.dumps(payload), timeout=30)
    resp.raise_for_status()
    return resp.json()


def _slice_date(key: str, slice_: dict) -> dt.date | None:
    raw = slice_.get("Date") or key
    try:
        return dt.date.fromisoformat(str(raw)[:10])
    except ValueError:
        return None


def _slice_available(slice_: dict) -> bool:
    return (
        bool(slice_.get("IsFree"))
        and not slice_.get("IsBlocked")
        and not slice_.get("IsWalkin")
        and not slice_.get("Lock")
    )


def parse_availability(grid: dict) -> dict[str, dict]:
    """Return {unit_key: {"label": str, "aliases": set[str], "dates": set[date]}}."""
    units = ((grid or {}).get("Facility") or {}).get("Units") or {}
    result: dict[str, dict] = {}
    for unit_key, unit in units.items():
        aliases = {str(unit_key)}
        for k in ("UnitId", "Name", "ShortName"):
            if unit.get(k) not in (None, ""):
                aliases.add(str(unit[k]))
        # "Site 012" / "012" / "12" should all match a configured "12".
        for a in list(aliases):
            digits = "".join(ch for ch in a if ch.isdigit())
            if digits:
                aliases.add(digits.lstrip("0") or "0")
        label = unit.get("Name") or unit.get("ShortName") or str(unit_key)
        dates = set()
        for key, slice_ in (unit.get("Slices") or {}).items():
            d = _slice_date(key, slice_)
            if d and _slice_available(slice_):
                dates.add(d)
        result[str(unit_key)] = {"label": label, "aliases": {a.lower() for a in aliases},
                                 "dates": dates}
    return result


def unit_matches(unit: dict, sites: list[str]) -> bool:
    if not sites:
        return True
    for s in sites:
        s = s.strip().lower()
        if s in unit["aliases"]:
            return True
        if s.isdigit() and (s.lstrip("0") or "0") in unit["aliases"]:
            return True
    return False


def find_stays(dates: set[dt.date], watch: Watch) -> list[tuple[dt.date, int]]:
    """Return (arrival_date, nights) for maximal runs of >= watch.nights nights."""
    stays = []
    in_range = sorted(d for d in dates if watch.start_date <= d <= watch.end_date)
    run: list[dt.date] = []
    for d in in_range + [None]:  # sentinel flushes the last run
        if run and (d is None or d != run[-1] + dt.timedelta(days=1)):
            if len(run) >= watch.nights:
                arrivals = run[: len(run) - watch.nights + 1]
                if watch.weekdays:
                    arrivals = [a for a in arrivals if a.weekday() in watch.weekdays]
                if arrivals:
                    stays.append((arrivals[0], (run[-1] - arrivals[0]).days + 1))
            run = []
        if d is not None:
            run.append(d)
    return stays


def check_watch(session: requests.Session, watch: Watch) -> list[dict]:
    """Return a list of openings: {"site", "arrival", "nights"}."""
    merged: dict[str, dict] = {}
    start = max(watch.start_date, dt.date.today())
    while start <= watch.end_date:
        end = min(start + dt.timedelta(days=WINDOW_DAYS - 1), watch.end_date)
        grid = fetch_grid(session, watch.facility_id, start, end)
        for key, unit in parse_availability(grid).items():
            if key in merged:
                merged[key]["dates"] |= unit["dates"]
            else:
                merged[key] = unit
        start = end + dt.timedelta(days=1)
        time.sleep(1)  # be polite

    openings = []
    for unit in merged.values():
        if not unit_matches(unit, watch.sites):
            continue
        for arrival, nights in find_stays(unit["dates"], watch):
            openings.append({"site": unit["label"], "arrival": arrival, "nights": nights})
    openings.sort(key=lambda o: (o["arrival"], o["site"]))
    return openings


# --------------------------------------------------------------------------- #
# Notifications
# --------------------------------------------------------------------------- #

def _setting(section: dict, key: str, env: str) -> str | None:
    return os.environ.get(env) or section.get(key)


def send_twilio(cfg: dict, body: str) -> None:
    sid = _setting(cfg, "account_sid", "TWILIO_ACCOUNT_SID")
    token = _setting(cfg, "auth_token", "TWILIO_AUTH_TOKEN")
    from_ = _setting(cfg, "from_number", "TWILIO_FROM_NUMBER")
    to_numbers = cfg.get("to_numbers") or [os.environ.get("TWILIO_TO_NUMBER")]
    if not (sid and token and from_ and any(to_numbers)):
        raise RuntimeError("Twilio is enabled but account_sid/auth_token/from_number/"
                           "to_numbers are not all set")
    url = f"https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json"
    for to in filter(None, to_numbers):
        resp = requests.post(url, auth=(sid, token),
                             data={"From": from_, "To": to, "Body": body}, timeout=30)
        if resp.status_code >= 400:
            raise RuntimeError(f"Twilio error {resp.status_code}: {resp.text}")
        log.info("SMS sent to %s via Twilio", to)


def send_email(cfg: dict, subject: str, body: str) -> None:
    """Send via SMTP. Point `to` at a carrier email-to-SMS gateway for free texts."""
    host = _setting(cfg, "smtp_host", "SMTP_HOST")
    port = int(_setting(cfg, "smtp_port", "SMTP_PORT") or 587)
    user = _setting(cfg, "username", "SMTP_USERNAME")
    password = _setting(cfg, "password", "SMTP_PASSWORD")
    from_ = cfg.get("from_address") or user
    to = cfg.get("to_addresses") or []
    if not (host and from_ and to):
        raise RuntimeError("Email is enabled but smtp_host/from_address/to_addresses "
                           "are not all set")
    msg = EmailMessage()
    msg["From"] = from_
    msg["To"] = ", ".join(to)
    msg["Subject"] = subject
    msg.set_content(body)
    if port == 465:
        server = smtplib.SMTP_SSL(host, port, timeout=30)
    else:
        server = smtplib.SMTP(host, port, timeout=30)
        server.starttls()
    with server:
        if user and password:
            server.login(user, password)
        server.send_message(msg)
    log.info("Email sent to %s", ", ".join(to))


def notify(cfg: dict, subject: str, body: str) -> None:
    sent = False
    errors = []
    twilio = cfg.get("twilio", {})
    email = cfg.get("email", {})
    if twilio.get("enabled"):
        try:
            send_twilio(twilio, body)
            sent = True
        except Exception as e:  # noqa: BLE001
            errors.append(e)
            log.error("Twilio notification failed: %s", e)
    if email.get("enabled"):
        try:
            send_email(email, subject, body)
            sent = True
        except Exception as e:  # noqa: BLE001
            errors.append(e)
            log.error("Email notification failed: %s", e)
    if not sent:
        log.warning("No notifier delivered this message:\n%s", body)
        if errors:
            raise errors[0]


def format_message(watch: Watch, openings: list[dict], limit: int = 5) -> str:
    lines = [f"Campsite open: {watch.name}"]
    for o in openings[:limit]:
        n = o["nights"]
        lines.append(f"- {o['site']}: {o['arrival']:%a %b %d} ({n} night{'s' if n != 1 else ''})")
    if len(openings) > limit:
        lines.append(f"+{len(openings) - limit} more")
    lines.append(watch.booking_url)
    return "\n".join(lines)


# --------------------------------------------------------------------------- #
# State (so the same opening isn't texted every run)
# --------------------------------------------------------------------------- #

def opening_key(watch: Watch, o: dict) -> str:
    return f"{watch.facility_id}|{o['site']}|{o['arrival'].isoformat()}"


def load_state(path: Path) -> set[str]:
    try:
        return set(json.loads(path.read_text()).get("alerted", []))
    except (FileNotFoundError, json.JSONDecodeError):
        return set()


def save_state(path: Path, alerted: set[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps({"alerted": sorted(alerted)}, indent=2))
    tmp.replace(path)


# --------------------------------------------------------------------------- #
# Main loop
# --------------------------------------------------------------------------- #

def run_once(cfg: dict, state_path: Path, session: requests.Session) -> None:
    alerted = load_state(state_path)
    still_open: set[str] = set()

    for watch in cfg["watches"]:
        try:
            openings = check_watch(session, watch)
        except (requests.RequestException, ValueError) as e:
            log.error("Check failed for %s: %s", watch.name, e)
            # Keep previous state for this watch so a flaky request doesn't re-alert.
            still_open |= {k for k in alerted if k.startswith(f"{watch.facility_id}|")}
            continue

        keys = {opening_key(watch, o): o for o in openings}
        still_open |= keys.keys()
        new = [o for k, o in keys.items() if k not in alerted]
        log.info("%s: %d opening(s), %d new", watch.name, len(openings), len(new))
        if new:
            notify(cfg, f"Campsite open: {watch.name}", format_message(watch, new))

    # Forget openings that disappeared so we alert again if they reopen.
    save_state(state_path, still_open)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("-c", "--config", default=os.environ.get("CONFIG_PATH", "config.toml"))
    parser.add_argument("--once", action="store_true", help="check once and exit (for cron)")
    parser.add_argument("--test-notify", action="store_true", help="send a test alert and exit")
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args(argv)

    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.INFO,
                        format="%(asctime)s %(levelname)s %(message)s")

    cfg = load_config(Path(args.config))
    settings = cfg.get("settings", {})
    state_path = Path(os.environ.get("STATE_PATH") or settings.get("state_file", "state.json"))

    if args.test_notify:
        notify(cfg, "Campsite checker test", "Test alert from campsite_checker.py")
        return 0

    session = requests.Session()
    if args.once:
        run_once(cfg, state_path, session)
        return 0

    interval = int(settings.get("interval_minutes", 10)) * 60
    log.info("Watching %d facility(ies); checking every %d min",
             len(cfg["watches"]), interval // 60)
    while True:
        try:
            run_once(cfg, state_path, session)
        except Exception:  # noqa: BLE001 - keep the service alive
            log.exception("Unexpected error during check")
        # Jitter so requests don't land on an exact schedule.
        time.sleep(interval + random.uniform(0, min(60, interval * 0.2)))


if __name__ == "__main__":
    sys.exit(main())
