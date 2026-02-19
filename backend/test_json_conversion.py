#!/usr/bin/env python3
"""
Test the graph_to_json function with sample data.
"""

import pandas as pd
import json
from dateutil import parser as date_parser
from main import Transaction, build_transaction_graph, graph_to_json


def test_graph_to_json():
    """Test the graph_to_json function with sample transactions."""
    print("🔬 Testing graph_to_json function\n")
    
    # Load sample transactions
    df = pd.read_csv("transactions.csv")
    
    transactions = []
    for _, row in df.head(10).iterrows():
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
    
    # Convert to JSON format for Cytoscape.js
    graph_json = graph_to_json(G)
    
    print(f"\n📋 Graph JSON structure:")
    print(f"  • Nodes: {len(graph_json['nodes'])}")
    print(f"  • Edges: {len(graph_json['edges'])}")
    
    print(f"\n🎯 Sample nodes (first 3):")
    for node in graph_json['nodes'][:3]:
        print(f"  {node}")
    
    print(f"\n💰 Sample edges (first 3):")
    for edge in graph_json['edges'][:3]:
        print(f"  ID: {edge['id']}")
        print(f"    {edge['source']} → {edge['target']}")
        print(f"    Amount: ${edge['amount']:,.2f}")
        print(f"    Time: {edge['timestamp']}")
        print()
    
    # Validate JSON serialization
    try:
        json_str = json.dumps(graph_json, indent=2)
        print("✅ JSON serialization successful!")
        
        # Show JSON size
        print(f"📏 JSON size: {len(json_str):,} characters")
        
    except Exception as e:
        print(f"❌ JSON serialization failed: {e}")
        return False
    
    return True


if __name__ == "__main__":
    test_graph_to_json()