"use client";

import { useState, useRef } from "react";

interface Transaction {
  transaction_id: string;
  sender_id: string;
  receiver_id: string;
  amount: number;
  timestamp: string;
}

interface ValidationError {
  row: number;
  error: string;
  data: Record<string, any>;
}

interface UploadResponse {
  success: boolean;
  message: string;
  total_rows: number;
  valid_transactions: Transaction[];
  errors: ValidationError[];
}

export default function CSVUpload() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<UploadResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setResponse(null);
      setError(null);
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("http://localhost:8001/upload-csv", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.detail || "Upload failed");
      }

      const result: UploadResponse = await res.json();
      setResponse(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const clearFile = () => {
    setFile(null);
    setResponse(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">
          Transaction CSV Upload
        </h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select CSV File
            </label>
            <div className="flex items-center space-x-4">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileSelect}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
              {file && (
                <button
                  onClick={clearFile}
                  className="px-3 py-2 text-sm text-gray-600 hover:text-gray-800"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {file && (
            <div className="bg-gray-50 p-4 rounded-md">
              <p className="text-sm text-gray-700">
                <span className="font-medium">Selected file:</span> {file.name}
              </p>
              <p className="text-sm text-gray-500">
                Size: {(file.size / 1024).toFixed(1)} KB
              </p>
            </div>
          )}

          <button
            onClick={handleUpload}
            disabled={!file || loading}
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Processing..." : "Upload and Validate"}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-red-800 text-sm font-medium">Error:</p>
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      {response && (
        <div className="space-y-4">
          <div
            className={`p-4 rounded-md ${response.success ? "bg-green-50 border border-green-200" : "bg-yellow-50 border border-yellow-200"}`}
          >
            <h3
              className={`text-lg font-medium ${response.success ? "text-green-800" : "text-yellow-800"}`}
            >
              Validation Results
            </h3>
            <p
              className={`text-sm ${response.success ? "text-green-700" : "text-yellow-700"}`}
            >
              {response.message}
            </p>
            <div className="mt-2 text-sm">
              <p>Total rows processed: {response.total_rows}</p>
              <p>Valid transactions: {response.valid_transactions.length}</p>
              {response.errors.length > 0 && (
                <p className="text-red-600">Errors: {response.errors.length}</p>
              )}
            </div>
          </div>

          {response.errors.length > 0 && (
            <div className="bg-white rounded-lg shadow-md p-6">
              <h4 className="text-lg font-medium text-gray-900 mb-4">
                Validation Errors
              </h4>
              <div className="max-h-60 overflow-y-auto">
                <table className="min-w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        Row
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        Error
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {response.errors.map((error, index) => (
                      <tr key={index}>
                        <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900">
                          {error.row}
                        </td>
                        <td className="px-3 py-2 text-sm text-red-600">
                          {error.error}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {response.valid_transactions.length > 0 && (
            <div className="bg-white rounded-lg shadow-md p-6">
              <h4 className="text-lg font-medium text-gray-900 mb-4">
                Valid Transactions ({response.valid_transactions.length})
              </h4>
              <div className="max-h-60 overflow-y-auto">
                <table className="min-w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        Transaction ID
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        Sender
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        Receiver
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        Amount
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        Timestamp
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {response.valid_transactions
                      .slice(0, 50)
                      .map((transaction, index) => (
                        <tr key={index}>
                          <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900">
                            {transaction.transaction_id}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900">
                            {transaction.sender_id}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900">
                            {transaction.receiver_id}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900">
                            ${transaction.amount.toFixed(2)}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">
                            {new Date(transaction.timestamp).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
                {response.valid_transactions.length > 50 && (
                  <p className="mt-2 text-sm text-gray-500 text-center">
                    Showing first 50 transactions of{" "}
                    {response.valid_transactions.length}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
        <h4 className="text-sm font-medium text-blue-800 mb-2">
          CSV Format Requirements
        </h4>
        <p className="text-sm text-blue-700 mb-2">
          Your CSV file must contain the following columns:
        </p>
        <ul className="text-sm text-blue-600 list-disc list-inside space-y-1">
          <li>
            <code>transaction_id</code> - Unique identifier for the transaction
          </li>
          <li>
            <code>sender_id</code> - ID of the sender
          </li>
          <li>
            <code>receiver_id</code> - ID of the receiver
          </li>
          <li>
            <code>amount</code> - Transaction amount (positive number)
          </li>
          <li>
            <code>timestamp</code> - Date and time of transaction
          </li>
        </ul>
      </div>
    </div>
  );
}
