"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import cytoscape, { Core, EdgeDefinition, NodeDefinition } from "cytoscape";
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  RotateCcw,
  Eye,
  EyeOff,
  Filter,
  Layers,
  Target,
  Info,
  X,
} from "lucide-react";

interface GraphNode {
  id: string;
}

interface GraphEdge {
  id: string;
  source: string;
  target: string;
  amount: number;
  timestamp: string;
}

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

interface SuspiciousRing {
  ring_id: string;
  members: Array<string>;
  pattern: string;
  risk_score?: number;
  total_amount?: number;
  transaction_count?: number;
}

interface SuspiciousAccount {
  account_id: string;
  suspicion_score: number;
  involved_rings: string[];
  is_merchant: boolean;
}

interface GraphVisualizationProps {
  graphData: GraphData;
  suspiciousRings?: Array<SuspiciousRing>;
  suspicionScores?: SuspiciousAccount[];
  merchantAccounts?: Record<string, boolean>;
  stats?: {
    nodes_count: number;
    edges_count: number;
    total_amount: number;
    unique_accounts: number;
  };
}

export default function GraphVisualizationNew({
  graphData,
  stats,
  suspiciousRings,
  suspicionScores,
  merchantAccounts,
}: GraphVisualizationProps) {
  const cyRef = useRef<HTMLDivElement>(null);
  const cyInstance = useRef<Core | null>(null);
  const [selectedElement, setSelectedElement] = useState<any>(null);
  const [layoutType, setLayoutType] = useState<
    "cose" | "circle" | "grid" | "breadthfirst" | "concentric"
  >("cose");
  const [showCycles, setShowCycles] = useState(true);
  const [showLayering, setShowLayering] = useState(true);
  const [showSmurfing, setShowSmurfing] = useState(true);
  const [showLabels, setShowLabels] = useState(false);
  const [riskFilter, setRiskFilter] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (!cyRef.current || !graphData) return;

    const cycleMembers = new Set<string>();
    const fanInMembers = new Set<string>();
    const fanOutMembers = new Set<string>();
    const layeredMembers = new Set<string>();
    const highRiskMembers = new Set<string>();
    const riskScores: Record<string, number> = {};

    if (suspiciousRings) {
      suspiciousRings.forEach((ring) => {
        ring.members.forEach((member) => {
          const score = ring.risk_score || 0;
          riskScores[member] = Math.max(riskScores[member] || 0, score);
          switch (ring.pattern) {
            case "cycle":
              cycleMembers.add(member);
              break;
            case "smurfing_fan_in":
              fanInMembers.add(member);
              break;
            case "smurfing_fan_out":
              fanOutMembers.add(member);
              break;
            case "layered":
              layeredMembers.add(member);
              break;
          }
          if (score > 0.7) highRiskMembers.add(member);
        });
      });
    }

    // Also include suspicion scores
    if (suspicionScores) {
      suspicionScores.forEach((account) => {
        riskScores[account.account_id] = Math.max(
          riskScores[account.account_id] || 0,
          account.suspicion_score / 100,
        );
      });
    }

    const nodes: NodeDefinition[] = graphData.nodes
      .filter((node) => (riskScores[node.id] || 0) >= riskFilter / 100)
      .map((node) => {
        const isCycleMember = cycleMembers.has(node.id);
        const isFanInMember = fanInMembers.has(node.id);
        const isFanOutMember = fanOutMembers.has(node.id);
        const isLayeredMember = layeredMembers.has(node.id);
        const isHighRisk = highRiskMembers.has(node.id);
        const isMerchant = merchantAccounts?.[node.id] || false;
        const score = riskScores[node.id] || 0;

        // Determine node size based on score
        const baseSize = 35;
        const sizeBoost = score * 25;

        return {
          data: {
            id: node.id,
            label: node.id,
            riskScore: Math.round(score * 100),
            nodeSize: baseSize + sizeBoost,
            ...(isCycleMember && showCycles && { isCycleMember: true }),
            ...(isFanInMember && showSmurfing && { isFanInMember: true }),
            ...(isFanOutMember && showSmurfing && { isFanOutMember: true }),
            ...(isLayeredMember && showLayering && { isLayeredMember: true }),
            ...(isHighRisk && { isHighRisk: true }),
            ...(isMerchant && { isMerchant: true }),
          },
        };
      });

    const nodeIds = new Set(nodes.map((n) => n.data.id));

    const edges: EdgeDefinition[] = graphData.edges
      .filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target))
      .map((edge) => {
        const isSuspiciousEdge =
          (showCycles &&
            cycleMembers.has(edge.source) &&
            cycleMembers.has(edge.target)) ||
          (showSmurfing &&
            fanInMembers.has(edge.source) &&
            fanInMembers.has(edge.target)) ||
          (showSmurfing &&
            fanOutMembers.has(edge.source) &&
            fanOutMembers.has(edge.target)) ||
          (showLayering &&
            layeredMembers.has(edge.source) &&
            layeredMembers.has(edge.target));

        return {
          data: {
            id: edge.id,
            source: edge.source,
            target: edge.target,
            amount: edge.amount,
            timestamp: edge.timestamp,
            weight: Math.log10(edge.amount + 1),
            ...(isSuspiciousEdge && { isSuspiciousEdge: true }),
          },
        };
      });

    cyInstance.current = cytoscape({
      container: cyRef.current,
      elements: [...nodes, ...edges],
      style: [
        {
          selector: "node",
          style: {
            "background-color": "#3B8FF3",
            label: showLabels ? "data(label)" : "",
            "text-valign": "bottom",
            "text-halign": "center",
            color: "#5A5F72",
            "font-size": "9px",
            "font-weight": "500",
            width: "data(nodeSize)",
            height: "data(nodeSize)",
            "border-width": "2px",
            "border-color": "#2B7AD4",
            "text-margin-y": 8,
            "text-background-color": "rgba(255, 255, 255, 0.85)",
            "text-background-opacity": 1,
            "text-background-padding": "3px",
            "text-background-shape": "roundrectangle",
            "min-zoomed-font-size": 8,
            "overlay-opacity": 0,
          } as any,
        },
        {
          selector: "node:hover",
          style: {
            label: "data(label)",
            "border-width": "3px",
            "z-index": 999,
            "text-opacity": 1,
          },
        },
        {
          selector: "node:selected",
          style: {
            "border-color": "#F29F67",
            "border-width": "4px",
            label: "data(label)",
            "z-index": 999,
          },
        },
        // Risk score label
        {
          selector: "node[riskScore > 0]",
          style: {
            label: showLabels ? "data(label)" : "data(riskScore)",
            "text-valign": "center",
            "text-halign": "center",
            color: "#1E1E2C",
            "font-size": "10px",
            "font-weight": "bold",
            "text-background-opacity": 0,
            "text-margin-y": 0,
          },
        },
        {
          selector: "edge",
          style: {
            width: "mapData(weight, 0, 6, 1, 3)",
            "line-color": "#C8CCD6",
            "target-arrow-color": "#C8CCD6",
            "target-arrow-shape": "triangle",
            "curve-style": "bezier",
            opacity: 0.4,
            "arrow-scale": 0.7,
          },
        },
        {
          selector: "edge:hover",
          style: {
            opacity: 0.8,
            "line-color": "#8B8FA3",
            "target-arrow-color": "#8B8FA3",
            width: "mapData(weight, 0, 6, 2, 5)",
          },
        },
        {
          selector: "edge:selected",
          style: {
            "line-color": "#F29F67",
            "target-arrow-color": "#F29F67",
            width: "mapData(weight, 0, 6, 2, 6)",
            opacity: 1,
            "z-index": 999,
          },
        },
        // Pattern-specific node styles
        {
          selector: "node[isCycleMember]",
          style: {
            "background-color": "#ef4444",
            "border-color": "#dc2626",
            "border-width": "3px",
          },
        },
        {
          selector: "node[isFanInMember]",
          style: {
            "background-color": "#f97316",
            "border-color": "#ea580c",
            "border-width": "3px",
          },
        },
        {
          selector: "node[isFanOutMember]",
          style: {
            "background-color": "#ea580c",
            "border-color": "#c2410c",
            "border-width": "3px",
          },
        },
        {
          selector: "node[isLayeredMember]",
          style: {
            "background-color": "#dc2626",
            "border-color": "#991b1b",
            "border-width": "3px",
          },
        },
        {
          selector: "node[isHighRisk]",
          style: {
            "background-color": "#991b1b",
            "border-color": "#7f1d1d",
            "border-width": "4px",
          },
        },
        {
          selector: "node[isMerchant]",
          style: {
            "background-color": "#8b5cf6",
            "border-color": "#7c3aed",
            "border-width": "3px",
            shape: "diamond",
          } as any,
        },
        {
          selector: "edge[isSuspiciousEdge]",
          style: {
            "line-color": "#ef4444",
            "target-arrow-color": "#ef4444",
            width: "mapData(weight, 0, 6, 2, 5)",
            opacity: 0.8,
            "line-style": "solid",
            "z-index": 100,
          },
        },
      ],
      layout: {
        name: layoutType,
        padding: 60,
        animate: true,
        animationDuration: 800,
        ...(layoutType === "cose" && {
          nodeRepulsion: 8000,
          edgeElasticity: 100,
          nestingFactor: 1.2,
          gravity: 1,
          numIter: 1000,
          nodeOverlap: 4,
          idealEdgeLength: 100,
        }),
        ...(layoutType === "grid" && { spacing: 80, avoidOverlap: true }),
        ...(layoutType === "circle" && { spacing: 100, avoidOverlap: true }),
        ...(layoutType === "breadthfirst" && {
          spacing: 80,
          circle: false,
          avoidOverlap: true,
        }),
        ...(layoutType === "concentric" && {
          spacing: 100,
          avoidOverlap: true,
          minNodeSpacing: 50,
          concentric: (node: any) => {
            if (node.data("isHighRisk")) return 4;
            if (node.data("isCycleMember")) return 3;
            if (node.data("isLayeredMember")) return 3;
            if (node.data("isFanInMember")) return 2;
            if (node.data("isFanOutMember")) return 2;
            return 1;
          },
          levelWidth: (nodes: any) => nodes.maxDegree() / 2,
        }),
      },
    });

    cyInstance.current.on("tap", "node", (event) => {
      const node = event.target;
      setSelectedElement({ type: "node", id: node.id(), data: node.data() });
    });

    cyInstance.current.on("tap", "edge", (event) => {
      const edge = event.target;
      setSelectedElement({ type: "edge", id: edge.id(), data: edge.data() });
    });

    cyInstance.current.on("tap", (event) => {
      if (event.target === cyInstance.current) setSelectedElement(null);
    });

    return () => {
      cyInstance.current?.destroy();
    };
  }, [
    graphData,
    layoutType,
    suspiciousRings,
    suspicionScores,
    merchantAccounts,
    showCycles,
    showLayering,
    showSmurfing,
    showLabels,
    riskFilter,
  ]);

  const handleZoomIn = useCallback(() => {
    if (cyInstance.current) {
      const zoom = cyInstance.current.zoom();
      cyInstance.current.animate({ zoom: zoom * 1.3, duration: 200 });
    }
  }, []);

  const handleZoomOut = useCallback(() => {
    if (cyInstance.current) {
      const zoom = cyInstance.current.zoom();
      cyInstance.current.animate({ zoom: zoom / 1.3, duration: 200 });
    }
  }, []);

  const resetView = useCallback(() => {
    if (cyInstance.current) {
      cyInstance.current.fit(undefined, 60);
      cyInstance.current.center();
    }
  }, []);

  const handleLayoutChange = (
    newLayout: "cose" | "circle" | "grid" | "breadthfirst" | "concentric",
  ) => {
    setLayoutType(newLayout);
  };

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  const filteredNodeCount = graphData.nodes.filter((node) => {
    if (riskFilter === 0) return true;
    const score =
      suspicionScores?.find((a) => a.account_id === node.id)?.suspicion_score ||
      0;
    return score >= riskFilter;
  }).length;

  return (
    <motion.div
      layout
      className={`bg-white rounded-xl border border-[#E2E5EE] shadow-sm overflow-hidden ${
        isFullscreen ? "fixed inset-4 z-50" : ""
      }`}
    >
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#E2E5EE]">
        <div className="flex items-center gap-2">
          {/* Zoom Controls */}
          <div className="flex items-center bg-[#F5F6FA] rounded-lg border border-[#E2E5EE]">
            <button
              onClick={handleZoomIn}
              className="p-2 hover:bg-[#EEF0F5] rounded-l-lg transition-colors"
              title="Zoom In"
            >
              <ZoomIn className="w-4 h-4 text-[#5A5F72]" />
            </button>
            <div className="w-px h-5 bg-[#E2E5EE]" />
            <button
              onClick={handleZoomOut}
              className="p-2 hover:bg-[#EEF0F5] transition-colors"
              title="Zoom Out"
            >
              <ZoomOut className="w-4 h-4 text-[#5A5F72]" />
            </button>
            <div className="w-px h-5 bg-[#E2E5EE]" />
            <button
              onClick={toggleFullscreen}
              className="p-2 hover:bg-[#EEF0F5] transition-colors"
              title="Fullscreen"
            >
              <Maximize2 className="w-4 h-4 text-[#5A5F72]" />
            </button>
            <div className="w-px h-5 bg-[#E2E5EE]" />
            <button
              onClick={resetView}
              className="p-2 hover:bg-[#EEF0F5] rounded-r-lg transition-colors"
              title="Reset View"
            >
              <RotateCcw className="w-4 h-4 text-[#5A5F72]" />
            </button>
          </div>

          {/* Layout Selector */}
          <div className="flex items-center bg-[#F5F6FA] rounded-lg border border-[#E2E5EE] ml-2">
            {(
              ["cose", "circle", "grid", "breadthfirst", "concentric"] as const
            ).map((layout) => (
              <button
                key={layout}
                onClick={() => handleLayoutChange(layout)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors first:rounded-l-lg last:rounded-r-lg ${
                  layoutType === layout
                    ? "bg-[#F29F67] text-white"
                    : "text-[#7C8197] hover:text-[#1E1E2C] hover:bg-[#EEF0F5]"
                }`}
              >
                {layout.charAt(0).toUpperCase() + layout.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Right Info */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-[#7C8197]">
            {filteredNodeCount} nodes • {graphData.edges.length} connections
          </span>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#34B1AA] animate-pulse-live" />
            <span className="text-xs text-[#34B1AA] font-medium">Live</span>
          </div>
        </div>
      </div>

      <div
        className="flex"
        style={{ height: isFullscreen ? "calc(100vh - 120px)" : "600px" }}
      >
        {/* Controls Panel */}
        <div className="w-64 border-r border-[#E2E5EE] bg-white p-4 space-y-5 overflow-y-auto shrink-0">
          <h3 className="text-sm font-bold text-[#1E1E2C] flex items-center gap-2">
            <Filter className="w-4 h-4 text-[#F29F67]" />
            Graph Controls
          </h3>

          {/* Risk Filter */}
          <div className="bg-[#F8F9FC] rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-[#1E1E2C]">
                Risk Level Filter
              </label>
              <span className="text-xs font-bold text-[#F29F67] bg-[#F29F67]/10 px-2 py-0.5 rounded-full">
                {riskFilter}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={riskFilter}
              onChange={(e) => setRiskFilter(Number(e.target.value))}
              className="w-full h-1.5 bg-[#E2E5EE] rounded-full appearance-none cursor-pointer accent-[#F29F67]"
            />
          </div>

          {/* Detection Patterns */}
          <div>
            <h4 className="text-[11px] font-bold text-[#1E1E2C] uppercase tracking-wider mb-3">
              Detection Patterns
            </h4>
            <div className="space-y-2.5">
              <ToggleControl
                label="Show Cycles"
                enabled={showCycles}
                onChange={setShowCycles}
              />
              <ToggleControl
                label="Show Layering"
                enabled={showLayering}
                onChange={setShowLayering}
              />
              <ToggleControl
                label="Show Smurfing"
                enabled={showSmurfing}
                onChange={setShowSmurfing}
              />
              <ToggleControl
                label="Show Labels"
                enabled={showLabels}
                onChange={setShowLabels}
              />
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-[#E2E5EE]" />

          {/* Node Types Legend */}
          <div>
            <h4 className="text-[11px] font-bold text-[#1E1E2C] uppercase tracking-wider mb-3">
              Node Types
            </h4>
            <div className="space-y-2">
              <LegendItem color="bg-[#3B8FF3]" label="Normal Account" />
              <LegendItem color="bg-red-500" label="High Risk" />
              <LegendItem
                color="bg-purple-500"
                label="Merchant"
                shape="diamond"
              />
              <LegendItem color="bg-red-700" label="Fraud Ring Leader" />
              <LegendItem color="bg-orange-500" label="Smurfing Node" />
            </div>
          </div>

          {/* Edge Types Legend */}
          <div>
            <h4 className="text-[11px] font-bold text-[#1E1E2C] uppercase tracking-wider mb-3">
              Edge Types
            </h4>
            <div className="space-y-2.5">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-[2px] bg-[#C8CCD6] rounded-full" />
                <span className="text-xs text-[#4A4F63]">Normal</span>
              </div>
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-[2px] bg-red-500 rounded-full" />
                <span className="text-xs text-[#4A4F63]">Suspicious</span>
              </div>
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-[3px] bg-[#E0B50F] rounded-full" />
                <span className="text-xs text-[#4A4F63]">High Volume</span>
              </div>
            </div>
          </div>
        </div>

        {/* Graph Canvas */}
        <div className="flex-1 relative">
          <div
            ref={cyRef}
            className="w-full h-full graph-container"
            style={{
              background:
                "radial-gradient(ellipse at center, #F8F9FC 0%, #ECEEF4 100%)",
            }}
          />

          {/* Fullscreen close button */}
          {isFullscreen && (
            <button
              onClick={toggleFullscreen}
              className="absolute top-3 right-3 p-2 bg-white/80 rounded-lg hover:bg-[#F0F1F5] transition-colors shadow"
            >
              <X className="w-4 h-4 text-[#4A4F63]" />
            </button>
          )}
        </div>

        {/* Selection Detail Panel */}
        <AnimatePresence>
          {selectedElement && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 280, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="border-l border-[#E2E5EE] overflow-hidden shrink-0"
            >
              <div className="w-70 p-4 space-y-4 h-full overflow-y-auto bg-white">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-[#1E1E2C]">
                    {selectedElement.type === "node"
                      ? "Account Details"
                      : "Transaction Details"}
                  </h4>
                  <button
                    onClick={() => setSelectedElement(null)}
                    className="p-1.5 hover:bg-[#F0F1F5] rounded-lg transition-colors"
                  >
                    <X className="w-4 h-4 text-[#5A5F72]" />
                  </button>
                </div>

                {selectedElement.type === "node" ? (
                  <NodeDetails
                    nodeId={selectedElement.id}
                    nodeData={selectedElement.data}
                    suspicionScores={suspicionScores}
                    suspiciousRings={suspiciousRings}
                    merchantAccounts={merchantAccounts}
                  />
                ) : (
                  <EdgeDetails data={selectedElement.data} />
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom Info Bar */}
      <div className="px-4 py-2.5 border-t border-[#E2E5EE] bg-[#F8F9FC] flex items-center justify-between">
        <p className="text-xs text-[#5A5F72]">
          Scroll to zoom • Drag to pan • Click nodes or edges for details
        </p>
        {stats && (
          <div className="flex items-center gap-4 text-xs font-medium text-[#4A4F63]">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#3B8FF3]"></span>
              {stats.nodes_count} accounts
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#C8CCD6]"></span>
              {stats.edges_count} transactions
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#E0B50F]"></span>$
              {stats.total_amount.toLocaleString()} total volume
            </span>
          </div>
        )}
      </div>

      {/* Fullscreen backdrop */}
      {isFullscreen && (
        <div
          className="fixed inset-0 bg-black/60 -z-10"
          onClick={toggleFullscreen}
        />
      )}
    </motion.div>
  );
}

// Subcomponents

function ToggleControl({
  label,
  enabled,
  onChange,
}: {
  label: string;
  enabled: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[13px] text-[#3A3F52] font-medium">{label}</span>
      <button
        onClick={() => onChange(!enabled)}
        className={`toggle-switch ${enabled ? "active" : ""}`}
      />
    </div>
  );
}

function LegendItem({
  color,
  label,
  shape,
}: {
  color: string;
  label: string;
  shape?: string;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <div
        className={`w-3 h-3 ${color} ${
          shape === "diamond" ? "rotate-45 rounded-[2px]" : "rounded-full"
        } ring-2 ring-white shadow-sm`}
      />
      <span className="text-[13px] text-[#3A3F52]">{label}</span>
    </div>
  );
}

function NodeDetails({
  nodeId,
  nodeData,
  suspicionScores,
  suspiciousRings,
  merchantAccounts,
}: {
  nodeId: string;
  nodeData: any;
  suspicionScores?: SuspiciousAccount[];
  suspiciousRings?: SuspiciousRing[];
  merchantAccounts?: Record<string, boolean>;
}) {
  const account = suspicionScores?.find((a) => a.account_id === nodeId);
  const isMerchant = merchantAccounts?.[nodeId];
  const rings =
    suspiciousRings?.filter((r) => r.members.includes(nodeId)) || [];
  const score = account?.suspicion_score || 0;

  return (
    <div className="space-y-3">
      {/* Account ID */}
      <div className="bg-[#F5F6FA] rounded-xl p-3.5 border border-[#E8EAF0]">
        <span className="text-[10px] font-semibold text-[#7C8197] uppercase tracking-wider">
          Account ID
        </span>
        <p className="text-sm font-mono font-bold text-[#1E1E2C] mt-1">
          {nodeId}
        </p>
      </div>

      {/* Account Type */}
      <div
        className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl ${
          isMerchant
            ? "bg-purple-50 border border-purple-200"
            : "bg-[#F5F6FA] border border-[#E8EAF0]"
        }`}
      >
        <span className="text-base">{isMerchant ? "🏪" : "👤"}</span>
        <span
          className={`text-[13px] font-semibold ${isMerchant ? "text-purple-600" : "text-[#4A4F63]"}`}
        >
          {isMerchant ? "Merchant Account" : "Individual Account"}
        </span>
      </div>

      {/* Risk Score */}
      {account ? (
        <div
          className={`p-3.5 rounded-xl border ${
            score >= 80
              ? "bg-red-50 border-red-200"
              : score >= 50
                ? "bg-orange-50 border-orange-200"
                : "bg-amber-50 border-amber-200"
          }`}
        >
          <div className="flex items-center justify-between mb-2.5">
            <span
              className={`text-[11px] font-bold uppercase tracking-wider ${
                score >= 80
                  ? "text-red-700"
                  : score >= 50
                    ? "text-orange-700"
                    : "text-amber-700"
              }`}
            >
              Suspicion Score
            </span>
            <span
              className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                score >= 80
                  ? "bg-red-500 text-white"
                  : score >= 50
                    ? "bg-orange-500 text-white"
                    : "bg-amber-500 text-white"
              }`}
            >
              {score >= 80 ? "HIGH" : score >= 50 ? "MEDIUM" : "LOW"}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2 rounded-full bg-white/60 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${
                  score >= 80
                    ? "bg-red-500"
                    : score >= 50
                      ? "bg-orange-500"
                      : "bg-amber-500"
                }`}
                style={{ width: `${Math.min(100, score)}%` }}
              />
            </div>
            <span
              className={`text-lg font-extrabold ${
                score >= 80
                  ? "text-red-600"
                  : score >= 50
                    ? "text-orange-600"
                    : "text-amber-600"
              }`}
            >
              {score}
            </span>
          </div>
        </div>
      ) : (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200">
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center">
              <span className="text-emerald-600 text-xs">✓</span>
            </span>
            <span className="text-[13px] font-semibold text-emerald-700">
              No suspicion flags
            </span>
          </div>
        </div>
      )}

      {/* Ring Memberships */}
      {rings.length > 0 && (
        <div className="space-y-2">
          <span className="text-[11px] font-bold text-[#1E1E2C] uppercase tracking-wider">
            Ring Memberships ({rings.length})
          </span>
          {rings.map((ring, i) => (
            <div
              key={i}
              className="bg-red-50 border border-red-200 rounded-xl p-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-semibold text-red-600">
                  {ring.pattern === "cycle" && "🔄 Cycle Ring"}
                  {ring.pattern === "smurfing_fan_in" && "📥 Fan-In"}
                  {ring.pattern === "smurfing_fan_out" && "📤 Fan-Out"}
                  {ring.pattern === "layered" && "🏗️ Layered"}
                </span>
                {ring.risk_score && (
                  <span className="text-xs font-bold text-red-500">
                    {(ring.risk_score * 100).toFixed(0)}%
                  </span>
                )}
              </div>
              <p className="text-[11px] text-[#5A5F72] mt-1">
                {ring.members.length} members
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EdgeDetails({ data }: { data: any }) {
  return (
    <div className="space-y-3">
      <div className="bg-[#F5F6FA] rounded-xl p-3.5 border border-[#E8EAF0]">
        <span className="text-[10px] font-semibold text-[#7C8197] uppercase tracking-wider">
          Transaction ID
        </span>
        <p className="text-xs font-mono font-bold text-[#1E1E2C] mt-1 break-all">
          {data.id}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="bg-blue-50 rounded-xl p-3 border border-blue-100">
          <span className="text-[10px] font-semibold text-blue-600 uppercase tracking-wider">
            From
          </span>
          <p className="text-xs font-mono font-bold text-[#3B8FF3] mt-1">
            {data.source}
          </p>
        </div>
        <div className="bg-teal-50 rounded-xl p-3 border border-teal-100">
          <span className="text-[10px] font-semibold text-teal-600 uppercase tracking-wider">
            To
          </span>
          <p className="text-xs font-mono font-bold text-[#34B1AA] mt-1">
            {data.target}
          </p>
        </div>
      </div>

      <div className="bg-[#F5F6FA] rounded-xl p-3.5 border border-[#E8EAF0]">
        <span className="text-[10px] font-semibold text-[#7C8197] uppercase tracking-wider">
          Amount
        </span>
        <p className="text-xl font-extrabold text-[#1E1E2C] mt-1">
          ${data.amount?.toLocaleString()}
        </p>
      </div>

      <div className="bg-[#F5F6FA] rounded-xl p-3.5 border border-[#E8EAF0]">
        <span className="text-[10px] font-semibold text-[#7C8197] uppercase tracking-wider">
          Timestamp
        </span>
        <p className="text-xs font-medium text-[#3A3F52] mt-1">
          {new Date(data.timestamp).toLocaleString()}
        </p>
      </div>

      {data.isSuspiciousEdge && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3.5">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-red-500" />
            <span className="text-[13px] font-semibold text-red-600">
              Suspicious Transaction
            </span>
          </div>
          <p className="text-[11px] text-red-500/80 mt-1">
            Part of a detected fraud pattern
          </p>
        </div>
      )}
    </div>
  );
}
