"use client";

import { useState } from "react";
import {
  Upload,
  BarChart3,
  Network,
  AlertTriangle,
  FileText,
  Settings,
  HelpCircle,
  ChevronLeft,
  ChevronRight,
  Database,
} from "lucide-react";
import { motion } from "framer-motion";

type ViewType =
  | "dashboard"
  | "upload"
  | "graph"
  | "rings"
  | "scores"
  | "report";

interface SidebarProps {
  currentView: ViewType;
  onViewChange: (view: ViewType) => void;
  hasData: boolean;
}

const navItems = [
  {
    id: "dashboard" as ViewType,
    label: "Dashboard",
    icon: BarChart3,
    description: "Overview & Stats",
  },
  {
    id: "upload" as ViewType,
    label: "Upload Data",
    icon: Upload,
    description: "Import CSV",
  },
  {
    id: "graph" as ViewType,
    label: "Graph View",
    icon: Network,
    description: "Transaction Network",
    requiresData: true,
  },
  {
    id: "rings" as ViewType,
    label: "Ring Detection",
    icon: AlertTriangle,
    description: "Suspicious Patterns",
    requiresData: true,
  },
  {
    id: "scores" as ViewType,
    label: "Risk Scores",
    icon: BarChart3,
    description: "Account Analysis",
    requiresData: true,
  },
  {
    id: "report" as ViewType,
    label: "Reports",
    icon: FileText,
    description: "Generate & Export",
  },
];

export default function Sidebar({
  currentView,
  onViewChange,
  hasData,
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <motion.aside
      animate={{ width: collapsed ? 64 : 240 }}
      transition={{ duration: 0.2, ease: "easeInOut" }}
      className="h-full glass-strong border-r border-white/5 flex flex-col relative"
    >
      {/* Toggle Button */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-6 w-6 h-6 rounded-full bg-[#243044] border border-white/10 flex items-center justify-center hover:bg-[#2d4a6f] transition-colors z-10"
      >
        {collapsed ? (
          <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
        ) : (
          <ChevronLeft className="w-3.5 h-3.5 text-slate-400" />
        )}
      </button>

      {/* Navigation */}
      <nav className="flex-1 pt-4 px-2 space-y-1">
        {navItems.map((item) => {
          const isDisabled = item.requiresData && !hasData;
          const isActive = currentView === item.id;
          const Icon = item.icon;

          return (
            <button
              key={item.id}
              onClick={() => !isDisabled && onViewChange(item.id)}
              disabled={isDisabled}
              className={`
                w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group relative
                ${
                  isActive
                    ? "bg-blue-500/15 text-blue-400 border border-blue-500/20"
                    : isDisabled
                      ? "text-slate-600 cursor-not-allowed"
                      : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
                }
              `}
              title={collapsed ? item.label : undefined}
            >
              {isActive && (
                <motion.div
                  layoutId="activeIndicator"
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-6 bg-blue-400 rounded-r"
                  transition={{ duration: 0.2 }}
                />
              )}
              <Icon
                className={`w-5 h-5 shrink-0 ${isActive ? "text-blue-400" : ""}`}
              />
              {!collapsed && (
                <div className="flex-1 text-left min-w-0">
                  <div className="text-sm font-medium truncate">
                    {item.label}
                  </div>
                  <div className="text-[10px] text-slate-600 truncate">
                    {item.description}
                  </div>
                </div>
              )}
              {isDisabled && !collapsed && (
                <span className="text-[9px] text-slate-600 bg-slate-800 px-1.5 py-0.5 rounded">
                  Need data
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Bottom Section */}
      <div className="p-2 space-y-1 border-t border-white/5">
        {!collapsed && (
          <div className="px-3 py-2 mb-2">
            <div className="flex items-center gap-2 text-slate-500">
              <Database className="w-3.5 h-3.5" />
              <span className="text-[10px] uppercase tracking-wider">
                {hasData ? "Data Loaded" : "No Data"}
              </span>
            </div>
            <div className="mt-1.5 h-1 bg-slate-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  hasData
                    ? "w-full bg-linear-to-r from-blue-500 to-cyan-400"
                    : "w-0"
                }`}
              />
            </div>
          </div>
        )}
        <button
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-slate-500 hover:bg-white/5 hover:text-slate-300 transition-colors"
          title={collapsed ? "Settings" : undefined}
        >
          <Settings className="w-4 h-4 shrink-0" />
          {!collapsed && <span className="text-sm">Settings</span>}
        </button>
        <button
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-slate-500 hover:bg-white/5 hover:text-slate-300 transition-colors"
          title={collapsed ? "Help" : undefined}
        >
          <HelpCircle className="w-4 h-4 shrink-0" />
          {!collapsed && <span className="text-sm">Help</span>}
        </button>
      </div>
    </motion.aside>
  );
}
