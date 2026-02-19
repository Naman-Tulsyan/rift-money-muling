"use client";

import { motion } from "framer-motion";
import {
  AlertTriangle,
  Shield,
  Users,
  DollarSign,
  TrendingUp,
  ChevronRight,
  ArrowRight,
} from "lucide-react";

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

interface RingDetectionViewProps {
  ringData: RingDetectionResponse;
}

const patternConfig: Record<
  string,
  {
    icon: string;
    label: string;
    color: string;
    bgColor: string;
    borderColor: string;
  }
> = {
  cycle: {
    icon: "🔄",
    label: "Cycle Ring",
    color: "text-red-400",
    bgColor: "bg-red-500/10",
    borderColor: "border-red-500/20",
  },
  smurfing_fan_in: {
    icon: "📥",
    label: "Fan-In Smurfing",
    color: "text-orange-400",
    bgColor: "bg-orange-500/10",
    borderColor: "border-orange-500/20",
  },
  smurfing_fan_out: {
    icon: "📤",
    label: "Fan-Out Smurfing",
    color: "text-amber-400",
    bgColor: "bg-amber-500/10",
    borderColor: "border-amber-500/20",
  },
  layered: {
    icon: "🏗️",
    label: "Layered Network",
    color: "text-purple-400",
    bgColor: "bg-purple-500/10",
    borderColor: "border-purple-500/20",
  },
};

export default function RingDetectionView({
  ringData,
}: RingDetectionViewProps) {
  const stats = ringData.graph_stats;

  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatMini
          label="Total Rings"
          value={ringData.total_rings}
          icon={AlertTriangle}
          color="text-red-400"
          bgColor="bg-red-500/10"
        />
        <StatMini
          label="High Risk"
          value={stats.high_risk_rings}
          icon={Shield}
          color="text-orange-400"
          bgColor="bg-orange-500/10"
        />
        <StatMini
          label="Ring Volume"
          value={`$${stats.total_ring_amount.toLocaleString()}`}
          icon={DollarSign}
          color="text-purple-400"
          bgColor="bg-purple-500/10"
        />
        <StatMini
          label="Avg Risk Score"
          value={`${((stats.average_ring_risk || 0) * 100).toFixed(0)}%`}
          icon={TrendingUp}
          color="text-amber-400"
          bgColor="bg-amber-500/10"
        />
      </div>

      {/* Ring Size Distribution */}
      <div className="bg-[#1a2332] rounded-xl border border-white/5 p-5">
        <h3 className="text-sm font-semibold text-white mb-4">
          Ring Size Distribution
        </h3>
        <div className="grid grid-cols-3 gap-3">
          {[
            { size: "3-member", count: stats.rings_by_size["3_member_rings"] },
            { size: "4-member", count: stats.rings_by_size["4_member_rings"] },
            { size: "5-member", count: stats.rings_by_size["5_member_rings"] },
          ].map((item) => (
            <div
              key={item.size}
              className="bg-[#111827] rounded-lg p-4 text-center"
            >
              <div className="text-2xl font-bold text-white">{item.count}</div>
              <div className="text-xs text-slate-500 mt-1">
                {item.size} rings
              </div>
              <div className="mt-2 h-1 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full"
                  style={{
                    width: `${ringData.total_rings > 0 ? (item.count / ringData.total_rings) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Ring List */}
      <div className="bg-[#1a2332] rounded-xl border border-white/5 overflow-hidden">
        <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">
            Detected Rings ({ringData.suspicious_rings.length})
          </h3>
          <span className="text-xs text-slate-500">Sorted by risk score</span>
        </div>
        <div className="divide-y divide-white/5 max-h-125 overflow-y-auto">
          {ringData.suspicious_rings
            .sort((a, b) => (b.risk_score || 0) - (a.risk_score || 0))
            .map((ring, index) => {
              const config = patternConfig[ring.pattern] || patternConfig.cycle;
              const riskPct = ((ring.risk_score || 0) * 100).toFixed(0);

              return (
                <motion.div
                  key={ring.ring_id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.03 }}
                  className="px-5 py-4 hover:bg-white/2 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-medium ${config.bgColor} ${config.color} border ${config.borderColor}`}
                        >
                          {config.icon} {config.label}
                        </span>
                        <span className="text-xs text-slate-600">
                          {ring.ring_id}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-400">
                        <span className="flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          {ring.members.length} members
                        </span>
                        <span>•</span>
                        <span>${ring.total_amount?.toLocaleString() || 0}</span>
                        <span>•</span>
                        <span>{ring.transaction_count || 0} txns</span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {ring.members.map((m) => (
                          <span
                            key={m}
                            className="px-1.5 py-0.5 text-[10px] font-mono bg-[#111827] text-slate-400 rounded border border-white/5"
                          >
                            {m}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Risk Gauge */}
                    <div className="text-right ml-4">
                      <div
                        className={`text-lg font-bold ${
                          Number(riskPct) >= 70
                            ? "text-red-400"
                            : Number(riskPct) >= 40
                              ? "text-orange-400"
                              : "text-amber-400"
                        }`}
                      >
                        {riskPct}%
                      </div>
                      <div className="text-[10px] text-slate-600">Risk</div>
                      <div className="mt-1 w-16 h-1 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            Number(riskPct) >= 70
                              ? "bg-red-500"
                              : Number(riskPct) >= 40
                                ? "bg-orange-500"
                                : "bg-amber-500"
                          }`}
                          style={{ width: `${riskPct}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
        </div>
      </div>
    </div>
  );
}

function StatMini({
  label,
  value,
  icon: Icon,
  color,
  bgColor,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
  bgColor: string;
}) {
  return (
    <div className="bg-[#1a2332] rounded-xl border border-white/5 p-4">
      <div className="flex items-center gap-3">
        <div
          className={`w-9 h-9 ${bgColor} rounded-lg flex items-center justify-center`}
        >
          <Icon className={`w-4.5 h-4.5 ${color}`} />
        </div>
        <div>
          <div className="text-lg font-bold text-white">{value}</div>
          <div className="text-[10px] text-slate-500 uppercase tracking-wider">
            {label}
          </div>
        </div>
      </div>
    </div>
  );
}
