#!/usr/bin/env bash
#
# TrackFlights edge node bootstrap for Raspberry Pi OS Lite (64-bit) on a Pi 3.
#
# Installs, side-by-side:
#   * dump1090-fa  — decodes the RTL-SDR, serves aircraft.json on :8080
#   * piaware      — feeds FlightAware natively (claim a free Enterprise account)
#   * pps-tools + chrony — discipline the clock from the u-blox PPS pulse (for MLAT)
#   * python venv  — runs our custom Supabase ETL (src/main.py)
# and configures the GPIO UART for the GPS HAT + the PPS overlay.
#
# Re-runnable: each step checks/appends idempotently. Review before running.
#   Usage:  sudo bash scripts/setup-pi.sh
#
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "Please run with sudo: sudo bash scripts/setup-pi.sh" >&2
  exit 1
fi

# Pi OS Bookworm moved boot config to /boot/firmware; older releases use /boot.
BOOT_DIR="/boot/firmware"
[[ -d "$BOOT_DIR" ]] || BOOT_DIR="/boot"
CONFIG_TXT="$BOOT_DIR/config.txt"
CMDLINE_TXT="$BOOT_DIR/cmdline.txt"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# PIAWARE_REPO_VERSION: bump to the current release from
# https://www.flightaware.com/adsb/piaware/install (Debian package).
PIAWARE_REPO_VERSION="${PIAWARE_REPO_VERSION:-8.2}"

append_once() { # append_once <line> <file>
  local line="$1" file="$2"
  grep -qxF "$line" "$file" 2>/dev/null || { echo "$line" >> "$file"; echo "  + $file: $line"; }
}

echo "==> [1/6] Base packages"
apt-get update -y
apt-get install -y git rtl-sdr pps-tools chrony python3-venv python3-pip

echo "==> [2/6] FlightAware decoder (dump1090-fa) + feeder (piaware)"
if ! dpkg -s piaware >/dev/null 2>&1; then
  tmp_deb="$(mktemp --suffix=.deb)"
  wget -O "$tmp_deb" \
    "https://www.flightaware.com/adsb/piaware/files/packages/pool/piaware/p/piaware-support/piaware-repository_${PIAWARE_REPO_VERSION}_all.deb"
  dpkg -i "$tmp_deb"
  rm -f "$tmp_deb"
  apt-get update -y
fi
apt-get install -y piaware dump1090-fa
# Decoder serves http://localhost:8080/data/aircraft.json. To use readsb instead,
# skip dump1090-fa and follow https://github.com/wiedehopf/readsb (set ADSB_JSON_URL
# accordingly — readsb/tar1090 also expose /data/aircraft.json).

echo "==> [3/6] GPS HAT serial (free the good UART, disable serial login console)"
append_once "enable_uart=1" "$CONFIG_TXT"
# On the Pi 3 the PL011 UART (ttyAMA0) is wired to Bluetooth by default; disabling BT
# routes the reliable UART to the GPIO header → /dev/serial0 for the GPS HAT.
append_once "dtoverlay=disable-bt" "$CONFIG_TXT"
# Remove the kernel serial console so it doesn't fight the GPS for the port.
if grep -q "console=serial0,115200" "$CMDLINE_TXT" 2>/dev/null; then
  sed -i 's/console=serial0,115200 //g' "$CMDLINE_TXT"
  echo "  + removed serial console from $CMDLINE_TXT"
fi
systemctl disable --now serial-getty@ttyS0.service 2>/dev/null || true
systemctl disable --now hciuart.service 2>/dev/null || true

echo "==> [4/6] PPS (Pulse-Per-Second) overlay for microsecond time sync"
# Wire the u-blox PPS pin to GPIO18 (BCM) — adjust gpiopin to match your HAT wiring.
append_once "dtoverlay=pps-gpio,gpiopin=18" "$CONFIG_TXT"
append_once "pps-gpio" "/etc/modules"

echo "==> [5/6] chrony: discipline the clock from PPS"
CHRONY_CONF="/etc/chrony/chrony.conf"
if [[ -f "$CHRONY_CONF" ]]; then
  append_once "# --- TrackFlights GPS/PPS time source ---" "$CHRONY_CONF"
  # Kernel PPS device (created by the pps-gpio overlay after reboot).
  append_once "refclock PPS /dev/pps0 refid PPS lock NMEA" "$CHRONY_CONF"
  # Optional NMEA coarse time via gpsd's shared-memory clock (apt install gpsd to use):
  append_once "# refclock SHM 0 refid NMEA offset 0.2 delay 0.2 noselect" "$CHRONY_CONF"
  systemctl restart chrony || true
fi

echo "==> [6/6] Python virtualenv for the ETL"
cd "$REPO_DIR"
python3 -m venv .venv
.venv/bin/pip install --upgrade pip
.venv/bin/pip install -r requirements.txt

cat <<EOF

==> Done. Next steps:
  1. Reboot to apply UART/PPS/Bluetooth changes:   sudo reboot
  2. Verify PPS pulses:                            sudo ppstest /dev/pps0
  3. Verify GPS NMEA stream:                       cat /dev/serial0   (Ctrl-C to stop)
  4. Verify the decoder feed:                      curl -s localhost:8080/data/aircraft.json | head
  5. Claim your FlightAware feeder (free account): https://flightaware.com/adsb/piaware/claim
     (and check status with:  piaware-status)
  6. Configure the ETL:   cp .env.example .env   and fill in Supabase creds + station/GPS.
  7. Install the service:  see systemd/trackflights-edge.service (instructions in README.md).
EOF
