from datetime import datetime
from typing import List, Optional, Dict, Any
import io
import os
import time
import pandas as pd
import networkx as nx
from dateutil import parser as date_parser
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field, validator

from services.json_formatter import build_final_json
from ml.predictor import (
    is_available as ml_is_available,
    predict_fraud_probabilities,
    compute_final_scores,
)

app = FastAPI(title="Rift Money Muling API", version="0.1.0")

# Add CORS middleware for frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class Transaction(BaseModel):
    """Transaction model with validation and normalization."""
    transaction_id: str = Field(..., description="Unique transaction identifier")
    sender_id: str = Field(..., description="Sender identifier")
    receiver_id: str = Field(..., description="Receiver identifier")
    amount: float = Field(..., gt=0, description="Transaction amount (must be positive)")
    timestamp: datetime = Field(..., description="Transaction timestamp")

    @validator('amount', pre=True)
    def validate_amount(cls, v):
        """Convert amount to float and validate it's positive."""
        try:
            amount = float(v)
            if amount <= 0:
                raise ValueError("Amount must be positive")
            return amount
        except (ValueError, TypeError) as e:
            raise ValueError(f"Invalid amount format: {v}")

    @validator('timestamp', pre=True)
    def validate_timestamp(cls, v):
        """Parse various timestamp formats into datetime."""
        if isinstance(v, datetime):
            return v
        if isinstance(v, str):
            try:
                return date_parser.parse(v)
            except (ValueError, TypeError) as e:
                raise ValueError(f"Invalid timestamp format: {v}")
        raise ValueError(f"Invalid timestamp type: {type(v)}")


class CSVValidationResponse(BaseModel):
    """Response model for CSV validation."""
    success: bool
    message: str
    total_rows: int
    valid_transactions: List[Transaction] = []
    errors: List[dict] = []


class CSVValidationError(BaseModel):
    """Error model for CSV validation issues."""
    row: int
    field: str
    value: str
    error: str


class GraphAnalysisResponse(BaseModel):
    """Response model for graph analysis."""
    success: bool
    message: str
    nodes_count: int
    edges_count: int
    graph_stats: Dict[str, Any]
    outgoing_map: Dict[str, List[Dict]]
    incoming_map: Dict[str, List[Dict]]


class SuspiciousRing(BaseModel):
    """Model for suspicious ring detection."""
    ring_id: str
    members: List[str]
    pattern: str
    risk_score: Optional[float] = None
    total_amount: Optional[float] = None
    transaction_count: Optional[int] = None


class RingDetectionResponse(BaseModel):
    """Response model for ring detection analysis."""
    success: bool
    message: str
    total_rings: int
    suspicious_rings: List[SuspiciousRing]
    graph_stats: Dict[str, Any]


@app.get("/")
def read_root() -> dict[str, str]:
    return {"message": "Rift Money Muling backend is running"}


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/upload-csv", response_model=CSVValidationResponse)
async def upload_csv(file: UploadFile = File(...)) -> CSVValidationResponse:
    """
    Upload and validate CSV file containing transaction data.
    
    Required columns: transaction_id, sender_id, receiver_id, amount, timestamp
    """
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="File must be a CSV")
    
    try:
        # Read CSV content
        content = await file.read()
        csv_data = pd.read_csv(io.StringIO(content.decode('utf-8')))
        
        # Validate required columns
        required_columns = {'transaction_id', 'sender_id', 'receiver_id', 'amount', 'timestamp'}
        missing_columns = required_columns - set(csv_data.columns)
        
        if missing_columns:
            raise HTTPException(
                status_code=400, 
                detail=f"Missing required columns: {', '.join(missing_columns)}"
            )
        
        # Process each row
        valid_transactions = []
        errors = []
        
        for idx, row in csv_data.iterrows():
            try:
                # Create transaction with validation
                transaction_data = {
                    'transaction_id': str(row['transaction_id']).strip(),
                    'sender_id': str(row['sender_id']).strip(),
                    'receiver_id': str(row['receiver_id']).strip(),
                    'amount': row['amount'],
                    'timestamp': row['timestamp']
                }
                
                # Validate transaction
                transaction = Transaction(**transaction_data)
                valid_transactions.append(transaction)
                
            except Exception as e:
                errors.append({
                    'row': idx + 1,  # 1-based row numbering
                    'error': str(e),
                    'data': row.to_dict()
                })
        
        # Prepare response
        success = len(errors) == 0
        message = f"Successfully processed {len(valid_transactions)} transactions"
        if errors:
            message += f" with {len(errors)} errors"
        
        return CSVValidationResponse(
            success=success,
            message=message,
            total_rows=len(csv_data),
            valid_transactions=valid_transactions,
            errors=errors
        )
        
    except pd.errors.EmptyDataError:
        raise HTTPException(status_code=400, detail="CSV file is empty")
    except pd.errors.ParserError as e:
        raise HTTPException(status_code=400, detail=f"CSV parsing error: {str(e)}")
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="File encoding not supported. Please use UTF-8")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


def build_transaction_graph(transactions: List[Transaction]) -> nx.MultiDiGraph:
    """
    Build a NetworkX MultiDiGraph from transaction data.
    
    Args:
        transactions: List of validated Transaction objects
        
    Returns:
        NetworkX MultiDiGraph with transactions as edges
    """
    G = nx.MultiDiGraph()
    
    for transaction in transactions:
        # Add edge from sender to receiver with transaction data
        G.add_edge(
            transaction.sender_id,
            transaction.receiver_id,
            transaction_id=transaction.transaction_id,
            amount=transaction.amount,
            timestamp=transaction.timestamp,
            tx_id=transaction.transaction_id  # Alternative name as shown in user's structure
        )
    
    return G


def graph_to_json(G: nx.MultiDiGraph) -> Dict[str, Any]:
    """
    Convert NetworkX graph to JSON format for Cytoscape.js visualization.
    
    Args:
        G: NetworkX MultiDiGraph
        
    Returns:
        Dictionary with nodes and edges in Cytoscape.js format
    """
    nodes = [{"id": node} for node in G.nodes()]
    
    edges = []
    for u, v, key, data in G.edges(keys=True, data=True):
        edges.append({
            "id": data["tx_id"],
            "source": u,
            "target": v,
            "amount": data["amount"],
            "timestamp": data["timestamp"].isoformat() if hasattr(data["timestamp"], 'isoformat') else str(data["timestamp"])
        })
    
    return {"nodes": nodes, "edges": edges}


def convert_to_simple_graph(G: nx.MultiDiGraph) -> nx.DiGraph:
    """
    Convert MultiDiGraph to simple DiGraph for cycle detection.
    
    Args:
        G: NetworkX MultiDiGraph
        
    Returns:
        NetworkX DiGraph
    """
    simple_G = nx.DiGraph()

    for u, v in G.edges():
        simple_G.add_edge(u, v)

    return simple_G


def detect_cycles(G: nx.MultiDiGraph) -> List[List[str]]:
    """
    Detect all cycles in the graph.
    
    Args:
        G: NetworkX MultiDiGraph
        
    Returns:
        List of cycles (each cycle is a list of node IDs)
    """
    simple_G = convert_to_simple_graph(G)
    all_cycles = list(nx.simple_cycles(simple_G))
    return all_cycles


def filter_valid_cycles(cycles: List[List[str]]) -> List[List[str]]:
    """
    Filter cycles to only include those with 3-5 members.
    
    Args:
        cycles: List of all detected cycles
        
    Returns:
        List of valid cycles (3-5 members)
    """
    return [c for c in cycles if 3 <= len(c) <= 5]


