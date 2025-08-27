import time
import random
import requests
from datetime import datetime
import math

RAW_ENDPOINT = 'http://localhost:5050/upload_raw'
PROCESSED_ENDPOINT = 'http://localhost:5050/upload_processed'

def generate_raw():
    return [random.randint(100, 500) for _ in range(8)]

def simulate_ml_processing(tick):
    # Sinusoidal function: amplitude 60, offset 60, period ~10 seconds (range: 0 to 120)
    amplitude = 60
    offset = 60
    period = 10  # seconds
    combined_average = offset + amplitude * math.sin(2 * math.pi * (tick % period) / period)
    timestamp = datetime.now().timestamp()
    return {"combined_average": combined_average, "timestamp": timestamp}

tick = 0
while True:
    raw = generate_raw()
    processed = simulate_ml_processing(tick)

    try:
        requests.post(RAW_ENDPOINT, json={"raw_data": raw})
        requests.post(PROCESSED_ENDPOINT, json=processed)
        print("[ML MOCK] Raw:", raw)
        print("[ML MOCK] Processed:", processed)
    except Exception as e:
        print("[ML MOCK] Error:", e)

    tick += 0.5  # increment by sleep interval
    time.sleep(0.5) #Change to 0.02 when done testing