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
