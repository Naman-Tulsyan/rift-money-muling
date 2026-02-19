"""
Feature Extraction & Dataset Generation for Money Muling Detection.

Converts detection pipeline results into a structured training dataset
suitable for ML-based fraud detection models.
"""

import json
import os
from collections import defaultdict
from datetime import datetime
from typing import Any, Dict, List, Optional, Set

import pandas as pd

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
_DATASET_FILENAME = "account_features.json"

# Label thresholds
_LAYERING_DEPTH_THRESHOLD = 3
_RING_SIZE_THRESHOLD = 3
_MERCHANT_TX_THRESHOLD = 200


# ---------------------------------------------------------------------------
# Type aliases (mirrors main.py Transaction fields)
# ---------------------------------------------------------------------------

class _TxLike:
    """Duck-type contract for transaction objects used in this module."""
    sender_id: str
    receiver_id: str
    amount: float
    timestamp: datetime


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _all_account_ids(transactions: List[Any]) -> List[str]:
    """Return a deterministically sorted list of unique account IDs."""
    ids: Set[str] = set()
    for tx in transactions:
        ids.add(tx.sender_id)
        ids.add(tx.receiver_id)
    return sorted(ids)


def _account_ring_map(
    fraud_rings: List[Dict[str, Any]],
) -> Dict[str, int]:
    """Map each account to the size of the largest ring it belongs to."""
    ring_sizes: Dict[str, int] = {}
    for ring in fraud_rings:
        members = ring.get("members", [])
        size = len(members)
        for member in members:
            # Keep the largest ring size if an account appears in multiple rings
            if member not in ring_sizes or size > ring_sizes[member]:
                ring_sizes[member] = size
    return ring_sizes


def _max_transactions_per_hour(timestamps: List[datetime]) -> int:
    """
    Return the maximum number of transactions in any single clock-hour bucket.

    Uses floor-hour bucketing (e.g. 14:00–14:59) for determinism.
    """
    if not timestamps:
        return 0

    hourly: Dict[str, int] = defaultdict(int)
    for ts in timestamps:
        # Bucket by YYYY-MM-DD HH
        bucket = ts.strftime("%Y-%m-%d %H")
        hourly[bucket] += 1

    return max(hourly.values()) if hourly else 0


# ---------------------------------------------------------------------------
# TASK 1: Extract features per account
# ---------------------------------------------------------------------------

def extract_account_features(
    transactions: List[Any],
    fraud_rings: List[Dict[str, Any]],
    smurfing_accounts: Set[str],
    layering_info: Dict[str, int],
    cycle_counts: Dict[str, int],
) -> List[Dict[str, Any]]:
    """
    Compute per-account features from pipeline outputs.

    Parameters
    ----------
    transactions : list
        Transaction objects with sender_id, receiver_id, amount, timestamp.
    fraud_rings : list[dict]
        Each dict has ring_id, pattern, members, risk_score.
    smurfing_accounts : set[str]
        Account IDs flagged for smurfing behaviour.
    layering_info : dict[str, int]
        account_id → layering depth.
    cycle_counts : dict[str, int]
        account_id → number of cycles the account participates in.

    Returns
    -------
    list[dict]
        One feature dict per account, sorted by account_id ascending.
    """

    # Pre-compute ring sizes per account
    ring_size_map = _account_ring_map(fraud_rings)

    # Collect per-account transaction stats using defaultdict
    sent_amounts: Dict[str, List[float]] = defaultdict(list)
    sent_timestamps: Dict[str, List[datetime]] = defaultdict(list)
    receivers_of: Dict[str, Set[str]] = defaultdict(set)
    senders_to: Dict[str, Set[str]] = defaultdict(set)
    tx_count: Dict[str, int] = defaultdict(int)

    for tx in transactions:
        sid = tx.sender_id
        rid = tx.receiver_id

        # Sender stats
        sent_amounts[sid].append(tx.amount)
        sent_timestamps[sid].append(tx.timestamp)
        receivers_of[sid].add(rid)
        tx_count[sid] += 1

        # Receiver stats (counts toward total_transactions & unique_senders)
        senders_to[rid].add(sid)
        tx_count[rid] += 1

    # Build feature vector for every unique account
    account_ids = _all_account_ids(transactions)
    features_list: List[Dict[str, Any]] = []

    for acct in account_ids:
        total_sent = sum(sent_amounts.get(acct, []))
        amounts = sent_amounts.get(acct, [])
        avg_amount = (total_sent / len(amounts)) if amounts else 0.0
        total_tx = tx_count.get(acct, 0)

        features: Dict[str, Any] = {
            # Identifier
            "account_id": acct,
            # Basic behaviour
            "total_transactions": total_tx,
            "total_amount_sent": round(total_sent, 2),
            "avg_transaction_amount": round(avg_amount, 2),
            "unique_receivers": len(receivers_of.get(acct, set())),
            "unique_senders": len(senders_to.get(acct, set())),
            "max_transactions_per_hour": _max_transactions_per_hour(
                sent_timestamps.get(acct, [])
            ),
            # Graph features
            "smurfing_flag": 1 if acct in smurfing_accounts else 0,
            "layering_depth": layering_info.get(acct, 0),
            "cycle_count": cycle_counts.get(acct, 0),
            "ring_size": ring_size_map.get(acct, 0),
            # False-positive protection
            "merchant_flag": 1 if total_tx > _MERCHANT_TX_THRESHOLD else 0,
        }
        features_list.append(features)

    return features_list