def calculate_ring_metrics(cycle: List[str], G: nx.MultiDiGraph) -> Dict[str, float]:
    """
    Calculate metrics for a suspicious ring.
    
    Args:
        cycle: List of account IDs in the ring
        G: NetworkX MultiDiGraph
        
    Returns:
        Dictionary with ring metrics
    """
    total_amount = 0
    transaction_count = 0
    
    # Calculate total amount and transaction count within the ring
    for i in range(len(cycle)):
        current = cycle[i]
        next_node = cycle[(i + 1) % len(cycle)]
        
        # Check if there's an edge from current to next_node
        if G.has_edge(current, next_node):
            for key, data in G[current][next_node].items():
                total_amount += data.get('amount', 0)
                transaction_count += 1
    
    # Calculate risk score based on amount and frequency
    risk_score = (total_amount / 100000) + (transaction_count * 0.1)  # Simple heuristic
    risk_score = min(risk_score, 10.0)  # Cap at 10
    
    return {
        'total_amount': total_amount,
        'transaction_count': transaction_count,
        'risk_score': risk_score
    }


def build_cycle_rings(valid_cycles: List[List[str]], G: nx.MultiDiGraph) -> List[SuspiciousRing]:
    """
    Build suspicious ring objects from valid cycles.
    
    Args:
        valid_cycles: List of valid cycles (3-5 members)
        G: NetworkX MultiDiGraph
        
    Returns:
        List of SuspiciousRing objects
    """
    rings = []

    for i, cycle in enumerate(valid_cycles, start=1):
        metrics = calculate_ring_metrics(cycle, G)
        
        rings.append(SuspiciousRing(
            ring_id=f"RING_{i:03}",
            members=sorted(cycle),
            pattern="cycle",
            risk_score=metrics['risk_score'],
            total_amount=metrics['total_amount'],
            transaction_count=metrics['transaction_count']
        ))

    return rings


def cycle_detector(G: nx.MultiDiGraph) -> List[SuspiciousRing]:
    """
    Main function to detect suspicious cycles/rings in the transaction graph.
    
    Args:
        G: NetworkX MultiDiGraph
        
    Returns:
        List of SuspiciousRing objects
    """
    cycles = detect_cycles(G)
    valid_cycles = filter_valid_cycles(cycles)
    return build_cycle_rings(valid_cycles, G)


def create_transaction_maps(G: nx.MultiDiGraph) -> tuple[Dict[str, List[Dict]], Dict[str, List[Dict]]]:
    """
    Create outgoing and incoming transaction maps from the graph.
    
    Args:
        G: NetworkX MultiDiGraph
        
    Returns:
        Tuple of (outgoing_map, incoming_map) sorted by timestamp
    """
    outgoing_map = {}
    incoming_map = {}
    
    # Build outgoing map (transactions sent by each account)
    for u, v, data in G.edges(data=True):
        # Convert datetime to string for JSON serialization
        transaction_data = data.copy()
        transaction_data['timestamp'] = data['timestamp'].isoformat()
        transaction_data['receiver_id'] = v  # Include receiver in outgoing data
        outgoing_map.setdefault(u, []).append(transaction_data)
    
    # Build incoming map (transactions received by each account)
    for u, v, data in G.edges(data=True):
        # Convert datetime to string for JSON serialization
        transaction_data = data.copy()
        transaction_data['timestamp'] = data['timestamp'].isoformat()
        transaction_data['sender_id'] = u  # Include sender in incoming data
        incoming_map.setdefault(v, []).append(transaction_data)
    
    # Sort by timestamp
    for acc in outgoing_map:
        outgoing_map[acc].sort(key=lambda x: x["timestamp"])
    
    for acc in incoming_map:
        incoming_map[acc].sort(key=lambda x: x["timestamp"])
    
    return outgoing_map, incoming_map


# ---------------------------------------------------------------------------
# Smurfing Detection (deterministic, rule-based)
# ---------------------------------------------------------------------------
from datetime import timedelta

_SMURFING_WINDOW = timedelta(hours=72)
_SMURFING_MIN_COUNTERPARTIES = 10
_MERCHANT_TX_THRESHOLD = 100


def is_merchant(
    account_id: str,
    incoming_map: Dict[str, List[Dict]],
    outgoing_map: Dict[str, List[Dict]],
) -> bool:
    """
    Return True if *account_id* has more than 100 total transactions
    (incoming + outgoing), marking it as a merchant to be excluded
    from smurfing detection.
    """
    incoming_count = len(incoming_map.get(account_id, []))
    outgoing_count = len(outgoing_map.get(account_id, []))
    return (incoming_count + outgoing_count) > _MERCHANT_TX_THRESHOLD


def _parse_ts(ts) -> datetime:
    """Parse a timestamp that may be a datetime or an ISO-format string."""
    if isinstance(ts, datetime):
        return ts
    return datetime.fromisoformat(ts)


def detect_fan_in(
    incoming_map: Dict[str, List[Dict]],
    outgoing_map: Dict[str, List[Dict]],
) -> List[Dict[str, Any]]:
    """
    Detect fan-in smurfing: 10+ unique senders sending to the SAME
    receiver within a sliding 72-hour window.

    Returns a list of ring dicts (without ring_id; those are assigned
    later by smurfing_detector).
    """
    rings: List[Dict[str, Any]] = []
    seen_accounts: set[str] = set()

    for receiver_id in sorted(incoming_map.keys()):  # sorted for determinism
        if receiver_id in seen_accounts:
            continue
        if is_merchant(receiver_id, incoming_map, outgoing_map):
            continue

        txns = incoming_map[receiver_id]
        if len(txns) < _SMURFING_MIN_COUNTERPARTIES:
            continue  # fast path – not enough txns at all

        # Parse timestamps once
        parsed: List[tuple[datetime, str]] = [
            (_parse_ts(tx["timestamp"]), tx["sender_id"]) for tx in txns
        ]

        # Sliding-window with a sender frequency counter
        sender_freq: Dict[str, int] = {}
        left = 0
        best_unique = 0
        best_left = 0
        best_right = 0

        for right in range(len(parsed)):
            sender = parsed[right][1]
            sender_freq[sender] = sender_freq.get(sender, 0) + 1

            # Shrink the window from the left while it exceeds 72 h
            while parsed[right][0] - parsed[left][0] > _SMURFING_WINDOW:
                old_sender = parsed[left][1]
                sender_freq[old_sender] -= 1
                if sender_freq[old_sender] == 0:
                    del sender_freq[old_sender]
                left += 1

            if len(sender_freq) > best_unique:
                best_unique = len(sender_freq)
                best_left = left
                best_right = right

        if best_unique >= _SMURFING_MIN_COUNTERPARTIES:
            senders_in_window = {
                parsed[i][1] for i in range(best_left, best_right + 1)
            }
            members = sorted(senders_in_window | {receiver_id})
            seen_accounts.add(receiver_id)
            rings.append({
                "members": members,
                "pattern": "smurfing_fan_in",
            })

    return rings


def detect_fan_out(
    outgoing_map: Dict[str, List[Dict]],
    incoming_map: Dict[str, List[Dict]],
) -> List[Dict[str, Any]]:
    """
    Detect fan-out smurfing: 1 sender sending to 10+ unique receivers
    within a sliding 72-hour window.

    Returns a list of ring dicts (without ring_id).
    """
    rings: List[Dict[str, Any]] = []
    seen_accounts: set[str] = set()

    for sender_id in sorted(outgoing_map.keys()):  # sorted for determinism
        if sender_id in seen_accounts:
            continue
        if is_merchant(sender_id, incoming_map, outgoing_map):
            continue

        txns = outgoing_map[sender_id]
        if len(txns) < _SMURFING_MIN_COUNTERPARTIES:
            continue

        parsed: List[tuple[datetime, str]] = [
            (_parse_ts(tx["timestamp"]), tx["receiver_id"]) for tx in txns
        ]

        receiver_freq: Dict[str, int] = {}
        left = 0
        best_unique = 0
        best_left = 0
        best_right = 0

        for right in range(len(parsed)):
            receiver = parsed[right][1]
            receiver_freq[receiver] = receiver_freq.get(receiver, 0) + 1

            while parsed[right][0] - parsed[left][0] > _SMURFING_WINDOW:
                old_recv = parsed[left][1]
                receiver_freq[old_recv] -= 1
                if receiver_freq[old_recv] == 0:
                    del receiver_freq[old_recv]
                left += 1

            if len(receiver_freq) > best_unique:
                best_unique = len(receiver_freq)
                best_left = left
                best_right = right

        if best_unique >= _SMURFING_MIN_COUNTERPARTIES:
            receivers_in_window = {
                parsed[i][1] for i in range(best_left, best_right + 1)
            }
            members = sorted(receivers_in_window | {sender_id})
            seen_accounts.add(sender_id)
            rings.append({
                "members": members,
                "pattern": "smurfing_fan_out",
            })

    return rings


