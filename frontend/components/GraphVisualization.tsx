"use client";

import { useEffect, useRef, useState } from "react";
import cytoscape, { Core, EdgeDefinition, NodeDefinition } from "cytoscape";

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

export default function GraphVisualization({
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

  useEffect(() => {
    if (!cyRef.current || !graphData) return;

    // Create sets for different pattern types
    const cycleMembers = new Set<string>();
    const fanInMembers = new Set<string>();
    const fanOutMembers = new Set<string>();
    const layeredMembers = new Set<string>();
    const highRiskMembers = new Set<string>();

    if (suspiciousRings) {
      suspiciousRings.forEach((ring) => {
        ring.members.forEach((member) => {
          // Categorize by pattern type
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

          // High risk threshold
          if ((ring.risk_score || 0) > 0.7) {
            highRiskMembers.add(member);
          }
        });
      });
    }

    // Prepare nodes and edges for Cytoscape
    const nodes: NodeDefinition[] = graphData.nodes.map((node) => {
      const isCycleMember = cycleMembers.has(node.id);
      const isFanInMember = fanInMembers.has(node.id);
      const isFanOutMember = fanOutMembers.has(node.id);
      const isLayeredMember = layeredMembers.has(node.id);
      const isHighRisk = highRiskMembers.has(node.id);

      return {
        data: {
          id: node.id,
          // Set pattern-specific properties
          ...(isCycleMember && { isCycleMember: true }),
          ...(isFanInMember && { isFanInMember: true }),
          ...(isFanOutMember && { isFanOutMember: true }),
          ...(isLayeredMember && { isLayeredMember: true }),
          ...(isHighRisk && { isHighRisk: true }),
        },
      };
    });

    const edges: EdgeDefinition[] = graphData.edges.map((edge) => {
      const isSuspiciousEdge =
        (cycleMembers.has(edge.source) && cycleMembers.has(edge.target)) ||
        (fanInMembers.has(edge.source) && fanInMembers.has(edge.target)) ||
        (fanOutMembers.has(edge.source) && fanOutMembers.has(edge.target)) ||
        (layeredMembers.has(edge.source) && layeredMembers.has(edge.target));

      return {
        data: {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          amount: edge.amount,
          timestamp: edge.timestamp,
          weight: Math.log10(edge.amount + 1), // For edge thickness
          // Only set isSuspiciousEdge if it's true
          ...(isSuspiciousEdge && { isSuspiciousEdge: true }),
        },
      };
    });

    // Initialize Cytoscape
    cyInstance.current = cytoscape({
      container: cyRef.current,
      elements: [...nodes, ...edges],
      style: [
        {
          selector: "node",
          style: {
            "background-color": "#3B82F6",
            label: "data(id)",
            "text-valign": "center",
            "text-halign": "center",
            color: "#ffffff",
            "font-size": "10px",
            "font-weight": "bold",
            width: "40px",
            height: "40px",
            "border-width": "2px",
            "border-color": "#1E40AF",
            "text-background-color": "#000000",
            "text-background-opacity": 0.8,
            "text-background-padding": "3px",
            "text-opacity": 0, // Hide labels by default
            "min-zoomed-font-size": 8,
          },
        },
        {
          selector: "node:hover",
          style: {
            "text-opacity": 1, // Show label on hover
            "border-width": "3px",
            "z-index": 999,
          },
        },
        {
          selector: "node:selected",
          style: {
            "background-color": "#EF4444",
            "border-color": "#DC2626",
            "border-width": "4px",
            "text-opacity": 1, // Show label when selected
            "z-index": 999,
          },
        },
        {
          selector: "edge",
          style: {
            width: "mapData(weight, 0, 6, 1, 4)",
            "line-color": "#94A3B8",
            "target-arrow-color": "#94A3B8",
            "target-arrow-shape": "triangle",
            "curve-style": "bezier",
            opacity: 0.6,
            "arrow-scale": 0.8,
          },
        },
        {
          selector: "edge:hover",
          style: {
            opacity: 0.9,
            "line-color": "#64748B",
            "target-arrow-color": "#64748B",
          },
        },
        {
          selector: "edge:selected",
          style: {
            "line-color": "#EF4444",
            "target-arrow-color": "#EF4444",
            width: "mapData(weight, 0, 6, 2, 6)",
            opacity: 1,
            "z-index": 999,
          },
        },
        {
          selector: "node[isCycleMember]",
          style: {
            "background-color": "#EF4444", // Bright red for cycle rings
            "border-color": "#DC2626",
            "border-width": "3px",
            "text-opacity": 1, // Always show labels for suspicious members
          },
        },
        {
          selector: "node[isFanInMember]",
          style: {
            "background-color": "#F97316", // Orange-red for fan-in
            "border-color": "#EA580C",
            "border-width": "3px",
            "text-opacity": 1,
          },
        },
        {
          selector: "node[isFanOutMember]",
          style: {
            "background-color": "#EA580C", // Dark orange for fan-out
            "border-color": "#C2410C",
            "border-width": "3px",
            "text-opacity": 1,
          },
        },
        {
          selector: "node[isLayeredMember]",
          style: {
            "background-color": "#DC2626", // Deep red for layered networks
            "border-color": "#991B1B",
            "border-width": "3px",
            "text-opacity": 1,
          },
        },
        {
          selector: "node[isHighRisk]",
          style: {
            "background-color": "#991B1B", // Darkest red for high risk
            "border-color": "#7F1D1D",
            "border-width": "4px",
            "text-opacity": 1, // Always show labels for high risk
          },
        },
        {
          selector: "edge[isSuspiciousEdge]",
          style: {
            "line-color": "#EF4444", // Red for suspicious edges
            "target-arrow-color": "#EF4444",
            width: "mapData(weight, 0, 6, 2, 5)",
            opacity: 1,
            "z-index": 100,
          },
        },
      ],
      layout: {
        name: layoutType,
        padding: 60, // Increased padding
        animate: true,
        animationDuration: 1000,
        // Layout-specific configurations for better spacing
        ...(layoutType === "cose" && {
          nodeRepulsion: 8000,
          edgeElasticity: 100,
          nestingFactor: 1.2,
          gravity: 1,
          numIter: 1000,
          nodeOverlap: 4,
          idealEdgeLength: 100,
        }),
        ...(layoutType === "grid" && {
          spacing: 80,
          avoidOverlap: true,
        }),
        ...(layoutType === "circle" && {
          spacing: 100,
          avoidOverlap: true,
        }),
        ...(layoutType === "breadthfirst" && {
          spacing: 80,
          circle: false,
          avoidOverlap: true,
        }),
        ...(layoutType === "concentric" && {
          spacing: 100,
          avoidOverlap: true,
          minNodeSpacing: 50,
          concentric: function (node: any) {
            // Put suspicious members in inner circles based on risk level
            if (node.data("isHighRisk")) return 4; // Highest priority
            if (node.data("isCycleMember")) return 3;
            if (node.data("isLayeredMember")) return 3;
            if (node.data("isFanInMember")) return 2;
            if (node.data("isFanOutMember")) return 2;
            return 1; // Normal nodes in outer circle
          },
          levelWidth: function (nodes: any) {
            return nodes.maxDegree() / 2;
          },
        }),
      },
    });

    // Add event listeners
    cyInstance.current.on("tap", "node", (event) => {
      const node = event.target;
      setSelectedElement({
        type: "node",
        id: node.id(),
        data: node.data(),
      });
    });

    cyInstance.current.on("tap", "edge", (event) => {
      const edge = event.target;
      setSelectedElement({
        type: "edge",
        id: edge.id(),
        data: edge.data(),
      });
    });

    cyInstance.current.on("tap", (event) => {
      if (event.target === cyInstance.current) {
        setSelectedElement(null);
      }
    });

    // Ring members are always colored based on the initial data
    // The highlightRings toggle can be used for additional features in the future
    // but doesn't affect the basic coloring

    // No need to call updateRingHighlighting since ring coloring is set in initial data

    return () => {
      cyInstance.current?.destroy();
    };
  }, [graphData, layoutType, suspiciousRings]);

  const handleLayoutChange = (newLayout: typeof layoutType) => {
    setLayoutType(newLayout);
    if (cyInstance.current) {
      const layoutConfig = {
        name: newLayout,
        animate: true,
        animationDuration: 1000,
        padding: 60,
        // Layout-specific configurations for better spacing
        ...(newLayout === "cose" && {
          nodeRepulsion: 80000,
          edgeElasticity: 100,
          nestingFactor: 1,
          gravity: 1,
          numIter: 1000,
          nodeOverlap: 0,
          idealEdgeLength: 100,
        }),
        ...(newLayout === "grid" && {
          spacing: 80,
          avoidOverlap: true,
        }),
        ...(newLayout === "circle" && {
          spacing: 100,
          avoidOverlap: true,
        }),
        ...(newLayout === "breadthfirst" && {
          spacing: 80,
          circle: false,
          avoidOverlap: true,
        }),
        ...(newLayout === "concentric" && {
          spacing: 100,
          avoidOverlap: true,
          minNodeSpacing: 50,
          concentric: function (node: any) {
            // Put suspicious members in inner circles based on risk level
            if (node.data("isHighRisk")) return 4;
            if (node.data("isCycleMember")) return 3;
            if (node.data("isLayeredMember")) return 3;
            if (node.data("isFanInMember")) return 2;
            if (node.data("isFanOutMember")) return 2;
            return 1;
          },
          levelWidth: function (nodes: any) {
            return nodes.maxDegree() / 2;
          },
        }),
      };
      cyInstance.current.layout(layoutConfig).run();
    }
  };

  const resetView = () => {
    if (cyInstance.current) {
      cyInstance.current.fit();
      cyInstance.current.center();
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-semibold text-gray-900">
          Transaction Network Graph
        </h3>
        <button
          onClick={resetView}
          className="px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
        >
          Reset View
        </button>
      </div>

      {/* Stats Panel */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 p-4 bg-gray-50 rounded-lg">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">
              {stats.nodes_count}
            </div>
            <div className="text-sm text-gray-600">Accounts</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">
              {stats.edges_count}
            </div>
            <div className="text-sm text-gray-600">Transactions</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-600">
              ${stats.total_amount.toLocaleString()}
            </div>
            <div className="text-sm text-gray-600">Total Amount</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-600">
              {stats.unique_accounts}
            </div>
            <div className="text-sm text-gray-600">Unique Accounts</div>
          </div>
        </div>
      )}

      {/* Rings Summary Panel */}
      {suspiciousRings && suspiciousRings.length > 0 && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <h4 className="font-semibold text-red-800 mb-3 flex items-center">
            🚨 Suspicious Patterns Detected ({suspiciousRings.length})
          </h4>
          <div className="grid gap-3">
            {suspiciousRings.map((ring, index) => (
              <div
                key={index}
                className="bg-white p-3 rounded border border-red-200"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <span className="font-medium text-red-700">
                      {ring.pattern === "cycle" && "🔄 Cycle Ring"}
                      {ring.pattern === "smurfing_fan_in" &&
                        "📥 Fan-In Smurfing"}
                      {ring.pattern === "smurfing_fan_out" &&
                        "📤 Fan-Out Smurfing"}
                      {ring.pattern === "layered" && "🏗️ Layered Network"}
                    </span>
                    <div className="text-sm text-red-600">
                      {ring.members.length} members
                      {ring.risk_score
                        ? ` • Risk: ${(ring.risk_score * 100).toFixed(1)}%`
                        : ""}
                    </div>
                    <div className="text-xs text-gray-600 mt-1">
                      Members: {ring.members.join(", ")}
                    </div>
                  </div>
                  {ring.risk_score && ring.risk_score > 0.8 && (
                    <span className="bg-red-500 text-white text-xs px-2 py-1 rounded">
                      HIGH RISK
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Color Legend */}
      {suspiciousRings && suspiciousRings.length > 0 && (
        <div className="mb-4 p-4 bg-gray-50 border border-gray-200 rounded-lg">
          <h4 className="font-semibold text-gray-800 mb-3">
            🎨 Pattern Color Legend
          </h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-red-500 border-2 border-red-600"></div>
              <span className="text-sm text-gray-700">Cycle Rings</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-orange-500 border-2 border-orange-600"></div>
              <span className="text-sm text-gray-700">Fan-In Smurfing</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-orange-600 border-2 border-orange-700"></div>
              <span className="text-sm text-gray-700">Fan-Out Smurfing</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-red-600 border-2 border-red-800"></div>
              <span className="text-sm text-gray-700">Layered Networks</span>
            </div>
          </div>
        </div>
      )}

      {/* Layout Controls */}
      <div className="flex gap-2 mb-4 flex-wrap items-center">
        <span className="text-sm font-medium text-gray-700 flex items-center">
          Layout:
        </span>
        {(
          ["cose", "circle", "grid", "breadthfirst", "concentric"] as const
        ).map((layout) => (
          <button
            key={layout}
            onClick={() => handleLayoutChange(layout)}
            className={`px-3 py-1 text-sm rounded-md transition-colors ${
              layoutType === layout
                ? "bg-blue-600 text-white"
                : "bg-gray-200 hover:bg-gray-300 text-gray-700"
            }`}
          >
            {layout.charAt(0).toUpperCase() + layout.slice(1)}
          </button>
        ))}
      </div>

      <div className="flex gap-4">
        {/* Graph Container */}
        <div className="flex-1">
          <div
            ref={cyRef}
            className="w-full h-96 border border-gray-300 rounded-lg bg-gray-50"
            style={{ minHeight: "500px" }}
          />
        </div>

        {/* Selection Panel */}
        {selectedElement && (
          <div className="w-80 bg-gray-50 p-4 rounded-lg">
            <h4 className="font-semibold text-gray-900 mb-3">
              {selectedElement.type === "node"
                ? "🏦 Account Details"
                : "💰 Transaction Details"}
            </h4>

            {selectedElement.type === "node" ? (
              <div className="space-y-2">
                <div>
                  <span className="font-medium text-gray-700">Account ID:</span>
                  <div className="text-gray-900">{selectedElement.id}</div>
                </div>

                {/* Merchant Status */}
                {(() => {
                  const isMerchant = merchantAccounts?.[selectedElement.id];
                  if (isMerchant === undefined) return null;
                  return (
                    <div
                      className={`flex items-center gap-2 px-3 py-2 rounded ${
                        isMerchant
                          ? "bg-blue-50 border border-blue-200"
                          : "bg-gray-50 border border-gray-200"
                      }`}
                    >
                      <span className="text-base">
                        {isMerchant ? "🏪" : "👤"}
                      </span>
                      <span
                        className={`text-sm font-medium ${
                          isMerchant ? "text-blue-700" : "text-gray-600"
                        }`}
                      >
                        {isMerchant ? "Merchant Account" : "Individual Account"}
                      </span>
                      {isMerchant && (
                        <span className="ml-auto px-2 py-0.5 bg-blue-100 text-blue-800 text-xs rounded-full font-medium">
                          HIGH VOLUME
                        </span>
                      )}
                    </div>
                  );
                })()}

                {/* Suspicion Score */}
                {(() => {
                  const account = suspicionScores?.find(
                    (a) => a.account_id === selectedElement.id,
                  );
                  if (account) {
                    const score = account.suspicion_score;
                    const level =
                      score >= 80 ? "HIGH" : score >= 50 ? "MEDIUM" : "LOW";
                    const colors =
                      score >= 80
                        ? {
                            bg: "bg-red-50",
                            border: "border-red-200",
                            text: "text-red-700",
                            bar: "bg-red-500",
                            badge: "bg-red-100 text-red-800",
                          }
                        : score >= 50
                          ? {
                              bg: "bg-orange-50",
                              border: "border-orange-200",
                              text: "text-orange-700",
                              bar: "bg-orange-500",
                              badge: "bg-orange-100 text-orange-800",
                            }
                          : {
                              bg: "bg-yellow-50",
                              border: "border-yellow-200",
                              text: "text-yellow-700",
                              bar: "bg-yellow-500",
                              badge: "bg-yellow-100 text-yellow-800",
                            };
                    return (
                      <div
                        className={`${colors.bg} ${colors.border} border p-3 rounded mt-2`}
                      >
                        <div className="flex justify-between items-center mb-1">
                          <span className={`font-medium ${colors.text}`}>
                            🕵️ Suspicion Score
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors.badge}`}
                          >
                            {level}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <div className="flex-1 bg-gray-200 rounded-full h-2.5">
                            <div
                              className={`h-2.5 rounded-full ${colors.bar}`}
                              style={{
                                width: `${Math.min(100, score)}%`,
                              }}
                            ></div>
                          </div>
                          <span className={`text-sm font-bold ${colors.text}`}>
                            {score}/100
                          </span>
                        </div>
                        {account.involved_rings.length > 0 && (
                          <div className="mt-2 text-xs text-gray-600">
                            Rings:{" "}
                            {account.involved_rings.map((rid) => (
                              <span
                                key={rid}
                                className="inline-block px-1.5 py-0.5 bg-gray-100 rounded mr-1 mb-1"
                              >
                                {rid}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  }
                  return (
                    <div className="bg-green-50 border border-green-200 p-2 rounded mt-2">
                      <span className="text-sm text-green-700">
                        ✅ No suspicion flags
                      </span>
                    </div>
                  );
                })()}

                {/* Ring Information */}
                {suspiciousRings && suspiciousRings.length > 0 && (
                  <div>
                    {suspiciousRings
                      .filter((ring) =>
                        ring.members.includes(selectedElement.id),
                      )
                      .map((ring, index) => (
                        <div key={index} className="bg-red-50 p-2 rounded mt-2">
                          <span className="font-medium text-red-700">
                            🚨 {ring.pattern === "cycle" && "Cycle Ring"}
                            {ring.pattern === "smurfing_fan_in" &&
                              "Fan-In Smurfing"}
                            {ring.pattern === "smurfing_fan_out" &&
                              "Fan-Out Smurfing"}
                            {ring.pattern === "layered" && "Layered Network"}
                          </span>
                          {ring.risk_score && (
                            <div className="text-sm text-red-600">
                              Risk Score: {(ring.risk_score * 100).toFixed(1)}%
                            </div>
                          )}
                          <div className="text-sm text-red-600">
                            Members: {ring.members.length}
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <span className="font-medium text-gray-700">
                    Transaction ID:
                  </span>
                  <div className="text-gray-900 font-mono text-sm">
                    {selectedElement.id}
                  </div>
                </div>
                <div>
                  <span className="font-medium text-gray-700">From:</span>
                  <div className="text-blue-600 font-mono">
                    {selectedElement.data.source}
                  </div>
                </div>
                <div>
                  <span className="font-medium text-gray-700">To:</span>
                  <div className="text-green-600 font-mono">
                    {selectedElement.data.target}
                  </div>
                </div>
                <div>
                  <span className="font-medium text-gray-700">Amount:</span>
                  <div className="text-purple-600 font-bold">
                    ${selectedElement.data.amount.toLocaleString()}
                  </div>
                </div>
                <div>
                  <span className="font-medium text-gray-700">Timestamp:</span>
                  <div className="text-gray-600 text-sm">
                    {new Date(selectedElement.data.timestamp).toLocaleString()}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mt-4 p-3 bg-blue-50 rounded-lg">
        <p className="text-sm text-blue-800">
          <strong>Interaction Guide:</strong> Blue nodes represent normal
          accounts. Suspicious patterns are color-coded:{" "}
          <span className="text-red-600">Red (Cycle Rings)</span>,{" "}
          <span className="text-orange-500">Orange (Fan-In Smurfing)</span>,{" "}
          <span className="text-orange-600">
            Dark Orange (Fan-Out Smurfing)
          </span>
          , <span className="text-red-700">Deep Red (Layered Networks)</span>.
          Hover over nodes to see labels. Click on nodes (accounts) or edges
          (transactions) to view details. Use layout buttons to change the graph
          arrangement. Scroll to zoom, drag to pan.
        </p>
      </div>
    </div>
  );
}