# ---------------------------------------------------------------------------
# TASK 2: Auto-generate labels
# ---------------------------------------------------------------------------

def generate_labels(features_list: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Attach a binary fraud label to each account feature dict.

    Rule-based labelling:
        label = 1  if ANY of:
            • smurfing_flag == 1
            • cycle_count > 0
            • layering_depth >= 3
            • ring_size >= 3
        Otherwise label = 0.

    Parameters
    ----------
    features_list : list[dict]
        Output of ``extract_account_features``.

    Returns
    -------
    list[dict]
        Same dicts with an added ``label`` key.
    """

    labelled: List[Dict[str, Any]] = []
    for feat in features_list:
        is_fraud = (
            feat.get("smurfing_flag", 0) == 1
            or feat.get("cycle_count", 0) > 0
            or feat.get("layering_depth", 0) >= _LAYERING_DEPTH_THRESHOLD
            or feat.get("ring_size", 0) >= _RING_SIZE_THRESHOLD
        )
        entry = {**feat, "label": 1 if is_fraud else 0}
        labelled.append(entry)

    return labelled


# ---------------------------------------------------------------------------
# TASK 3: Build training dataset
# ---------------------------------------------------------------------------

def build_training_dataset(
    transactions: List[Any],
    fraud_rings: List[Dict[str, Any]],
    smurfing_accounts: Set[str],
    layering_info: Dict[str, int],
    cycle_counts: Dict[str, int],
) -> List[Dict[str, Any]]:
    """
    End-to-end: extract features, generate labels, return dataset rows.

    Parameters
    ----------
    transactions : list
        Transaction objects.
    fraud_rings : list[dict]
        Detected fraud rings.
    smurfing_accounts : set[str]
        Flagged smurfing accounts.
    layering_info : dict[str, int]
        Layering depth per account.
    cycle_counts : dict[str, int]
        Cycle participation counts.

    Returns
    -------
    list[dict]
        One dict per account with all features + label, sorted by account_id.
    """

    features = extract_account_features(
        transactions=transactions,
        fraud_rings=fraud_rings,
        smurfing_accounts=smurfing_accounts,
        layering_info=layering_info,
        cycle_counts=cycle_counts,
    )
    dataset = generate_labels(features)
    return dataset


# ---------------------------------------------------------------------------
# TASK 4: Save dataset
# ---------------------------------------------------------------------------

def save_dataset(
    dataset: List[Dict[str, Any]],
    output_dir: Optional[str] = None,
    filename: Optional[str] = None,
) -> str:
    """
    Persist the training dataset to ``data/account_features.json``.

    Parameters
    ----------
    dataset : list[dict]
        Rows produced by ``build_training_dataset``.
    output_dir : str, optional
        Override the default output directory.
    filename : str, optional
        Override the default filename.

    Returns
    -------
    str
        Absolute path of the written file.
    """

    dest_dir = output_dir or _DATA_DIR
    dest_file = filename or _DATASET_FILENAME
    os.makedirs(dest_dir, exist_ok=True)

    filepath = os.path.join(dest_dir, dest_file)
    with open(filepath, "w", encoding="utf-8") as fh:
        json.dump(dataset, fh, indent=2, default=str)

    return filepath
