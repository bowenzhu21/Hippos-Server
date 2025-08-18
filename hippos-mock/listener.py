
from flask import Flask, request, jsonify
from flask_cors import CORS
import time

app = Flask(__name__)
CORS(app)

latest_processed = {"p1": 0, "p2": 0}
processed_sum = {"p1": 0, "p2": 0}
processed_count = 0
last_avg_time = time.time()

latest_raw = {}

@app.route("/upload_raw", methods=["POST"])
def upload_raw():
    global latest_raw
    latest_raw = request.json
    return jsonify({"status": "raw received"})

@app.route("/upload_processed", methods=["POST"])
def upload_processed():
    global latest_processed, processed_sum, processed_count, last_avg_time
    data = request.json
    processed_sum["p1"] += data["p1"]
    processed_sum["p2"] += data["p2"]
    processed_count += 1

    if time.time() - last_avg_time >= 0.5:
        latest_processed = {
            "p1_avg": processed_sum["p1"] // processed_count,
            "p2_avg": processed_sum["p2"] // processed_count,
            "timestamp": time.time()
        }
        processed_sum = {"p1": 0, "p2": 0}
        processed_count = 0
        last_avg_time = time.time()
    return jsonify({"status": "processed received"})

@app.route("/latest_processed", methods=["GET"])
def get_latest_processed():
    return jsonify(latest_processed)

@app.route("/latest_raw", methods=["GET"])
def get_latest_raw():
    return jsonify(latest_raw)

if __name__ == "__main__":
    app.run(debug=True, port=5050)