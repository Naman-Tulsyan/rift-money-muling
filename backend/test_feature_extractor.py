"""Smoke test for feature_extractor module."""

from datetime import datetime
from main import Transaction
from services.feature_extractor import (
    extract_account_features,
    generate_labels,
    build_training_dataset,
    save_dataset,
)

# --- Synthetic transactions ---
txns = [
    Transaction(transaction_id="t1", sender_id="A", receiver_id="B", amount=100.0, timestamp=datetime(2025, 1, 1, 10, 0)),
    Transaction(transaction_id="t2", sender_id="B", receiver_id="C", amount=50.0, timestamp=datetime(2025, 1, 1, 10, 15)),
    Transaction(transaction_id="t3", sender_id="C", receiver_id="A", amount=30.0, timestamp=datetime(2025, 1, 1, 10, 30)),
    Transaction(transaction_id="t4", sender_id="A", receiver_id="C", amount=200.0, timestamp=datetime(2025, 1, 1, 11, 0)),
    Transaction(transaction_id="t5", sender_id="D", receiver_id="A", amount=500.0, timestamp=datetime(2025, 1, 1, 12, 0)),
]

fraud_rings = [
    {"ring_id": "r1", "pattern": "cycle", "members": ["A", "B", "C"], "risk_score": 85},
]

smurfing = {"B"}
layering = {"C": 4}
cycles = {"A": 2, "B": 1, "C": 1}

# Test extract
feats = extract_account_features(txns, fraud_rings, smurfing, layering, cycles)
print("--- Features ---")
for f in feats:
    print(f)

# Test labels
labelled = generate_labels(feats)
print("\n--- Labels ---")
for row in labelled:
    print(row["account_id"], "->", row["label"])

# Test build + save
dataset = build_training_dataset(txns, fraud_rings, smurfing, layering, cycles)
path = save_dataset(dataset)
print(f"\nSaved to: {path}")

# Assertions
a = {r["account_id"]: r for r in dataset}
assert a["A"]["label"] == 1, "A should be fraud (cycle_count>0, ring_size>=3)"
assert a["B"]["label"] == 1, "B should be fraud (smurfing)"
assert a["C"]["label"] == 1, "C should be fraud (layering>=3, ring_size>=3)"
assert a["D"]["label"] == 0, "D should be clean"
assert a["A"]["total_transactions"] == 4  # sent 2 + received 2
assert a["A"]["unique_receivers"] == 2    # B, C
assert a["D"]["merchant_flag"] == 0
print("\nAll assertions passed!")
