from datetime import datetime
from typing import List, Optional
import io
import pandas as pd
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
