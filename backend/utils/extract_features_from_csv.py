"""
Extract per-account features from synthetic_transactions.csv and produce
data/account_features.csv suitable for ML training.

Uses ground-truth fraud labels from the synthetic data generator and
computes behavioural / graph features from raw transactions.
"""

import os
from collections import defaultdict
from typing import Dict, List, Set, Tuple

import numpy as np
import pandas as pd

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

_BASE_DIR = os.path.dirname(os.path.dirname(__file__))
_DATA_DIR = os.path.join(_BASE_DIR, "data")
_INPUT_CSV = os.path.join(_DATA_DIR, "synthetic_transactions.csv")
_LABELS_CSV = os.path.join(_DATA_DIR, "fraud_labels.csv")
_OUTPUT_CSV = os.path.join(_DATA_DIR, "account_features.csv")

# Thresholds
_MERCHANT_TX_THRESHOLD = 200


# ---------------------------------------------------------------------------
# 1. Load data
# ---------------------------------------------------------------------------

def load_transactions(path: str = _INPUT_CSV) -> pd.DataFrame:
    return pd.read_csv(path, parse_dates=["timestamp"])


def load_labels(path: str = _LABELS_CSV) -> pd.DataFrame:
    return pd.read_csv(path)


# ---------------------------------------------------------------------------
# 2. Compute per-account behavioural features
# ---------------------------------------------------------------------------

def compute_account_features(df: pd.DataFrame) -> pd.DataFrame:
    """Compute statistical features per account from raw transactions."""

    all_ids = sorted(set(df["sender_id"]) | set(df["receiver_id"]))

    # Sender-side aggregations
    sent = df.groupby("sender_id").agg(
        sent_count=("amount", "size"),
        total_amount_sent=("amount", "sum"),
        avg_amount_sent=("amount", "mean"),
        unique_receivers=("receiver_id", "nunique"),
    )

    # Receiver-side aggregations
    recv = df.groupby("receiver_id").agg(
        recv_count=("amount", "size"),
        unique_senders=("sender_id", "nunique"),
    )

    # Max transactions per clock-hour (sender side)
    df_hour = df.copy()
    df_hour["hour_bucket"] = df_hour["timestamp"].dt.floor("h")
    hourly = (
        df_hour.groupby(["sender_id", "hour_bucket"])
        .size()
        .reset_index(name="cnt")
    )
    max_per_hour = hourly.groupby("sender_id")["cnt"].max()

    # Combine into stats DataFrame
    stats = pd.DataFrame(index=all_ids)
    stats.index.name = "account_id"
    stats["total_transactions"] = (
        sent["sent_count"].reindex(all_ids, fill_value=0).values
        + recv["recv_count"].reindex(all_ids, fill_value=0).values
    )
    stats["total_amount_sent"] = (
        sent["total_amount_sent"].reindex(all_ids, fill_value=0).values
    )
    stats["avg_transaction_amount"] = (
        sent["avg_amount_sent"].reindex(all_ids, fill_value=0).values
    )
    stats["unique_receivers"] = (
        sent["unique_receivers"].reindex(all_ids, fill_value=0).astype(int).values
    )
    stats["unique_senders"] = (
        recv["unique_senders"].reindex(all_ids, fill_value=0).astype(int).values
    )
    stats["max_transactions_per_hour"] = (
        max_per_hour.reindex(all_ids, fill_value=0).astype(int).values
    )

    stats = stats.round(2)
    return stats


# ---------------------------------------------------------------------------
# 3. Merge features with ground-truth labels
# ---------------------------------------------------------------------------

def build_training_dataset(
    df: pd.DataFrame,
    labels: pd.DataFrame,
) -> pd.DataFrame:
    """
    Combine behavioural features with fraud labels from the generator.

    Adds:
      - smurfing_flag, layering_depth (from label metadata),
        cycle_count, ring_size
      - merchant_flag (high-volume account heuristic)
      - label (binary fraud indicator)
    """
    stats = compute_account_features(df)
    stats.reset_index(inplace=True)

    # Merge with ground-truth
    merged = stats.merge(labels, on="account_id", how="left")
    merged["label"] = merged["label"].fillna(0).astype(int)

    # Enriched graph features from ground truth
    merged["smurfing_flag"] = merged["in_smurfing"].fillna(0).astype(int)
    merged["cycle_count"] = merged["in_cycle"].fillna(0).astype(int)

    # Approximate layering depth: use chain membership as a signal
    merged["layering_depth"] = merged["in_layering"].fillna(0).astype(int) * 4

    # Ring size approximation: fraud accounts interconnected via transactions
    _compute_ring_sizes(df, merged)

    # Merchant flag
    merged["merchant_flag"] = (
        merged["total_transactions"] > _MERCHANT_TX_THRESHOLD
    ).astype(int)

    # Select final columns in order
    output_cols = [
        "account_id",
        "total_transactions",
        "total_amount_sent",
        "avg_transaction_amount",
        "unique_receivers",
        "unique_senders",
        "max_transactions_per_hour",
        "smurfing_flag",
        "layering_depth",
        "cycle_count",
        "ring_size",
        "merchant_flag",
        "label",
    ]
    return merged[output_cols]


def _compute_ring_sizes(df: pd.DataFrame, merged: pd.DataFrame) -> None:
    """
    Compute ring_size: for each fraud account, count how many other fraud
    accounts it transacts with directly.
    """
    fraud_ids = set(merged.loc[merged["label"] == 1, "account_id"])

    # Build undirected fraud-to-fraud graph using union-find
    parent: Dict[str, str] = {}

    def find(x: str) -> str:
        while parent.get(x, x) != x:
            parent[x] = parent.get(parent[x], parent[x])
            x = parent[x]
        return x

    def union(a: str, b: str) -> None:
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[ra] = rb

    for _, row in df.iterrows():
        s, r = row["sender_id"], row["receiver_id"]
        if s in fraud_ids and r in fraud_ids:
            union(s, r)

    # Count component sizes
    components: Dict[str, set] = defaultdict(set)
    for node in fraud_ids:
        components[find(node)].add(node)

    ring_map: Dict[str, int] = {}
    for comp in components.values():
        size = len(comp)
        for node in comp:
            ring_map[node] = size

    merged["ring_size"] = merged["account_id"].map(ring_map).fillna(0).astype(int)


# ---------------------------------------------------------------------------
# 4. Save
# ---------------------------------------------------------------------------

def save_features(features: pd.DataFrame, path: str = _OUTPUT_CSV) -> str:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    features.to_csv(path, index=False)
    return os.path.abspath(path)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    print("🔧 Extracting account features from synthetic transactions …")

    # Check if labels exist; if not, regenerate synthetic data
    if not os.path.exists(_LABELS_CSV):
        print("   ⚠ No fraud_labels.csv found — regenerating synthetic data …")
        from utils.synthetic_data_generator import main as gen_main
        gen_main()

    df = load_transactions()
    labels = load_labels()
    print(f"   Loaded {len(df):,} transactions, {len(labels):,} account labels")

    features = build_training_dataset(df, labels)

    fraud_count = features["label"].sum()
    print(f"\n   Total accounts : {len(features):,}")
    print(f"   Fraud (label=1): {fraud_count:,}")
    print(f"   Clean (label=0): {len(features) - fraud_count:,}")

    saved = save_features(features)
    print(f"✅ Saved to {saved}")


if __name__ == "__main__":
    main()
