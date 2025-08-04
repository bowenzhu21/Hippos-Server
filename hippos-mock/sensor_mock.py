import time
import random
import requests  # or use websockets if using that method

ENDPOINT = 'http://localhost:5050/stream'  # Change if using WebSocket or deployed server

def generate_sensor_data():
    return {
        "flexion": round(random.uniform(0, 120), 2),
        "valgus": round(random.uniform(-10, 10), 2),
        "rotation": round(random.uniform(-20, 20), 2),
        "timestamp": time.time()
    }

while True:
    data = generate_sensor_data()
    try:
        requests.post(ENDPOINT, json=data)
        print("Sent:", data)
    except Exception as e:
        print("Failed to send:", e)
    time.sleep(10)