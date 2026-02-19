#!/usr/bin/env python3
"""
Test script to demonstrate NetworkX graph building functionality.
"""

import pandas as pd
import networkx as nx
from dateutil import parser as date_parser
from main import Transaction, build_transaction_graph, create_transaction_maps


def load_sample_transactions(csv_file: str = "transactions.csv", limit: int = 10):
    """Load and validate sample transactions from CSV."""
    df = pd.read_csv(csv_file)
    
    transactions = []
    for _, row in df.head(limit).iterrows():
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
    
    return transactions


def demonstrate_graph_analysis():
    """Demonstrate the graph building and analysis functionality."""
    print("🔍 Building NetworkX Graph from Transaction Data\n")
    
    # Load sample transactions
    transactions = load_sample_transactions(limit=20)
    print(f"✅ Loaded {len(transactions)} transactions")
    
    # Build graph
    G = build_transaction_graph(transactions)
    print(f"📊 Created graph with {G.number_of_nodes()} nodes and {G.number_of_edges()} edges")
    
    # Create transaction maps
    outgoing_map, incoming_map = create_transaction_maps(G)
    
    print(f"\n📤 Outgoing transactions map (accounts that send money):")
    for account, txns in list(outgoing_map.items())[:3]:
        print(f"  {account}: {len(txns)} outgoing transactions")
        print(f"    └─ Total sent: ${sum(tx['amount'] for tx in txns):,.2f}")
    
    print(f"\n📥 Incoming transactions map (accounts that receive money):")
    for account, txns in list(incoming_map.items())[:3]:
        print(f"  {account}: {len(txns)} incoming transactions")
        print(f"    └─ Total received: ${sum(tx['amount'] for tx in txns):,.2f}")
    
    # Display some graph statistics
    print(f"\n📈 Graph Statistics:")
    print(f"  • Unique accounts: {G.number_of_nodes()}")
    print(f"  • Total transactions: {G.number_of_edges()}")
    print(f"  • Graph density: {nx.density(G):.4f}")
    print(f"  • Is weakly connected: {nx.is_weakly_connected(G)}")
    
    # Show example of sorted transactions by timestamp
    if outgoing_map:
        sample_account = list(outgoing_map.keys())[0]
        print(f"\n🕒 Sample sorted transactions for {sample_account}:")
        for tx in outgoing_map[sample_account][:3]:
            print(f"  └─ {tx['timestamp']}: ${tx['amount']:,.2f} → {tx['receiver_id']}")


if __name__ == "__main__":
    demonstrate_graph_analysis()