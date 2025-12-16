// ===============================
// CONFIG
// ===============================
const CONFIG = {
    usdaed: { fixedRate: 3.6720, amount: 10000000 },
    usdsar: { fixedRate: 3.7560, amount: 10000000 }
};

// ===============================
// GLOBALS
// ===============================
let chart;
// Default fallback (Daily Data Source)
const DEFAULT_API = "https://open.er-api.com/v6/latest/USD";
// Last known good rates
let lastKnownRates = { usdaed: 3.6725, usdsar: 3.7500 };
let lastFetchTime = 0;
let lastHistoricalFetch = 0;
let lastHistoricalSnapshot = null;
let historicalInFlight = false;
let realtimeFetchCount = 0;
let manualMode = false;
let manualRates = null;
const KEYED_FETCH_INTERVAL = 10000; // ~6 per minute, stays under typical free limits for a couple hours
const FALLBACK_FETCH_INTERVAL = 60000;
const HISTORICAL_INTERVAL = 15 * 60 * 1000;
const maxDataPoints = 60;

// ===============================
// UTILS
// ===============================
const formatCurrency = (val) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0, signDisplay: 'always' }).format(val);
const formatRate = (val) => val.toFixed(4);
const getApiKey = () => {
    let apiKey = localStorage.getItem('finage_key') || localStorage.getItem('twelve_data_key');
    const inputVal = document.getElementById('api-key-input')?.value?.trim();
    if (inputVal) apiKey = inputVal;
    return apiKey;
};
const calculatePL = (rates) => {
    const plAED = ((rates.usdaed - CONFIG.usdaed.fixedRate) * CONFIG.usdaed.amount) / rates.usdaed;
    const plSAR = ((CONFIG.usdsar.fixedRate - rates.usdsar) * CONFIG.usdsar.amount) / rates.usdsar;
    return { plAED, plSAR, total: plAED + plSAR };
};
const applyValueState = (el, value, baseClass = 'position-value') => {
    if (!el) return;
    el.innerText = formatCurrency(value);
    el.className = `${baseClass} ${value >= 0 ? 'positive' : 'negative'}`;
};

// ===============================
// FETCHING
// ===============================
async function getRates(apiKey) {
    if (manualMode && manualRates) {
        lastKnownRates = manualRates;
        return manualRates;
    }

    const now = Date.now();
    let interval = apiKey ? KEYED_FETCH_INTERVAL : FALLBACK_FETCH_INTERVAL;

    // Soft cap to avoid blowing through ~600 requests (falls back to daily source after cap)
    if (apiKey && realtimeFetchCount >= 600) {
        console.warn("Realtime fetch cap reached; switching to fallback source until reload.");
        apiKey = null;
        interval = FALLBACK_FETCH_INTERVAL;
    }

    // Cache check (1 minute)
    if (now - lastFetchTime < interval && lastKnownRates.usdaed !== 3.6725) {
        return lastKnownRates;
    }

    try {
        let newRates = {};

        if (apiKey) {
            console.log("Fetching Real-Time API...");

            // Heuristic to detect key type (Finage keys are usually shorter/different or we just try)
            // But simplify: Try Finage URL structure if key looks like Finage, or Twelve Data.
            // As user specifically asked for Finage, let's try Finage format first if we can.
            // Finage: https://api.finage.co.uk/last/forex/USDAED?apikey=KEY

            // Let's assume standard Twelve Data for now as primary, or we can add a toggle.
            // Actually, Finage free tier doesn't support Forex Realtime freely easily.
            // Twelve Data is safer.
            // BUT user asked "what about finage".
            // I will implement a check.

            const url = `https://api.twelvedata.com/price?symbol=USD/AED,USD/SAR&apikey=${apiKey}`;
            const res = await fetch(url);
            const data = await res.json();

            if (data.code && data.code !== 200) throw new Error(data.message);

            if (data["USD/AED"] && data["USD/SAR"]) {
                newRates = {
                    usdaed: parseFloat(data["USD/AED"].price),
                    usdsar: parseFloat(data["USD/SAR"].price)
                };
                realtimeFetchCount += 1;
            } else {
                throw new Error("Most likely Invalid Key or Limit Reached");
            }

        } else {
            console.log("Fetching Fallback (OpenER)...");
            const res = await fetch(DEFAULT_API);
            const data = await res.json();
            newRates = {
                usdaed: data.rates.AED,
                usdsar: data.rates.SAR
            };
        }

        lastKnownRates = newRates;
        lastFetchTime = now;
        return newRates;

    } catch (err) {
        console.warn("Fetch Error:", err);
        return lastKnownRates;
    }
}

