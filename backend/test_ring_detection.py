#!/usr/bin/env python3
"""
Test script for suspicious ring detection functionality.
"""

import pandas as pd
import json
from dateutil import parser as date_parser
from main import Transaction, build_transaction_graph, cycle_detector


def test_ring_detection():
    """Test the ring detection functionality with sample data."""
    print("🕵️‍♂️ Testing Suspicious Ring Detection\n")
    
    # Load sample transactions
    df = pd.read_csv("transactions.csv")
    
    transactions = []
    for _, row in df.head(100).iterrows():  # Test with first 100 transactions
        try:
            transaction = Transaction(
                transaction_id=str(row['transaction_id']),
                sender_id=str(row['sender_id']),
                receiver_id=str(row['receiver_id']),
                amount=float(row['amount']),
                timestamp=date_parser.parse(str(row['timestamp']))
            )
            transactions.append(transaction)
        except Exception as e:
            print(f"Error processing row: {e}")
            continue
    
    print(f"✅ Loaded {len(transactions)} transactions")
    
    # Build graph
    G = build_transaction_graph(transactions)
    print(f"📊 Created graph with {G.number_of_nodes()} nodes and {G.number_of_edges()} edges")
    
    # Detect suspicious rings
    suspicious_rings = cycle_detector(G)
    print(f"🔍 Detected {len(suspicious_rings)} suspicious rings")
    
    if suspicious_rings:
        print(f"\n🚨 Top 5 Most Suspicious Rings:")
        # Sort by risk score
        sorted_rings = sorted(suspicious_rings, key=lambda x: x.risk_score or 0, reverse=True)
        
        for i, ring in enumerate(sorted_rings[:5], 1):
            print(f"\n{i}. {ring.ring_id}")
            print(f"   Members: {ring.members}")
            print(f"   Risk Score: {ring.risk_score:.2f}")
            print(f"   Total Amount: ${ring.total_amount:,.2f}")
            print(f"   Transactions: {ring.transaction_count}")
            print(f"   Pattern: {ring.pattern}")
        
        # Statistics
        ring_sizes = {}
        for ring in suspicious_rings:
            size = len(ring.members)
            ring_sizes[size] = ring_sizes.get(size, 0) + 1
        
        print(f"\n📈 Ring Statistics:")
        for size, count in sorted(ring_sizes.items()):
            print(f"  • {size}-member rings: {count}")
        
        high_risk_count = len([r for r in suspicious_rings if (r.risk_score or 0) > 5.0])
        print(f"  • High-risk rings (>5.0): {high_risk_count}")
        
        total_suspicious_amount = sum(r.total_amount or 0 for r in suspicious_rings)
        print(f"  • Total amount in rings: ${total_suspicious_amount:,.2f}")
        
    else:
        print("ℹ️ No suspicious rings detected in the sample data")
    
    # Test JSON serialization
    print(f"\n🧪 Testing JSON serialization...")
    try:
        ring_data = [ring.dict() for ring in suspicious_rings]
        json_str = json.dumps(ring_data, indent=2, default=str)
        print(f"✅ JSON serialization successful ({len(json_str):,} characters)")
    except Exception as e:
        print(f"❌ JSON serialization failed: {e}")
    
    return suspicious_rings


def create_test_ring_data():
    """Create a small test dataset with a known ring pattern."""
    print("\n🧪 Creating Test Ring Data")
    
    # Create a simple 3-member ring: A -> B -> C -> A
    test_transactions = [
        Transaction(
            transaction_id="TEST001",
            sender_id="ACC_A",
            receiver_id="ACC_B",
            amount=10000.0,
            timestamp=date_parser.parse("2023-01-01T10:00:00")
        ),
        Transaction(
            transaction_id="TEST002",
            sender_id="ACC_B",
            receiver_id="ACC_C",
            amount=9500.0,
            timestamp=date_parser.parse("2023-01-01T11:00:00")
        ),
        Transaction(
            transaction_id="TEST003",
            sender_id="ACC_C",
            receiver_id="ACC_A",
            amount=9000.0,
            timestamp=date_parser.parse("2023-01-01T12:00:00")
        ),
        # Add a 4-member ring: D -> E -> F -> G -> D
        Transaction(
            transaction_id="TEST004",
            sender_id="ACC_D",
            receiver_id="ACC_E",
            amount=5000.0,
            timestamp=date_parser.parse("2023-01-02T10:00:00")
        ),
        Transaction(
            transaction_id="TEST005",
            sender_id="ACC_E",
            receiver_id="ACC_F",
            amount=4800.0,
            timestamp=date_parser.parse("2023-01-02T11:00:00")
        ),
        Transaction(
            transaction_id="TEST006",
            sender_id="ACC_F",
            receiver_id="ACC_G",
            amount=4600.0,
            timestamp=date_parser.parse("2023-01-02T12:00:00")
        ),
        Transaction(
            transaction_id="TEST007",
            sender_id="ACC_G",
            receiver_id="ACC_D",
            amount=4400.0,
            timestamp=date_parser.parse("2023-01-02T13:00:00")
        )
    ]
    
    # Build graph and detect rings
    G = build_transaction_graph(test_transactions)
    rings = cycle_detector(G)
    
    print(f"📊 Test graph: {G.number_of_nodes()} nodes, {G.number_of_edges()} edges")
    print(f"🔍 Detected rings: {len(rings)}")
    
    for ring in rings:
        print(f"\n  {ring.ring_id}: {ring.members}")
        print(f"    Risk Score: {ring.risk_score:.2f}")
        print(f"    Amount: ${ring.total_amount:,.2f}")
    
    return rings


if __name__ == "__main__":
    # Test with sample data
    rings = test_ring_detection()
    
    # Test with known ring pattern
    test_rings = create_test_ring_data()
    
    print(f"\n✅ Ring detection testing complete!")