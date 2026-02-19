"use client";

import { useState } from "react";
import {
  Search,
  Bell,
  User,
  Shield,
  ChevronDown,
  Activity,
  AlertTriangle,
  CheckCircle,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface HeaderProps {
  totalAlerts?: number;
  onSearch?: (query: string) => void;
}

export default function Header({ totalAlerts = 0, onSearch }: HeaderProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfile, setShowProfile] = useState(false);

  const notifications = [
    {
      id: 1,
      type: "alert",
      message: "High-risk cycle ring detected",
      time: "2 min ago",
      read: false,
    },
    {
      id: 2,
      type: "warning",
      message: "Unusual transaction pattern flagged",
      time: "15 min ago",
      read: false,
    },
    {
      id: 3,
      type: "success",
      message: "Report generated successfully",
      time: "1 hr ago",
      read: true,
    },
  ];

  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch?.(searchQuery);
  };

  return (
    <header className="h-16 glass-strong flex items-center justify-between px-6 z-50 relative border-b border-white/5">
      {/* Logo & Title */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-linear-to-br from-blue-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-blue-500/20">
          <Shield className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-white tracking-tight">
            RIFT<span className="text-blue-400">.</span>
          </h1>
          <p className="text-[10px] text-slate-500 -mt-1 tracking-wider uppercase">
            Fraud Detection
          </p>
        </div>
      </div>

      {/* Search Bar */}
      <form onSubmit={handleSearch} className="flex-1 max-w-md mx-8">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search accounts, transactions..."
            className="w-full pl-10 pr-4 py-2 bg-[#1a2332] border border-white/5 rounded-lg text-sm text-slate-300 placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all"
          />
        </div>
      </form>

      {/* Right Section */}
      <div className="flex items-center gap-2">
        {/* Live Indicator */}
        <div className="flex items-center gap-2 px-3 py-1.5 bg-[#1a2332] rounded-lg mr-2">
          <Activity className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-xs text-slate-400">System Active</span>
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse-live" />
        </div>

        {/* Notifications */}
        <div className="relative">
          <button
            onClick={() => {
              setShowNotifications(!showNotifications);
              setShowProfile(false);
            }}
            className="relative p-2 rounded-lg hover:bg-white/5 transition-colors"
          >
            <Bell className="w-5 h-5 text-slate-400" />
            {(unreadCount > 0 || totalAlerts > 0) && (
              <span className="absolute -top-0.5 -right-0.5 w-4.5 h-4.5 bg-red-500 rounded-full text-[10px] font-bold text-white flex items-center justify-center min-w-4.5 px-1">
                {totalAlerts || unreadCount}
              </span>
            )}
          </button>

          <AnimatePresence>
            {showNotifications && (
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.96 }}
                transition={{ duration: 0.15 }}
                className="absolute right-0 top-12 w-80 bg-[#1a2332] rounded-xl border border-white/10 shadow-2xl overflow-hidden"
              >
                <div className="px-4 py-3 border-b border-white/5">
                  <h3 className="text-sm font-semibold text-white">
                    Notifications
                  </h3>
                </div>
                <div className="max-h-72 overflow-y-auto">
                  {notifications.map((notif) => (
                    <div
                      key={notif.id}
                      className={`px-4 py-3 flex items-start gap-3 hover:bg-white/5 transition-colors border-b border-white/5 last:border-0 ${
                        !notif.read ? "bg-blue-500/5" : ""
                      }`}
                    >
                      {notif.type === "alert" && (
                        <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                      )}
                      {notif.type === "warning" && (
                        <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                      )}
                      {notif.type === "success" && (
                        <CheckCircle className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-300">
                          {notif.message}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {notif.time}
                        </p>
                      </div>
                      {!notif.read && (
                        <span className="w-2 h-2 rounded-full bg-blue-400 mt-1.5 shrink-0" />
                      )}
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Profile */}
        <div className="relative">
          <button
            onClick={() => {
              setShowProfile(!showProfile);
              setShowNotifications(false);
            }}
            className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-white/5 transition-colors"
          >
            <div className="w-8 h-8 rounded-lg bg-linear-to-br from-blue-500 to-purple-500 flex items-center justify-center">
              <User className="w-4 h-4 text-white" />
            </div>
            <span className="text-sm text-slate-300 hidden sm:block">
              Admin
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
          </button>

          <AnimatePresence>
            {showProfile && (
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.96 }}
                transition={{ duration: 0.15 }}
                className="absolute right-0 top-12 w-48 bg-[#1a2332] rounded-xl border border-white/10 shadow-2xl overflow-hidden"
              >
                <div className="py-1">
                  <button className="w-full px-4 py-2 text-sm text-slate-300 hover:bg-white/5 text-left transition-colors">
                    Settings
                  </button>
                  <button className="w-full px-4 py-2 text-sm text-slate-300 hover:bg-white/5 text-left transition-colors">
                    Help
                  </button>
                  <div className="my-1 border-t border-white/5" />
                  <button className="w-full px-4 py-2 text-sm text-red-400 hover:bg-white/5 text-left transition-colors">
                    Sign Out
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Click outside handler */}
      {(showNotifications || showProfile) && (
        <div
          className="fixed inset-0 z-[-1]"
          onClick={() => {
            setShowNotifications(false);
            setShowProfile(false);
          }}
        />
      )}
    </header>
  );
}
