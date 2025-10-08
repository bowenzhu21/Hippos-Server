
# Hippos App

## Getting Started (Windows)

### Prerequisites

- **Git**: [Download](https://git-scm.com/download/win)
- **Node.js (LTS)**: [Download](https://nodejs.org/) or install via [nvm-windows](https://github.com/coreybutler/nvm-windows):
	- `nvm install lts && nvm use lts`
- **npm**: Comes with Node.js
- **Expo Go app** or your custom dev client app on your phone (from App Store or Google Play)

### 1. Clone the Repository

```
git clone <REPO_URL>
cd hippos-app/hippos-mock/webapp/hippos
```

### 2. Install Dependencies

```
npm install
```

### 3. Start the Expo Dev Server

```
npx expo start --dev-client
```

### 4. Connect Your Phone

- Make sure your phone and computer are on the same Wi-Fi network.
- Download and install your custom Expo dev client app (or Expo Go, if supported).
- Open the app and scan the QR code shown in your terminal or browser after running the dev server.

This will launch the app on your phone, connected to your local development server.

---

**Note:**
- You do **not** need to use any Python scripts (`flexion.py`, `server.py`) for this workflow.
- For Android/iOS development, ensure your device is set up for development (see [Expo documentation](https://docs.expo.dev/)).
