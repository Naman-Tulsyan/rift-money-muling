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

interface GraphVisualizationProps {
  graphData: GraphData;
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
}: GraphVisualizationProps) {
  const cyRef = useRef<HTMLDivElement>(null);
  const cyInstance = useRef<Core | null>(null);
  const [selectedElement, setSelectedElement] = useState<any>(null);
  const [layoutType, setLayoutType] = useState<
    "cose" | "circle" | "grid" | "breadthfirst"
  >("cose");

  useEffect(() => {
    if (!cyRef.current || !graphData) return;

    // Prepare nodes and edges for Cytoscape
    const nodes: NodeDefinition[] = graphData.nodes.map((node) => ({
      data: { id: node.id },
    }));

    const edges: EdgeDefinition[] = graphData.edges.map((edge) => ({
      data: {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        amount: edge.amount,
        timestamp: edge.timestamp,
        weight: Math.log10(edge.amount + 1), // For edge thickness
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

    return () => {
      cyInstance.current?.destroy();
    };
  }, [graphData, layoutType]);

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

      {/* Layout Controls */}
      <div className="flex gap-2 mb-4 flex-wrap">
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
