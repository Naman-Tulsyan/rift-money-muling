"use client";

import { useState, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";
import StatsCards from "@/components/StatsCards";
import CSVUpload from "@/components/CSVUploadNew";
import GraphVisualizationNew from "@/components/GraphVisualizationNew";
import RingDetectionView from "@/components/RingDetectionView";
import RiskScoresView from "@/components/RiskScoresView";
import {
  BarChart3,
  Upload,
  Network,
  AlertTriangle,
  Shield,
  FileText,
  Download,
  Loader2,
  ArrowRight,
} from "lucide-react";

type ViewType =
  | "dashboard"
  | "upload"
  | "graph"
  | "rings"
  | "scores"
  | "report";

interface UploadResponse {
  success: boolean;
  message: string;
  total_rows: number;
  valid_transactions: Array<{
    transaction_id: string;
    sender_id: string;
    receiver_id: string;
    amount: number;
    timestamp: string;
  }>;
  errors: Array<{ row: number; error: string; data: Record<string, unknown> }>;
}

interface GraphResponse {
  success: boolean;
  message: string;
  graph: {
    nodes: Array<{ id: string }>;
    edges: Array<{
      id: string;
      source: string;
      target: string;
      amount: number;
      timestamp: string;
    }>;
  };
  stats: {
    nodes_count: number;
    edges_count: number;
    total_amount: number;
    unique_accounts: number;
  };
}

interface RingDetectionResponse {
  success: boolean;
  message: string;
  total_rings: number;
  suspicious_rings: Array<{
    ring_id: string;
    members: Array<string>;
    pattern: string;
    risk_score?: number;
    total_amount?: number;
    transaction_count?: number;
  }>;
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

interface SuspicionScoreResponse {
  success: boolean;
  message: string;
  total_accounts: number;
  suspicious_accounts: Array<{
    account_id: string;
    suspicion_score: number;
    involved_rings: string[];
    is_merchant: boolean;
  }>;
  merchant_accounts: Record<string, boolean>;
}

export default function Home() {
  const [currentView, setCurrentView] = useState<ViewType>("dashboard");
  const [response, setResponse] = useState<UploadResponse | null>(null);
  const [graphData, setGraphData] = useState<GraphResponse | null>(null);
  const [ringData, setRingData] = useState<RingDetectionResponse | null>(null);
  const [suspicionData, setSuspicionData] =
    useState<SuspicionScoreResponse | null>(null);
  const [analyzeLoading, setAnalyzeLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  const hasData = !!(graphData || ringData || suspicionData);

  const handleDataLoaded = useCallback(
    (data: {
      response: UploadResponse | null;
      graphData: GraphResponse | null;
      ringData: RingDetectionResponse | null;
      suspicionData: SuspicionScoreResponse | null;
    }) => {
      setResponse(data.response);
      setGraphData(data.graphData);
      setRingData(data.ringData);
      setSuspicionData(data.suspicionData);
      setCurrentView("dashboard");
    },
    [],
  );

  const handleGenerateReport = async () => {
    setAnalyzeLoading(true);
    setReportError(null);
    try {
      const analyzeResponse = await fetch(
        "https://rift-money-muling-seven.vercel.app//analyze",
        {
          method: "POST",
        },
      );
      if (!analyzeResponse.ok) {
        const errorData = await analyzeResponse.json();
        throw new Error(errorData.detail || "Analysis failed");
      }

      const downloadResponse = await fetch(
        "https://rift-money-muling-seven.vercel.app//download-report",
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
    } catch (err) {
      setReportError(err instanceof Error ? err.message : "Report failed");
    } finally {
      setAnalyzeLoading(false);
    }
  };

  const suspicionStats = suspicionData
    ? {
        total_accounts: suspicionData.total_accounts,
        high_risk: suspicionData.suspicious_accounts.filter(
          (a) => a.suspicion_score >= 80,
        ).length,
        medium_risk: suspicionData.suspicious_accounts.filter(
          (a) => a.suspicion_score >= 50 && a.suspicion_score < 80,
        ).length,
        low_risk: suspicionData.suspicious_accounts.filter(
          (a) => a.suspicion_score < 50,
        ).length,
      }
    : undefined;

  const totalAlerts =
    (ringData?.graph_stats.high_risk_rings || 0) +
    (suspicionStats?.high_risk || 0);

  const renderContent = () => {
    switch (currentView) {
      case "upload":
        return (
          <div className="max-w-2xl mx-auto">
            <CSVUpload
              onDataLoaded={handleDataLoaded}
              onNavigate={(view) => setCurrentView(view as ViewType)}
            />
          </div>
        );

      case "graph":
        if (!graphData)
          return (
            <EmptyState
              view="graph"
              onNavigate={() => setCurrentView("upload")}
            />
          );
        return (
          <GraphVisualizationNew
            graphData={graphData.graph}
            stats={graphData.stats}
            suspiciousRings={ringData?.suspicious_rings}
            suspicionScores={suspicionData?.suspicious_accounts}
            merchantAccounts={suspicionData?.merchant_accounts}
          />
        );

      case "rings":
        if (!ringData)
          return (
            <EmptyState
              view="rings"
              onNavigate={() => setCurrentView("upload")}
            />
          );
        return <RingDetectionView ringData={ringData} />;

      case "scores":
        if (!suspicionData)
          return (
            <EmptyState
              view="scores"
              onNavigate={() => setCurrentView("upload")}
            />
          );
        return <RiskScoresView suspicionData={suspicionData} />;

      case "report":
        return (
          <div className="max-w-xl mx-auto">
            <div className="bg-white rounded-xl border border-[#E2E5EE] shadow-sm p-8 text-center">
              <div className="w-16 h-16 mx-auto bg-purple-500/10 rounded-2xl flex items-center justify-center mb-4">
                <FileText className="w-8 h-8 text-purple-500" />
              </div>
              <h2 className="text-xl font-bold text-[#1E1E2C] mb-2">
                Generate Analysis Report
              </h2>
              <p className="text-sm text-[#7C8197] mb-6 max-w-sm mx-auto">
                Run comprehensive fraud detection analysis and download a
                detailed JSON report with all findings
              </p>
              <button
                onClick={handleGenerateReport}
                disabled={analyzeLoading}
                className="inline-flex items-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-500 disabled:bg-[#E2E5EE] disabled:text-[#A5AAC0] text-white font-medium rounded-xl transition-all duration-200 disabled:cursor-not-allowed"
              >
                {analyzeLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Generating Report...
                  </>
                ) : (
                  <>
                    <Download className="w-5 h-5" />
                    Generate & Download Report
                  </>
                )}
              </button>
              {reportError && (
                <p className="mt-4 text-sm text-red-500">{reportError}</p>
              )}
            </div>
          </div>
        );

      case "dashboard":
      default:
        return (
          <div className="space-y-6">
            {/* Stats */}
            <StatsCards
              graphStats={graphData?.stats}
              ringStats={
                ringData
                  ? {
                      total_rings: ringData.total_rings,
                      ...ringData.graph_stats,
                    }
                  : undefined
              }
              suspicionStats={suspicionStats}
            />

            {/* Quick Actions / Content */}
            {hasData ? (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Graph Preview */}
                <div className="lg:col-span-2">
                  <div className="bg-white rounded-xl border border-[#E2E5EE] shadow-sm overflow-hidden">
                    <div className="px-5 py-3 border-b border-[#E2E5EE] flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-[#1E1E2C] flex items-center gap-2">
                        <Network className="w-4 h-4 text-[#3B8FF3]" />
                        Transaction Network
                      </h3>
                      <button
                        onClick={() => setCurrentView("graph")}
                        className="text-xs text-[#F29F67] hover:text-[#E8904E] flex items-center gap-1 transition-colors"
                      >
                        Full View <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                    {graphData && (
                      <div className="h-100">
                        <GraphVisualizationNew
                          graphData={graphData.graph}
                          stats={graphData.stats}
                          suspiciousRings={ringData?.suspicious_rings}
                          suspicionScores={suspicionData?.suspicious_accounts}
                          merchantAccounts={suspicionData?.merchant_accounts}
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* Sidebar Panels */}
                <div className="space-y-4">
                  {/* Top Risks */}
                  <div className="bg-white rounded-xl border border-[#E2E5EE] shadow-sm p-5">
                    <h3 className="text-sm font-semibold text-[#1E1E2C] flex items-center gap-2 mb-4">
                      <Shield className="w-4 h-4 text-red-500" />
                      Top Risk Accounts
                    </h3>
                    <div className="space-y-3">
                      {suspicionData?.suspicious_accounts
                        .sort((a, b) => b.suspicion_score - a.suspicion_score)
                        .slice(0, 5)
                        .map((account) => (
                          <div
                            key={account.account_id}
                            className="flex items-center justify-between"
                          >
                            <span className="text-xs font-mono text-[#4A4F63]">
                              {account.account_id}
                            </span>
                            <div className="flex items-center gap-2">
                              <div className="w-16 h-1 bg-[#E2E5EE] rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${
                                    account.suspicion_score >= 80
                                      ? "bg-red-500"
                                      : account.suspicion_score >= 50
                                        ? "bg-orange-500"
                                        : "bg-amber-500"
                                  }`}
                                  style={{
                                    width: `${account.suspicion_score}%`,
                                  }}
                                />
                              </div>
                              <span
                                className={`text-xs font-bold w-6 text-right ${
                                  account.suspicion_score >= 80
                                    ? "text-red-500"
                                    : account.suspicion_score >= 50
                                      ? "text-orange-500"
                                      : "text-amber-500"
                                }`}
                              >
                                {account.suspicion_score}
                              </span>
                            </div>
                          </div>
                        )) || (
                        <p className="text-xs text-[#A5AAC0]">
                          No accounts scored
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => setCurrentView("scores")}
                      className="w-full mt-4 py-2 text-xs text-[#F29F67] hover:text-[#E8904E] bg-[#F29F67]/5 hover:bg-[#F29F67]/10 rounded-lg transition-colors"
                    >
                      View All Scores →
                    </button>
                  </div>

                  {/* Recent Rings */}
                  <div className="bg-white rounded-xl border border-[#E2E5EE] shadow-sm p-5">
                    <h3 className="text-sm font-semibold text-[#1E1E2C] flex items-center gap-2 mb-4">
                      <AlertTriangle className="w-4 h-4 text-[#E0B50F]" />
                      Recent Rings
                    </h3>
                    <div className="space-y-2">
                      {ringData?.suspicious_rings.slice(0, 4).map((ring) => (
                        <div
                          key={ring.ring_id}
                          className="flex items-center justify-between px-3 py-2 bg-[#F5F6FA] rounded-lg"
                        >
                          <div>
                            <span className="text-xs text-[#5A5F72]">
                              {ring.pattern === "cycle" && "🔄"}
                              {ring.pattern === "smurfing_fan_in" && "📥"}
                              {ring.pattern === "smurfing_fan_out" && "📤"}
                              {ring.pattern === "layered" && "🏗️"}{" "}
                              {ring.members.length} members
                            </span>
                          </div>
                          <span
                            className={`text-xs font-bold ${
                              (ring.risk_score || 0) >= 0.7
                                ? "text-red-500"
                                : "text-amber-500"
                            }`}
                          >
                            {((ring.risk_score || 0) * 100).toFixed(0)}%
                          </span>
                        </div>
                      )) || (
                        <p className="text-xs text-[#A5AAC0]">
                          No rings detected
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => setCurrentView("rings")}
                      className="w-full mt-4 py-2 text-xs text-[#F29F67] hover:text-[#E8904E] bg-[#F29F67]/5 hover:bg-[#F29F67]/10 rounded-lg transition-colors"
                    >
                      View All Rings →
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              /* Empty State */
              <div className="bg-white rounded-xl border border-[#E2E5EE] shadow-sm p-12 text-center">
                <div className="w-20 h-20 mx-auto bg-[#F29F67]/10 rounded-2xl flex items-center justify-center mb-5">
                  <Upload className="w-10 h-10 text-[#F29F67]" />
                </div>
                <h2 className="text-xl font-bold text-[#1E1E2C] mb-2">
                  Welcome to RIFT
                </h2>
                <p className="text-sm text-[#7C8197] mb-6 max-w-md mx-auto">
                  Upload transaction data or load sample data to start detecting
                  money muling patterns and suspicious activities
                </p>
                <div className="flex items-center justify-center gap-3">
                  <button
                    onClick={() => setCurrentView("upload")}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#F29F67] hover:bg-[#E8904E] text-white text-sm font-medium rounded-xl transition-all duration-200"
                  >
                    <Upload className="w-4 h-4" />
                    Upload CSV
                  </button>
                  <button
                    onClick={async () => {
                      try {
                        const [graphRes, ringRes, scoreRes] = await Promise.all(
                          [
                            fetch(
                              "https://rift-money-muling-seven.vercel.app//graph-data/existing",
                            ),
                            fetch(
                              "https://rift-money-muling-seven.vercel.app//detect-rings/existing",
                            ),
                            fetch(
                              "https://rift-money-muling-seven.vercel.app//suspicion-scores/existing",
                            ),
                          ],
                        );

                        const gd: GraphResponse | null = graphRes.ok
                          ? await graphRes.json()
                          : null;
                        const rd: RingDetectionResponse | null = ringRes.ok
                          ? await ringRes.json()
                          : null;
                        const sd: SuspicionScoreResponse | null = scoreRes.ok
                          ? await scoreRes.json()
                          : null;

                        handleDataLoaded({
                          response: null,
                          graphData: gd,
                          ringData: rd,
                          suspicionData: sd,
                        });
                      } catch {
                        // Silent fail
                      }
                    }}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#EEF0F5] hover:bg-[#E2E5EE] text-[#4A4F63] text-sm font-medium rounded-xl border border-[#E2E5EE] transition-all duration-200"
                  >
                    <BarChart3 className="w-4 h-4" />
                    Load Sample Data
                  </button>
                </div>
              </div>
            )}
          </div>
        );
    }
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <Header totalAlerts={totalAlerts} />
      <div className="flex-1 flex overflow-hidden">
        <Sidebar
          currentView={currentView}
          onViewChange={setCurrentView}
          hasData={hasData}
        />
        <main className="flex-1 overflow-y-auto p-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentView}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {/* View Header */}
              <div className="mb-6">
                <h2 className="text-xl font-bold text-[#1E1E2C]">
                  {currentView === "dashboard" && "Dashboard"}
                  {currentView === "upload" && "Upload Data"}
                  {currentView === "graph" && "Transaction Graph"}
                  {currentView === "rings" && "Ring Detection"}
                  {currentView === "scores" && "Risk Scores"}
                  {currentView === "report" && "Reports"}
                </h2>
                <p className="text-sm text-[#7C8197] mt-0.5">
                  {currentView === "dashboard" &&
                    "Overview of fraud detection analytics"}
                  {currentView === "upload" &&
                    "Import transaction CSV files for analysis"}
                  {currentView === "graph" &&
                    "Interactive network visualization of transactions"}
                  {currentView === "rings" &&
                    "Detected suspicious ring patterns"}
                  {currentView === "scores" &&
                    "Per-account risk assessment scores"}
                  {currentView === "report" &&
                    "Generate and export analysis reports"}
                </p>
              </div>

              {renderContent()}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}

function EmptyState({
  view,
  onNavigate,
}: {
  view: string;
  onNavigate: () => void;
}) {
  return (
    <div className="bg-white rounded-xl border border-[#E2E5EE] shadow-sm p-12 text-center">
      <div className="w-16 h-16 mx-auto bg-[#EEF0F5] rounded-2xl flex items-center justify-center mb-4">
        <Upload className="w-8 h-8 text-[#A5AAC0]" />
      </div>
      <h3 className="text-lg font-bold text-[#1E1E2C] mb-2">
        No Data Available
      </h3>
      <p className="text-sm text-[#7C8197] mb-5">
        Upload transaction data first to view {view} analysis
      </p>
      <button
        onClick={onNavigate}
        className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#F29F67] hover:bg-[#E8904E] text-white text-sm font-medium rounded-xl transition-all duration-200"
      >
        <Upload className="w-4 h-4" />
        Upload Data
      </button>
    </div>
  );
}
