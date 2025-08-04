from flask import Flask, request, jsonify
from flask_cors import CORS
from ml_stub import process_data
import time

app = Flask(__name__)
CORS(app)  # Enable for local frontend

latest_data = {}  # Store last update for frontend

@app.route("/stream", methods=["POST"])
def receive_data():
    global latest_data
    raw = request.json
    processed = process_data(raw)
    latest_data = processed
    return jsonify({"status": "ok"})

@app.route("/latest", methods=["GET"])
def get_latest():
    return jsonify(latest_data)

if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5050)
