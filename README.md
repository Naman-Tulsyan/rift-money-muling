# 💳 Money Muling Detection Engine

### 🚨 AI + Graph Intelligence System for Detecting Fraud Rings in Financial Transactions

---

## 🏆 Hackathon Project Submission

This project is an **end-to-end fraud detection platform** designed to identify **money mule accounts, coordinated fraud rings, and suspicious transaction behavior** using a hybrid approach that combines:

- 🧠 **Graph Analytics**
- 🤖 **Machine Learning**
- ⚙️ **Rule-Based AML Detection**
- 📊 **Interactive Visual Investigation Dashboard**

Our system detects **fraud networks BEFORE financial damage occurs**, making it highly suitable for real-world deployment in banking, fintech, and digital payment ecosystems.

---

# 🌍 Problem Statement

Financial fraud involving **money mule accounts** is rapidly increasing, especially in high-volume digital payment systems like UPI.

Traditional fraud systems suffer from major limitations:

❌ Focus only on individual transactions
❌ Detect fraud after loss occurs
❌ Cannot identify coordinated fraud rings
❌ High false positives (flagging legitimate merchants)

There is a strong need for a system that can:

✔ Detect fraud networks early

# Money Muling Detection Engine (Graph + ML)

End-to-end platform for detecting potential money mule accounts and coordinated fraud rings from transaction data.

It ships as:

- A FastAPI backend that ingests a transactions CSV, builds a directed transaction graph, detects suspicious ring patterns, computes explainable suspicion scores, and optionally blends them with an ML model.
- A Next.js dashboard that lets you upload data, visualize the transaction graph, inspect detected rings, review per-account risk, and download a JSON report.

## What this repo actually does

### Detection pipeline

Given transactions (sender → receiver edges with amount + timestamp), the backend runs:

1. CSV validation and normalization (Pydantic model parsing for timestamps/amounts)
2. Graph construction (NetworkX `MultiDiGraph`)
3. Pattern detectors - Cycles (3–5 member loops) - Smurfing (fan-in / fan-out structures) - Layered chains (multi-hop laundering-like paths)
4. Suspicion scoring (rule-based) - Pattern participation (cycle/smurfing/layering) - Velocity bonus (high max tx/hour) - Merchant penalty (very high volume accounts)
5. Optional ML scoring (if model artefacts exist) - RandomForest fraud probability per account - Blend rule score + ML probability into a final score
6. Report generation (`output/latest_report.json`) and download

### Key outputs

- Graph JSON (nodes/edges) for visualization
- Suspicious ring list (with pattern + risk)
- Per-account suspicion scores (0–100)
- A deterministic JSON report for investigations/audits

## Project structure

```
backend/
        main.py                       FastAPI app + pipeline
        services/
                json_formatter.py            Final report formatter (writes output/latest_report.json)
                feature_extractor.py         Feature extraction for training datasets
        ml/
                predictor.py                 Loads model/scaler and predicts fraud probability
                train_model.py               Trains and saves model artefacts
        utils/
                synthetic_data_generator.py  Generates synthetic_transactions.csv + fraud_labels.csv
                extract_features_from_csv.py Builds account_features.csv for ML training
        data/                          Synthetic data + extracted features
        models/                        fraud_model.pkl + scaler.pkl (generated)
        output/                        latest_report.json (generated)

frontend/
        app/page.tsx                   Main dashboard shell
        components/                    Upload + graph + ring + scoring views
```

## Quickstart (local dev)

### 1) Backend (FastAPI)

From the repo root:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Backend will be on `http://127.0.0.1:8000`.

Notes:

- CORS is configured in `backend/main.py` and already allows localhost dev origins by default.
- You can override allowed origins with `ALLOWED_ORIGINS` (comma-separated) or `ALLOWED_ORIGINS=*`.

### 2) Frontend (Next.js)

```bash
cd frontend
npm install
npm run dev
```

Frontend will be on `http://localhost:3000`.

Important: the current frontend is hardcoded to call the deployed API base URL (`https://rift-money-muling-seven.vercel.app`).

To use your local backend, replace that base URL in:

- `frontend/components/CSVUploadNew.tsx`
- `frontend/app/page.tsx`

with `http://127.0.0.1:8000`.

## Transaction CSV format

Required columns:

- `transaction_id` (string)
- `sender_id` (string)
- `receiver_id` (string)
- `amount` (number, must be > 0)
- `timestamp` (string; many ISO-like formats supported)

