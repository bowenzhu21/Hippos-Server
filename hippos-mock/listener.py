from flask import Flask, request, jsonify
from flask_cors import CORS
import time
import os
import csv
import uuid
import requests
import random
import math

# Remote FastAPI ingest configuration (override via env if needed)
# Default to localhost:8000 expecting an SSH tunnel/port-forward
FASTAPI_BASE = os.getenv("HIPPOS_FASTAPI_BASE", "http://localhost:8000")
FASTAPI_API_KEY = os.getenv("HIPPOS_FASTAPI_KEY", "hippos_dev_key_123")
DEFAULT_SESSION_ID = os.getenv(
    "HIPPOS_SESSION_ID", "00000000-0000-0000-0000-000000000001"
)

app = Flask(__name__)
CORS(app)

# Globals
latest_processed = {"combined_average": 0, "timestamp": 0}
latest_raw = {}

# File paths
# Always store data inside the webapp so we don't create a top-level data folder.
BASE_DIR = os.path.join(os.path.dirname(__file__), "webapp", "hippos", "data")
PROCESSED_FILE = os.path.join(BASE_DIR, "processed_log.csv")
RAW_FILE = os.path.join(BASE_DIR, "raw_log.csv")

# Ensure data directory and files exist
os.makedirs(BASE_DIR, exist_ok=True)

# Create CSV headers if missing
if not os.path.exists(PROCESSED_FILE):
    with open(PROCESSED_FILE, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["timestamp", "combined_average"])

if not os.path.exists(RAW_FILE):
    with open(RAW_FILE, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["timestamp"] + [f"sensor_{i}" for i in range(8)])


@app.route("/upload_raw", methods=["POST"])
def upload_raw():
    global latest_raw
    latest_raw = request.json

    raw_data = latest_raw.get("raw_data", [])
    timestamp = time.time()

    # Save to CSV
    if isinstance(raw_data, list) and len(raw_data) == 8:
        with open(RAW_FILE, "a", newline="") as f:
            writer = csv.writer(f)
            writer.writerow([timestamp] + raw_data)

    # Forward to FastAPI ingest (best-effort)
    try:
        samples = [
            {
                "session_id": latest_raw.get("session_id")
                or DEFAULT_SESSION_ID,
                "device_timestamp_ms": int(timestamp * 1000),
                "values": {
                    **{
                        f"sensor_{i}": int(raw_data[i])
                        for i in range(8)
                        if isinstance(raw_data, list) and len(raw_data) == 8
                    }
                },
            }
        ]
        requests.post(
            f"{FASTAPI_BASE}/v1/ingest",
            headers={
                "Content-Type": "application/json",
                "x-api-key": FASTAPI_API_KEY,
            },
            json={"samples": samples},
            timeout=3,
        )
    except Exception:
        # Silent fail to avoid breaking local dev
        pass

    return jsonify({"status": "raw received"})


@app.route("/upload_processed", methods=["POST"])
def upload_processed():
    global latest_processed
    data = request.json
    combined_average = data.get("combined_average")
    timestamp = data.get("timestamp", time.time())

    if combined_average is not None:
        latest_processed = {
            "combined_average": combined_average,
            "timestamp": timestamp
        }
        with open(PROCESSED_FILE, "a", newline="") as f:
            writer = csv.writer(f)
            writer.writerow([timestamp, combined_average])
        # Forward to FastAPI ingest (best-effort)
        try:
            samples = [
                {
                    "session_id": data.get("session_id") or DEFAULT_SESSION_ID,
                    "device_timestamp_ms": int(float(timestamp) * 1000),
                    "values": {"combined_average": float(combined_average)},
                }
            ]
            requests.post(
                f"{FASTAPI_BASE}/v1/ingest",
                headers={
                    "Content-Type": "application/json",
                    "x-api-key": FASTAPI_API_KEY,
                },
                json={"samples": samples},
                timeout=3,
            )
        except Exception:
            # Silent fail to avoid breaking local dev
            pass
        return jsonify({"status": "processed received"})
    else:
        return jsonify({"status": "error", "reason": "Missing combined_average"}), 400


@app.route("/latest_processed", methods=["GET"])
def get_latest_processed():
    return jsonify(latest_processed)


@app.route("/latest_raw", methods=["GET"])
def get_latest_raw():
    return jsonify(latest_raw)


@app.route("/history", methods=["GET"])
def get_history():
    history = []
    if os.path.exists(PROCESSED_FILE):
        with open(PROCESSED_FILE, "r") as f:
            reader = csv.DictReader(f)
            for row in reader:
                history.append({
                    "timestamp": float(row["timestamp"]),
                    "combined_average": float(row["combined_average"])
                })
    return jsonify(history)


@app.route("/history_raw", methods=["GET"])
def get_history_raw():
    history = []
    if os.path.exists(RAW_FILE):
        with open(RAW_FILE, "r") as f:
            reader = csv.DictReader(f)
            for row in reader:
                entry = {
                    "timestamp": float(row["timestamp"]),
                    "raw_data": [int(row[f"sensor_{i}"]) for i in range(8)]
                }
                history.append(entry)
    return jsonify(history)


@app.route("/simulate_once", methods=["POST"])
def simulate_once():
    """Generate one raw + processed sample and feed through existing endpoints."""
    now = time.time()
    # Raw: 8 channels random
    raw = [random.randint(100, 500) for _ in range(8)]
    # Processed: sinusoidal around 60 with amplitude 60
    period = 10.0
    combined_average = 60.0 + 60.0 * math.sin(2 * math.pi * (now % period) / period)

    # Send to existing handlers so CSV + forwarding logic runs
    try:
        requests.post(
            "http://localhost:5050/upload_raw",
            json={"raw_data": raw, "session_id": DEFAULT_SESSION_ID},
            timeout=3,
        )
        requests.post(
            "http://localhost:5050/upload_processed",
            json={"combined_average": combined_average, "timestamp": now, "session_id": DEFAULT_SESSION_ID},
            timeout=3,
        )
    except Exception as e:
        return jsonify({"status": "error", "reason": str(e)}), 500

    return jsonify({
        "status": "ok",
        "generated": {
            "timestamp": now,
            "raw": raw,
            "combined_average": combined_average,
        },
    })


if __name__ == "__main__":
    app.run(debug=True, port=5050)
