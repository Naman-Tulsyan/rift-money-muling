"""
ML Training Pipeline for Money Muling Detection Engine.

Trains a supervised RandomForestClassifier that predicts the probability
of an account being fraudulent based on extracted features.

Input  : data/account_features.csv
Output : models/fraud_model.pkl, models/scaler.pkl
"""

import os
from typing import Tuple

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
)
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

_BASE_DIR = os.path.dirname(os.path.dirname(__file__))
_DATA_DIR = os.path.join(_BASE_DIR, "data")
_MODELS_DIR = os.path.join(_BASE_DIR, "models")

_INPUT_CSV = os.path.join(_DATA_DIR, "account_features.csv")
_MODEL_PATH = os.path.join(_MODELS_DIR, "fraud_model.pkl")
_SCALER_PATH = os.path.join(_MODELS_DIR, "scaler.pkl")

# Feature columns (binary flags kept as-is by the scaler since they
# are already 0/1, but listing them here for clarity)
_BINARY_FLAGS = {"smurfing_flag", "merchant_flag"}

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

_LABEL_COL = "label"


# ──────────────────────────────────────────────
#  TASK 1: Load data
# ──────────────────────────────────────────────

def load_data(path: str = _INPUT_CSV) -> Tuple[pd.DataFrame, pd.Series]:
    """
    Load account_features.csv, drop account_id, return (X, y).
    """
    df = pd.read_csv(path)

    # Drop identifier column if present
    if "account_id" in df.columns:
        df.drop(columns=["account_id"], inplace=True)

    y = df[_LABEL_COL]
    X = df[_FEATURE_COLS]

    return X, y


# ──────────────────────────────────────────────
#  TASK 2: Preprocessing
# ──────────────────────────────────────────────

def preprocess_data(
    X_train: pd.DataFrame,
    X_test: pd.DataFrame,
) -> Tuple[np.ndarray, np.ndarray, StandardScaler]:
    """
    - Fill any missing values with 0
    - Scale numeric features using StandardScaler
    - Binary flags are scaled too (harmless for 0/1 values)

    Returns scaled arrays and the fitted scaler.
    """
    X_train = X_train.fillna(0)
    X_test = X_test.fillna(0)

    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)

    return X_train_scaled, X_test_scaled, scaler


# ──────────────────────────────────────────────
#  TASK 3 + 4: Train model
# ──────────────────────────────────────────────

def train_model(
    X_train: np.ndarray,
    y_train: pd.Series,
) -> RandomForestClassifier:
    """
    Train a RandomForestClassifier with:
        n_estimators = 200
        max_depth     = 10
        random_state  = 42
    """
    clf = RandomForestClassifier(
        n_estimators=200,
        max_depth=10,
        random_state=42,
        n_jobs=-1,
    )
    clf.fit(X_train, y_train)
    return clf


# ──────────────────────────────────────────────
#  TASK 5: Evaluation
# ──────────────────────────────────────────────

def evaluate_model(
    clf: RandomForestClassifier,
    X_test: np.ndarray,
    y_test: pd.Series,
    feature_names: list | None = None,
) -> dict:
    """
    Compute and print:
        - Accuracy, Precision, Recall, F1
        - Confusion Matrix
        - Top 10 feature importances

    Returns a dict of metric values.
    """
    y_pred = clf.predict(X_test)

    acc = accuracy_score(y_test, y_pred)
    prec = precision_score(y_test, y_pred, zero_division=0)
    rec = recall_score(y_test, y_pred, zero_division=0)
    f1 = f1_score(y_test, y_pred, zero_division=0)
    cm = confusion_matrix(y_test, y_pred)

    # ── Print metrics ──
    print("\n╔══════════════════════════════════════╗")
    print("║       Model Evaluation Metrics       ║")
    print("╠══════════════════════════════════════╣")
    print(f"║  Accuracy  : {acc:.4f}                 ║")
    print(f"║  Precision : {prec:.4f}                 ║")
    print(f"║  Recall    : {rec:.4f}                 ║")
    print(f"║  F1 Score  : {f1:.4f}                 ║")
    print("╚══════════════════════════════════════╝")

    print("\nConfusion Matrix:")
    print(cm)

    print("\nClassification Report:")
    print(classification_report(y_test, y_pred, zero_division=0))

    # ── Feature importance ──
    if feature_names is not None:
        _print_feature_importance(clf, feature_names)

    return {
        "accuracy": acc,
        "precision": prec,
        "recall": rec,
        "f1": f1,
        "confusion_matrix": cm,
    }


# ──────────────────────────────────────────────
#  TASK 6: Feature importance
# ──────────────────────────────────────────────

def _print_feature_importance(
    clf: RandomForestClassifier,
    feature_names: list,
    top_n: int = 10,
) -> None:
    importances = clf.feature_importances_
    indices = np.argsort(importances)[::-1]

    print(f"\nTop {min(top_n, len(feature_names))} Feature Importances:")
    print("-" * 42)
    for rank, idx in enumerate(indices[:top_n], start=1):
        print(f"  {rank:2d}. {feature_names[idx]:<28s} {importances[idx]:.4f}")
    print("-" * 42)


# ──────────────────────────────────────────────
#  TASK 7: Save model
# ──────────────────────────────────────────────

def save_model(
    clf: RandomForestClassifier,
    scaler: StandardScaler,
    model_path: str = _MODEL_PATH,
    scaler_path: str = _SCALER_PATH,
) -> None:
    """
    Persist trained model and scaler via joblib.
    Creates models/ directory if it does not exist.
    """
    os.makedirs(os.path.dirname(model_path), exist_ok=True)

    joblib.dump(clf, model_path)
    joblib.dump(scaler, scaler_path)

    print(f"\n💾 Model  saved → {os.path.abspath(model_path)}")
    print(f"💾 Scaler saved → {os.path.abspath(scaler_path)}")


# ──────────────────────────────────────────────
#  Main pipeline
# ──────────────────────────────────────────────

def main() -> None:
    print("=" * 50)
    print("  Money Muling Detection – ML Training Pipeline")
    print("=" * 50)

    # 1. Load
    print("\n[1/5] Loading data …")
    X, y = load_data()
    print(f"      Samples : {len(X):,}")
    print(f"      Features: {X.shape[1]}")
    print(f"      Fraud   : {y.sum():,}  ({y.mean() * 100:.1f}%)")
    print(f"      Clean   : {(~y.astype(bool)).sum():,}")

    # 2. Split
    print("\n[2/5] Splitting data (80/20 stratified) …")
    X_train, X_test, y_train, y_test = train_test_split(
        X, y,
        test_size=0.20,
        stratify=y,
        random_state=42,
    )
    print(f"      Train : {len(X_train):,}")
    print(f"      Test  : {len(X_test):,}")

    # 3. Preprocess
    print("\n[3/5] Preprocessing (scaling) …")
    X_train_s, X_test_s, scaler = preprocess_data(X_train, X_test)

    # 4. Train
    print("\n[4/5] Training RandomForestClassifier …")
    clf = train_model(X_train_s, y_train)
    print("      Done.")

    # 5. Evaluate
    print("\n[5/5] Evaluating …")
    evaluate_model(clf, X_test_s, y_test, feature_names=_FEATURE_COLS)

    # 6. Save
    save_model(clf, scaler)

    print("\n✅ Training pipeline complete.")


if __name__ == "__main__":
    main()
