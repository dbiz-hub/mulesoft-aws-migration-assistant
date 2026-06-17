import React, { useState, useEffect } from "react";
import ReactFlow, { 
  Controls, 
  Background, 
  MarkerType 
} from "reactflow";
import "reactflow/dist/style.css";
import { AlertCircle, RefreshCw } from "lucide-react";

// Helper to resolve styled node properties
const getStyledNode = (node) => {
  let borderColor = "#64748b"; // default gray
  let bgColor = "#0f172a";
  let textColor = "#cbd5e1";

  const type = node.type || "";
  const label = node.label || "";
  const id = node.id || "";

  if (type === "aws" || id.includes("apigw") || id.includes("lambda") || id === "sqs" || id === "dynamodb" || id === "rds" || id === "cloudwatch") {
    borderColor = "#ff9900"; // AWS orange
    bgColor = "#1a140c";
    textColor = "#ffaa33";
  } else if (type === "mule" || id.startsWith("mule") || id === "mq" || id === "os" || id === "logger") {
    borderColor = "#00a2df"; // MuleSoft cyan/blue
    bgColor = "#07131a";
    textColor = "#3fc3f7";
  } else if (type === "ai" || type === "report" || id === "ai" || id === "report") {
    borderColor = "#a855f7"; // AI/report purple
    bgColor = "#140e1b";
    textColor = "#d8b4fe";
  }

  return {
    id: node.id,
    position: node.position || { x: 0, y: 0 },
    data: { label: label },
    style: {
      background: bgColor,
      color: textColor,
      border: `2px solid ${borderColor}`,
      borderRadius: "10px",
      padding: "12px 16px",
      fontSize: "11px",
      fontWeight: "bold",
      boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
      width: 170,
      textAlign: "center"
    }
  };
};

