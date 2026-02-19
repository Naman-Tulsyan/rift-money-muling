"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Search,
  Filter,
  ArrowUpDown,
  Shield,
  AlertTriangle,
  CheckCircle,
  Users,
} from "lucide-react";

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

interface RiskScoresViewProps {
  suspicionData: SuspicionScoreResponse;
}

export default function RiskScoresView({ suspicionData }: RiskScoresViewProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [riskFilter, setRiskFilter] = useState<
    "all" | "high" | "medium" | "low"
  >("all");
  const [sortBy, setSortBy] = useState<"score" | "rings">("score");
  const [sortAsc, setSortAsc] = useState(false);

  const accounts = suspicionData.suspicious_accounts;

  const highRisk = accounts.filter((a) => a.suspicion_score >= 80).length;
  const mediumRisk = accounts.filter(
    (a) => a.suspicion_score >= 50 && a.suspicion_score < 80,
  ).length;
  const lowRisk = accounts.filter((a) => a.suspicion_score < 50).length;

  const filteredAccounts = accounts
    .filter((a) => {
      if (
        searchQuery &&
        !a.account_id.toLowerCase().includes(searchQuery.toLowerCase())
      )
        return false;
      if (riskFilter === "high" && a.suspicion_score < 80) return false;
      if (
        riskFilter === "medium" &&
        (a.suspicion_score < 50 || a.suspicion_score >= 80)
      )
        return false;
      if (riskFilter === "low" && a.suspicion_score >= 50) return false;
      return true;
    })
    .sort((a, b) => {
      let cmp = 0;
      if (sortBy === "score") cmp = a.suspicion_score - b.suspicion_score;
      else cmp = a.involved_rings.length - b.involved_rings.length;
      return sortAsc ? cmp : -cmp;
    });

  return (
    <div className="space-y-6">
      {/* Distribution Cards */}
      <div className="grid grid-cols-4 gap-4">
        <DistCard
          label="Total Flagged"
          value={accounts.length}
          color="text-[#3B8FF3]"
          bgColor="bg-[#3B8FF3]/10"
          borderColor="border-[#3B8FF3]/20"
          active={riskFilter === "all"}
          onClick={() => setRiskFilter("all")}
        />
        <DistCard
          label="High Risk (≥80)"
          value={highRisk}
          color="text-red-500"
          bgColor="bg-red-500/10"
          borderColor="border-red-500/20"
          active={riskFilter === "high"}
          onClick={() => setRiskFilter(riskFilter === "high" ? "all" : "high")}
        />
        <DistCard
          label="Medium Risk (50-79)"
          value={mediumRisk}
          color="text-[#F29F67]"
          bgColor="bg-[#F29F67]/10"
          borderColor="border-[#F29F67]/20"
          active={riskFilter === "medium"}
          onClick={() =>
            setRiskFilter(riskFilter === "medium" ? "all" : "medium")
          }
        />
        <DistCard
          label="Low Risk (<50)"
          value={lowRisk}
          color="text-[#E0B50F]"
          bgColor="bg-[#E0B50F]/10"
          borderColor="border-[#E0B50F]/20"
          active={riskFilter === "low"}
          onClick={() => setRiskFilter(riskFilter === "low" ? "all" : "low")}
        />
      </div>

      {/* Risk Distribution Bar */}
      <div className="bg-white rounded-xl border border-[#E2E5EE] shadow-sm p-5">
        <h3 className="text-sm font-semibold text-[#1E1E2C] mb-3">
          Risk Distribution
        </h3>
        <div className="flex h-3 rounded-full overflow-hidden bg-[#E2E5EE]">
          {highRisk > 0 && (
            <div
              className="bg-red-500 transition-all duration-500"
              style={{
                width: `${(highRisk / accounts.length) * 100}%`,
              }}
            />
          )}
          {mediumRisk > 0 && (
            <div
              className="bg-orange-500 transition-all duration-500"
              style={{
                width: `${(mediumRisk / accounts.length) * 100}%`,
              }}
            />
          )}
          {lowRisk > 0 && (
            <div
              className="bg-amber-500 transition-all duration-500"
              style={{
                width: `${(lowRisk / accounts.length) * 100}%`,
              }}
            />
          )}
        </div>
        <div className="flex items-center justify-between mt-2 text-xs text-[#7C8197]">
          <span>{((highRisk / accounts.length) * 100).toFixed(0)}% High</span>
          <span>
            {((mediumRisk / accounts.length) * 100).toFixed(0)}% Medium
          </span>
          <span>{((lowRisk / accounts.length) * 100).toFixed(0)}% Low</span>
        </div>
      </div>

      {/* Scoring Info */}
      <div className="bg-[#3B8FF3]/5 border border-[#3B8FF3]/10 rounded-xl px-5 py-3">
        <p className="text-xs text-[#3B8FF3]/80">
          <strong>Scoring:</strong> Based on ring membership (pattern type),
          transaction velocity, and merchant status. Score range: 0-100.
        </p>
      </div>

      {/* Account Table */}
      <div className="bg-white rounded-xl border border-[#E2E5EE] shadow-sm overflow-hidden">
        {/* Table Controls */}
        <div className="px-5 py-3 border-b border-[#E2E5EE] flex items-center justify-between gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A5AAC0]" />
            <input
              type="text"
              placeholder="Search accounts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-[#F5F6FA] border border-[#E2E5EE] rounded-lg text-sm text-[#1E1E2C] placeholder:text-[#A5AAC0] focus:outline-none focus:border-[#F29F67]/30 transition-colors"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (sortBy === "score") setSortAsc(!sortAsc);
                else {
                  setSortBy("score");
                  setSortAsc(false);
                }
              }}
              className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                sortBy === "score"
                  ? "bg-[#F29F67]/10 border-[#F29F67]/20 text-[#F29F67]"
                  : "border-[#E2E5EE] text-[#7C8197] hover:bg-[#F5F6FA]"
              }`}
            >
              <ArrowUpDown className="w-3 h-3 inline mr-1" />
              Score {sortBy === "score" ? (sortAsc ? "↑" : "↓") : ""}
            </button>
            <button
              onClick={() => {
                if (sortBy === "rings") setSortAsc(!sortAsc);
                else {
                  setSortBy("rings");
                  setSortAsc(false);
                }
              }}
              className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                sortBy === "rings"
                  ? "bg-[#F29F67]/10 border-[#F29F67]/20 text-[#F29F67]"
                  : "border-[#E2E5EE] text-[#7C8197] hover:bg-[#F5F6FA]"
              }`}
            >
              <ArrowUpDown className="w-3 h-3 inline mr-1" />
              Rings {sortBy === "rings" ? (sortAsc ? "↑" : "↓") : ""}
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="max-h-125 overflow-y-auto">
          <table className="w-full data-table">
            <thead className="sticky top-0 z-10">
              <tr>
                <th className="px-5 py-3 text-left">Account ID</th>
                <th className="px-5 py-3 text-left">Suspicion Score</th>
                <th className="px-5 py-3 text-left">Risk Level</th>
                <th className="px-5 py-3 text-left">Type</th>
                <th className="px-5 py-3 text-left">Involved Rings</th>
              </tr>
            </thead>
            <tbody>
              {filteredAccounts.map((account, index) => (
                <motion.tr
                  key={account.account_id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: index * 0.02 }}
                  className="hover:bg-[#F8F9FC] transition-colors"
                >
                  <td className="px-5 py-3">
                    <span className="text-sm font-mono text-[#1E1E2C]">
                      {account.account_id}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-1.5 bg-[#E2E5EE] rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            account.suspicion_score >= 80
                              ? "bg-red-500"
                              : account.suspicion_score >= 50
                                ? "bg-orange-500"
                                : "bg-amber-500"
                          }`}
                          style={{
                            width: `${Math.min(100, account.suspicion_score)}%`,
                          }}
                        />
                      </div>
                      <span className="text-sm font-medium text-[#1E1E2C] w-8">
                        {account.suspicion_score}
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold ${
                        account.suspicion_score >= 80
                          ? "bg-red-500/15 text-red-400"
                          : account.suspicion_score >= 50
                            ? "bg-orange-500/15 text-orange-400"
                            : "bg-amber-500/15 text-amber-400"
                      }`}
                    >
                      {account.suspicion_score >= 80
                        ? "HIGH"
                        : account.suspicion_score >= 50
                          ? "MEDIUM"
                          : "LOW"}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={`text-xs ${
                        account.is_merchant
                          ? "text-purple-500"
                          : "text-[#7C8197]"
                      }`}
                    >
                      {account.is_merchant ? "🏪 Merchant" : "👤 Individual"}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    {account.involved_rings.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {account.involved_rings.map((ringId) => (
                          <span
                            key={ringId}
                            className="px-1.5 py-0.5 text-[10px] font-mono bg-[#F5F6FA] text-[#5A5F72] rounded border border-[#E2E5EE]"
                          >
                            {ringId}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-[#A5AAC0]">—</span>
                    )}
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[#E2E5EE] text-xs text-[#A5AAC0]">
          Showing {filteredAccounts.length} of {accounts.length} accounts
        </div>
      </div>
    </div>
  );
}

function DistCard({
  label,
  value,
  color,
  bgColor,
  borderColor,
  active,
  onClick,
}: {
  label: string;
  value: number;
  color: string;
  bgColor: string;
  borderColor: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`bg-white rounded-xl border p-4 text-left transition-all duration-200 shadow-sm ${
        active
          ? `${borderColor} ${bgColor}`
          : "border-[#E2E5EE] hover:border-[#D0D4DE]"
      }`}
    >
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-[10px] text-[#7C8197] mt-0.5">{label}</div>
    </button>
  );
}
