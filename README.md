# Campsite Reservation Checker

This script checks [ReserveCalifornia](https://www.reservecalifornia.com/) on a schedule and texts you when a campsite you want becomes available. It can run on a VPS, on a NAS (Synology, QNAP, Unraid, TrueNAS) or on any machine that has Python 3.9+ or Docker.

- Watch one or more campgrounds, either for specific site numbers or for any site
- Limit alerts by date range, minimum number of nights and allowed arrival days (for example, weekends only)
- Send SMS through **Twilio** (reliable, about $0.01 per text) or free through your carrier's **email-to-SMS gateway**
- A state file keeps track of what you've already been told about, so you get one text per opening. If a site is booked and then opens up again, you get a new text.

## 1. Configure

```bash
cp config.example.toml config.toml
```

Then edit `config.toml`:

- **Campground IDs** come from the ReserveCalifornia URL:
  `https://www.reservecalifornia.com/Web/#!park/<park_id>/<facility_id>`.
  For example, Wright's Beach is `park/718/706`.
- **`sites`**: the site numbers you care about. `"5"`, `"005"` and `"Site 005"` all match. Leave the list empty to match any site.
- **`nights`**: the minimum number of consecutive nights.
- **`arrival_days`**: optional, for example `["Fri", "Sat"]`.

To watch several campgrounds, add another `[[watch]]` block for each one.

### SMS options

**Twilio (recommended).** Create an account, buy a phone number and fill in the `[twilio]` section. US numbers also need A2P 10DLC or toll-free verification before messages are delivered reliably.

**Email-to-SMS (free).** Set `[email] enabled = true` and send to your carrier's gateway, such as `5551234567@vtext.com` (Verizon), `@tmomail.net` (T-Mobile) or `@txt.att.net` (AT&T). With Gmail, use an [App Password](https://myaccount.google.com/apppasswords).

You can supply secrets as environment variables instead of writing them in the file: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, `TWILIO_TO_NUMBER`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`.

To check that alerts reach your phone:

```bash
python campsite_checker.py --test-notify
```

## 2. Run

### Option A: Docker (best for a NAS)

```bash
mkdir -p data && cp config.toml data/
docker compose up -d --build
docker compose logs -f
```

The container checks every `interval_minutes` and restarts automatically. On Synology, open **Container Manager → Project → Create**, point it at this folder and use the included `docker-compose.yml`.

### Option B: systemd service (VPS)

```bash
sudo useradd -r -s /usr/sbin/nologin campsite
sudo git clone <this repo> /opt/campsite-checker && cd /opt/campsite-checker
sudo python3 -m venv .venv && sudo .venv/bin/pip install -r requirements.txt
sudo cp config.example.toml config.toml && sudo nano config.toml
sudo chown -R campsite: /opt/campsite-checker
sudo cp deploy/campsite-checker.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now campsite-checker
journalctl -u campsite-checker -f
```

### Option C: cron / NAS Task Scheduler

Use `--once` so each run does a single check and exits:

```cron
*/10 * * * * cd /path/to/CampsiteReservationChecker && .venv/bin/python campsite_checker.py --once >> checker.log 2>&1
```

## Notes

- Please don't set the interval too low. Every 5–15 minutes is plenty and less likely to get you rate-limited.
- The script calls the same unofficial `calirdr.usedirect.com` API that the ReserveCalifornia website uses. If they change it, the script may need updating. Run it with `-v` to see debug output.
- A text only tells you a site is open. You still need to book it yourself, quickly.

## Development

```bash
python -m unittest discover -s tests -t .
```