export default function ArchitectureDiagram({ mode, activeTab, analyzedData }) {
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    setError(false);
    setLoading(true);

    try {
      const selectedMode = mode || (activeTab === "sourceMule" ? "mule" : "aws");

      const connectors = analyzedData?.connectors || [];
      const flows = analyzedData?.flows || [];
      
      const hasDb = connectors.includes("Database") || flows.some(f => f.processors?.some(p => p.type === "database"));
      const hasMq = connectors.includes("Anypoint MQ") || connectors.includes("VM") || flows.some(f => f.processors?.some(p => p.type?.startsWith("anypoint-mq") || p.type?.startsWith("vm")));
      const hasObjectStore = connectors.includes("Object Store") || flows.some(f => f.processors?.some(p => p.type?.startsWith("objectstore-")));
      const hasLogger = flows.some(f => f.processors?.some(p => p.type === "logger"));

      if (selectedMode === "mule") {
        // Render Source MuleSoft Architecture
        const localNodes = [
          { id: "client", label: "Client Application", type: "client", position: { x: 30, y: 100 } },
          { id: "muleExp", label: "Experience API Layer", type: "mule", position: { x: 230, y: 100 } },
          { id: "muleProc", label: "Process API Layer", type: "mule", position: { x: 430, y: 100 } },
          { id: "muleSys", label: "System API Layer", type: "mule", position: { x: 630, y: 100 } },
          { id: "external", label: "Backend / External System", type: "client", position: { x: 830, y: 100 } }
        ];

        if (hasMq) {
          localNodes.push({ id: "mq", label: "Anypoint MQ Broker", type: "mule", position: { x: 630, y: 220 } });
        }
        if (hasObjectStore) {
          localNodes.push({ id: "os", label: "Object Store Cache", type: "mule", position: { x: 430, y: 220 } });
        }
        if (hasLogger) {
          localNodes.push({ id: "logger", label: "Mule Logger", type: "mule", position: { x: 230, y: 220 } });
        }

        const localEdges = [
          { id: "em1", source: "client", target: "muleExp", stroke: "#00a2df" },
          { id: "em2", source: "muleExp", target: "muleProc", stroke: "#00a2df" },
          { id: "em3", source: "muleProc", target: "muleSys", stroke: "#00a2df" },
          { id: "em4", source: "muleSys", target: "external", stroke: "#00a2df" }
        ];

        if (hasMq) {
          localEdges.push({ id: "em5", source: "muleSys", target: "mq", stroke: "#00a2df" });
        }
        if (hasObjectStore) {
          localEdges.push({ id: "em6", source: "muleProc", target: "os", stroke: "#00a2df" });
        }
        if (hasLogger) {
          localEdges.push({ id: "em7", source: "muleExp", target: "logger", stroke: "#00a2df" });
        }

        setNodes(localNodes.map(getStyledNode));
        setEdges(localEdges.map(edge => ({
          id: edge.id,
          source: edge.source,
          target: edge.target,
          type: "smoothstep",
          animated: true,
          style: { stroke: edge.stroke, strokeWidth: 2 },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: edge.stroke,
            width: 16,
            height: 16
          }
        })));
      } else {
        // Render Target AWS Architecture
        const localNodes = [
          { id: "client", label: "Consumer Client", type: "client", position: { x: 30, y: 100 } },
          { id: "apigw", label: "Amazon API Gateway", type: "aws", position: { x: 230, y: 100 } },
          { id: "lambdaExp", label: "Experience API Lambda", type: "aws", position: { x: 430, y: 100 } },
          { id: "lambdaProc", label: "Process API Lambda", type: "aws", position: { x: 630, y: 100 } },
          { id: "lambdaSys", label: "System API Lambda", type: "aws", position: { x: 830, y: 100 } },
          { id: "external", label: "AWS Services / External System", type: "client", position: { x: 1030, y: 100 } }
        ];

        if (hasMq) {
          localNodes.push({ id: "sqs", label: "Amazon SQS Queue", type: "aws", position: { x: 630, y: 220 } });
        }
        if (hasObjectStore) {
          localNodes.push({ id: "dynamodb", label: "Amazon DynamoDB (Cache)", type: "aws", position: { x: 430, y: 220 } });
        }
        if (hasLogger) {
          localNodes.push({ id: "cloudwatch", label: "Amazon CloudWatch Logs", type: "aws", position: { x: 230, y: 220 } });
        }
        if (hasDb) {
          localNodes.push({ id: "rds", label: "Amazon RDS / Aurora", type: "aws", position: { x: 830, y: 220 } });
        }

        const localEdges = [
          { id: "e1", source: "client", target: "apigw", stroke: "#ff9900" },
          { id: "e2", source: "apigw", target: "lambdaExp", stroke: "#ff9900" },
          { id: "e3", source: "lambdaExp", target: "lambdaProc", stroke: "#ff9900" },
          { id: "e4", source: "lambdaProc", target: "lambdaSys", stroke: "#ff9900" },
          { id: "e5", source: "lambdaSys", target: "external", stroke: "#ff9900" }
        ];

        if (hasMq) {
          localEdges.push(
            { id: "e6a", source: "lambdaProc", target: "sqs", stroke: "#ff9900" },
            { id: "e6b", source: "sqs", target: "lambdaSys", stroke: "#ff9900" }
          );
        }
        if (hasObjectStore) {
          localEdges.push({ id: "e7", source: "lambdaProc", target: "dynamodb", stroke: "#ff9900" });
        }
        if (hasLogger) {
          localEdges.push({ id: "e8", source: "lambdaExp", target: "cloudwatch", stroke: "#ff9900" });
        }
        if (hasDb) {
          localEdges.push({ id: "e9", source: "lambdaSys", target: "rds", stroke: "#ff9900" });
        }

        setNodes(localNodes.map(getStyledNode));
        setEdges(localEdges.map(edge => ({
          id: edge.id,
          source: edge.source,
          target: edge.target,
          type: "smoothstep",
          animated: true,
          style: { stroke: edge.stroke, strokeWidth: 2 },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: edge.stroke,
            width: 16,
            height: 16
          }
        })));
      }
      setLoading(false);
    } catch (err) {
      console.error("Error setting up React Flow nodes:", err);
      setError(true);
      setLoading(false);
    }
  }, [mode, activeTab, analyzedData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8 bg-dark-900/40 border border-dark-700/50 rounded-xl my-4 w-full h-[300px]">
        <div className="text-xs text-slate-400 animate-pulse flex items-center gap-2">
          <RefreshCw className="w-4 h-4 animate-spin text-mule-400" />
          <span>Generating interactive diagram...</span>
        </div>
      </div>
    );
  }

  if (error || !nodes || nodes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-6 bg-dark-950 border border-dark-800 rounded-xl my-4 w-full h-[300px]">
        <AlertCircle className="w-8 h-8 text-red-500 mb-2" />
        <span className="text-xs text-slate-400">Failed to render diagram.</span>
      </div>
    );
  }

  return (
    <div className="w-full h-[300px] bg-[#090d16] border border-dark-800 rounded-xl overflow-hidden my-4 relative shadow-inner">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        nodesConnectable={false}
        nodesDraggable={true}
        elementsSelectable={true}
        zoomOnScroll={false}
        panOnScroll={false}
        preventScrolling={true}
      >
        <Controls 
          showInteractive={false} 
          className="bg-dark-900 border border-dark-700 text-white rounded shadow-lg fill-white stroke-white"
        />
        <Background color="#1e293b" gap={16} size={1} />
      </ReactFlow>
    </div>
  );
}
