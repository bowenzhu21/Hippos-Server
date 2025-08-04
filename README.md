
# 🦵 Hippos Mock Integration Server

This project simulates the data pipeline for **Hippos Exoskeleton**, a smart knee brace system focused on injury prevention and recovery. It mimics sensor input, processes it through a mock machine learning pipeline, and visualizes the results in real time on a local web interface.

---

## 🔧 Project Overview

This setup is intended for testing and prototyping before real sensor hardware is integrated.

**Components:**
- `sensor_mock.py`: Simulates live biomechanical data (flexion, valgus, tibial rotation).
- `listener.py`: Flask server that receives mock data, processes it via `ml_stub.py`, and exposes the results.
- `ml_stub.py`: Processes incoming data to determine a basic injury risk score.
- `webapp/index.html`: Frontend UI that fetches and displays the processed data.
- `sensor_log.csv`: CSV log file of all received and processed readings (auto-generated).

---

## 🚀 Getting Started

### 1. Install Python Dependencies

Make sure Python 3 is installed, then run:

```bash
pip3 install flask flask-cors requests
```

---

### 2. Start the Flask Listener Server

In **Terminal 1**:

```bash
cd hippos-mock
python3 listener.py
```

This starts the backend Flask server at:  
**http://localhost:5000**

---

### 3. Start the Mock Sensor Stream

In **Terminal 2**:

```bash
cd hippos-mock
python3 sensor_mock.py
```

This script sends random data to `/stream` every 5 seconds.

---

### 4. Start the Frontend Web App

In **Terminal 3**:

```bash
cd hippos-mock/webapp
python3 -m http.server 8000
```

Then visit:  
**http://localhost:8000/index.html**

You’ll see the live, processed data updating on the page.

---

## 📡 Data Flow

```
[sensor_mock.py]
    ↓ (POST JSON every 5 sec)
[listener.py]
    ↓ (process via ml_stub.py)
[latest JSON]
    ↑ (polled by index.html)
[Real-time Web Dashboard]
```

---

## 🧠 What This Simulates

- **BLE or WiFi Sensor Data** → (simulated by `sensor_mock.py`)
- **ML Risk Inference** → (`ml_stub.py`)
- **Cloud/Local Server Pipeline** → (`listener.py`)
- **Front-End Visualization** → (`index.html`)

---

## ✅ Future Expansion Ideas

- Connect to **real ESP32 microcontroller** and sensor hardware.
- Deploy Flask backend to a **Proxmox VM or cloud** via **Tailscale**.
- Replace mock ML logic with a **real ML model**.
- Store data in **AWS DynamoDB**, **Firebase**, or **PostgreSQL**.
- Use **Socket.IO or WebSocket** for low-latency updates.
- Add **user authentication and session logging**.

---