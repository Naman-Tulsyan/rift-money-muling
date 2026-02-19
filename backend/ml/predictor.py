"""
ML Fraud Predictor for Money Muling Detection Engine.

Loads a pre-trained RandomForestClassifier and StandardScaler once at module
initialisation, then provides vectorised prediction functions used by the
detection pipeline.

Model files expected:
    models/fraud_model.pkl
    models/scaler.pkl
"""

import os
from typing import Dict, List, Optional

import joblib
import numpy as np
import pandas as pd

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

_BASE_DIR = os.path.dirname(os.path.dirname(__file__))
_MODELS_DIR = os.path.join(_BASE_DIR, "models")
_MODEL_PATH = os.path.join(_MODELS_DIR, "fraud_model.pkl")
_SCALER_PATH = os.path.join(_MODELS_DIR, "scaler.pkl")

# Feature columns — must match the training order exactly
_FEATURE_COLS = [
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
]

# Blending weights for final score
_RULE_WEIGHT = 0.6
_ML_WEIGHT = 0.4

# ---------------------------------------------------------------------------
# Module-level model & scaler (loaded once)
# ---------------------------------------------------------------------------

_model = None
_scaler = None


def _load_artifacts() -> bool:
    """
    Load the trained model and scaler from disk on first use.

    Returns True if both artefacts are available, False otherwise.
    """
    global _model, _scaler

    if _model is not None and _scaler is not None:
        return True

    if not os.path.exists(_MODEL_PATH) or not os.path.exists(_SCALER_PATH):
        return False

    _model = joblib.load(_MODEL_PATH)
    _scaler = joblib.load(_SCALER_PATH)
    return True


# ---------------------------------------------------------------------------
# TASK 2: Prepare feature matrix
# ---------------------------------------------------------------------------

def prepare_feature_matrix(
    account_features: List[Dict],
) -> tuple[np.ndarray, List[str]]:
    """
    Convert a list of per-account feature dicts into a scaled NumPy matrix
    ready for the model.

    Args:
        account_features: One dict per account with keys matching
                          ``_FEATURE_COLS`` plus ``account_id``.

    Returns:
        (scaled_df, account_ids)
        - scaled_df: DataFrame (n_accounts × n_features) after StandardScaler
        - account_ids: list of account IDs in the same row order
    """
    df = pd.DataFrame(account_features)
    account_ids = df["account_id"].tolist()
    X = df[_FEATURE_COLS].fillna(0)

    if not _load_artifacts():
        raise RuntimeError(
            "ML model artefacts not found. "
            "Run `python -m ml.train_model` first."
        )

    X_scaled = _scaler.transform(X)  # type: ignore[union-attr]
    return X_scaled, account_ids


# ---------------------------------------------------------------------------
# TASK 3: Predict fraud probabilities
# ---------------------------------------------------------------------------

def predict_fraud_probabilities(
    account_features: List[Dict],
) -> Dict[str, float]:
    """
    Compute the probability of each account being fraudulent.

    Args:
        account_features: Per-account feature dicts (same format as training
                          data, including ``account_id``).

    Returns:
        ``{account_id: probability}`` where probability ∈ [0, 1].
    """
    if not account_features:
        return {}

    X_scaled, account_ids = prepare_feature_matrix(account_features)

    # predict_proba returns shape (n_samples, 2): [P(clean), P(fraud)]
    probas = _model.predict_proba(X_scaled)  # type: ignore[union-attr]
    fraud_col = list(_model.classes_).index(1)  # type: ignore[union-attr]

    return {
        acct: float(round(probas[i, fraud_col], 6))
        for i, acct in enumerate(account_ids)
    }


# ---------------------------------------------------------------------------
# TASK 4: Combine rule-based + ML scores
# ---------------------------------------------------------------------------

def compute_final_scores(
    rule_scores: Dict[str, int],
    ml_probabilities: Dict[str, float],
) -> Dict[str, Dict[str, float]]:
    """
    Blend rule-based suspicion scores with ML fraud probabilities.

    Formula per account:
        final_score = 0.6 × rule_score + 0.4 × (ml_probability × 100)

    Clamped to [0, 100].

    Args:
        rule_scores:      ``{account_id: rule_score}``  (0–100).
        ml_probabilities: ``{account_id: probability}`` (0–1).

    Returns:
        ``{account_id: {"rule_score": …, "ml_probability": …,
                        "final_score": …}}``
    """
    all_accounts = set(rule_scores) | set(ml_probabilities)
    results: Dict[str, Dict[str, float]] = {}

    for acct in all_accounts:
        rule = rule_scores.get(acct, 0)
        ml_prob = ml_probabilities.get(acct, 0.0)

        raw = _RULE_WEIGHT * rule + _ML_WEIGHT * (ml_prob * 100)
        final = max(0.0, min(100.0, raw))

        results[acct] = {
            "rule_score": float(rule),
            "ml_probability": round(ml_prob, 6),
            "final_score": round(final, 2),
        }

    return results


# ---------------------------------------------------------------------------
# Convenience: check if ML scoring is available
# ---------------------------------------------------------------------------

def is_available() -> bool:
    """Return True if model files exist and can be loaded."""
    return _load_artifacts()
