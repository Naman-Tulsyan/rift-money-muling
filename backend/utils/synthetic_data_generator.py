"""
Synthetic Transaction Dataset Generator for Money Muling Detection Engine.

Generates a large realistic dataset of bank transactions including both
normal behavior and fraud patterns (cycles, smurfing, and layering).

Output: data/synthetic_transactions.csv
"""

import os
import random
import uuid
from datetime import datetime, timedelta
from typing import List, Tuple

import pandas as pd

# Deterministic output
random.seed(42)

# --- Constants ---
NUM_ACCOUNTS = 1000
TOTAL_TRANSACTIONS = 50_000
NORMAL_RATIO = 0.80  # ~80% normal, ~20% fraud

AMOUNT_MIN = 100
AMOUNT_MAX = 50_000

DAYS_BACK = 30
BASE_TIME = datetime(2026, 2, 19)  # reference "now"

NUM_CYCLES = 50
NUM_SMURFING_GROUPS = 50
NUM_LAYERED_CHAINS = 50


# ──────────────────────────────────────────────
#  Helper utilities
# ──────────────────────────────────────────────

def _random_timestamp() -> datetime:
    """Return a random timestamp within the last DAYS_BACK days."""
    offset = timedelta(
        days=random.randint(0, DAYS_BACK - 1),
        hours=random.randint(0, 23),
        minutes=random.randint(0, 59),
        seconds=random.randint(0, 59),
    )
    return BASE_TIME - offset


def _close_timestamps(base: datetime, n: int, max_hours: int = 4) -> List[datetime]:
    """Return *n* timestamps clustered around *base* within *max_hours*."""
    return [
        base + timedelta(hours=random.uniform(-max_hours, max_hours),
                         minutes=random.randint(0, 59))
        for _ in range(n)
    ]


def _txn_id() -> str:
    return f"TXN-{uuid.uuid4().hex[:12].upper()}"


# ──────────────────────────────────────────────
#  1. Account generation
# ──────────────────────────────────────────────

def generate_accounts(n: int = NUM_ACCOUNTS) -> List[str]:
    """Generate account IDs A0001 … A{n}."""
    return [f"A{str(i).zfill(4)}" for i in range(1, n + 1)]


# ──────────────────────────────────────────────
#  2. Normal transactions (~80 %)
# ──────────────────────────────────────────────

def generate_normal_transactions(
    accounts: List[str],
    count: int,
) -> List[dict]:
    """
    Create typical user behaviour:
    - Random sender → receiver (no self-sends)
    - Random amount in [AMOUNT_MIN, AMOUNT_MAX]
    - Timestamps spread evenly over the window
    """
    transactions: List[dict] = []
    for _ in range(count):
        sender, receiver = random.sample(accounts, 2)
        transactions.append({
            "transaction_id": _txn_id(),
            "sender_id": sender,
            "receiver_id": receiver,
            "amount": round(random.uniform(AMOUNT_MIN, AMOUNT_MAX), 2),
            "timestamp": _random_timestamp(),
        })
    return transactions


# ──────────────────────────────────────────────
#  3-A. Cycle fraud
# ──────────────────────────────────────────────

def generate_cycle_fraud(
    accounts: List[str],
    num_cycles: int = NUM_CYCLES,
) -> List[dict]:
    """
    Create *num_cycles* cycles of length 3-5.
    Example cycle:  A1 → A2 → A3 → A1
    Uses similar amounts and close timestamps per cycle.
    """
    transactions: List[dict] = []
    for _ in range(num_cycles):
        cycle_len = random.randint(3, 5)
        cycle_accounts = random.sample(accounts, cycle_len)

        base_amount = round(random.uniform(500, 10_000), 2)
        base_time = _random_timestamp()
        stamps = _close_timestamps(base_time, cycle_len, max_hours=3)

        for i in range(cycle_len):
            sender = cycle_accounts[i]
            receiver = cycle_accounts[(i + 1) % cycle_len]
            # Slight amount jitter (±5 %) to look realistic
            amount = round(base_amount * random.uniform(0.95, 1.05), 2)
            transactions.append({
                "transaction_id": _txn_id(),
                "sender_id": sender,
                "receiver_id": receiver,
                "amount": amount,
                "timestamp": stamps[i],
            })
    return transactions


# ──────────────────────────────────────────────
#  3-B. Smurfing fraud
# ──────────────────────────────────────────────

