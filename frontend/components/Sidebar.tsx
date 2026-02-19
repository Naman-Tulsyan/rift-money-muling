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
      className="h-full glass-strong border-r border-[#E2E5EE] flex flex-col relative"
    >
      {/* Toggle Button */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-6 w-6 h-6 rounded-full bg-white border border-[#E2E5EE] shadow-sm flex items-center justify-center hover:bg-[#F5F6FA] transition-colors z-10"
      >
        {collapsed ? (
          <ChevronRight className="w-3.5 h-3.5 text-[#5A5F72]" />
        ) : (
          <ChevronLeft className="w-3.5 h-3.5 text-[#5A5F72]" />
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
                    ? "bg-[#F29F67]/10 text-[#F29F67] border border-[#F29F67]/25"
                    : isDisabled
                      ? "text-[#C0C4D6] cursor-not-allowed"
                      : "text-[#5A5F72] hover:bg-[#F0F1F5] hover:text-[#1E1E2C]"
                }
              `}
              title={collapsed ? item.label : undefined}
            >
              {isActive && (
                <motion.div
                  layoutId="activeIndicator"
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-6 bg-[#F29F67] rounded-r"
                  transition={{ duration: 0.2 }}
                />
              )}
              <Icon
                className={`w-5 h-5 shrink-0 ${isActive ? "text-[#F29F67]" : ""}`}
              />
              {!collapsed && (
                <div className="flex-1 text-left min-w-0">
                  <div className="text-sm font-medium truncate">
                    {item.label}
                  </div>
                  <div className="text-[10px] text-[#A5AAC0] truncate">
                    {item.description}
                  </div>
                </div>
              )}
              {isDisabled && !collapsed && (
                <span className="text-[9px] text-[#A5AAC0] bg-[#EEF0F5] px-1.5 py-0.5 rounded">
                  Need data
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Bottom Section */}
      <div className="p-2 space-y-1 border-t border-[#E2E5EE]">
        {!collapsed && (
          <div className="px-3 py-2 mb-2">
            <div className="flex items-center gap-2 text-[#7C8197]">
              <Database className="w-3.5 h-3.5" />
              <span className="text-[10px] uppercase tracking-wider">
                {hasData ? "Data Loaded" : "No Data"}
              </span>
            </div>
            <div className="mt-1.5 h-1 bg-[#E2E5EE] rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  hasData
                    ? "w-full bg-linear-to-r from-[#F29F67] to-[#34B1AA]"
                    : "w-0"
                }`}
              />
            </div>
          </div>
        )}
        <button
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[#7C8197] hover:bg-[#F0F1F5] hover:text-[#4A4F63] transition-colors"
          title={collapsed ? "Settings" : undefined}
        >
          <Settings className="w-4 h-4 shrink-0" />
          {!collapsed && <span className="text-sm">Settings</span>}
        </button>
        <button
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[#7C8197] hover:bg-[#F0F1F5] hover:text-[#4A4F63] transition-colors"
          title={collapsed ? "Help" : undefined}
        >
          <HelpCircle className="w-4 h-4 shrink-0" />
          {!collapsed && <span className="text-sm">Help</span>}
        </button>
      </div>
    </motion.aside>
  );
}