def smurfing_detector(
    incoming_map: Dict[str, List[Dict]],
    outgoing_map: Dict[str, List[Dict]],
) -> List[SuspiciousRing]:
    """
    Top-level smurfing detector.  Combines fan-in and fan-out results
    and assigns deterministic ring IDs (RING_SM_001, RING_SM_002, …).
    """
    fan_in_rings = detect_fan_in(incoming_map, outgoing_map)
    fan_out_rings = detect_fan_out(outgoing_map, incoming_map)

    all_raw = fan_in_rings + fan_out_rings

    results: List[SuspiciousRing] = []
    for idx, raw in enumerate(all_raw, start=1):
        results.append(
            SuspiciousRing(
                ring_id=f"RING_SM_{idx:03}",
                members=raw["members"],
                pattern=raw["pattern"],
            )
        )

    return results


# ---------------------------------------------------------------------------
# Layered / Shell Network Detection (deterministic, rule-based)
# ---------------------------------------------------------------------------

_LAYERED_MIN_PATH_LEN = 3   # minimum edges in the chain
_LAYERED_MAX_PATH_LEN = 5   # maximum edges in the chain
_LAYERED_INTERMEDIATE_MIN_DEGREE = 2
_LAYERED_INTERMEDIATE_MAX_DEGREE = 3


def total_degree(
    account_id: str,
    incoming_map: Dict[str, List[Dict]],
    outgoing_map: Dict[str, List[Dict]],
) -> int:
    """
    Return the total transaction count (incoming + outgoing) for an account.
    """
    return len(incoming_map.get(account_id, [])) + len(outgoing_map.get(account_id, []))


def to_simple_digraph(G: nx.MultiDiGraph) -> nx.DiGraph:
    """
    Convert a MultiDiGraph to a simple DiGraph (one edge per (u, v) pair).
    The original graph is NOT modified.
    """
    simple = nx.DiGraph()
    for u, v in G.edges():
        simple.add_edge(u, v)
    return simple


def detect_layered_networks(
    G: nx.MultiDiGraph,
    incoming_map: Dict[str, List[Dict]],
    outgoing_map: Dict[str, List[Dict]],
) -> List[SuspiciousRing]:
    """
    Detect layered (shell) networks using bounded DFS on a simplified DiGraph.

    A layered network is a directed simple path of 3-5 edges where every
    *intermediate* node (excluding the start and end) satisfies:
      - total degree (incoming + outgoing tx count) is between 2 and 3 inclusive
      - is NOT a merchant (total tx count <= 100)

    Returns a deduplicated, deterministically ordered list of SuspiciousRing.
    """
    simple = to_simple_digraph(G)

    # Pre-compute degrees and merchant status for every node so we avoid
    # repeated dict lookups during the DFS.
    node_degree: Dict[str, int] = {}
    node_is_merchant: Dict[str, bool] = {}
    for node in simple.nodes():
        node_degree[node] = total_degree(node, incoming_map, outgoing_map)
        node_is_merchant[node] = is_merchant(node, incoming_map, outgoing_map)

    def _valid_intermediate(node: str) -> bool:
        """Check if a node qualifies as a valid intermediate in a layered path."""
        deg = node_degree[node]
        return (
            _LAYERED_INTERMEDIATE_MIN_DEGREE <= deg <= _LAYERED_INTERMEDIATE_MAX_DEGREE
            and not node_is_merchant[node]
        )

    # Collect all valid paths using bounded DFS.
    # A path with `k` edges has `k + 1` nodes.
    # Path lengths of interest: 3..5 edges → 4..6 nodes.
    seen_member_sets: set[frozenset[str]] = set()
    raw_rings: List[Dict[str, Any]] = []

    # Iterate over all potential start nodes in sorted order (determinism).
    for start in sorted(simple.nodes()):
        # Bounded DFS – stack entries: (current_node, path_so_far)
        stack: list[tuple[str, list[str]]] = [(start, [start])]

        while stack:
            current, path = stack.pop()
            edge_count = len(path) - 1  # number of edges traversed so far

            # If we already have a path in the valid edge-count range,
            # record it (but continue extending if we haven't hit max).
            if _LAYERED_MIN_PATH_LEN <= edge_count <= _LAYERED_MAX_PATH_LEN:
                # Validate all intermediate nodes (indices 1 .. len-2)
                intermediates_ok = all(
                    _valid_intermediate(path[i]) for i in range(1, len(path) - 1)
                )
                if intermediates_ok:
                    member_key = frozenset(path)
                    if member_key not in seen_member_sets:
                        seen_member_sets.add(member_key)
                        raw_rings.append({
                            "members": list(path),  # preserve traversal order
                            "pattern": "layered",
                        })

            # Stop extending if we've hit the maximum edge count.
            if edge_count >= _LAYERED_MAX_PATH_LEN:
                continue

            # Before extending, check that the NEXT node would be a valid
            # intermediate (unless it would become the end node of a valid-
            # length path, in which case it doesn't need the intermediate
            # check).  We still need to ensure the path stays simple.
            for neighbor in sorted(simple.successors(current)):
                if neighbor in path:  # simple path – no repeated nodes
                    continue

                next_edge_count = edge_count + 1

                # If this neighbor would be an intermediate (i.e., we could
                # extend further), it must pass the intermediate check.
                # If next_edge_count is already in valid range, the neighbor
                # is the *end* node and doesn't need the check – but we
                # still want to try extending further, so we allow it.
                is_end_candidate = next_edge_count >= _LAYERED_MIN_PATH_LEN
                is_extendable = next_edge_count < _LAYERED_MAX_PATH_LEN

                if is_extendable and not is_end_candidate:
                    # neighbor will definitely be intermediate – must qualify
                    if not _valid_intermediate(neighbor):
                        continue
                elif is_extendable and is_end_candidate:
                    # neighbor could be end OR intermediate; allow either way
                    pass
                # else: next_edge_count == MAX, neighbor is the final end node

                stack.append((neighbor, path + [neighbor]))

    # Sort raw rings deterministically by sorted member tuple for stable IDs.
    raw_rings.sort(key=lambda r: tuple(sorted(r["members"])))

    # Assign deterministic IDs.
    results: List[SuspiciousRing] = []
    for idx, ring in enumerate(raw_rings, start=1):
        results.append(
            SuspiciousRing(
                ring_id=f"RING_LY_{idx:03}",
                members=sorted(ring["members"]),
                pattern=ring["pattern"],
            )
        )

    return results


# ---------------------------------------------------------------------------
# Fraud Ring Aggregation
# ---------------------------------------------------------------------------

_RISK_BASE_SCORES: Dict[str, int] = {
    "cycle": 90,
    "smurfing_fan_in": 85,
    "smurfing_fan_out": 85,
    "layered": 80,
}


