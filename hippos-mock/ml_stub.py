
import time
import random
import requests

RAW_ENDPOINT = 'http://localhost:5050/upload_raw'
PROCESSED_ENDPOINT = 'http://localhost:5050/upload_processed'

def generate_raw():
    return [random.randint(100, 500) for _ in range(8)]

def simulate_ml_processing(raw_data):
    p1 = sum(raw_data[:4]) // 4
    p2 = sum(raw_data[4:]) // 4
    return {"p1": p1, "p2": p2}

while True:
    raw = generate_raw()
    processed = simulate_ml_processing(raw)

    try:
        requests.post(RAW_ENDPOINT, json={"raw_data": raw})
        requests.post(PROCESSED_ENDPOINT, json=processed)
        print("[ML MOCK] Raw:", raw)
        print("[ML MOCK] Processed:", processed)
    except Exception as e:
        print("[ML MOCK] Error:", e)

    time.sleep(0.02)