def generate_smurfing_fraud(
    accounts: List[str],
    num_groups: int = NUM_SMURFING_GROUPS,
) -> List[dict]:
    """
    For each group create:
      • Fan-in:  10-15 senders → 1 receiver within 24 h
      • Fan-out: 1 sender  → 10-15 receivers within 24 h

    Uses small, consistent amounts per group.
    """
    transactions: List[dict] = []

    for _ in range(num_groups):
        # ---- Fan-in ----
        fan_in_count = random.randint(10, 15)
        participants = random.sample(accounts, fan_in_count + 1)
        hub = participants[0]
        senders = participants[1:]

        base_amount = round(random.uniform(200, 3_000), 2)
        base_time = _random_timestamp()
        stamps = _close_timestamps(base_time, fan_in_count, max_hours=12)

        for idx, sender in enumerate(senders):
            amount = round(base_amount * random.uniform(0.90, 1.10), 2)
            transactions.append({
                "transaction_id": _txn_id(),
                "sender_id": sender,
                "receiver_id": hub,
                "amount": amount,
                "timestamp": stamps[idx],
            })

        # ---- Fan-out ----
        fan_out_count = random.randint(10, 15)
        recipients = random.sample(accounts, fan_out_count + 1)
        hub_out = recipients[0]
        receivers = recipients[1:]

        base_amount = round(random.uniform(200, 3_000), 2)
        base_time = _random_timestamp()
        stamps = _close_timestamps(base_time, fan_out_count, max_hours=12)

        for idx, receiver in enumerate(receivers):
            amount = round(base_amount * random.uniform(0.90, 1.10), 2)
            transactions.append({
                "transaction_id": _txn_id(),
                "sender_id": hub_out,
                "receiver_id": receiver,
                "amount": amount,
                "timestamp": stamps[idx],
            })

    return transactions


# ──────────────────────────────────────────────
#  3-C. Layering fraud
# ──────────────────────────────────────────────

def generate_layered_fraud(
    accounts: List[str],
    num_chains: int = NUM_LAYERED_CHAINS,
) -> List[dict]:
    """
    Create *num_chains* layered chains of 4-6 accounts.
    A1 → A2 → A3 → A4 (→ A5 → A6)

    Intermediate nodes have only 2-3 transactions total,
    so we add 1-2 small "noise" transactions per intermediate.
    """
    transactions: List[dict] = []

    for _ in range(num_chains):
        chain_len = random.randint(4, 6)
        chain_accounts = random.sample(accounts, chain_len)

        base_amount = round(random.uniform(1_000, 15_000), 2)
        base_time = _random_timestamp()

        # Main chain transactions
        for i in range(chain_len - 1):
            sender = chain_accounts[i]
            receiver = chain_accounts[i + 1]
            # Slight reduction per hop to simulate fees / extraction
            amount = round(base_amount * random.uniform(0.92, 0.98), 2)
            ts = base_time + timedelta(hours=i * random.uniform(1, 6))
            transactions.append({
                "transaction_id": _txn_id(),
                "sender_id": sender,
                "receiver_id": receiver,
                "amount": amount,
                "timestamp": ts,
            })

        # Add 1-2 small noise txns for each intermediate node
        intermediates = chain_accounts[1:-1]
        for node in intermediates:
            extra = random.randint(1, 2)
            for _ in range(extra):
                # Tiny transaction to/from a random account
                other = random.choice(accounts)
                while other == node:
                    other = random.choice(accounts)
                direction = random.choice(["in", "out"])
                small_amount = round(random.uniform(50, 500), 2)
                ts = base_time + timedelta(hours=random.uniform(0, 24))
                if direction == "in":
                    transactions.append({
                        "transaction_id": _txn_id(),
                        "sender_id": other,
                        "receiver_id": node,
                        "amount": small_amount,
                        "timestamp": ts,
                    })
                else:
                    transactions.append({
                        "transaction_id": _txn_id(),
                        "sender_id": node,
                        "receiver_id": other,
                        "amount": small_amount,
                        "timestamp": ts,
                    })

    return transactions


# ──────────────────────────────────────────────
#  4. Build & save
# ──────────────────────────────────────────────

def build_dataset() -> pd.DataFrame:
    """
    Assemble the full dataset:
    1. Generate accounts
    2. Generate normal + fraud transactions
    3. Combine, sort by timestamp, return DataFrame
    """
    accounts = generate_accounts()

    # Budget calculation
    # Estimate fraud txns first, then fill the rest with normal
    cycle_txns = generate_cycle_fraud(accounts)
    smurfing_txns = generate_smurfing_fraud(accounts)
    layered_txns = generate_layered_fraud(accounts)

    fraud_count = len(cycle_txns) + len(smurfing_txns) + len(layered_txns)
    normal_count = max(TOTAL_TRANSACTIONS - fraud_count, 0)

    normal_txns = generate_normal_transactions(accounts, normal_count)

    all_txns = normal_txns + cycle_txns + smurfing_txns + layered_txns

    df = pd.DataFrame(all_txns)
    df.sort_values("timestamp", inplace=True)
    df.reset_index(drop=True, inplace=True)

    return df


def save_to_csv(df: pd.DataFrame, path: str | None = None) -> str:
    """Save the DataFrame to CSV and return the path used."""
    if path is None:
        path = os.path.join(os.path.dirname(__file__), "..", "data", "synthetic_transactions.csv")
    path = os.path.abspath(path)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    df.to_csv(path, index=False)
    return path


# ──────────────────────────────────────────────
#  Main entry-point
# ──────────────────────────────────────────────

def main():
    print("🔧 Generating synthetic transaction dataset …")
    df = build_dataset()

    fraud_approx = len(df) - int(TOTAL_TRANSACTIONS * NORMAL_RATIO)
    print(f"   Total transactions : {len(df):,}")
    print(f"   Normal (approx)    : {len(df) - fraud_approx:,}")
    print(f"   Fraud  (approx)    : {fraud_approx:,}")

    saved = save_to_csv(df)
    print(f"✅ Saved to {saved}")


if __name__ == "__main__":
    main()