You can also query the sample schema from the backend:

```bash
curl http://127.0.0.1:8000/transactions/sample
```

## Backend API

Base URL (local): `http://127.0.0.1:8000`

### Health

```bash
curl http://127.0.0.1:8000/
curl http://127.0.0.1:8000/health
```

### Upload + validate CSV

```bash
curl -F "file=@transactions.csv" http://127.0.0.1:8000/upload-csv
```

Returns: validated rows plus per-row errors (if any).

### Graph JSON for visualization

```bash
curl -F "file=@transactions.csv" http://127.0.0.1:8000/graph-data
```

Returns:

- `graph.nodes[] = { id }`
- `graph.edges[] = { id, source, target, amount, timestamp }`

Existing sample data variant (uses `backend/transactions.csv`):

```bash
curl http://127.0.0.1:8000/graph-data/existing
```

### Ring detection

```bash
curl -F "file=@transactions.csv" http://127.0.0.1:8000/detect-rings
```

Returns suspicious rings with patterns:

- `cycle`
- `smurfing_fan_in`
- `smurfing_fan_out`
- `layered`

Existing sample data variant (uses `backend/transactions.csv`):

```bash
curl http://127.0.0.1:8000/detect-rings/existing
```

### Suspicion scores

```bash
curl -F "file=@transactions.csv" http://127.0.0.1:8000/suspicion-scores
```

Returns per-account suspicion scores (0–100) plus a `merchant_accounts` map.

Existing sample data variant (uses `backend/transactions.csv`):

```bash
curl http://127.0.0.1:8000/suspicion-scores/existing
```

### Additional endpoints

The backend also exposes higher-level graph analysis helpers (primarily for debugging / richer stats):

- `POST /build-graph` (upload CSV → graph stats + outgoing/incoming maps)
- `GET /analyze-existing-data` (runs analysis on `backend/transactions.csv`)

### Full analysis + report

```bash
curl -X POST http://127.0.0.1:8000/analyze
curl -O -J http://127.0.0.1:8000/download-report
```

`POST /analyze` accepts an optional file upload. If you omit the file, it uses the built-in demo CSV:

- `backend/transactions_with_demo_fraud.csv`

The report schema is produced in `backend/services/json_formatter.py` and looks like:

```json
{
  "summary": {
    "total_accounts": 0,
    "total_transactions": 0,
    "fraud_rings_detected": 0,
    "suspicious_accounts_count": 0,
    "ml_model_active": false,
    "processing_time_seconds": 0.0
  },
  "fraud_rings": [
    {
      "ring_id": "RING_001",
      "pattern": "cycle",
      "members": ["A", "B"],
      "risk_score": 80
    }
  ],
  "suspicious_accounts": [
    {
      "account_id": "A",
      "suspicion_score": 90,
      "risk_level": "HIGH",
      "associated_ring": "RING_001",
      "rule_score": 90,
      "ml_probability": 0.873421
    }
  ]
}
```

Notes:

- `risk_score` in the final report is an integer 0–100.
- `ml_probability` and `rule_score` are included only when an ML model is available.

## ML (optional)

The ML model is a RandomForestClassifier trained on synthetic data.

### Generate synthetic dataset

```bash
cd backend
python utils/synthetic_data_generator.py
```

Outputs:

- `backend/data/synthetic_transactions.csv`
- `backend/data/fraud_labels.csv`

### Extract account features for training

```bash
cd backend
python utils/extract_features_from_csv.py
```

Outputs:

- `backend/data/account_features.csv`

### Train model

```bash
cd backend
python -m ml.train_model
```

Outputs:

- `backend/models/fraud_model.pkl`
- `backend/models/scaler.pkl`

Once these exist, `POST /analyze` will automatically enable ML blending.

## Tests / validation scripts

This repo contains runnable test scripts under `backend/`.

Examples:

```bash
cd backend
python test_suspicion_scoring.py
python test_ring_detection.py
python test_feature_extractor.py
```

## Troubleshooting

### CORS errors in the browser

- Ensure the backend is running on port 8000 and the frontend on 3000.
- If you changed ports/domains, set `ALLOWED_ORIGINS` and restart the backend.

### Frontend still calling the deployed API

- Search for `rift-money-muling-seven.vercel.app` in the frontend and replace with your local backend base URL.

## License

MIT
