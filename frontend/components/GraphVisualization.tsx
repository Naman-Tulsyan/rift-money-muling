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

interface GraphVisualizationProps {
  graphData: GraphData;
  suspiciousRings?: Array<SuspiciousRing>;
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
}: GraphVisualizationProps) {
  const cyRef = useRef<HTMLDivElement>(null);
  const cyInstance = useRef<Core | null>(null);
  const [selectedElement, setSelectedElement] = useState<any>(null);
  const [highlightRings, setHighlightRings] = useState(false);
  const [layoutType, setLayoutType] = useState<
    "cose" | "circle" | "grid" | "breadthfirst"
  >("cose");

  useEffect(() => {
    if (!cyRef.current || !graphData) return;

    // Create sets of ring members for easy lookup
    const ringMembers = new Set<string>();
    const highRiskMembers = new Set<string>();

    if (suspiciousRings) {
      suspiciousRings.forEach((ring) => {
        ring.members.forEach((member) => {
          ringMembers.add(member);
          if ((ring.risk_score || 0) > 5.0) {
            highRiskMembers.add(member);
          }
        });
      });
    }

    // Prepare nodes and edges for Cytoscape
    const nodes: NodeDefinition[] = graphData.nodes.map((node) => ({
      data: {
        id: node.id,
        isRingMember: ringMembers.has(node.id),
        isHighRisk: highRiskMembers.has(node.id),
      },
    }));

    const edges: EdgeDefinition[] = graphData.edges.map((edge) => ({
      data: {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        amount: edge.amount,
        timestamp: edge.timestamp,
        weight: Math.log10(edge.amount + 1), // For edge thickness
        isRingEdge:
          ringMembers.has(edge.source) && ringMembers.has(edge.target),
      },
    }));

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
            "font-size": "12px",
            "font-weight": "bold",
            width: "30px",
            height: "30px",
            "border-width": "2px",
            "border-color": "#1E40AF",
            "text-background-color": "#000000",
            "text-background-opacity": 0.7,
            "text-background-padding": "2px",
          },
        },
        {
          selector: "node:selected",
          style: {
            "background-color": "#EF4444",
            "border-color": "#DC2626",
            "border-width": "3px",
          },
        },
        {
          selector: "edge",
          style: {
            width: "mapData(weight, 0, 6, 1, 8)",
            "line-color": "#64748B",
            "target-arrow-color": "#64748B",
            "target-arrow-shape": "triangle",
            "curve-style": "bezier",
            opacity: 0.8,
          },
        },
        {
          selector: "edge:selected",
          style: {
            "line-color": "#EF4444",
            "target-arrow-color": "#EF4444",
            width: "mapData(weight, 0, 6, 2, 10)",
            opacity: 1,
          },
        },
        {
          selector: "node[isRingMember]",
          style: {
            "background-color": "#F59E0B",
            "border-color": "#D97706",
            "border-width": "3px",
          },
        },
        {
          selector: "node[isHighRisk]",
          style: {
            "background-color": "#EF4444",
            "border-color": "#DC2626",
            "border-width": "4px",
          },
        },
        {
          selector: "edge[isRingEdge]",
          style: {
            "line-color": "#F59E0B",
            "target-arrow-color": "#F59E0B",
            width: "mapData(weight, 0, 6, 2, 10)",
            opacity: 1,
          },
        },
      ],
      layout: {
        name: layoutType,
        padding: 30,
        animate: true,
        animationDuration: 1000,
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

    // Update ring highlighting based on toggle
    const updateRingHighlighting = () => {
      if (highlightRings && suspiciousRings && suspiciousRings.length > 0) {
        cyInstance.current?.nodes().forEach((node: any) => {
          const nodeId = node.data("id");
          const isInRing = suspiciousRings.some((ring: any) =>
            ring.members.includes(nodeId),
          );

          if (isInRing) {
            node.data("isRingMember", true);
            // Check if it's in a high-risk ring
            const isHighRisk = suspiciousRings.some(
              (ring: any) =>
                ring.members.includes(nodeId) &&
                ring.risk_score &&
                ring.risk_score > 0.7,
            );
            node.data("isHighRisk", isHighRisk);
          } else {
            node.data("isRingMember", false);
            node.data("isHighRisk", false);
          }
        });

        // Update edges that are part of rings
        cyInstance.current?.edges().forEach((edge: any) => {
          const sourceId = edge.source().id();
          const targetId = edge.target().id();
          const isRingEdge = suspiciousRings.some(
            (ring: any) =>
              ring.members.includes(sourceId) &&
              ring.members.includes(targetId),
          );
          edge.data("isRingEdge", isRingEdge);
        });
      } else {
        // Remove highlighting
        cyInstance.current?.nodes().forEach((node: any) => {
          node.data("isRingMember", false);
          node.data("isHighRisk", false);
        });
        cyInstance.current?.edges().forEach((edge: any) => {
          edge.data("isRingEdge", false);
        });
      }
    };

    updateRingHighlighting();

    return () => {
      cyInstance.current?.destroy();
    };
  }, [graphData, layoutType, suspiciousRings, highlightRings]);

  const handleLayoutChange = (newLayout: typeof layoutType) => {
    setLayoutType(newLayout);
    if (cyInstance.current) {
      cyInstance.current
        .layout({
          name: newLayout,
          animate: true,
          animationDuration: 1000,
        })
        .run();
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
            🚨 Suspicious Rings Detected ({suspiciousRings.length})
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
                      Ring {index + 1}
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

      {/* Layout Controls */}
      <div className="flex gap-2 mb-4 flex-wrap items-center">
        <span className="text-sm font-medium text-gray-700 flex items-center">
          Layout:
        </span>
        {(["cose", "circle", "grid", "breadthfirst"] as const).map((layout) => (
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

        {suspiciousRings && suspiciousRings.length > 0 && (
          <>
            <span className="text-gray-400 mx-2">|</span>
            <button
              onClick={() => setHighlightRings(!highlightRings)}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                highlightRings
                  ? "bg-red-600 text-white"
                  : "bg-red-100 hover:bg-red-200 text-red-700"
              }`}
            >
              🚨 {highlightRings ? "Hide" : "Show"} Rings (
              {suspiciousRings.length})
            </button>
          </>
        )}
      </div>

      <div className="flex gap-4">
        {/* Graph Container */}
        <div className="flex-1">
          <div
            ref={cyRef}
            className="w-full h-96 border border-gray-300 rounded-lg bg-gray-50"
            style={{ minHeight: "400px" }}
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
                            🚨 Suspicious Ring {index + 1}
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
          <strong>Interaction Guide:</strong> Click on nodes (accounts) or edges
          (transactions) to view details. Use layout buttons to change the graph
          arrangement. Scroll to zoom, drag to pan.
        </p>
      </div>
    </div>
  );
}
