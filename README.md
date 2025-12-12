# FX Hedging Dashboard 🛡️

A premium, real-time dashboard to track **Corporate FX Hedging** (Forward Contracts) for **USDAED** and **USDSAR**. This application visualizes the effectiveness of your hedges by comparing fixed contract rates versus live market movements.

## ✨ Features

- **Real-Time Tracking**: Updates rates every minute using the Twelve Data API.
- **Instant P/L Calculation**: Automatically calculates USD profit/loss based on your contract size (10M Notional).
- **Live Graph Area**: Visualizes P/L trends over the last hour.
- **Mobile Support**: Fully responsive PWA design (Installable on iOS/Android).
- **Fallback Mode**: Works with free daily data if no API key is provided.

## 🚀 How to Use

1. **Clone the repository**:
   ```bash
   git clone https://github.com/yourusername/fx-monitor.git
   ```

2. **Run the Dashboard**:
   - **Windows**: Double-click `Launch_Dashboard.bat`.
   - **Mac/Linux** or **Web**: Simply open `index.html` in your browser.

3. **Activate Live Data**:
   - Click the **"Settings"** panel at the bottom.
   - Enter your **Free API Key** from [Twelve Data](https://twelvedata.com/).
   - Click **Activate**.

## ⚙️ Configuration

You can adjust your Contract Rates and Amounts in `app.js`:

```javascript
const CONFIG = {
    usdaed: {
        fixedRate: 3.6720, // Your Buy Rate
        amount: 10000000   // 10 Million USD
    },
    usdsar: {
        fixedRate: 3.7560, // Your Sell Rate
        amount: 10000000   // 10 Million USD
    }
};
```

## 🔒 Security Note

This app runs entirely in your browser (`client-side`). Your API keys and financial settings are stored in your browser's **Local Storage** and are never sent to any external server (other than the official data provider).

## 📄 Service Worker

Includes `manifest.json` for "Add to Home Screen" functionality on mobile devices.

---
*Built for High-Stakes Treasury Management.*
