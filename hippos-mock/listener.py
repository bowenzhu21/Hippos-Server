from flask import Flask, request, jsonify
from flask_cors import CORS
import time
import os
import csv

app = Flask(__name__)
CORS(app)

# Globals
latest_processed = {"combined_average": 0, "timestamp": 0}
latest_raw = {}

# File paths
PROCESSED_FILE = "data/processed_log.csv"
RAW_FILE = "data/raw_log.csv"

# Ensure data directory and files exist
os.makedirs("data", exist_ok=True)

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


if __name__ == "__main__":
    app.run(debug=True, port=5050)