import React, { useState, useEffect } from "react";
import ReactFlow, { 
  Controls, 
  Background, 
  MarkerType 
} from "reactflow";
import "reactflow/dist/style.css";
import { AlertCircle, RefreshCw, Layers, Cpu, ArrowRight } from "lucide-react";

// Helper to resolve styled node properties
const getStyledNode = (node) => {
  let borderColor = "#475569"; // default slate-600
  let bgColor = "#0f172a"; // default slate-900
  let textColor = "#cbd5e1"; // default slate-300

  if (node.type === "client") {
    borderColor = "#64748b";
    bgColor = "#0f172a";
    textColor = "#cbd5e1";
  } else if (node.type === "aws" || node.id.includes("aws") || node.id.includes("lambda") || node.id === "apigw" || node.id === "sqs" || node.id === "dynamodb" || node.id === "rds" || node.id === "cloudwatch") {
    borderColor = "#ff9900"; // AWS orange
    bgColor = "#1a140c";
    textColor = "#ffaa33";
  } else if (node.type === "mule" || node.id.startsWith("Mule") || node.id.includes("mule") || node.id === "os" || node.id === "mq" || node.id === "logger") {
    borderColor = "#00a2df"; // MuleSoft blue
    bgColor = "#07131a";
    textColor = "#3fc3f7";
  } else if (node.type === "ai" || node.id.includes("AI") || node.id === "report" || node.id === "blueprint" || node.id === "parser" || node.id === "sam" || node.id === "deploy") {
    borderColor = "#a855f7"; // AI purple
    bgColor = "#140e1b";
    textColor = "#d8b4fe";
  }

  return {
    id: node.id,
    position: node.position || { x: 0, y: 0 },
    data: { label: node.label || node.data?.label || node.id },
    style: {
      background: bgColor,
      color: textColor,
      border: `1.5px solid ${borderColor}`,
      borderRadius: "8px",
      padding: "10px 14px",
      fontSize: "11px",
      fontWeight: "bold",
      boxShadow: "0 4px 6px -1px rgba(0,0,0,0.3)",
      width: 160,
      textAlign: "center"
    }
  };
};