def combine_all_rings(
    cycle_rings: List[SuspiciousRing],
    smurfing_rings: List[SuspiciousRing],
    layered_rings: List[SuspiciousRing],
) -> List[SuspiciousRing]:
    """
    Merge all detector outputs into a single list without mutation.
    Each ring is treated independently — no merging of overlapping members.
    """
    return list(cycle_rings) + list(smurfing_rings) + list(layered_rings)


def calculate_aggregated_risk_score(pattern: str, member_count: int) -> float:
    """
    Compute a risk score in the range 0.0–1.0 using the fixed formula:
        raw = base_score + min(10, number_of_members)   (0-100)
        risk_score = raw / 100                           (0.0-1.0)
    """
    base = _RISK_BASE_SCORES.get(pattern, 80)
    raw = min(100, base + min(10, member_count))
    return round(raw / 100.0, 4)


def assign_risk_scores(rings: List[SuspiciousRing]) -> List[SuspiciousRing]:
    """
    Return a new list with risk_score populated using the aggregation formula.
    Original objects are not mutated.
    """
    scored: List[SuspiciousRing] = []
    for ring in rings:
        scored.append(
            SuspiciousRing(
                ring_id=ring.ring_id,
                members=ring.members,
                pattern=ring.pattern,
                risk_score=calculate_aggregated_risk_score(ring.pattern, len(ring.members)),
                total_amount=ring.total_amount,
                transaction_count=ring.transaction_count,
            )
        )
    return scored


def sort_rings_by_risk(rings: List[SuspiciousRing]) -> List[SuspiciousRing]:
    """
    Sort rings in descending order of risk_score.
    Uses a stable sort so rings with equal scores retain their original order.
    """
    return sorted(rings, key=lambda r: r.risk_score or 0, reverse=True)


def assign_ring_ids(rings: List[SuspiciousRing]) -> List[SuspiciousRing]:
    """
    Overwrite ring IDs with deterministic sequential IDs: RING_001, RING_002, …
    """
    result: List[SuspiciousRing] = []
    for idx, ring in enumerate(rings, start=1):
        result.append(
            SuspiciousRing(
                ring_id=f"RING_{idx:03}",
                members=ring.members,
                pattern=ring.pattern,
                risk_score=ring.risk_score,
                total_amount=ring.total_amount,
                transaction_count=ring.transaction_count,
            )
        )
    return result


def aggregate_fraud_rings(
    cycle_rings: List[SuspiciousRing],
    smurfing_rings: List[SuspiciousRing],
    layered_rings: List[SuspiciousRing],
) -> List[SuspiciousRing]:
    """
    Main aggregation function.

    1. Combine rings from all detectors
    2. Compute risk scores using the fixed formula
    3. Sort by risk score descending (stable)
    4. Assign deterministic sequential ring IDs

    Returns a final, deterministic list of SuspiciousRing objects.
    """
    combined = combine_all_rings(cycle_rings, smurfing_rings, layered_rings)
    scored = assign_risk_scores(combined)
    ordered = sort_rings_by_risk(scored)
    final = assign_ring_ids(ordered)
    return final


# ---------------------------------------------------------------------------
# Suspicious Account Scoring (deterministic, rule-based)
# ---------------------------------------------------------------------------

_PATTERN_SCORES: Dict[str, int] = {
    "cycle": 40,
    "smurfing_fan_in": 30,
    "smurfing_fan_out": 30,
    "layered": 25,
}

_VELOCITY_BONUS_HIGH = 20   # > 10 tx/hour
_VELOCITY_BONUS_LOW = 10    # > 5  tx/hour
_MERCHANT_PENALTY = -50
_SCORING_MERCHANT_TX_THRESHOLD = 200


class SuspiciousAccount(BaseModel):
    """Model for a scored suspicious account."""
    account_id: str
    suspicion_score: int
    involved_rings: List[str]
    is_merchant: bool = False


class SuspicionScoreResponse(BaseModel):
    """Response model for the suspicion scoring endpoint."""
    success: bool
    message: str
    total_accounts: int
    suspicious_accounts: List[SuspiciousAccount]
    merchant_accounts: Dict[str, bool] = {}  # all account_id → is_merchant


def build_account_ring_map(
    fraud_rings: List[SuspiciousRing],
) -> Dict[str, List[str]]:
    """
    Build a mapping from account ID → list of ring IDs the account belongs to.

    Args:
        fraud_rings: Aggregated fraud rings (each has ring_id, members, pattern).

    Returns:
        Dict mapping each account to its list of ring IDs (sorted for determinism).
    """
    account_to_rings: Dict[str, List[str]] = {}
    for ring in fraud_rings:
        for member in ring.members:
            account_to_rings.setdefault(member, []).append(ring.ring_id)
    # Sort ring lists for determinism
    for acc in account_to_rings:
        account_to_rings[acc] = sorted(account_to_rings[acc])
    return account_to_rings


def apply_ring_scores(
    fraud_rings: List[SuspiciousRing],
) -> Dict[str, int]:
    """
    Compute the base score for every account from the rings it belongs to.
    Scores from ALL rings are summed.

    Args:
        fraud_rings: Aggregated fraud rings.

    Returns:
        Dict mapping account_id → cumulative pattern-based score.
    """
    scores: Dict[str, int] = {}
    for ring in fraud_rings:
        pattern_score = _PATTERN_SCORES.get(ring.pattern, 0)
        for member in ring.members:
            scores[member] = scores.get(member, 0) + pattern_score
    return scores


def compute_transaction_metrics(
    G: nx.MultiDiGraph,
) -> Dict[str, Dict[str, Any]]:
    """
    For every node in the graph, compute:
      - total_transactions: number of edges (in + out)
      - max_tx_per_hour: maximum transactions within any 1-hour sliding window
      - is_merchant: True if total_transactions > 200 OR degree is very high
                     compared to the graph average

    Args:
        G: Transaction MultiDiGraph.

    Returns:
        Dict mapping account_id → metrics dict.
    """
    metrics: Dict[str, Dict[str, Any]] = {}

    # Gather timestamps per node (both sent and received count)
    node_timestamps: Dict[str, List[datetime]] = {}
    node_tx_count: Dict[str, int] = {}

    for node in G.nodes():
        node_tx_count[node] = 0
        node_timestamps[node] = []

    for u, v, data in G.edges(data=True):
        ts = data.get("timestamp")
        # sender activity
        node_tx_count[u] = node_tx_count.get(u, 0) + 1
        if ts is not None:
            node_timestamps.setdefault(u, []).append(ts)
        # receiver activity
        node_tx_count[v] = node_tx_count.get(v, 0) + 1
        if ts is not None:
            node_timestamps.setdefault(v, []).append(ts)

    # Average degree for merchant heuristic
    total_nodes = G.number_of_nodes()
    avg_tx = (sum(node_tx_count.values()) / total_nodes) if total_nodes > 0 else 0.0
    high_degree_threshold = avg_tx * 3  # 3× the average is "very high"

    one_hour = timedelta(hours=1)

    for node in sorted(G.nodes()):  # sorted for determinism
        total_tx = node_tx_count.get(node, 0)
        timestamps = sorted(node_timestamps.get(node, []))

        # Sliding-window for max tx/hour
        max_tx_per_hour = 0
        if timestamps:
            left = 0
            for right in range(len(timestamps)):
                while timestamps[right] - timestamps[left] > one_hour:
                    left += 1
                window_size = right - left + 1
                if window_size > max_tx_per_hour:
                    max_tx_per_hour = window_size

        is_merchant_node = (
            total_tx > _SCORING_MERCHANT_TX_THRESHOLD
            or total_tx > high_degree_threshold
        )

        metrics[node] = {
            "total_transactions": total_tx,
            "max_tx_per_hour": max_tx_per_hour,
            "is_merchant": is_merchant_node,
        }

    return metrics


