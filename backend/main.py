from datetime import datetime
from typing import List, Optional, Dict, Any
import io
import pandas as pd
import networkx as nx
from dateutil import parser as date_parser
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, validator

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
        
        # Detect cycle-based rings
        suspicious_rings = cycle_detector(G)
        
        # Detect smurfing rings
        outgoing_map, incoming_map = create_transaction_maps(G)
        smurfing_rings = smurfing_detector(incoming_map, outgoing_map)
        suspicious_rings.extend(smurfing_rings)
        
        # Sort rings by risk score (highest first)
        suspicious_rings.sort(key=lambda x: x.risk_score or 0, reverse=True)
        
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
            "high_risk_rings": len([r for r in suspicious_rings if (r.risk_score or 0) > 5.0]),
            "total_ring_amount": sum(r.total_amount or 0 for r in suspicious_rings),
            "smurfing_fan_in": len([r for r in suspicious_rings if r.pattern == "smurfing_fan_in"]),
            "smurfing_fan_out": len([r for r in suspicious_rings if r.pattern == "smurfing_fan_out"])
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
        
        # Build graph and detect rings
        G = build_transaction_graph(valid_transactions)
        suspicious_rings = cycle_detector(G)
        
        # Detect smurfing rings
        outgoing_map, incoming_map = create_transaction_maps(G)
        smurfing_rings = smurfing_detector(incoming_map, outgoing_map)
        suspicious_rings.extend(smurfing_rings)
        
        # Sort rings by risk score (highest first)
        suspicious_rings.sort(key=lambda x: x.risk_score or 0, reverse=True)
        
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
            "high_risk_rings": len([r for r in suspicious_rings if (r.risk_score or 0) > 5.0]),
            "total_ring_amount": sum(r.total_amount or 0 for r in suspicious_rings),
            "smurfing_fan_in": len([r for r in suspicious_rings if r.pattern == "smurfing_fan_in"]),
            "smurfing_fan_out": len([r for r in suspicious_rings if r.pattern == "smurfing_fan_out"]),
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
