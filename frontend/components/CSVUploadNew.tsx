"use client";

import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload,
  FileSpreadsheet,
  X,
  CheckCircle,
  AlertCircle,
  Loader2,
  Download,
  Database,
  ArrowRight,
  FileText,
  Info,
} from "lucide-react";

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
  data: Record<string, unknown>;
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

interface SuspiciousAccount {
  account_id: string;
  suspicion_score: number;
  involved_rings: string[];
  is_merchant: boolean;
}

interface SuspicionScoreResponse {
  success: boolean;
  message: string;
  total_accounts: number;
  suspicious_accounts: SuspiciousAccount[];
  merchant_accounts: Record<string, boolean>;
}

interface CSVUploadProps {
  onDataLoaded: (data: {
    response: UploadResponse | null;
    graphData: GraphResponse | null;
    ringData: RingDetectionResponse | null;
    suspicionData: SuspicionScoreResponse | null;
  }) => void;
  onNavigate?: (view: string) => void;
}

export default function CSVUpload({
  onDataLoaded,
  onNavigate,
}: CSVUploadProps) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState("");
  const [analyzeLoading, setAnalyzeLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile?.name.endsWith(".csv")) {
      setFile(droppedFile);
      setError(null);
      setSuccess(null);
    } else {
      setError("Please drop a valid CSV file");
    }
  }, []);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setError(null);
      setSuccess(null);
    }
  };

  const processData = async (isExisting: boolean = false) => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    setUploadProgress(0);

    try {
      if (isExisting) {
        setLoadingStep("Loading existing data...");
        setUploadProgress(20);

        const [graphRes, ringRes, scoreRes] = await Promise.all([
          fetch("http://localhost:8000/graph-data/existing"),
          fetch("http://localhost:8000/detect-rings/existing"),
          fetch("http://localhost:8000/suspicion-scores/existing"),
        ]);

        setUploadProgress(80);

        let graphData: GraphResponse | null = null;
        let ringData: RingDetectionResponse | null = null;
        let suspicionData: SuspicionScoreResponse | null = null;

        if (graphRes.ok) graphData = await graphRes.json();
        if (ringRes.ok) ringData = await ringRes.json();
        if (scoreRes.ok) suspicionData = await scoreRes.json();

        if (!graphRes.ok) throw new Error("Failed to load existing data");

        setUploadProgress(100);
        setSuccess(`Loaded sample data successfully`);

        onDataLoaded({
          response: null,
          graphData,
          ringData,
          suspicionData,
        });
      } else {
        if (!file) return;

        // Step 1: Upload & Validate
        setLoadingStep("Uploading & validating CSV...");
        setUploadProgress(15);
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
        setUploadProgress(35);

        // Step 2: Build Graph
        setLoadingStep("Building transaction graph...");
        const graphFormData = new FormData();
        graphFormData.append("file", file);
        const graphRes = await fetch("http://localhost:8000/graph-data", {
          method: "POST",
          body: graphFormData,
        });
        const graphData: GraphResponse | null = graphRes.ok
          ? await graphRes.json()
          : null;
        setUploadProgress(55);

        // Step 3: Detect Rings
        setLoadingStep("Detecting suspicious rings...");
        const ringFormData = new FormData();
        ringFormData.append("file", file);
        const ringRes = await fetch("http://localhost:8000/detect-rings", {
          method: "POST",
          body: ringFormData,
        });
        const ringData: RingDetectionResponse | null = ringRes.ok
          ? await ringRes.json()
          : null;
        setUploadProgress(75);

        // Step 4: Score Accounts
        setLoadingStep("Scoring suspicious accounts...");
        const scoreFormData = new FormData();
        scoreFormData.append("file", file);
        const scoreRes = await fetch("http://localhost:8000/suspicion-scores", {
          method: "POST",
          body: scoreFormData,
        });
        const suspicionData: SuspicionScoreResponse | null = scoreRes.ok
          ? await scoreRes.json()
          : null;
        setUploadProgress(100);

        setSuccess(
          `Processed ${result.valid_transactions.length} transactions successfully${
            result.errors.length > 0 ? ` (${result.errors.length} errors)` : ""
          }`,
        );

        onDataLoaded({
          response: result,
          graphData,
          ringData,
          suspicionData,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
      setLoadingStep("");
    }
  };

  const handleAnalyzeAndDownload = async () => {
    setAnalyzeLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      if (file) formData.append("file", file);

      const analyzeResponse = await fetch("http://localhost:8000/analyze", {
        method: "POST",
        body: file ? formData : undefined,
      });

      if (!analyzeResponse.ok) {
        const errorData = await analyzeResponse.json();
        throw new Error(errorData.detail || "Analysis failed");
      }

      const downloadResponse = await fetch(
        "http://localhost:8000/download-report",
      );

      if (!downloadResponse.ok) throw new Error("Failed to download report");

      const blob = await downloadResponse.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "fraud_detection_report.json";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      setSuccess("Report downloaded successfully!");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Analysis and download failed",
      );
    } finally {
      setAnalyzeLoading(false);
    }
  };

  const clearFile = () => {
    setFile(null);
    setError(null);
    setSuccess(null);
    setUploadProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="space-y-6">
      {/* Upload Section */}
      <div className="bg-[#1a2332] rounded-xl border border-white/5 overflow-hidden">
        <div className="p-6">
          <h2 className="text-lg font-semibold text-white mb-1">
            Import Transaction Data
          </h2>
          <p className="text-sm text-slate-500 mb-5">
            Upload a CSV file or load existing sample data to begin analysis
          </p>

          {/* Drag & Drop Zone */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`
              drop-zone rounded-xl p-8 text-center cursor-pointer transition-all duration-300
              ${
                isDragging
                  ? "active border-blue-400 bg-blue-500/5"
                  : file
                    ? "border-emerald-500/30 bg-emerald-500/5"
                    : "border-slate-700 hover:border-slate-600 bg-[#111827]"
              }
            `}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileSelect}
              className="hidden"
            />

            {file ? (
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="space-y-3"
              >
                <div className="w-14 h-14 mx-auto bg-emerald-500/10 rounded-xl flex items-center justify-center">
                  <FileSpreadsheet className="w-7 h-7 text-emerald-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-white">{file.name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {(file.size / 1024).toFixed(1)} KB
                  </p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    clearFile();
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1 text-xs text-slate-400 hover:text-red-400 bg-slate-800 hover:bg-red-500/10 rounded-lg transition-colors"
                >
                  <X className="w-3 h-3" /> Remove
                </button>
              </motion.div>
            ) : (
              <div className="space-y-3">
                <div className="w-14 h-14 mx-auto bg-slate-800 rounded-xl flex items-center justify-center">
                  <Upload className="w-7 h-7 text-slate-500" />
                </div>
                <div>
                  <p className="text-sm text-slate-300">
                    <span className="text-blue-400 font-medium">
                      Click to upload
                    </span>{" "}
                    or drag and drop
                  </p>
                  <p className="text-xs text-slate-600 mt-1">CSV files only</p>
                </div>
              </div>
            )}
          </div>

          {/* Progress Bar */}
          <AnimatePresence>
            {loading && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-4 space-y-2"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="text-blue-400 flex items-center gap-1.5">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    {loadingStep}
                  </span>
                  <span className="text-slate-500">{uploadProgress}%</span>
                </div>
                <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-linear-to-r from-blue-500 to-cyan-400 rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${uploadProgress}%` }}
                    transition={{ duration: 0.5 }}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Action Buttons */}
          <div className="mt-5 grid grid-cols-2 gap-3">
            <button
              onClick={() => processData(false)}
              disabled={!file || loading}
              className="flex items-center justify-center gap-2 py-2.5 px-4 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-600 text-white text-sm font-medium rounded-lg transition-all duration-200 disabled:cursor-not-allowed"
            >
              {loading && !file ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              Upload & Analyze
            </button>
            <button
              onClick={() => processData(true)}
              disabled={loading}
              className="flex items-center justify-center gap-2 py-2.5 px-4 bg-[#243044] hover:bg-[#2d4a6f] disabled:bg-slate-800 disabled:text-slate-600 text-slate-300 text-sm font-medium rounded-lg border border-white/5 transition-all duration-200 disabled:cursor-not-allowed"
            >
              <Database className="w-4 h-4" />
              Load Sample Data
            </button>
          </div>
        </div>

        {/* Status Messages */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="px-6 pb-4"
            >
              <div className="flex items-start gap-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-red-400">Error</p>
                  <p className="text-xs text-red-400/70 mt-0.5">{error}</p>
                </div>
              </div>
            </motion.div>
          )}

          {success && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="px-6 pb-4"
            >
              <div className="flex items-center justify-between p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                <div className="flex items-start gap-3">
                  <CheckCircle className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-emerald-400">
                      Success
                    </p>
                    <p className="text-xs text-emerald-400/70 mt-0.5">
                      {success}
                    </p>
                  </div>
                </div>
                {onNavigate && (
                  <button
                    onClick={() => onNavigate("dashboard")}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs text-blue-400 hover:text-blue-300 bg-blue-500/10 rounded-lg transition-colors"
                  >
                    View Results
                    <ArrowRight className="w-3 h-3" />
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Generate Report Card */}
      <div className="bg-[#1a2332] rounded-xl border border-white/5 p-6">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 bg-purple-500/10 rounded-lg flex items-center justify-center shrink-0">
            <FileText className="w-5 h-5 text-purple-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-white mb-1">
              Generate Analysis Report
            </h3>
            <p className="text-xs text-slate-500 mb-3">
              Run comprehensive analysis and download a detailed JSON report
              {file ? " using your uploaded file" : " using sample data"}
            </p>
            <button
              onClick={handleAnalyzeAndDownload}
              disabled={loading || analyzeLoading}
              className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-slate-800 disabled:text-slate-600 text-white text-sm font-medium rounded-lg transition-all duration-200 disabled:cursor-not-allowed"
            >
              {analyzeLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  Generate & Download
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* CSV Format Guide */}
      <div className="bg-[#1a2332] rounded-xl border border-white/5 p-5">
        <div className="flex items-center gap-2 mb-3">
          <Info className="w-4 h-4 text-blue-400" />
          <h4 className="text-sm font-medium text-slate-300">
            Required CSV Format
          </h4>
        </div>
        <div className="grid grid-cols-5 gap-2">
          {[
            { col: "transaction_id", desc: "Unique ID" },
            { col: "sender_id", desc: "Sender" },
            { col: "receiver_id", desc: "Receiver" },
            { col: "amount", desc: "Amount ($)" },
            { col: "timestamp", desc: "Date/Time" },
          ].map((item) => (
            <div
              key={item.col}
              className="bg-[#111827] rounded-lg p-2.5 text-center"
            >
              <code className="text-xs text-blue-400 font-mono">
                {item.col}
              </code>
              <p className="text-[10px] text-slate-600 mt-0.5">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