export default function ArchitectureDiagram({ activeTab, analyzedData }) {
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    setError(false);
    setLoading(true);

    try {
      if (activeTab === "aiTarget") {
        // Fetch AI nodes & edges from backend route
        fetch("/api/architecture/diagram-data")
          .then((res) => {
            if (!res.ok) throw new Error("Backend unavailable");
            return res.json();
          })
          .then((data) => {
            const formattedNodes = (data.nodes || []).map((node, index) => {
              // Stagger nodes dynamically for visualization
              let x = 50 + index * 180;
              let y = 140;

              if (node.type === "client") {
                x = 50;
                y = 150;
              } else if (node.id === "cloudwatch") {
                x = 350;
                y = 260;
              } else if (node.id === "sqs") {
                x = 550;
                y = 260;
              } else if (node.id === "dynamodb" || node.id === "rds") {
                x = 750;
                y = 260;
              } else if (node.id === "apigw") {
                x = 220;
                y = 150;
              } else if (node.id === "lambdaExp") {
                x = 390;
                y = 150;
              } else if (node.id === "lambdaProc") {
                x = 560;
                y = 150;
              } else if (node.id === "lambdaSys") {
                x = 730;
                y = 150;
              } else if (node.type === "external") {
                x = 920;
                y = 150;
              }

              return getStyledNode({
                id: node.id,
                label: node.label,
                type: node.type,
                position: { x, y }
              });
            });

            const formattedEdges = (data.edges || []).map((edge) => {
              const isAws = edge.source.includes("lambda") || edge.source === "apigw";
              return {
                id: edge.id,
                source: edge.source,
                target: edge.target,
                type: "smoothstep",
                animated: true,
                style: { stroke: isAws ? "#ff9900" : "#64748b", strokeWidth: 2 },
                markerEnd: {
                  type: MarkerType.ArrowClosed,
                  color: isAws ? "#ff9900" : "#64748b",
                  width: 16,
                  height: 16
                }
              };
            });

            setNodes(formattedNodes);
            setEdges(formattedEdges);
            setLoading(false);
          })
          .catch((err) => {
            console.error("Failed fetching AI diagram data. Falling back locally.", err);
            loadLocalSafeTarget();
          });
      } else if (activeTab === "localTarget") {
        loadLocalSafeTarget();
      } else if (activeTab === "sourceMule") {
        loadSourceMule();
      } else if (activeTab === "migrationFlow") {
        loadMigrationFlow();
      }
    } catch (err) {
      console.error("Error setting up React Flow nodes:", err);
      setError(true);
      setLoading(false);
    }
  }, [activeTab, analyzedData]);

  // Static Local Safe AWS target
  const loadLocalSafeTarget = () => {
    const localNodes = [
      { id: "client", label: "Consumer Client", type: "client", position: { x: 50, y: 150 } },
      { id: "apigw", label: "Amazon API Gateway", type: "aws", position: { x: 230, y: 150 } },
      { id: "lambdaExp", label: "Experience API Lambda", type: "aws", position: { x: 410, y: 150 } },
      { id: "lambdaProc", label: "Process API Lambda", type: "aws", position: { x: 590, y: 150 } },
      { id: "lambdaSys", label: "System API Lambda", type: "aws", position: { x: 770, y: 150 } },
      { id: "sqs", label: "Amazon SQS Queue", type: "aws", position: { x: 590, y: 260 } },
      { id: "dynamodb", label: "Amazon DynamoDB (Cache)", type: "aws", position: { x: 770, y: 260 } },
      { id: "cloudwatch", label: "Amazon CloudWatch", type: "aws", position: { x: 410, y: 260 } },
      { id: "external", label: "External Systems", type: "external", position: { x: 950, y: 150 } }
    ].map(getStyledNode);

    const localEdges = [
      { id: "e1", source: "client", target: "apigw", stroke: "#ff9900" },
      { id: "e2", source: "apigw", target: "lambdaExp", stroke: "#ff9900" },
      { id: "e3", source: "lambdaExp", target: "lambdaProc", stroke: "#ff9900" },
      { id: "e4", source: "lambdaProc", target: "lambdaSys", stroke: "#ff9900" },
      { id: "e5", source: "lambdaSys", target: "external", stroke: "#ff9900" },
      { id: "e6", source: "lambdaSys", target: "sqs", stroke: "#ff9900" },
      { id: "e7", source: "lambdaProc", target: "dynamodb", stroke: "#ff9900" },
      { id: "e8", source: "lambdaExp", target: "cloudwatch", stroke: "#ff9900" }
    ].map(edge => ({
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
    }));

    setNodes(localNodes);
    setEdges(localEdges);
    setLoading(false);
  };

  // Static MuleSoft Source Layering
  const loadSourceMule = () => {
    const localNodes = [
      { id: "client", label: "Client Application", type: "client", position: { x: 50, y: 150 } },
      { id: "muleExp", label: "Mule Experience API", type: "mule", position: { x: 230, y: 150 } },
      { id: "muleProc", label: "Mule Process API", type: "mule", position: { x: 410, y: 150 } },
      { id: "muleSys", label: "Mule System API", type: "mule", position: { x: 590, y: 150 } },
      { id: "backend", label: "Backend Database/System", type: "external", position: { x: 770, y: 150 } },
      { id: "mq", label: "Anypoint MQ Broker", type: "mule", position: { x: 590, y: 260 } },
      { id: "os", label: "Object Store Cache", type: "mule", position: { x: 410, y: 260 } },
      { id: "logger", label: "Mule Logger", type: "mule", position: { x: 230, y: 260 } }
    ].map(getStyledNode);

    const localEdges = [
      { id: "em1", source: "client", target: "muleExp", stroke: "#00a2df" },
      { id: "em2", source: "muleExp", target: "muleProc", stroke: "#00a2df" },
      { id: "em3", source: "muleProc", target: "muleSys", stroke: "#00a2df" },
      { id: "em4", source: "muleSys", target: "backend", stroke: "#00a2df" },
      { id: "em5", source: "muleSys", target: "mq", stroke: "#00a2df" },
      { id: "em6", source: "muleProc", target: "os", stroke: "#00a2df" },
      { id: "em7", source: "muleExp", target: "logger", stroke: "#00a2df" }
    ].map(edge => ({
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
    }));

    setNodes(localNodes);
    setEdges(localEdges);
    setLoading(false);
  };

  // Static Mule-to-AWS Migration Flow
  const loadMigrationFlow = () => {
    const localNodes = [
      { id: "muleXml", label: "Mule XML / DWL Source", type: "mule", position: { x: 50, y: 150 } },
      { id: "parser", label: "AST Parser Engine", type: "mule", position: { x: 210, y: 150 } },
      { id: "ai", label: "AI Translation Service", type: "ai", position: { x: 370, y: 150 } },
      { id: "blueprint", label: "Architecture Blueprint", type: "ai", position: { x: 530, y: 150 } },
      { id: "awsMap", label: "AWS Component Mapper", type: "aws", position: { x: 690, y: 150 } },
      { id: "sam", label: "SAM Template Generator", type: "aws", position: { x: 850, y: 150 } },
      { id: "deploy", label: "Mock AWS Deployment", type: "aws", position: { x: 1010, y: 150 } }
    ].map(getStyledNode);

    const localEdges = [
      { id: "ef1", source: "muleXml", target: "parser", stroke: "#64748b" },
      { id: "ef2", source: "parser", target: "ai", stroke: "#a855f7" },
      { id: "ef3", source: "ai", target: "blueprint", stroke: "#a855f7" },
      { id: "ef4", source: "blueprint", target: "awsMap", stroke: "#ff9900" },
      { id: "ef5", source: "awsMap", target: "sam", stroke: "#ff9900" },
      { id: "ef6", source: "sam", target: "deploy", stroke: "#ff9900" }
    ].map(edge => ({
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
    }));

    setNodes(localNodes);
    setEdges(localEdges);
    setLoading(false);
  };

  const renderFallbackHtml = () => {
    return (
      <div className="flex flex-col items-center justify-center p-6 bg-dark-950 border border-dark-800 rounded-xl my-4 w-full h-[320px] overflow-y-auto">
        <div className="flex items-center gap-2 text-slate-400 text-xs font-semibold mb-6">
          <AlertCircle className="w-4 h-4 text-amber-500" />
          <span>Diagram Display Fallback (Rendering Boundaries)</span>
        </div>
        
        {activeTab === "sourceMule" ? (
          <div className="flex flex-col md:flex-row items-center justify-center gap-4 text-xs font-mono">
            <div className="px-3 py-1.5 border border-slate-700 bg-slate-900 rounded font-bold text-slate-300">Client App</div>
            <ArrowRight className="w-4 h-4 text-slate-600 hidden md:block" />
            <div className="px-3 py-1.5 border border-cyan-500 bg-cyan-950/20 rounded font-bold text-cyan-400">Experience API</div>
            <ArrowRight className="w-4 h-4 text-slate-600 hidden md:block" />
            <div className="px-3 py-1.5 border border-cyan-500 bg-cyan-950/20 rounded font-bold text-cyan-400">Process API</div>
            <ArrowRight className="w-4 h-4 text-slate-600 hidden md:block" />
            <div className="px-3 py-1.5 border border-cyan-500 bg-cyan-950/20 rounded font-bold text-cyan-400">System API</div>
            <ArrowRight className="w-4 h-4 text-slate-600 hidden md:block" />
            <div className="px-3 py-1.5 border border-slate-700 bg-slate-900 rounded font-bold text-slate-300">Backend Systems</div>
          </div>
        ) : activeTab === "migrationFlow" ? (
          <div className="flex flex-col md:flex-row items-center justify-center gap-4 text-xs font-mono">
            <div className="px-3 py-1.5 border border-cyan-500 bg-cyan-950/20 rounded font-bold text-cyan-400">Mule XML Code</div>
            <ArrowRight className="w-4 h-4 text-purple-600 hidden md:block" />
            <div className="px-3 py-1.5 border border-purple-500 bg-purple-950/20 rounded font-bold text-purple-400">Parser + AI Analyzers</div>
            <ArrowRight className="w-4 h-4 text-purple-600 hidden md:block" />
            <div className="px-3 py-1.5 border border-purple-500 bg-purple-950/20 rounded font-bold text-purple-400">Blueprint Report</div>
            <ArrowRight className="w-4 h-4 text-orange-600 hidden md:block" />
            <div className="px-3 py-1.5 border border-orange-500 bg-orange-950/20 rounded font-bold text-orange-400">AWS Target SAM Project</div>
          </div>
        ) : (
          <div className="flex flex-col md:flex-row items-center justify-center gap-4 text-xs font-mono">
            <div className="px-3 py-1.5 border border-slate-700 bg-slate-900 rounded font-bold text-slate-300">Client Client</div>
            <ArrowRight className="w-4 h-4 text-orange-600 hidden md:block" />
            <div className="px-3 py-1.5 border border-orange-500 bg-orange-950/20 rounded font-bold text-orange-400">API Gateway</div>
            <ArrowRight className="w-4 h-4 text-orange-600 hidden md:block" />
            <div className="px-3 py-1.5 border border-orange-500 bg-orange-950/20 rounded font-bold text-orange-400">Lambda Functions</div>
            <ArrowRight className="w-4 h-4 text-orange-600 hidden md:block" />
            <div className="px-3 py-1.5 border border-orange-500 bg-orange-950/20 rounded font-bold text-orange-400">SQS / RDS / DynamoDB</div>
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8 bg-dark-900/40 border border-dark-700/50 rounded-xl my-4 w-full h-[320px]">
        <div className="text-xs text-slate-400 animate-pulse flex items-center gap-2">
          <RefreshCw className="w-4 h-4 animate-spin text-mule-400" />
          <span>Generating interactive diagram...</span>
        </div>
      </div>
    );
  }

  if (error || !nodes || nodes.length === 0) {
    return renderFallbackHtml();
  }

  return (
    <div className="w-full h-[350px] bg-[#090d16] border border-dark-800 rounded-xl overflow-hidden my-4 relative shadow-inner">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        fitViewOptions={{ padding: 0.2 }}
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