def apply_velocity_bonus(
    scores: Dict[str, int],
    metrics: Dict[str, Dict[str, Any]],
) -> Dict[str, int]:
    """
    Add a velocity bonus to accounts with high transaction frequency.

    Rules (highest applicable only):
      > 10 tx/hour  → +20
      > 5  tx/hour  → +10

    Args:
        scores: Current account scores (mutated in-place copy is fine).
        metrics: Per-node transaction metrics.

    Returns:
        Updated scores dict.
    """
    updated = dict(scores)
    for account, m in metrics.items():
        rate = m["max_tx_per_hour"]
        bonus = 0
        if rate > 10:
            bonus = _VELOCITY_BONUS_HIGH
        elif rate > 5:
            bonus = _VELOCITY_BONUS_LOW
        if bonus and account in updated:
            updated[account] += bonus
    return updated


def apply_merchant_penalty(
    scores: Dict[str, int],
    metrics: Dict[str, Dict[str, Any]],
) -> Dict[str, int]:
    """
    Subtract merchant penalty from merchant-like accounts.

    Args:
        scores: Current account scores.
        metrics: Per-node transaction metrics.

    Returns:
        Updated scores dict.
    """
    updated = dict(scores)
    for account in updated:
        if metrics.get(account, {}).get("is_merchant", False):
            updated[account] += _MERCHANT_PENALTY  # negative value
    return updated


def build_final_account_list(
    scores: Dict[str, int],
    account_to_rings: Dict[str, List[str]],
    metrics: Optional[Dict[str, Dict[str, Any]]] = None,
) -> List[SuspiciousAccount]:
    """
    Build the final sorted list of suspicious accounts.

    * Scores are clamped to [0, 100] and cast to int.
    * Sorted by suspicion_score DESC, then account_id ASC (tie-break).
    * Only accounts that appear in at least one ring are included.

    Args:
        scores: Final computed scores.
        account_to_rings: Mapping of account → ring IDs.
        metrics: Per-node transaction metrics (for merchant flag).

    Returns:
        Sorted list of SuspiciousAccount objects.
    """
    result: List[SuspiciousAccount] = []
    for account_id in account_to_rings:
        raw_score = scores.get(account_id, 0)
        clamped = max(0, min(100, raw_score))
        is_merchant = (
            metrics.get(account_id, {}).get("is_merchant", False)
            if metrics else False
        )
        result.append(
            SuspiciousAccount(
                account_id=account_id,
                suspicion_score=int(clamped),
                involved_rings=sorted(account_to_rings[account_id]),
                is_merchant=is_merchant,
            )
        )
    # Primary: score DESC, secondary: account_id ASC (determinism)
    result.sort(key=lambda a: (-a.suspicion_score, a.account_id))
    return result


def _extract_pipeline_features(
    G: nx.MultiDiGraph,
    fraud_rings: List[SuspiciousRing],
) -> List[Dict[str, Any]]:
    """
    Extract per-account features from the pipeline graph and fraud rings,
    formatted for the ML predictor.

    Returns a list of feature dicts (one per account) with keys matching
    the training schema.
    """
    metrics = compute_transaction_metrics(G)

    # Derive pattern-level flags from fraud rings
    smurfing_accounts: set[str] = set()
    cycle_accounts: Dict[str, int] = {}      # account → cycle count
    layering_accounts: Dict[str, int] = {}    # account → depth estimate
    ring_members: Dict[str, int] = {}         # account → largest ring size

    for ring in fraud_rings:
        members = ring.members
        size = len(members)
        for m in members:
            ring_members[m] = max(ring_members.get(m, 0), size)

        if ring.pattern == "cycle":
            for m in members:
                cycle_accounts[m] = cycle_accounts.get(m, 0) + 1
        elif ring.pattern in ("smurfing_fan_in", "smurfing_fan_out"):
            for m in members:
                smurfing_accounts.add(m)
        elif ring.pattern == "layered":
            depth = len(members) - 1
            for m in members:
                layering_accounts[m] = max(layering_accounts.get(m, 0), depth)

    # Compute total_amount_sent and avg per node
    sent_stats: Dict[str, Dict[str, float]] = {}
    for u, v, data in G.edges(data=True):
        s = sent_stats.setdefault(u, {"total": 0.0, "count": 0})
        s["total"] += data.get("amount", 0.0)
        s["count"] += 1

    # Unique receivers / senders per node
    unique_receivers: Dict[str, set] = {}
    unique_senders: Dict[str, set] = {}
    for u, v, _data in G.edges(data=True):
        unique_receivers.setdefault(u, set()).add(v)
        unique_senders.setdefault(v, set()).add(u)

    features: List[Dict[str, Any]] = []
    for node in sorted(G.nodes()):
        m = metrics.get(node, {})
        s = sent_stats.get(node, {"total": 0.0, "count": 0})
        total_sent = s["total"]
        sent_count = s["count"]
        avg_amount = (total_sent / sent_count) if sent_count > 0 else 0.0

        features.append({
            "account_id": node,
            "total_transactions": m.get("total_transactions", 0),
            "total_amount_sent": round(total_sent, 2),
            "avg_transaction_amount": round(avg_amount, 2),
            "unique_receivers": len(unique_receivers.get(node, set())),
            "unique_senders": len(unique_senders.get(node, set())),
            "max_transactions_per_hour": m.get("max_tx_per_hour", 0),
            "smurfing_flag": 1 if node in smurfing_accounts else 0,
            "layering_depth": layering_accounts.get(node, 0),
            "cycle_count": cycle_accounts.get(node, 0),
            "ring_size": ring_members.get(node, 0),
            "merchant_flag": 1 if m.get("is_merchant", False) else 0,
        })
    return features


def compute_suspicion_scores(
    G: nx.MultiDiGraph,
    fraud_rings: List[SuspiciousRing],
) -> tuple[List[SuspiciousAccount], Dict[str, bool]]:
    """
    Main entry point for the suspicion scoring engine.

    Pipeline:
      1. Build account → ring membership map
      2. Compute base scores from ring patterns
      3. Compute per-node transaction metrics
      4. Apply velocity bonus
      5. Apply merchant penalty
      6. Clamp scores and build final sorted list

    Args:
        G: Transaction MultiDiGraph.
        fraud_rings: Aggregated fraud rings from all detectors.

    Returns:
        Tuple of (sorted SuspiciousAccount list, merchant_accounts map for all nodes).
    """
    # Step 1 – ring membership
    account_to_rings = build_account_ring_map(fraud_rings)

    # Step 2 – base pattern scores
    scores = apply_ring_scores(fraud_rings)

    # Step 3 – transaction metrics (velocity, merchant detection)
    metrics = compute_transaction_metrics(G)

    # Step 4 – velocity bonus
    scores = apply_velocity_bonus(scores, metrics)

    # Step 5 – merchant penalty
    scores = apply_merchant_penalty(scores, metrics)

    # Build merchant map for ALL nodes
    merchant_map: Dict[str, bool] = {
        node: metrics.get(node, {}).get("is_merchant", False)
        for node in sorted(G.nodes())
    }

    # Step 6 – build & sort output
    return build_final_account_list(scores, account_to_rings, metrics), merchant_map


