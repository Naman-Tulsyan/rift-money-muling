"""
JSON Report Formatter for Money Muling Detection Engine.

Generates a deterministic JSON report from fraud detection results,
including fraud rings, suspicious accounts, and summary statistics.
"""

import json
import os
import time
from typing import Any, Dict, List, Optional

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_OUTPUT_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "output")
_REPORT_FILENAME = "latest_report.json"


# ---------------------------------------------------------------------------
# Risk level helpers
# ---------------------------------------------------------------------------

def _risk_level(score: int) -> str:
    """
    Map a suspicion score (0-100) to a risk level label.

    score >= 80  → HIGH
    score >= 50  → MEDIUM
    else         → LOW
    """
    if score >= 80:
        return "HIGH"
    if score >= 50:
        return "MEDIUM"
    return "LOW"


# ---------------------------------------------------------------------------
# Public formatting functions
# ---------------------------------------------------------------------------

def format_fraud_rings(
    fraud_rings: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """
    Format and sort fraud rings for the final report.

    Each input dict must contain:
        ring_id (str), pattern (str), members (list[str]), risk_score (int/float)

    Returns a new list sorted by risk_score DESC (stable).
    """
    formatted: List[Dict[str, Any]] = []
    for ring in fraud_rings:
        formatted.append({
            "ring_id": ring["ring_id"],
            "pattern": ring["pattern"],
            "members": list(ring["members"]),
            "risk_score": round(float(ring["risk_score"]), 4),
        })

    # Sort by risk_score descending; stable sort preserves insertion order on ties
    formatted.sort(key=lambda r: r["risk_score"], reverse=True)
    return formatted


def format_suspicious_accounts(
    account_scores: Dict[str, int],
    account_ring_map: Dict[str, Optional[str]],
    ml_probabilities: Optional[Dict[str, float]] = None,
    rule_scores: Optional[Dict[str, int]] = None,
) -> List[Dict[str, Any]]:
    """
    Format and sort suspicious accounts for the final report.

    Args:
        account_scores:   account_id → final suspicion_score (int, 0-100).
                          When ML is enabled this is the blended score.
        account_ring_map: account_id → ring_id (str) or None
        ml_probabilities: account_id → fraud probability (0-1), optional.
        rule_scores:      account_id → rule-based score (0-100), optional.

    Returns a new list sorted by suspicion_score DESC, then account_id ASC.
    """
    ml_probs = ml_probabilities or {}
    rules = rule_scores or {}

    accounts: List[Dict[str, Any]] = []
    for account_id, score in account_scores.items():
        clamped = max(0, min(100, int(score)))
        entry: Dict[str, Any] = {
            "account_id": account_id,
            "suspicion_score": clamped,
            "risk_level": _risk_level(clamped),
            "associated_ring": account_ring_map.get(account_id),
        }
        # Include ML detail when available
        if ml_probs:
            entry["rule_score"] = int(rules.get(account_id, 0))
            entry["ml_probability"] = round(ml_probs.get(account_id, 0.0), 6)
        accounts.append(entry)

    # Primary: score DESC, secondary: account_id ASC (deterministic)
    accounts.sort(key=lambda a: (-a["suspicion_score"], a["account_id"]))
    return accounts


def build_final_json(
    transactions: list,
    fraud_rings: List[Dict[str, Any]],
    account_scores: Dict[str, int],
    account_ring_map: Dict[str, Optional[str]],
    processing_time_seconds: float,
    ml_probabilities: Optional[Dict[str, float]] = None,
    rule_scores: Optional[Dict[str, int]] = None,
) -> Dict[str, Any]:
    """
    Assemble the complete fraud detection report.

    Args:
        transactions:            list of Transaction objects (used for counts).
        fraud_rings:             list of ring dicts (ring_id, pattern, members, risk_score).
        account_scores:          account_id → final suspicion_score (blended when ML is active).
        account_ring_map:        account_id → ring_id or None.
        processing_time_seconds: elapsed wall-clock time for the pipeline.
        ml_probabilities:        account_id → ML fraud probability (0-1), optional.
        rule_scores:             account_id → rule-based score (0-100), optional.

    Returns the full report dict matching the required JSON schema.
    The report is also persisted to ``output/latest_report.json``.
    """
    formatted_rings = format_fraud_rings(fraud_rings)
    formatted_accounts = format_suspicious_accounts(
        account_scores, account_ring_map,
        ml_probabilities=ml_probabilities,
        rule_scores=rule_scores,
    )

    # Derive unique account IDs from transactions
    all_accounts: set[str] = set()
    for tx in transactions:
        all_accounts.add(tx.sender_id)
        all_accounts.add(tx.receiver_id)

    report: Dict[str, Any] = {
        "summary": {
            "total_accounts": len(all_accounts),
            "total_transactions": len(transactions),
            "fraud_rings_detected": len(formatted_rings),
            "suspicious_accounts_count": len(formatted_accounts),
            "ml_model_active": bool(ml_probabilities),
            "processing_time_seconds": round(processing_time_seconds, 4),
        },
        "fraud_rings": formatted_rings,
        "suspicious_accounts": formatted_accounts,
    }

    # Persist to disk
    _save_report(report)

    return report


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _save_report(report: Dict[str, Any]) -> str:
    """
    Write the report dict to ``output/latest_report.json``.

    Returns the absolute path of the written file.
    """
    os.makedirs(_OUTPUT_DIR, exist_ok=True)
    path = os.path.join(_OUTPUT_DIR, _REPORT_FILENAME)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)
    return path
