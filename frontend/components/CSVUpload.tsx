"use client";

import { useState, useRef } from "react";
import GraphVisualization from "./GraphVisualization";

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

interface GraphData {
  nodes: Array<{ id: string }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    amount: number;
    timestamp: string;
  }>;
}

interface GraphResponse {
  success: boolean;
  message: string;
  graph: GraphData;
  stats: {
    nodes_count: number;
    edges_count: number;
    total_amount: number;
    unique_accounts: number;
  };
}

interface SuspiciousRing {
  ring_id: string;
  members: Array<string>;
  pattern: string;
  risk_score?: number;
  total_amount?: number;
  transaction_count?: number;
}

interface RingDetectionResponse {
  success: boolean;
  message: string;
  total_rings: number;
  suspicious_rings: Array<SuspiciousRing>;
  graph_stats: {
    total_nodes: number;
    total_edges: number;
    total_amount: number;
    rings_by_size: {
      "3_member_rings": number;
      "4_member_rings": number;
      "5_member_rings": number;
    };
    high_risk_rings: number;
    total_ring_amount: number;
    average_ring_risk?: number;
  };
}

export default function CSVUpload() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<UploadResponse | null>(null);
  const [graphData, setGraphData] = useState<GraphResponse | null>(null);
  const [ringData, setRingData] = useState<RingDetectionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showGraph, setShowGraph] = useState(false);
  const [showRings, setShowRings] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setResponse(null);
      setGraphData(null);
      setRingData(null);
      setShowGraph(false);
      setShowRings(false);
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

      const res = await fetch("http://localhost:8000/upload-csv", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.detail || "Upload failed");
      }

      const result: UploadResponse = await res.json();
      setResponse(result);

      // If upload was successful, also fetch graph data
      if (result.success && result.valid_transactions.length > 0) {
        await fetchGraphData();
        await fetchRingData();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const fetchGraphData = async () => {
    if (!file) return;

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("http://localhost:8000/graph-data", {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        const graphResult: GraphResponse = await res.json();
        setGraphData(graphResult);
      }
    } catch (err) {
      console.error("Failed to fetch graph data:", err);
    }
  };

  const fetchRingData = async () => {
    if (!file) return;

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("http://localhost:8000/detect-rings", {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        const ringResult: RingDetectionResponse = await res.json();
        setRingData(ringResult);
      }
    } catch (err) {
      console.error("Failed to fetch ring data:", err);
    }
  };

  const loadExistingGraphData = async () => {
    setLoading(true);
    try {
      const [graphRes, ringRes] = await Promise.all([
        fetch("http://localhost:8000/graph-data/existing"),
        fetch("http://localhost:8000/detect-rings/existing"),
      ]);

      if (graphRes.ok) {
        const graphResult: GraphResponse = await graphRes.json();
        setGraphData(graphResult);
        setShowGraph(true);
      }

      if (ringRes.ok) {
        const ringResult: RingDetectionResponse = await ringRes.json();
        setRingData(ringResult);
        setShowRings(ringResult.total_rings > 0);
      } else {
        throw new Error("Failed to load existing data");
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load graph data",
      );
    } finally {
      setLoading(false);
    }
  };

  const clearFile = () => {
    setFile(null);
    setResponse(null);
    setGraphData(null);
    setRingData(null);
    setShowGraph(false);
    setShowRings(false);
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
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed mb-2"
          >
            {loading ? "Processing..." : "Upload and Validate"}
          </button>

          <button
            onClick={loadExistingGraphData}
            disabled={loading}
            className="w-full flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Loading..." : "Load Existing Sample Data"}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-red-800 text-sm font-medium">Error:</p>
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      {response && response.success && graphData && (
        <div className="space-y-4">
          <div className="flex justify-between items-center bg-green-50 border border-green-200 rounded-md p-4">
            <div>
              <h3 className="text-lg font-medium text-green-800">
                🎉 Graph Ready!
              </h3>
              <p className="text-sm text-green-700">
                Successfully processed {response.valid_transactions.length}{" "}
                transactions
              </p>
            </div>
            <button
              onClick={() => setShowGraph(!showGraph)}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
            >
              {showGraph ? "📊 Hide Graph" : "📈 View Graph"}
            </button>
          </div>

          {showGraph && (
            <GraphVisualization
              graphData={graphData.graph}
              stats={graphData.stats}
              suspiciousRings={ringData?.suspicious_rings}
            />
          )}
        </div>
      )}

      {ringData && (
        <div className="space-y-4">
          <div
            className={`p-4 rounded-md ${
              ringData.total_rings > 0
                ? "bg-red-50 border border-red-200"
                : "bg-green-50 border border-green-200"
            }`}
          >
            <div className="flex justify-between items-center">
              <div>
                <h3
                  className={`text-lg font-medium ${
                    ringData.total_rings > 0 ? "text-red-800" : "text-green-800"
                  }`}
                >
                  {ringData.total_rings > 0
                    ? "🚨 Suspicious Rings Detected!"
                    : "✅ No Suspicious Rings"}
                </h3>
                <p
                  className={`text-sm ${
                    ringData.total_rings > 0 ? "text-red-700" : "text-green-700"
                  }`}
                >
                  {ringData.message}
                </p>
              </div>
              {ringData.total_rings > 0 && (
                <button
                  onClick={() => setShowRings(!showRings)}
                  className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
                >
                  {showRings ? "🔍 Hide Details" : "🔍 View Details"}
                </button>
              )}
            </div>
          </div>

          {showRings && ringData.total_rings > 0 && (
            <div className="bg-white rounded-lg shadow-md p-6">
              <h4 className="text-lg font-medium text-gray-900 mb-4">
                🎯 Suspicious Ring Analysis
              </h4>

              {/* Ring Statistics */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 p-4 bg-gray-50 rounded-lg">
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-600">
                    {ringData.total_rings}
                  </div>
                  <div className="text-sm text-gray-600">Total Rings</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-orange-600">
                    {ringData.graph_stats.high_risk_rings}
                  </div>
                  <div className="text-sm text-gray-600">High Risk</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-600">
                    ${ringData.graph_stats.total_ring_amount.toLocaleString()}
                  </div>
                  <div className="text-sm text-gray-600">Ring Amount</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">
                    {ringData.graph_stats.average_ring_risk?.toFixed(2) ||
                      "0.00"}
                  </div>
                  <div className="text-sm text-gray-600">Avg Risk Score</div>
                </div>
              </div>

              {/* Ring Details */}
              <div className="space-y-4">
                <h5 className="font-medium text-gray-900 mb-3">
                  🔍 Detected Rings (Top 10)
                </h5>
                {ringData.suspicious_rings.slice(0, 10).map((ring, index) => (
                  <div
                    key={ring.ring_id}
                    className={`p-4 rounded-lg border ${
                      (ring.risk_score || 0) > 5.0
                        ? "border-red-200 bg-red-50"
                        : "border-yellow-200 bg-yellow-50"
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <h6 className="font-medium text-gray-900">
                          {ring.ring_id} - {ring.members.length} Members
                        </h6>
                        <p className="text-sm text-gray-600 mt-1">
                          <strong>Members:</strong> {ring.members.join(" → ")} →{" "}
                          {ring.members[0]}
                        </p>
                        <div className="flex gap-4 mt-2 text-sm">
                          <span className="text-gray-700">
                            <strong>Risk Score:</strong>
                            <span
                              className={`ml-1 font-medium ${
                                (ring.risk_score || 0) > 5.0
                                  ? "text-red-600"
                                  : "text-yellow-600"
                              }`}
                            >
                              {ring.risk_score?.toFixed(2) || "0.00"}
                            </span>
                          </span>
                          <span className="text-gray-700">
                            <strong>Amount:</strong> $
                            {ring.total_amount?.toLocaleString() || "0"}
                          </span>
                          <span className="text-gray-700">
                            <strong>Transactions:</strong>{" "}
                            {ring.transaction_count || 0}
                          </span>
                        </div>
                      </div>
                      <div
                        className={`px-3 py-1 rounded-full text-xs font-medium ${
                          (ring.risk_score || 0) > 5.0
                            ? "bg-red-100 text-red-800"
                            : "bg-yellow-100 text-yellow-800"
                        }`}
                      >
                        {(ring.risk_score || 0) > 5.0
                          ? "HIGH RISK"
                          : "MODERATE"}
                      </div>
                    </div>
                  </div>
                ))}

                {ringData.suspicious_rings.length > 10 && (
                  <p className="text-sm text-gray-500 text-center mt-4">
                    Showing top 10 of {ringData.suspicious_rings.length}{" "}
                    detected rings
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {showGraph && !response && graphData && (
        <GraphVisualization
          graphData={graphData.graph}
          stats={graphData.stats}
          suspiciousRings={ringData?.suspicious_rings}
        />
      )}

      {showRings && !response && ringData && ringData.total_rings > 0 && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <h4 className="text-lg font-medium text-gray-900 mb-4">
            🎯 Existing Data Ring Analysis
          </h4>
          <p className="text-gray-600 mb-4">{ringData.message}</p>
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

      {showGraph && !response && graphData && (
        <GraphVisualization
          graphData={graphData.graph}
          stats={graphData.stats}
        />
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
