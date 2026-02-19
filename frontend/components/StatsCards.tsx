"use client";

import { motion } from "framer-motion";
import {
  Users,
  ArrowRightLeft,
  DollarSign,
  AlertTriangle,
  TrendingUp,
  Shield,
  Target,
  Activity,
} from "lucide-react";

interface StatsCardsProps {
  graphStats?: {
    nodes_count: number;
    edges_count: number;
    total_amount: number;
    unique_accounts: number;
  };
  ringStats?: {
    total_rings: number;
    high_risk_rings: number;
    total_ring_amount: number;
    average_ring_risk?: number;
  };
  suspicionStats?: {
    total_accounts: number;
    high_risk: number;
    medium_risk: number;
    low_risk: number;
  };
}

interface StatCardData {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  borderColor: string;
  change?: string;
  changeType?: "up" | "down" | "neutral";
}

export default function StatsCards({
  graphStats,
  ringStats,
  suspicionStats,
}: StatsCardsProps) {
  const cards: StatCardData[] = [
    {
      label: "Total Accounts",
      value: graphStats?.nodes_count ?? "—",
      icon: Users,
      color: "text-[#3B8FF3]",
      bgColor: "bg-[#3B8FF3]/10",
      borderColor: "border-[#3B8FF3]/20",
      change: graphStats ? `${graphStats.unique_accounts} unique` : undefined,
      changeType: "neutral",
    },
    {
      label: "Transactions",
      value: graphStats?.edges_count ?? "—",
      icon: ArrowRightLeft,
      color: "text-[#34B1AA]",
      bgColor: "bg-[#34B1AA]/10",
      borderColor: "border-[#34B1AA]/20",
    },
    {
      label: "Total Volume",
      value: graphStats
        ? `$${graphStats.total_amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
        : "—",
      icon: DollarSign,
      color: "text-emerald-500",
      bgColor: "bg-emerald-500/10",
      borderColor: "border-emerald-500/20",
    },
    {
      label: "Suspicious Rings",
      value: ringStats?.total_rings ?? "—",
      icon: AlertTriangle,
      color:
        ringStats && ringStats.total_rings > 0
          ? "text-red-500"
          : "text-emerald-500",
      bgColor:
        ringStats && ringStats.total_rings > 0
          ? "bg-red-500/10"
          : "bg-emerald-500/10",
      borderColor:
        ringStats && ringStats.total_rings > 0
          ? "border-red-500/20"
          : "border-emerald-500/20",
      change: ringStats ? `${ringStats.high_risk_rings} high risk` : undefined,
      changeType: ringStats && ringStats.high_risk_rings > 0 ? "up" : "neutral",
    },
    {
      label: "High Risk Accounts",
      value: suspicionStats?.high_risk ?? "—",
      icon: Shield,
      color:
        suspicionStats && suspicionStats.high_risk > 0
          ? "text-red-500"
          : "text-emerald-500",
      bgColor:
        suspicionStats && suspicionStats.high_risk > 0
          ? "bg-red-500/10"
          : "bg-emerald-500/10",
      borderColor:
        suspicionStats && suspicionStats.high_risk > 0
          ? "border-red-500/20"
          : "border-emerald-500/20",
    },
    {
      label: "Avg Risk Score",
      value: ringStats?.average_ring_risk
        ? `${(ringStats.average_ring_risk * 100).toFixed(0)}%`
        : "—",
      icon: Target,
      color: "text-[#E0B50F]",
      bgColor: "bg-[#E0B50F]/10",
      borderColor: "border-[#E0B50F]/20",
    },
    {
      label: "Ring Volume",
      value: ringStats
        ? `$${ringStats.total_ring_amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
        : "—",
      icon: TrendingUp,
      color: "text-purple-500",
      bgColor: "bg-purple-500/10",
      borderColor: "border-purple-500/20",
    },
    {
      label: "Flagged Accounts",
      value: suspicionStats?.total_accounts ?? "—",
      icon: Activity,
      color: "text-[#F29F67]",
      bgColor: "bg-[#F29F67]/10",
      borderColor: "border-[#F29F67]/20",
      change: suspicionStats
        ? `${suspicionStats.medium_risk} medium risk`
        : undefined,
      changeType: "neutral",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card, index) => {
        const Icon = card.icon;
        return (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05, duration: 0.3 }}
            className={`card-hover bg-white rounded-xl border ${card.borderColor} p-4 relative overflow-hidden shadow-sm`}
          >
            {/* Background glow */}
            <div
              className={`absolute top-0 right-0 w-24 h-24 ${card.bgColor} rounded-full blur-2xl -translate-y-8 translate-x-8 opacity-50`}
            />

            <div className="relative">
              <div className="flex items-center justify-between mb-3">
                <div
                  className={`w-9 h-9 ${card.bgColor} rounded-lg flex items-center justify-center`}
                >
                  <Icon className={`w-4.5 h-4.5 ${card.color}`} />
                </div>
              </div>
              <div className="text-2xl font-bold text-[#1E1E2C] mb-0.5">
                {card.value}
              </div>
              <div className="text-xs text-[#7C8197]">{card.label}</div>
              {card.change && (
                <div
                  className={`mt-2 text-xs flex items-center gap-1 ${
                    card.changeType === "up"
                      ? "text-red-500"
                      : card.changeType === "down"
                        ? "text-emerald-500"
                        : "text-[#7C8197]"
                  }`}
                >
                  {card.change}
                </div>
              )}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