@app.post("/build-graph", response_model=GraphAnalysisResponse)
async def build_graph(file: UploadFile = File(...)) -> GraphAnalysisResponse:
    """
    Build a transaction graph from uploaded CSV file and return analysis.
    
    This endpoint uploads a CSV file, validates the transactions, builds a NetworkX 
    MultiDiGraph, and returns graph statistics along with outgoing/incoming maps.
    """
    # First validate the CSV using existing upload functionality
    csv_response = await upload_csv(file)
    
    if not csv_response.success:
        raise HTTPException(
            status_code=400, 
            detail=f"CSV validation failed: {csv_response.message}"
        )
    
    try:
        # Build the graph
        G = build_transaction_graph(csv_response.valid_transactions)
        
        # Create transaction maps
        outgoing_map, incoming_map = create_transaction_maps(G)
        
        # Calculate graph statistics
        graph_stats = {
            "nodes": list(G.nodes()),
            "unique_senders": len(outgoing_map),
            "unique_receivers": len(incoming_map),
            "total_amount": sum(data['amount'] for _, _, data in G.edges(data=True)),
            "average_amount": sum(data['amount'] for _, _, data in G.edges(data=True)) / G.number_of_edges() if G.number_of_edges() > 0 else 0,
            "density": nx.density(G),
            "is_connected": nx.is_weakly_connected(G) if G.number_of_nodes() > 0 else False,
        }
        
        return GraphAnalysisResponse(
            success=True,
            message=f"Successfully built graph with {G.number_of_nodes()} nodes and {G.number_of_edges()} edges",
            nodes_count=G.number_of_nodes(),
            edges_count=G.number_of_edges(),
            graph_stats=graph_stats,
            outgoing_map=outgoing_map,
            incoming_map=incoming_map
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Graph building error: {str(e)}")

@app.post("/detect-rings", response_model=RingDetectionResponse)
async def detect_suspicious_rings(file: UploadFile = File(...)) -> RingDetectionResponse:
    """
    Detect suspicious rings (cycles of 3-5 members) from uploaded CSV file.
    
    This endpoint analyzes the transaction network to identify potential money muling rings.
    """
    # First validate the CSV using existing upload functionality
    csv_response = await upload_csv(file)
    
    if not csv_response.success:
        raise HTTPException(
            status_code=400, 
            detail=f"CSV validation failed: {csv_response.message}"
        )
    
    try:
        # Build the graph
        G = build_transaction_graph(csv_response.valid_transactions)
        
        # Detect rings from all three detectors
        outgoing_map, incoming_map = create_transaction_maps(G)
        cycle_rings = cycle_detector(G)
        smurfing_rings = smurfing_detector(incoming_map, outgoing_map)
        layered_rings = detect_layered_networks(G, incoming_map, outgoing_map)
        
        # Aggregate: score, sort, and assign final IDs
        suspicious_rings = aggregate_fraud_rings(cycle_rings, smurfing_rings, layered_rings)
        
        # Calculate graph statistics
        graph_stats = {
            "total_nodes": G.number_of_nodes(),
            "total_edges": G.number_of_edges(),
            "total_amount": sum(data['amount'] for _, _, data in G.edges(data=True)),
            "rings_by_size": {
                "3_member_rings": len([r for r in suspicious_rings if len(r.members) == 3]),
                "4_member_rings": len([r for r in suspicious_rings if len(r.members) == 4]),
                "5_member_rings": len([r for r in suspicious_rings if len(r.members) == 5])
            },
            "high_risk_rings": len([r for r in suspicious_rings if (r.risk_score or 0) > 0.7]),
            "total_ring_amount": sum(r.total_amount or 0 for r in suspicious_rings),
            "cycle_rings": len([r for r in suspicious_rings if r.pattern == "cycle"]),
            "smurfing_fan_in": len([r for r in suspicious_rings if r.pattern == "smurfing_fan_in"]),
            "smurfing_fan_out": len([r for r in suspicious_rings if r.pattern == "smurfing_fan_out"]),
            "layered_networks": len([r for r in suspicious_rings if r.pattern == "layered"])
        }
        
        return RingDetectionResponse(
            success=True,
            message=f"Detected {len(suspicious_rings)} suspicious rings from {G.number_of_nodes()} accounts",
            total_rings=len(suspicious_rings),
            suspicious_rings=suspicious_rings,
            graph_stats=graph_stats
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ring detection error: {str(e)}")


@app.get("/detect-rings/existing", response_model=RingDetectionResponse)
async def detect_rings_from_existing_data() -> RingDetectionResponse:
    """
    Detect suspicious rings from existing transactions.csv file.
    """
    try:
        import os
        csv_file_path = os.path.join(os.path.dirname(__file__), "transactions.csv")
        
        if not os.path.exists(csv_file_path):
            raise HTTPException(status_code=404, detail="transactions.csv file not found")
        
        # Load and validate CSV data
        csv_data = pd.read_csv(csv_file_path)
        
        # Validate required columns
        required_columns = {'transaction_id', 'sender_id', 'receiver_id', 'amount', 'timestamp'}
        missing_columns = required_columns - set(csv_data.columns)
        
        if missing_columns:
            raise HTTPException(
                status_code=400, 
                detail=f"Missing required columns: {', '.join(missing_columns)}"
            )
        
        # Process transactions
        valid_transactions = []
        
        for idx, row in csv_data.iterrows():
            try:
                transaction_data = {
                    'transaction_id': str(row['transaction_id']).strip(),
                    'sender_id': str(row['sender_id']).strip(),
                    'receiver_id': str(row['receiver_id']).strip(),
                    'amount': row['amount'],
                    'timestamp': row['timestamp']
                }
                
                transaction = Transaction(**transaction_data)
                valid_transactions.append(transaction)
                
            except:
                continue
        
        # Build graph and detect rings from all detectors
        G = build_transaction_graph(valid_transactions)
        outgoing_map, incoming_map = create_transaction_maps(G)
        cycle_rings = cycle_detector(G)
        smurfing_rings = smurfing_detector(incoming_map, outgoing_map)
        layered_rings = detect_layered_networks(G, incoming_map, outgoing_map)
        
        # Aggregate: score, sort, and assign final IDs
        suspicious_rings = aggregate_fraud_rings(cycle_rings, smurfing_rings, layered_rings)
        
        # Calculate graph statistics
        graph_stats = {
            "total_nodes": G.number_of_nodes(),
            "total_edges": G.number_of_edges(),
            "total_amount": sum(data['amount'] for _, _, data in G.edges(data=True)),
            "rings_by_size": {
                "3_member_rings": len([r for r in suspicious_rings if len(r.members) == 3]),
                "4_member_rings": len([r for r in suspicious_rings if len(r.members) == 4]),
                "5_member_rings": len([r for r in suspicious_rings if len(r.members) == 5])
            },
            "high_risk_rings": len([r for r in suspicious_rings if (r.risk_score or 0) > 0.7]),
            "total_ring_amount": sum(r.total_amount or 0 for r in suspicious_rings),
            "cycle_rings": len([r for r in suspicious_rings if r.pattern == "cycle"]),
            "smurfing_fan_in": len([r for r in suspicious_rings if r.pattern == "smurfing_fan_in"]),
            "smurfing_fan_out": len([r for r in suspicious_rings if r.pattern == "smurfing_fan_out"]),
            "layered_networks": len([r for r in suspicious_rings if r.pattern == "layered"]),
            "average_ring_risk": sum(r.risk_score or 0 for r in suspicious_rings) / len(suspicious_rings) if suspicious_rings else 0
        }
        
        return RingDetectionResponse(
            success=True,
            message=f"Detected {len(suspicious_rings)} suspicious rings from existing data ({G.number_of_nodes()} accounts, {G.number_of_edges()} transactions)",
            total_rings=len(suspicious_rings),
            suspicious_rings=suspicious_rings,
            graph_stats=graph_stats
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ring detection error: {str(e)}")

@app.get("/analyze-existing-data", response_model=GraphAnalysisResponse)
async def analyze_existing_data() -> GraphAnalysisResponse:
    """
    Analyze the existing transactions.csv file and build graph analysis.
    
    This endpoint processes the existing transactions.csv file in the backend directory.
    """
    try:
        import os
        csv_file_path = os.path.join(os.path.dirname(__file__), "transactions.csv")
        
        if not os.path.exists(csv_file_path):
            raise HTTPException(status_code=404, detail="transactions.csv file not found")
        
        # Load and validate CSV data
        csv_data = pd.read_csv(csv_file_path)
        
        # Validate required columns
        required_columns = {'transaction_id', 'sender_id', 'receiver_id', 'amount', 'timestamp'}
        missing_columns = required_columns - set(csv_data.columns)
        
        if missing_columns:
            raise HTTPException(
                status_code=400, 
                detail=f"Missing required columns: {', '.join(missing_columns)}"
            )
        
        # Process transactions
        valid_transactions = []
        errors = []
        
        for idx, row in csv_data.iterrows():
            try:
                transaction_data = {
                    'transaction_id': str(row['transaction_id']).strip(),
                    'sender_id': str(row['sender_id']).strip(),
                    'receiver_id': str(row['receiver_id']).strip(),
                    'amount': row['amount'],
                    'timestamp': row['timestamp']
                }
                
                transaction = Transaction(**transaction_data)
                valid_transactions.append(transaction)
                
            except Exception as e:
                errors.append({
                    'row': idx + 1,
                    'error': str(e),
                    'data': row.to_dict()
                })
        
        # Build the graph
        G = build_transaction_graph(valid_transactions)
        
        # Create transaction maps
        outgoing_map, incoming_map = create_transaction_maps(G)
        
        # Calculate advanced graph statistics
        graph_stats = {
            "nodes": list(G.nodes())[:50],  # Limit nodes in response for performance
            "unique_senders": len(outgoing_map),
            "unique_receivers": len(incoming_map),
            "total_transactions": len(valid_transactions),
            "validation_errors": len(errors),
            "total_amount": sum(data['amount'] for _, _, data in G.edges(data=True)),
            "average_amount": sum(data['amount'] for _, _, data in G.edges(data=True)) / G.number_of_edges() if G.number_of_edges() > 0 else 0,
            "min_amount": min((data['amount'] for _, _, data in G.edges(data=True)), default=0),
            "max_amount": max((data['amount'] for _, _, data in G.edges(data=True)), default=0),
            "density": nx.density(G),
            "is_connected": nx.is_weakly_connected(G) if G.number_of_nodes() > 0 else False,
            "top_senders": sorted(
                [(acc, len(txns), sum(tx['amount'] for tx in txns)) 
                 for acc, txns in outgoing_map.items()],
                key=lambda x: x[2], reverse=True
            )[:10],
            "top_receivers": sorted(
                [(acc, len(txns), sum(tx['amount'] for tx in txns)) 
                 for acc, txns in incoming_map.items()],
                key=lambda x: x[2], reverse=True
            )[:10]
        }
        
        return GraphAnalysisResponse(
            success=True,
            message=f"Successfully analyzed {len(valid_transactions)} transactions from existing data ({len(errors)} validation errors)",
            nodes_count=G.number_of_nodes(),
            edges_count=G.number_of_edges(),
            graph_stats=graph_stats,
            outgoing_map=outgoing_map,
            incoming_map=incoming_map
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis error: {str(e)}")

@app.post("/graph-data")
async def get_graph_data(file: UploadFile = File(...)) -> Dict[str, Any]:
    """
    Upload CSV and return graph data in Cytoscape.js format for visualization.
    
    Returns nodes and edges in the format required by Cytoscape.js
    """
    # First validate the CSV using existing upload functionality
    csv_response = await upload_csv(file)
    
    if not csv_response.success:
        raise HTTPException(
            status_code=400, 
            detail=f"CSV validation failed: {csv_response.message}"
        )
    
    try:
        # Build the graph
        G = build_transaction_graph(csv_response.valid_transactions)
        
        # Convert to Cytoscape.js format
        graph_json = graph_to_json(G)
        
        return {
            "success": True,
            "message": f"Graph data generated for {G.number_of_nodes()} nodes and {G.number_of_edges()} edges",
            "graph": graph_json,
            "stats": {
                "nodes_count": G.number_of_nodes(),
                "edges_count": G.number_of_edges(),
                "total_amount": sum(data['amount'] for _, _, data in G.edges(data=True)),
                "unique_accounts": G.number_of_nodes()
            }
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Graph generation error: {str(e)}")


@app.get("/graph-data/existing")
async def get_existing_graph_data() -> Dict[str, Any]:
    """
    Generate graph data from existing transactions.csv for visualization.
    """
    try:
        import os
        csv_file_path = os.path.join(os.path.dirname(__file__), "transactions.csv")
        
        if not os.path.exists(csv_file_path):
            raise HTTPException(status_code=404, detail="transactions.csv file not found")
        
        # Use existing analysis function to process the data
        analysis_response = await analyze_existing_data()
        
        # Load CSV again to build graph (we could optimize this)
        csv_data = pd.read_csv(csv_file_path)
        valid_transactions = []
        
        for idx, row in csv_data.iterrows():
            try:
                transaction = Transaction(
                    transaction_id=str(row['transaction_id']).strip(),
                    sender_id=str(row['sender_id']).strip(),
                    receiver_id=str(row['receiver_id']).strip(),
                    amount=row['amount'],
                    timestamp=row['timestamp']
                )
                valid_transactions.append(transaction)
            except:
                continue
        
        # Build graph and convert to JSON
        G = build_transaction_graph(valid_transactions)
        graph_json = graph_to_json(G)
        
        return {
            "success": True,
            "message": f"Graph data generated from existing CSV with {G.number_of_nodes()} nodes and {G.number_of_edges()} edges",
            "graph": graph_json,
            "stats": {
                "nodes_count": G.number_of_nodes(),
                "edges_count": G.number_of_edges(),
                "total_amount": sum(data['amount'] for _, _, data in G.edges(data=True)),
                "unique_accounts": G.number_of_nodes()
            }
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Graph generation error: {str(e)}")

@app.post("/suspicion-scores", response_model=SuspicionScoreResponse)
async def get_suspicion_scores(file: UploadFile = File(...)) -> SuspicionScoreResponse:
    """
    Upload CSV and compute per-account suspicion scores.

    This endpoint runs the full pipeline: graph construction → ring detection
    → suspicion scoring.
    """
    csv_response = await upload_csv(file)
    if not csv_response.success:
        raise HTTPException(status_code=400, detail=f"CSV validation failed: {csv_response.message}")

    try:
        G = build_transaction_graph(csv_response.valid_transactions)
        outgoing_map, incoming_map = create_transaction_maps(G)

        cycle_rings = cycle_detector(G)
        smurfing_rings = smurfing_detector(incoming_map, outgoing_map)
        layered_rings = detect_layered_networks(G, incoming_map, outgoing_map)
        fraud_rings = aggregate_fraud_rings(cycle_rings, smurfing_rings, layered_rings)

        accounts, merchant_map = compute_suspicion_scores(G, fraud_rings)

        return SuspicionScoreResponse(
            success=True,
            message=f"Scored {len(accounts)} suspicious accounts from {G.number_of_nodes()} total accounts",
            total_accounts=len(accounts),
            suspicious_accounts=accounts,
            merchant_accounts=merchant_map,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Scoring error: {str(e)}")


@app.get("/suspicion-scores/existing", response_model=SuspicionScoreResponse)
async def get_suspicion_scores_existing() -> SuspicionScoreResponse:
    """
    Compute per-account suspicion scores from existing transactions.csv.
    """
    try:
        import os
        csv_file_path = os.path.join(os.path.dirname(__file__), "transactions.csv")
        if not os.path.exists(csv_file_path):
            raise HTTPException(status_code=404, detail="transactions.csv file not found")

        csv_data = pd.read_csv(csv_file_path)

        required_columns = {'transaction_id', 'sender_id', 'receiver_id', 'amount', 'timestamp'}
        missing_columns = required_columns - set(csv_data.columns)
        if missing_columns:
            raise HTTPException(status_code=400, detail=f"Missing required columns: {', '.join(missing_columns)}")

        valid_transactions: List[Transaction] = []
        for _, row in csv_data.iterrows():
            try:
                valid_transactions.append(Transaction(
                    transaction_id=str(row['transaction_id']).strip(),
                    sender_id=str(row['sender_id']).strip(),
                    receiver_id=str(row['receiver_id']).strip(),
                    amount=row['amount'],
                    timestamp=row['timestamp'],
                ))
            except Exception:
                continue

        G = build_transaction_graph(valid_transactions)
        outgoing_map, incoming_map = create_transaction_maps(G)

        cycle_rings = cycle_detector(G)
        smurfing_rings = smurfing_detector(incoming_map, outgoing_map)
        layered_rings = detect_layered_networks(G, incoming_map, outgoing_map)
        fraud_rings = aggregate_fraud_rings(cycle_rings, smurfing_rings, layered_rings)

        fraud_rings = aggregate_fraud_rings(cycle_rings, smurfing_rings, layered_rings)

        accounts, merchant_map = compute_suspicion_scores(G, fraud_rings)

        return SuspicionScoreResponse(
            success=True,
            message=f"Scored {len(accounts)} suspicious accounts from existing data ({G.number_of_nodes()} accounts, {G.number_of_edges()} transactions)",
            total_accounts=len(accounts),
            suspicious_accounts=accounts,
            merchant_accounts=merchant_map,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Scoring error: {str(e)}")


# ---------------------------------------------------------------------------
# Full Analysis & Report Endpoints
# ---------------------------------------------------------------------------

def _load_existing_transactions() -> List["Transaction"]:
    """Load and validate transactions from the existing CSV file."""
    csv_file_path = os.path.join(os.path.dirname(__file__), "transactions_with_demo_fraud.csv")
    if not os.path.exists(csv_file_path):
        raise HTTPException(status_code=404, detail="transactions.csv file not found")

    csv_data = pd.read_csv(csv_file_path)
    required_columns = {"transaction_id", "sender_id", "receiver_id", "amount", "timestamp"}
    missing = required_columns - set(csv_data.columns)
    if missing:
        raise HTTPException(status_code=400, detail=f"Missing required columns: {', '.join(missing)}")

    valid: List[Transaction] = []
    for _, row in csv_data.iterrows():
        try:
            valid.append(Transaction(
                transaction_id=str(row["transaction_id"]).strip(),
                sender_id=str(row["sender_id"]).strip(),
                receiver_id=str(row["receiver_id"]).strip(),
                amount=row["amount"],
                timestamp=row["timestamp"],
            ))
        except Exception:
            continue
    return valid


def _run_pipeline(transactions: List["Transaction"]) -> Dict[str, Any]:
    """
    Execute the full detection pipeline and build the JSON report.

    Returns the report dict (also saved to output/latest_report.json).
    """
    t_start = time.perf_counter()

    # 1. Build graph
    G = build_transaction_graph(transactions)
    outgoing_map, incoming_map = create_transaction_maps(G)

    # 2. Detect rings
    cycle_rings = cycle_detector(G)
    smurfing_rings = smurfing_detector(incoming_map, outgoing_map)
    layered_rings_list = detect_layered_networks(G, incoming_map, outgoing_map)
    fraud_rings = aggregate_fraud_rings(cycle_rings, smurfing_rings, layered_rings_list)

    # 3. Compute rule-based suspicion scores
    suspicious_accounts, _merchant_map = compute_suspicion_scores(G, fraud_rings)

    # 4. Prepare data for the JSON formatter
    # Convert SuspiciousRing objects to plain dicts
    # risk_score is stored as 0.0–1.0 in SuspiciousRing; convert to 0–100 int
    rings_as_dicts: List[Dict[str, Any]] = [
        {
            "ring_id": r.ring_id,
            "pattern": r.pattern,
            "members": list(r.members),
            "risk_score": int(round((r.risk_score or 0) * 100)),
        }
        for r in fraud_rings
    ]

    # Rule-based scores: account_id → suspicion_score (0-100)
    rule_scores: Dict[str, int] = {
        sa.account_id: sa.suspicion_score for sa in suspicious_accounts
    }

    # 4b. ML-enhanced scoring (if model is available)
    ml_probabilities: Dict[str, float] = {}
    final_scores_detail: Dict[str, Dict[str, float]] = {}

    # Only accounts that belong to at least one ring are "suspicious"
    ring_member_ids: set[str] = set()
    for r in fraud_rings:
        ring_member_ids.update(r.members)

    if ml_is_available():
        account_features = _extract_pipeline_features(G, fraud_rings)
        ml_probabilities = predict_fraud_probabilities(account_features)
        final_scores_detail = compute_final_scores(rule_scores, ml_probabilities)
        # Use blended final_score, but ONLY for ring members
        account_scores: Dict[str, int] = {
            acct: int(round(detail["final_score"]))
            for acct, detail in final_scores_detail.items()
            if acct in ring_member_ids
        }
        # Also limit ml_probabilities to ring members for report detail
        ml_probabilities = {
            acct: prob for acct, prob in ml_probabilities.items()
            if acct in ring_member_ids
        }
    else:
        # Fallback: use rule scores only (already ring-members-only)
        account_scores = dict(rule_scores)

    # account_ring_map: account_id → first (highest-risk) ring_id or None
    acct_ring_membership = build_account_ring_map(fraud_rings)
    account_ring_map: Dict[str, Optional[str]] = {
        acc: (rings[0] if rings else None)
        for acc, rings in acct_ring_membership.items()
    }

    t_end = time.perf_counter()

    # 5. Build & save the report
    report = build_final_json(
        transactions=transactions,
        fraud_rings=rings_as_dicts,
        account_scores=account_scores,
        account_ring_map=account_ring_map,
        processing_time_seconds=t_end - t_start,
        ml_probabilities=ml_probabilities,
        rule_scores=rule_scores,
    )
    return report


@app.post("/analyze")
async def analyze(file: Optional[UploadFile] = File(None)) -> Dict[str, Any]:
    """
    Run the full fraud detection pipeline and return the JSON report.

    - If a CSV file is uploaded, it is used as the data source.
    - If no file is provided, the existing ``transactions.csv`` is used.

    The report is also persisted to ``output/latest_report.json``.
    """
    try:
        if file is not None:
            csv_response = await upload_csv(file)
            if not csv_response.success:
                raise HTTPException(status_code=400, detail=f"CSV validation failed: {csv_response.message}")
            transactions = csv_response.valid_transactions
        else:
            transactions = _load_existing_transactions()

        if not transactions:
            raise HTTPException(status_code=400, detail="No valid transactions to analyze")

        return _run_pipeline(transactions)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis error: {str(e)}")


@app.get("/download-report")
async def download_report() -> FileResponse:
    """
    Download the latest fraud detection report as a JSON file.

    Returns ``output/latest_report.json`` with the download filename
    ``fraud_detection_report.json``.
    """
    report_path = os.path.join(os.path.dirname(__file__), "output", "latest_report.json")
    if not os.path.exists(report_path):
        raise HTTPException(
            status_code=404,
            detail="No report available. Run POST /analyze first.",
        )
    return FileResponse(
        path=report_path,
        media_type="application/json",
        filename="fraud_detection_report.json",
    )


@app.get("/transactions/sample")
def get_sample_csv() -> dict:
    """Return sample CSV format for reference."""
    return {
        "sample_format": {
            "headers": ["transaction_id", "sender_id", "receiver_id", "amount", "timestamp"],
            "example_row": {
                "transaction_id": "TXN001",
                "sender_id": "USER123",
                "receiver_id": "USER456", 
                "amount": "100.50",
                "timestamp": "2024-02-19T14:30:00Z"
            }
        }
    }
