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
          fetch(
            "https://rift-money-muling-seven.vercel.app/graph-data/existing",
          ),
          fetch(
            "https://rift-money-muling-seven.vercel.app/detect-rings/existing",
          ),
          fetch(
            "https://rift-money-muling-seven.vercel.app/suspicion-scores/existing",
          ),
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

        const res = await fetch(
          "https://rift-money-muling-seven.vercel.app/upload-csv",
          {
            method: "POST",
            body: formData,
          },
        );

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
        const graphRes = await fetch(
          "https://rift-money-muling-seven.vercel.app/graph-data",
          {
            method: "POST",
            body: graphFormData,
          },
        );
        const graphData: GraphResponse | null = graphRes.ok
          ? await graphRes.json()
          : null;
        setUploadProgress(55);

        // Step 3: Detect Rings
        setLoadingStep("Detecting suspicious rings...");
        const ringFormData = new FormData();
        ringFormData.append("file", file);
        const ringRes = await fetch(
          "https://rift-money-muling-seven.vercel.app/detect-rings",
          {
            method: "POST",
            body: ringFormData,
          },
        );
        const ringData: RingDetectionResponse | null = ringRes.ok
          ? await ringRes.json()
          : null;
        setUploadProgress(75);

        // Step 4: Score Accounts
        setLoadingStep("Scoring suspicious accounts...");
        const scoreFormData = new FormData();
        scoreFormData.append("file", file);
        const scoreRes = await fetch(
          "https://rift-money-muling-seven.vercel.app/suspicion-scores",
          {
            method: "POST",
            body: scoreFormData,
          },
        );
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

      const analyzeResponse = await fetch(
        "https://rift-money-muling-seven.vercel.app/analyze",
        {
          method: "POST",
          body: file ? formData : undefined,
        },
      );

      if (!analyzeResponse.ok) {
        const errorData = await analyzeResponse.json();
        throw new Error(errorData.detail || "Analysis failed");
      }

      const downloadResponse = await fetch(
        "https://rift-money-muling-seven.vercel.app/download-report",
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
      <div className="bg-white rounded-xl border border-[#E2E5EE] shadow-sm overflow-hidden">
        <div className="p-6">
          <h2 className="text-lg font-semibold text-[#1E1E2C] mb-1">
            Import Transaction Data
          </h2>
          <p className="text-sm text-[#7C8197] mb-5">
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
                  ? "active border-[#F29F67] bg-[#F29F67]/5"
                  : file
                    ? "border-[#34B1AA]/30 bg-[#34B1AA]/5"
                    : "border-[#D0D4DE] hover:border-[#B0B5C8] bg-[#F5F6FA]"
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
                <div className="w-14 h-14 mx-auto bg-[#34B1AA]/10 rounded-xl flex items-center justify-center">
                  <FileSpreadsheet className="w-7 h-7 text-[#34B1AA]" />
                </div>
                <div>
                  <p className="text-sm font-medium text-[#1E1E2C]">
                    {file.name}
                  </p>
                  <p className="text-xs text-[#7C8197] mt-0.5">
                    {(file.size / 1024).toFixed(1)} KB
                  </p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    clearFile();
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1 text-xs text-[#5A5F72] hover:text-red-500 bg-[#EEF0F5] hover:bg-red-500/10 rounded-lg transition-colors"
                >
                  <X className="w-3 h-3" /> Remove
                </button>
              </motion.div>
            ) : (
              <div className="space-y-3">
                <div className="w-14 h-14 mx-auto bg-[#EEF0F5] rounded-xl flex items-center justify-center">
                  <Upload className="w-7 h-7 text-[#A5AAC0]" />
                </div>
                <div>
                  <p className="text-sm text-[#4A4F63]">
                    <span className="text-[#F29F67] font-medium">
                      Click to upload
                    </span>{" "}
                    or drag and drop
                  </p>
                  <p className="text-xs text-[#A5AAC0] mt-1">CSV files only</p>
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
                  <span className="text-[#F29F67] flex items-center gap-1.5">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    {loadingStep}
                  </span>
                  <span className="text-[#7C8197]">{uploadProgress}%</span>
                </div>
                <div className="h-1.5 bg-[#E2E5EE] rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-linear-to-r from-[#F29F67] to-[#34B1AA] rounded-full"
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
              className="flex items-center justify-center gap-2 py-2.5 px-4 bg-[#F29F67] hover:bg-[#E8904E] disabled:bg-[#E2E5EE] disabled:text-[#A5AAC0] text-white text-sm font-medium rounded-lg transition-all duration-200 disabled:cursor-not-allowed"
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
              className="flex items-center justify-center gap-2 py-2.5 px-4 bg-[#EEF0F5] hover:bg-[#E2E5EE] disabled:bg-[#E2E5EE] disabled:text-[#A5AAC0] text-[#4A4F63] text-sm font-medium rounded-lg border border-[#E2E5EE] transition-all duration-200 disabled:cursor-not-allowed"
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
              <div className="flex items-center justify-between p-3 bg-[#34B1AA]/10 border border-[#34B1AA]/20 rounded-lg">
                <div className="flex items-start gap-3">
                  <CheckCircle className="w-4 h-4 text-[#34B1AA] mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-[#34B1AA]">
                      Success
                    </p>
                    <p className="text-xs text-[#34B1AA]/70 mt-0.5">
                      {success}
                    </p>
                  </div>
                </div>
                {onNavigate && (
                  <button
                    onClick={() => onNavigate("dashboard")}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs text-[#F29F67] hover:text-[#E8904E] bg-[#F29F67]/10 rounded-lg transition-colors"
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
      <div className="bg-white rounded-xl border border-[#E2E5EE] shadow-sm p-6">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 bg-purple-500/10 rounded-lg flex items-center justify-center shrink-0">
            <FileText className="w-5 h-5 text-purple-500" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-[#1E1E2C] mb-1">
              Generate Analysis Report
            </h3>
            <p className="text-xs text-[#7C8197] mb-3">
              Run comprehensive analysis and download a detailed JSON report
              {file ? " using your uploaded file" : " using sample data"}
            </p>
            <button
              onClick={handleAnalyzeAndDownload}
              disabled={loading || analyzeLoading}
              className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-[#E2E5EE] disabled:text-[#A5AAC0] text-white text-sm font-medium rounded-lg transition-all duration-200 disabled:cursor-not-allowed"
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
      <div className="bg-white rounded-xl border border-[#E2E5EE] shadow-sm p-5">
        <div className="flex items-center gap-2 mb-3">
          <Info className="w-4 h-4 text-[#3B8FF3]" />
          <h4 className="text-sm font-medium text-[#4A4F63]">
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
              className="bg-[#F5F6FA] rounded-lg p-2.5 text-center"
            >
              <code className="text-xs text-[#F29F67] font-mono">
                {item.col}
              </code>
              <p className="text-[10px] text-[#A5AAC0] mt-0.5">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
