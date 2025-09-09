# Hippos Mobile App — Full‑Stack Quick Start

## What to install

- Node.js 20 (use `nvm use` here if you have nvm)
- Python 3.10+ with pip
- Optional (to run on simulators/devices): Xcode (iOS) or Android Studio (Android)

## First‑time setup

Run these exactly in your terminal:

```bash
# From the repo root (one level above this folder)
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# App dependencies
cd webapp/hippos
nvm use    # optional, if you use nvm
npm install
```

## Run the full stack

```bash
cd webapp/hippos
npm run dev
```

This launches the local Flask mocks and the Expo dev server. Follow the on‑screen prompt to open iOS (`i`), Android (`a`), or Web (`w`). Stop with `Ctrl+C`.