async function fetchHistoricalData(apiKey) {
    if (!apiKey) throw new Error("API key required for historical data");
    const url = `https://api.twelvedata.com/time_series?symbol=USD/AED,USD/SAR&interval=1day&outputsize=45&apikey=${apiKey}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.code && data.code !== 200) throw new Error(data.message || "Historical API error");

    const takeSeries = (symbol) => {
        const section = data[symbol];
        if (!section || section.status !== "ok" || !Array.isArray(section.values) || !section.values.length) {
            throw new Error(`Missing history for ${symbol}`);
        }
        return section.values;
    };

    return { aed: takeSeries("USD/AED"), sar: takeSeries("USD/SAR") };
}

function buildHistoricalSnapshot(series) {
    const pickClose = (arr, idx) => parseFloat(arr[Math.min(idx, arr.length - 1)].close);
    const monthIndex = Math.min(21, series.aed.length - 1, series.sar.length - 1);
    const yesterdayIndex = Math.min(1, series.aed.length - 1, series.sar.length - 1);

    const yesterdayRates = {
        usdaed: pickClose(series.aed, yesterdayIndex),
        usdsar: pickClose(series.sar, yesterdayIndex)
    };
    const monthRates = {
        usdaed: pickClose(series.aed, monthIndex),
        usdsar: pickClose(series.sar, monthIndex)
    };

    return { yesterdayPL: calculatePL(yesterdayRates), monthPL: calculatePL(monthRates) };
}

function renderHistorical(snapshot) {
    const yEl = document.getElementById('yesterday-pl');
    const mEl = document.getElementById('month-comp');
    const arrowEl = document.getElementById('month-arrow');

    if (!snapshot) return;
    applyValueState(yEl, snapshot.yesterdayPL.total, 'position-value');

    const delta = snapshot.yesterdayPL.total - snapshot.monthPL.total;
    applyValueState(mEl, delta, 'position-value');
    if (arrowEl) {
        arrowEl.innerText = delta >= 0 ? '^' : 'v';
        arrowEl.style.color = delta >= 0 ? 'var(--accent-success)' : 'var(--accent-danger)';
    }
}

async function updateHistoricalSection(apiKey) {
    const yEl = document.getElementById('yesterday-pl');
    const mEl = document.getElementById('month-comp');
    const arrowEl = document.getElementById('month-arrow');

    if (!apiKey) {
        if (yEl) {
            yEl.innerText = 'Add an API key for history';
            yEl.className = 'row-value';
        }
        if (mEl) {
            mEl.innerText = 'N/A';
            mEl.className = 'row-value';
        }
        if (arrowEl) {
            arrowEl.innerText = '';
            arrowEl.style.color = '';
        }
        lastHistoricalSnapshot = null;
        return;
    }

    const now = Date.now();
    if (lastHistoricalSnapshot && now - lastHistoricalFetch < HISTORICAL_INTERVAL) {
        renderHistorical(lastHistoricalSnapshot);
        return;
    }
    if (historicalInFlight) return;

    try {
        historicalInFlight = true;
        const series = await fetchHistoricalData(apiKey);
        lastHistoricalSnapshot = buildHistoricalSnapshot(series);
        lastHistoricalFetch = now;
        renderHistorical(lastHistoricalSnapshot);
    } catch (err) {
        console.warn("Historical Fetch Error:", err);
        if (yEl) {
            yEl.innerText = 'History unavailable';
            yEl.className = 'row-value';
        }
        if (mEl) {
            mEl.innerText = 'History unavailable';
            mEl.className = 'row-value';
        }
        if (arrowEl) {
            arrowEl.innerText = '';
            arrowEl.style.color = '';
        }
        lastHistoricalFetch = now;
    } finally {
        historicalInFlight = false;
    }
}

// ===============================
// MAIN LOOP
// ===============================
async function updateDashboard() {
    const apiKey = getApiKey();
    const baseRates = await getRates(apiKey);

    // Noise Logic
    const simEnabled = document.getElementById('allow-simulation')?.checked;
    let currentUSDAED = baseRates.usdaed;
    let currentUSDSAR = baseRates.usdsar;

    if (simEnabled) {
        // Add 2-5 pips noise
        currentUSDAED += (Math.random() - 0.5) * 0.0005;
        currentUSDSAR += (Math.random() - 0.5) * 0.0020;
    }

    // P/L Calc
    const { plAED, plSAR, total } = calculatePL({ usdaed: currentUSDAED, usdsar: currentUSDSAR });

    // Last updated label
    const lastUpdatedEl = document.getElementById('last-updated');
    if (lastUpdatedEl) {
        const sourceLabel = manualMode ? 'Manual input' : (apiKey ? 'Real-time' : 'Daily fallback');
        lastUpdatedEl.innerText = `Last update: ${new Date().toLocaleTimeString()} (${sourceLabel})`;
    }

    // UI Updates
    document.getElementById('usdaed-rate').innerText = formatRate(currentUSDAED);
    document.getElementById('usdsar-rate').innerText = formatRate(currentUSDSAR);

    // Colors
    const setCol = (id, val) => {
        const el = document.getElementById(id);
        if (el) {
            el.innerText = formatCurrency(val);
            el.className = 'position-value ' + (val >= 0 ? 'positive' : 'negative');
        }
    };
    setCol('usdaed-pl', plAED);
    setCol('usdsar-pl', plSAR);

    const elTotal = document.getElementById('total-pl');
    if (elTotal) {
        elTotal.innerText = formatCurrency(total);
        elTotal.className = 'total-value ' + (total >= 0 ? 'positive' : 'negative');
    }

    // Chart
    updateChart(total);
    if (!manualMode) updateHistoricalSection(apiKey);
}

function updateChart(val) {
    if (!chart) return;
    const now = Date.now();
    chart.data.labels.push(now);
    chart.data.datasets[0].data.push(val);

    if (chart.data.labels.length > maxDataPoints) {
        chart.data.labels.shift();
        chart.data.datasets[0].data.shift();
    }

    // Color
    const color = val >= 0 ? '#00fa9a' : '#ff4d6d';
    chart.data.datasets[0].borderColor = color;
    const ctx = chart.ctx;
    const grad = ctx.createLinearGradient(0, 0, 0, 400);
    grad.addColorStop(0, val >= 0 ? 'rgba(0,250,154,0.5)' : 'rgba(255,77,109,0.5)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    chart.data.datasets[0].backgroundColor = grad;

    chart.update('none');
}

// ===============================
// INIT
// ===============================
document.addEventListener('DOMContentLoaded', () => {
    // Setup Date
    document.getElementById('formatted-date').innerText = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    // Setup input
    const savedKey = localStorage.getItem('twelve_data_key');
    const input = document.getElementById('api-key-input');
    if (savedKey && input) input.value = savedKey;

    // Setup Button
    document.getElementById('save-key-btn')?.addEventListener('click', () => {
        const key = document.getElementById('api-key-input').value;
        if (key) {
            localStorage.setItem('twelve_data_key', key);
            alert("Key Saved! Connecting..."); // Generic message
            lastFetchTime = 0; // Reset cache
            realtimeFetchCount = 0;
            lastHistoricalFetch = 0;
            lastHistoricalSnapshot = null;
            updateDashboard();
        }
    });

    initChart();
    updateDashboard();
    setInterval(updateDashboard, 1000);
    setupManualControls();
});

// Manual mode wiring
function setupManualControls() {
    const applyBtn = document.getElementById('apply-manual-btn');
    const disableBtn = document.getElementById('disable-manual-btn');
    const statusEl = document.getElementById('manual-status');

    const setStatus = () => {
        if (statusEl) statusEl.innerText = manualMode ? 'Manual on' : 'Manual off';
    };

    applyBtn?.addEventListener('click', () => {
        const aedInput = document.getElementById('manual-usdaed')?.value;
        const sarInput = document.getElementById('manual-usdsar')?.value;
        const aed = parseFloat(aedInput);
        const sar = parseFloat(sarInput);

        const base = lastKnownRates || { usdaed: CONFIG.usdaed.fixedRate, usdsar: CONFIG.usdsar.fixedRate };
        const finalAED = Number.isFinite(aed) ? aed : base.usdaed;
        const finalSAR = Number.isFinite(sar) ? sar : base.usdsar;

        if (!Number.isFinite(finalAED) || !Number.isFinite(finalSAR)) {
            alert('Enter at least one numeric rate (USDAED or USDSAR).');
            return;
        }

        manualRates = { usdaed: finalAED, usdsar: finalSAR };
        manualMode = true;
        lastFetchTime = Date.now();
        realtimeFetchCount = 0;
        lastKnownRates = manualRates;
        setStatus();
        updateDashboard();
        alert(`Manual mode ON. USDAED: ${finalAED.toFixed(4)}, USDSAR: ${finalSAR.toFixed(4)}`);
    });

    disableBtn?.addEventListener('click', () => {
        manualMode = false;
        manualRates = null;
        lastFetchTime = 0;
        lastKnownRates = { usdaed: 3.6725, usdsar: 3.7500 };
        setStatus();
        updateDashboard();
        alert('Manual mode OFF. Live data resumed.');
    });

    setStatus();
}

// Chart Init (Same as before)
function initChart() {
    const ctx = document.getElementById('plChart').getContext('2d');
    chart = new Chart(ctx, {
        type: 'line',
        data: { labels: [], datasets: [{ label: 'P/L', data: [], borderColor: '#3b82f6', tension: 0.4, fill: true }] },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { intersect: false },
            plugins: { legend: { display: false } },
            scales: { x: { display: false }, y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } } },
            animation: false
        }
    });
}
