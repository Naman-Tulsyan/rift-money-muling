#!/usr/bin/env python3
"""
Tests for the Suspicious Account Scoring engine (Step 5).

Covers:
  - Base pattern scoring
  - Multi-ring accumulation
  - Velocity bonus thresholds
  - Merchant penalty
  - Clamping to [0, 100]
  - Deterministic ordering
  - Full pipeline via compute_suspicion_scores()
"""

from datetime import datetime, timedelta
import networkx as nx

from main import (
    SuspiciousRing,
    build_account_ring_map,
    apply_ring_scores,
    compute_transaction_metrics,
    apply_velocity_bonus,
    apply_merchant_penalty,
    build_final_account_list,
    compute_suspicion_scores,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_ring(ring_id: str, members: list, pattern: str) -> SuspiciousRing:
    return SuspiciousRing(
        ring_id=ring_id,
        members=members,
        pattern=pattern,
        risk_score=90,
    )


def _build_graph_with_edges(edges: list) -> nx.MultiDiGraph:
    """
    Build a MultiDiGraph from a list of (sender, receiver, amount, timestamp) tuples.
    """
    G = nx.MultiDiGraph()
    for i, (u, v, amount, ts) in enumerate(edges):
        G.add_edge(
            u, v,
            transaction_id=f"TX_{i:04}",
            tx_id=f"TX_{i:04}",
            amount=amount,
            timestamp=ts,
        )
    return G


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_build_account_ring_map():
    """Each account maps to all ring IDs it belongs to."""
    rings = [
        _make_ring("RING_001", ["A", "B", "C"], "cycle"),
        _make_ring("RING_002", ["B", "D"], "smurfing_fan_in"),
    ]
    mapping = build_account_ring_map(rings)
    assert mapping["A"] == ["RING_001"]
    assert mapping["B"] == ["RING_001", "RING_002"]
    assert mapping["C"] == ["RING_001"]
    assert mapping["D"] == ["RING_002"]
    print("✅ test_build_account_ring_map passed")


def test_apply_ring_scores_single_ring():
    """Score for a single-cycle ring member should be 40."""
    rings = [_make_ring("RING_001", ["A", "B", "C"], "cycle")]
    scores = apply_ring_scores(rings)
    assert scores["A"] == 40
    assert scores["B"] == 40
    assert scores["C"] == 40
    print("✅ test_apply_ring_scores_single_ring passed")


def test_apply_ring_scores_multiple_rings():
    """Account in cycle + smurfing → 40 + 30 = 70."""
    rings = [
        _make_ring("RING_001", ["A", "B", "C"], "cycle"),
        _make_ring("RING_002", ["A", "D"], "smurfing_fan_in"),
    ]
    scores = apply_ring_scores(rings)
    assert scores["A"] == 70  # 40 + 30
    assert scores["B"] == 40
    assert scores["D"] == 30
    print("✅ test_apply_ring_scores_multiple_rings passed")


def test_apply_ring_scores_layered():
    """Layered pattern contributes +25."""
    rings = [_make_ring("RING_001", ["X", "Y"], "layered")]
    scores = apply_ring_scores(rings)
    assert scores["X"] == 25
    print("✅ test_apply_ring_scores_layered passed")


def test_velocity_bonus_above_5():
    """Account with 8 tx/hour → +10 bonus."""
    base = datetime(2024, 1, 1, 12, 0, 0)
    # 8 edges from A to B within 1 hour
    edges = [(f"A", f"B", 100, base + timedelta(minutes=i * 7)) for i in range(8)]
    G = _build_graph_with_edges(edges)
    metrics = compute_transaction_metrics(G)

    scores = {"A": 40}
    updated = apply_velocity_bonus(scores, metrics)
    assert updated["A"] == 50  # 40 + 10
    print("✅ test_velocity_bonus_above_5 passed")


def test_velocity_bonus_above_10():
    """Account with 12 tx/hour → +20 bonus."""
    base = datetime(2024, 1, 1, 12, 0, 0)
    edges = [("A", "B", 100, base + timedelta(minutes=i * 4)) for i in range(12)]
    G = _build_graph_with_edges(edges)
    metrics = compute_transaction_metrics(G)

    scores = {"A": 40}
    updated = apply_velocity_bonus(scores, metrics)
    assert updated["A"] == 60  # 40 + 20
    print("✅ test_velocity_bonus_above_10 passed")


def test_velocity_bonus_none():
    """Account with 3 tx/hour → no bonus."""
    base = datetime(2024, 1, 1, 12, 0, 0)
    edges = [("A", "B", 100, base + timedelta(minutes=i * 20)) for i in range(3)]
    G = _build_graph_with_edges(edges)
    metrics = compute_transaction_metrics(G)

    scores = {"A": 40}
    updated = apply_velocity_bonus(scores, metrics)
    assert updated["A"] == 40
    print("✅ test_velocity_bonus_none passed")


def test_merchant_penalty():
    """Account with >200 transactions should receive -50 penalty."""
    base = datetime(2024, 1, 1, 0, 0, 0)
    # 201 edges from A → different receivers (>200 total tx for A)
    edges = [("A", f"R{i}", 10, base + timedelta(seconds=i)) for i in range(201)]
    G = _build_graph_with_edges(edges)
    metrics = compute_transaction_metrics(G)

    assert metrics["A"]["is_merchant"] is True

    scores = {"A": 70}
    updated = apply_merchant_penalty(scores, metrics)
    assert updated["A"] == 20  # 70 - 50
    print("✅ test_merchant_penalty passed")


def test_no_merchant_penalty():
    """Account with <200 transactions should NOT receive penalty."""
    base = datetime(2024, 1, 1, 0, 0, 0)
    edges = [("A", f"R{i}", 10, base + timedelta(seconds=i)) for i in range(5)]
    G = _build_graph_with_edges(edges)
    metrics = compute_transaction_metrics(G)

    assert metrics["A"]["is_merchant"] is False

    scores = {"A": 70}
    updated = apply_merchant_penalty(scores, metrics)
    assert updated["A"] == 70
    print("✅ test_no_merchant_penalty passed")


def test_clamping_lower():
    """Score should never go below 0."""
    scores = {"A": 10}
    # Simulate merchant penalty manually
    metrics = {"A": {"is_merchant": True, "max_tx_per_hour": 0, "total_transactions": 300}}
    updated = apply_merchant_penalty(scores, metrics)
    # 10 - 50 = -40, but clamped to 0 in final output
    account_to_rings = {"A": ["RING_001"]}
    result = build_final_account_list(updated, account_to_rings)
    assert result[0].suspicion_score == 0
    print("✅ test_clamping_lower passed")


def test_clamping_upper():
    """Score should never exceed 100."""
    scores = {"A": 120}
    account_to_rings = {"A": ["RING_001"]}
    result = build_final_account_list(scores, account_to_rings)
    assert result[0].suspicion_score == 100
    print("✅ test_clamping_upper passed")


def test_deterministic_ordering():
    """Accounts with equal scores are ordered by account_id ASC."""
    scores = {"C": 50, "A": 50, "B": 80}
    account_to_rings = {"A": ["R1"], "B": ["R1"], "C": ["R1"]}
    result = build_final_account_list(scores, account_to_rings)
    ids = [a.account_id for a in result]
    assert ids == ["B", "A", "C"]  # 80 first, then 50s sorted alphabetically
    print("✅ test_deterministic_ordering passed")


def test_spec_example_cycle_with_velocity():
    """
    Spec test case:
      Account A in cycle ring, 8 tx/hour
      Expected: 40 (cycle) + 10 (velocity) = 50
    """
    base = datetime(2024, 1, 1, 12, 0, 0)
    # Build a cycle: A → B → C → A  (3 members)
    edges = [
        ("A", "B", 100, base),
        ("B", "C", 100, base + timedelta(minutes=10)),
        ("C", "A", 100, base + timedelta(minutes=20)),
    ]
    # Add extra edges from A to push velocity to 8 tx/hour
    for i in range(5):
        edges.append(("A", "B", 50, base + timedelta(minutes=3 + i * 7)))

    G = _build_graph_with_edges(edges)

    rings = [_make_ring("RING_001", ["A", "B", "C"], "cycle")]
    accounts = compute_suspicion_scores(G, rings)

    a_entry = next(a for a in accounts if a.account_id == "A")
    assert a_entry.suspicion_score == 50  # 40 + 10
    assert a_entry.involved_rings == ["RING_001"]
    print("✅ test_spec_example_cycle_with_velocity passed")


def test_spec_example_merchant_zeroed():
    """
    Spec test case:
      Account A in cycle ring, is merchant-like (>200 tx).
      Merchant penalty dominates → score clamped to 0.
    """
    base = datetime(2024, 1, 1, 0, 0, 0)
    # A sends to 201 unique receivers spread over many hours → merchant-like
    # Spread over 201 hours so no burst causes velocity bonus
    edges = [("A", f"R{i}", 10, base + timedelta(hours=i * 2)) for i in range(201)]

    G = _build_graph_with_edges(edges)

    rings = [_make_ring("RING_001", ["A", "B", "C"], "cycle")]
    accounts = compute_suspicion_scores(G, rings)

    a_entry = next(a for a in accounts if a.account_id == "A")
    # 40 (cycle) + 0 (no velocity bonus) - 50 (merchant) = -10 → clamped to 0
    assert a_entry.suspicion_score == 0
    print("✅ test_spec_example_merchant_zeroed passed")


def test_empty_rings():
    """No fraud rings → empty result."""
    G = nx.MultiDiGraph()
    G.add_edge("A", "B", transaction_id="TX_0001", tx_id="TX_0001", amount=100, timestamp=datetime.now())
    result = compute_suspicion_scores(G, [])
    assert result == []
    print("✅ test_empty_rings passed")


def test_output_structure():
    """Verify output entries have the correct fields and types."""
    base = datetime(2024, 1, 1, 12, 0, 0)
    edges = [("A", "B", 100, base)]
    G = _build_graph_with_edges(edges)
    rings = [_make_ring("RING_001", ["A", "B"], "cycle")]

    accounts = compute_suspicion_scores(G, rings)
    for acc in accounts:
        assert isinstance(acc.account_id, str)
        assert isinstance(acc.suspicion_score, int)
        assert isinstance(acc.involved_rings, list)
        assert 0 <= acc.suspicion_score <= 100
    print("✅ test_output_structure passed")


# ---------------------------------------------------------------------------
# Runner
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    test_build_account_ring_map()
    test_apply_ring_scores_single_ring()
    test_apply_ring_scores_multiple_rings()
    test_apply_ring_scores_layered()
    test_velocity_bonus_above_5()
    test_velocity_bonus_above_10()
    test_velocity_bonus_none()
    test_merchant_penalty()
    test_no_merchant_penalty()
    test_clamping_lower()
    test_clamping_upper()
    test_deterministic_ordering()
    test_spec_example_cycle_with_velocity()
    test_spec_example_merchant_zeroed()
    test_empty_rings()
    test_output_structure()
    print("\n🎉 All suspicion scoring tests passed!")
