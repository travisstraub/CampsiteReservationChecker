import datetime as dt
import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import campsite_checker as cc

D = dt.date


def slice_(day, free=True, **extra):
    s = {"Date": day.isoformat(), "IsFree": free, "IsBlocked": False,
         "IsWalkin": False, "Lock": None}
    s.update(extra)
    return {f"{day.isoformat()}T00:00:00": s}


def grid(units):
    return {"Facility": {"FacilityId": 706, "Units": units}}


def unit(name, days, uid=1772):
    slices = {}
    for d, free in days:
        slices.update(slice_(d, free))
    return {"UnitId": uid, "Name": name, "ShortName": name.split()[-1], "Slices": slices}


def watch(**kw):
    base = dict(name="Test", facility_id="706", park_id="718",
                start_date=D(2030, 6, 1), end_date=D(2030, 6, 30))
    base.update(kw)
    return cc.Watch(**base)


class ParseTests(unittest.TestCase):
    def test_availability_flags(self):
        g = grid({"1.1": {"Name": "Site 001", "Slices": {
            **slice_(D(2030, 6, 1)),
            **slice_(D(2030, 6, 2), free=False),
            **slice_(D(2030, 6, 3), IsWalkin=True),
            **slice_(D(2030, 6, 4), Lock={"x": 1}),
        }}})
        units = cc.parse_availability(g)
        self.assertEqual(units["1.1"]["dates"], {D(2030, 6, 1)})

    def test_empty_response(self):
        self.assertEqual(cc.parse_availability({}), {})
        self.assertEqual(cc.parse_availability({"Facility": None}), {})

    def test_site_matching(self):
        u = cc.parse_availability(grid({"1772.1": unit("Site 012", [])}))["1772.1"]
        for s in ["12", "012", "Site 012", "site 012", "1772.1", "1772"]:
            self.assertTrue(cc.unit_matches(u, [s]), s)
        self.assertFalse(cc.unit_matches(u, ["13"]))
        self.assertTrue(cc.unit_matches(u, []))


class StayTests(unittest.TestCase):
    def test_min_nights(self):
        dates = {D(2030, 6, 1), D(2030, 6, 2), D(2030, 6, 5)}
        self.assertEqual(cc.find_stays(dates, watch(nights=1)),
                         [(D(2030, 6, 1), 2), (D(2030, 6, 5), 1)])
        self.assertEqual(cc.find_stays(dates, watch(nights=2)), [(D(2030, 6, 1), 2)])
        self.assertEqual(cc.find_stays(dates, watch(nights=3)), [])

    def test_date_range(self):
        dates = {D(2030, 5, 31), D(2030, 6, 1)}
        self.assertEqual(cc.find_stays(dates, watch()), [(D(2030, 6, 1), 1)])

    def test_arrival_days(self):
        # 2030-06-07 is a Friday
        dates = {D(2030, 6, 5), D(2030, 6, 6), D(2030, 6, 7), D(2030, 6, 8)}
        w = watch(nights=2, weekdays=[4])
        self.assertEqual(cc.find_stays(dates, w), [(D(2030, 6, 7), 2)])
        w = watch(nights=3, weekdays=[4])
        self.assertEqual(cc.find_stays(dates, w), [])


class RunOnceTests(unittest.TestCase):
    def test_alerts_only_once_and_realerts_after_reopen(self):
        w = watch(start_date=D(2030, 6, 1), end_date=D(2030, 6, 10), sites=["5"])
        cfg = {"watches": [w]}
        open_grid = grid({"a": unit("Site 005", [(D(2030, 6, 2), True)]),
                          "b": unit("Site 006", [(D(2030, 6, 3), True)])})
        closed_grid = grid({"a": unit("Site 005", [(D(2030, 6, 2), False)])})

        with tempfile.TemporaryDirectory() as tmp, \
                mock.patch.object(cc, "notify") as notify, \
                mock.patch.object(cc.time, "sleep"):
            state = Path(tmp) / "state.json"
            with mock.patch.object(cc, "fetch_grid", return_value=open_grid):
                cc.run_once(cfg, state, None)
                cc.run_once(cfg, state, None)
            self.assertEqual(notify.call_count, 1)
            body = notify.call_args[0][2]
            self.assertIn("Site 005", body)
            self.assertNotIn("Site 006", body)

            with mock.patch.object(cc, "fetch_grid", return_value=closed_grid):
                cc.run_once(cfg, state, None)
            self.assertEqual(json.loads(state.read_text())["alerted"], [])
            with mock.patch.object(cc, "fetch_grid", return_value=open_grid):
                cc.run_once(cfg, state, None)
            self.assertEqual(notify.call_count, 2)


class ConfigTests(unittest.TestCase):
    def test_example_config_loads(self):
        cfg = cc.load_config(Path(__file__).parent.parent / "config.example.toml")
        w = cfg["watches"][0]
        self.assertEqual(w.facility_id, "706")
        self.assertEqual(w.weekdays, [4, 5])
        self.assertIn("park/718/706", w.booking_url)


if __name__ == "__main__":
    unittest.main()
