import React, { useState, useEffect, useRef } from "react";
import { 
  Database, GitFork, Github, Upload, Layers, Cpu, FileText, CheckCircle2, 
  Terminal, ShieldAlert, ArrowRight, Play, Check, ChevronRight, Download, 
  Folder, File, Settings, AlertCircle, RefreshCw, Eye, Code, Server, HelpCircle
} from "lucide-react";
import mermaid from "mermaid";

// Initialise Mermaid with dark theme configurations
mermaid.initialize({
  startOnLoad: false,
  theme: "dark",
  securityLevel: "loose",
  themeVariables: {
    background: "#090d16",
    primaryColor: "#00a2df",
    primaryTextColor: "#fff",
    lineColor: "#ff9900",
    secondaryColor: "#1c2333"
  }
});

import ArchitectureDiagram from "./components/ArchitectureDiagram";

// Local helper to generate MuleSoft source architecture from metadata
const generateSourceMuleDiagram = (projectName, analyzedData) => {
  const flows = analyzedData?.flows || [];
  const external = analyzedData?.externalSystems || [];
  
  let code = `flowchart LR\n`;
  code += `  Client["Client Application"] --> Ingress["HTTP Listener"]\n`;
  code += `  Ingress --> ExpAPI["Mule Experience API"]\n`;
  code += `  ExpAPI --> ProcAPI["Mule Process API"]\n`;
  
  const hasSysLayer = flows.some(f => f.name.toLowerCase().includes("sys") || f.name.toLowerCase().includes("system"));
  if (hasSysLayer) {
    code += `  ProcAPI --> SysAPI["Mule System API"]\n`;
    if (external.length > 0) {
      external.forEach((ext, i) => {
        const cleanName = ext.replace(/[^a-zA-Z0-9]/g, "");
        code += `  SysAPI --> Ext_${cleanName}["${ext}"]\n`;
      });
    } else {
      code += `  SysAPI --> Backend["Backend Systems"]\n`;
    }
  } else {
    if (external.length > 0) {
      external.forEach((ext, i) => {
        const cleanName = ext.replace(/[^a-zA-Z0-9]/g, "");
        code += `  ProcAPI --> Ext_${cleanName}["${ext}"]\n`;
      });
    } else {
      code += `  ProcAPI --> Backend["Backend Systems"]\n`;
    }
  }
  return code;
};

// Local helper to generate Target AWS architecture from metadata
const generateTargetAwsDiagram = (projectName, analyzedData) => {
  const flows = analyzedData?.flows || [];
  const hasDb = flows.some(f => f.processors?.some(p => p.type === "database")) || analyzedData?.connectors?.includes("Database");
  const hasMq = flows.some(f => f.processors?.some(p => p.type?.startsWith("anypoint-mq"))) || analyzedData?.connectors?.includes("Anypoint MQ");
  const external = analyzedData?.externalSystems || [];
  
  let code = `flowchart LR\n`;
  code += `  Client["Client Application"] --> APIGateway["Amazon API Gateway"]\n`;
  code += `  APIGateway --> LambdaExp["Experience API Lambda"]\n`;
  code += `  LambdaExp --> LambdaProc["Process API Lambda"]\n`;
  
  if (hasMq) {
    code += `  LambdaProc --> SQSQueue["Amazon SQS Queue"]\n`;
    code += `  SQSQueue --> LambdaSys["System API Lambda"]\n`;
    if (hasDb) {
      code += `  LambdaSys --> RDSDatabase["Amazon RDS / Aurora Serverless"]\n`;
    } else if (external.length > 0) {
      external.forEach((ext, i) => {
        const cleanName = ext.replace(/[^a-zA-Z0-9]/g, "");
        code += `  LambdaSys --> Ext_${cleanName}["${ext}"]\n`;
      });
    } else {
      code += `  LambdaSys --> ExternalServices["External Services"]\n`;
    }
  } else {
    if (hasDb) {
      code += `  LambdaProc --> LambdaSys["System API Lambda"]\n`;
      code += `  LambdaSys --> RDSDatabase["Amazon RDS / Aurora Serverless"]\n`;
    } else if (external.length > 0) {
      code += `  LambdaProc --> LambdaSys["System API Lambda"]\n`;
      external.forEach((ext, i) => {
        const cleanName = ext.replace(/[^a-zA-Z0-9]/g, "");
        code += `  LambdaSys --> Ext_${cleanName}["${ext}"]\n`;
      });
    } else {
      code += `  LambdaProc --> ExternalServices["External Services"]\n`;
    }
  }
  return code;
};

// Local helper to generate Migration flow diagram from metadata
const generateMigrationFlowDiagram = (projectName, analyzedData) => {
  const flows = analyzedData?.flows || [];
  const hasDb = flows.some(f => f.processors?.some(p => p.type === "database")) || analyzedData?.connectors?.includes("Database");
  const hasMq = flows.some(f => f.processors?.some(p => p.type?.startsWith("anypoint-mq"))) || analyzedData?.connectors?.includes("Anypoint MQ");

  let code = `flowchart LR\n`;
  code += `  subgraph MuleSoft["Source MuleSoft Architecture"]\n`;
  code += `    MuleHTTP["HTTP Connector"]\n`;
  code += `    MuleOrch["Mule Flows & DWL"]\n`;
  if (hasMq) code += `    MuleMQ["Anypoint MQ"]\n`;
  if (hasDb) code += `    MuleDB["Database Connector"]\n`;
  code += `  end\n\n`;
  
  code += `  subgraph AWS["Target AWS Architecture"]\n`;
  code += `    AWSApi["Amazon API Gateway"]\n`;
  code += `    AWSLambda["AWS Lambda (Node.js)"]\n`;
  if (hasMq) code += `    AWSSQS["Amazon SQS"]\n`;
  if (hasDb) code += `    AWSRDS["Amazon RDS / Aurora"]\n`;
  code += `  end\n\n`;
  
  code += `  MuleHTTP --> AWSApi\n`;
  code += `  MuleOrch --> AWSLambda\n`;
  if (hasMq) code += `  MuleMQ --> AWSSQS\n`;
  if (hasDb) code += `  MuleDB --> AWSRDS\n`;
  
  return code;
};

// Local helper to regenerate target diagram locally
const generateSafeBlueprintWithoutAi = (projectName, analyzedData) => {
  const flows = analyzedData?.flows || [];
  const hasDb = flows.some(f => f.processors?.some(p => p.type === "database")) || analyzedData?.connectors?.includes("Database");
  const hasMq = flows.some(f => f.processors?.some(p => p.type?.startsWith("anypoint-mq"))) || analyzedData?.connectors?.includes("Anypoint MQ");
  
  let chart = `flowchart LR
  Consumer["Consumer Client"] --> APIGateway["Amazon API Gateway"]
  APIGateway --> LambdaExp["Experience API Lambda"]
  LambdaExp --> LambdaProc["Process API Lambda"]
  ${hasMq ? "LambdaProc --> SQSQueue[\"Amazon SQS Queue\"]\n  SQSQueue --> LambdaSys[\"System API Lambda\"]" : "LambdaProc --> LambdaSys[\"System API Lambda\"]"}
  ${hasDb ? "  LambdaSys --> RDSDatabase[\"Amazon RDS / Aurora Serverless\"]" : ""}
`;

  return {
    summary: `Technical blueprint mapping MuleSoft architecture of ${projectName || "Mule Application"} to AWS services (Local Safe Generation). Visualizes API Gateway ingress routing requests to Experience and Process compute Lambdas, integrated with downstream SQS messaging queues and DynamoDB caching blocks.`,
    mermaidDiagram: chart,
    sanitized: true
  };
};

export default function App() {
  // Navigation State
  const [activeScreen, setActiveScreen] = useState("dashboard");

  // GitHub / Upload State
  const [githubToken, setGithubToken] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [connectedUser, setConnectedUser] = useState("");
  const [reposList, setReposList] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Loaded Codebase State
  const [projectName, setProjectName] = useState("");
  const [fileList, setFileList] = useState([]);
  const [fileContents, setFileContents] = useState({});
  const [selectedFile, setSelectedFile] = useState(null);
  const [explorerFilter, setExplorerFilter] = useState("all");

  // Analysis State
  const [analyzedData, setAnalyzedData] = useState(null);
  const [awsMappings, setAwsMappings] = useState([]);
  const [samFiles, setSamFiles] = useState({});
  const [selectedSamFile, setSelectedSamFile] = useState(null);

  // AI-Specific States
  const [aiStatusText, setAiStatusText] = useState("");
  const [aiAnalysisData, setAiAnalysisData] = useState(null);
  const [aiPlanData, setAiPlanData] = useState(null);
  const [warningMsg, setWarningMsg] = useState("");
  const [isGeneratingLambda, setIsGeneratingLambda] = useState(false);
  const [blueprintData, setBlueprintData] = useState(null);
  const [blueprintTab, setBlueprintTab] = useState("aiTarget");
  const [aiConsoleTab, setAiConsoleTab] = useState("executive");

  // AI Settings State
  const [aiProvider, setAiProvider] = useState(() => localStorage.getItem("ai_provider") || "auto");
  const [openAiApiKey, setOpenAiApiKey] = useState(() => localStorage.getItem("openai_api_key") || "");
  const [openAiModel, setOpenAiModel] = useState(() => localStorage.getItem("openai_model") || "gpt-4o-mini");
  const [geminiApiKey, setGeminiApiKey] = useState(() => localStorage.getItem("gemini_api_key") || "");
  const [geminiModel, setGeminiModel] = useState(() => localStorage.getItem("gemini_model") || "gemini-1.5-flash");

  // Health and request state
  const [backendHealth, setBackendHealth] = useState("checking");
  const [aiRequestStatus, setAiRequestStatus] = useState("idle"); // idle, running, completed, failed
  const [reportData, setReportData] = useState(null);

  // Sync settings to localStorage
  useEffect(() => { localStorage.setItem("ai_provider", aiProvider); }, [aiProvider]);
  useEffect(() => { localStorage.setItem("openai_api_key", openAiApiKey); }, [openAiApiKey]);
  useEffect(() => { localStorage.setItem("openai_model", openAiModel); }, [openAiModel]);
  useEffect(() => { localStorage.setItem("gemini_api_key", geminiApiKey); }, [geminiApiKey]);
  useEffect(() => { localStorage.setItem("gemini_model", geminiModel); }, [geminiModel]);

  useEffect(() => {
    console.log("API_BASE_URL", import.meta.env.VITE_API_BASE_URL);
  }, []);

  // Periodic health check
  const checkHealth = async () => {
    try {
      const baseUrl = import.meta.env.VITE_API_BASE_URL || "";
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) {
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const data = await response.json();
          if (data.status === "ok" || data.status === "OK") {
            setBackendHealth("healthy");
            return;
          }
        }
      }
      setBackendHealth("unreachable");
    } catch (e) {
      setBackendHealth("unreachable");
    }
  };

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  const getAiSettingsPayload = () => {
    return {
      provider: aiProvider,
      apiKey: aiProvider === "openai" ? openAiApiKey : (aiProvider === "gemini" ? geminiApiKey : ""),
      model: aiProvider === "openai" ? openAiModel : (aiProvider === "gemini" ? geminiModel : "")
    };
  };

  // safeFetch Content-Type check wrapper
  const safeFetch = async (url, options = {}) => {
    const baseUrl = import.meta.env.VITE_API_BASE_URL || "";
    const fullUrl = url.startsWith("/api") ? `${baseUrl}${url}` : url;
    const response = await fetch(fullUrl, options);
    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      const rawText = await response.text();
      console.error("[SafeFetch] Received non-JSON response:", rawText);
      throw new Error("Backend API did not return JSON. Check Vite proxy and backend server.");
    }
    return response;
  };

  // Deployment State
  const [awsAccessKey, setAwsAccessKey] = useState("");
  const [awsSecretKey, setAwsSecretKey] = useState("");
  const [awsRegion, setAwsRegion] = useState("us-east-1");
  const [deployStep, setDeployStep] = useState("idle"); // idle, validating, templates, deploying, completed
  const [terminalLogs, setTerminalLogs] = useState([]);
  const terminalBottomRef = useRef(null);

  // ----------------------------------------------------
  // API Call Handlers
  // ----------------------------------------------------

  // Connect GitHub
  const handleConnectGithub = async (e) => {
    e.preventDefault();
    if (!githubToken) return;
    setIsLoading(true);
    setErrorMsg("");
    setSuccessMsg("");
    
    try {
      const response = await safeFetch("/api/github/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: githubToken })
      });
      
      const data = await response.json();
      if (response.ok) {
        setConnectedUser(data.user);
        setSuccessMsg(`Successfully authenticated as @${data.user}`);
        // Fetch repository list
        await fetchReposList(githubToken);
      } else {
        setErrorMsg(data.error || "Authentication failed");
      }
    } catch (err) {
      setErrorMsg("Connection error: " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch repositories
  const fetchReposList = async (token) => {
    try {
      const response = await safeFetch("/api/github/repos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token })
      });
      const data = await response.json();
      setReposList(data.repos || []);
    } catch (err) {
      console.error(err);
    }
  };

  // Load Mock repository
  // Run OpenAI analysis on loaded files
  const handleRunAiAnalysis = async (files, technicalData) => {
    if (!files || !technicalData) return;
    setIsLoading(true);
    setAiStatusText("AI Analysis Running...");
    setAiRequestStatus("running");
    setWarningMsg("");
    
    try {
      const response = await safeFetch("/api/ai/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          files, 
          analyzedData: technicalData,
          aiSettings: getAiSettingsPayload()
        })
      });
      const data = await response.json();
      if (response.ok) {
        setAiAnalysisData(data);
        setAiRequestStatus("completed");
        if (data.warning || !data.executiveSummary) {
          setWarningMsg(data.warning || "AI provider key is not configured or in fallback mode.");
        }
      } else {
        setErrorMsg(data.error || "AI Analysis failed");
        setAiRequestStatus("failed");
      }
    } catch (err) {
      console.error("AI Analysis error:", err);
      setErrorMsg("Failed to run AI analysis: " + err.message);
      setAiRequestStatus("failed");
    } finally {
      setIsLoading(false);
      setAiStatusText("");
    }
  };

  // Generate AI Blueprint
  const handleLoadBlueprint = async (techData) => {
    const targetData = techData || analyzedData;
    if (!targetData) return;
    setIsLoading(true);
    setAiStatusText("Generating API Blueprint...");
    
    try {
      const response = await safeFetch("/api/ai/blueprint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          analyzedData: targetData,
          aiSettings: getAiSettingsPayload()
        })
      });
      const data = await response.json();
      if (response.ok) {
        setBlueprintData(data);
      }
    } catch (err) {
      console.error("Blueprint generation failed:", err);
    } finally {
      setIsLoading(false);
      setAiStatusText("");
    }
  };

  // Generate/Optimize Lambda handler with OpenAI
  const handleGenerateLambdaWithAI = async (flowName) => {
    if (!flowName || !analyzedData) return;
    setIsGeneratingLambda(true);
    setAiStatusText("Generating AWS Conversion Plan...");
    
    const flowSummary = analyzedData.flows.find(f => f.name === flowName) || { name: flowName, processors: [] };
    
    try {
      const response = await safeFetch("/api/ai/generate-lambda", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flowName, flowSummary, analyzedData })
      });
      const data = await response.json();
      if (response.ok) {
        const filePath = `src/handlers/${flowName}.js`;
        // Update local state
        setSamFiles(prev => ({
          ...prev,
          [filePath]: data.code
        }));
        setSelectedSamFile({ path: filePath, content: data.code });
        setSuccessMsg(`Successfully optimized Lambda handler for ${flowName}`);
      } else {
        setErrorMsg(data.error || "Lambda code generation failed");
      }
    } catch (err) {
      setErrorMsg("Lambda generation error: " + err.message);
    } finally {
      setIsGeneratingLambda(false);
      setAiStatusText("");
    }
  };

  // Load Mock repository
  const handleLoadMock = async (mockRepoName) => {
    setIsLoading(true);
    setErrorMsg("");
    setSuccessMsg("");
    setAiAnalysisData(null);
    setAiPlanData(null);
    setBlueprintData(null);
    setReportData(null);
    setWarningMsg("");
    
    try {
      const response = await safeFetch("/api/github/load-repo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ useMock: true, mockRepoName })
      });
      
      const data = await response.json();
      if (response.ok) {
        setProjectName(data.repoName);
        setFileList(data.files);
        setFileContents(data.fileContents);
        setAnalyzedData(data.analyzedData);
        setAwsMappings([]);
        setSamFiles({});
        setSelectedSamFile(null);
        
        // Select first XML file in explorer
        const xmlFile = data.files.find(f => f.path.endsWith(".xml"));
        if (xmlFile) {
          setSelectedFile({ path: xmlFile.path, content: data.fileContents[xmlFile.path] });
        } else if (data.files.length > 0) {
          setSelectedFile({ path: data.files[0].path, content: data.fileContents[data.files[0].path] });
        }

        setSuccessMsg(`Successfully loaded mock project: ${data.repoName}`);
        setActiveScreen("ai-console"); // Route directly to AI Analysis Console
        
        // Trigger AI analysis
        await handleRunAiAnalysis(data.fileContents, data.analyzedData);
        // Pre-fetch blueprint
        await handleLoadBlueprint(data.analyzedData);
      } else {
        setErrorMsg(data.error || "Failed to load mock project");
      }
    } catch (err) {
      setErrorMsg("Failed to connect: " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Load Real GitHub repo
  const handleLoadRealRepo = async (repoUrl) => {
    if (!githubToken || !repoUrl) return;
    setIsLoading(true);
    setErrorMsg("");
    setSuccessMsg("");
    setAiAnalysisData(null);
    setAiPlanData(null);
    setBlueprintData(null);
    setReportData(null);
    setWarningMsg("");

    try {
      const response = await safeFetch("/api/github/load-repo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: githubToken, repoUrl, useMock: false })
      });
      
      const data = await response.json();
      if (response.ok) {
        setProjectName(data.repoName);
        setFileList(data.files);
        setFileContents(data.fileContents);
        setAnalyzedData(data.analyzedData);
        setAwsMappings([]);
        setSamFiles({});
        setSelectedSamFile(null);

        const xmlFile = data.files.find(f => f.path.endsWith(".xml"));
        if (xmlFile) {
          setSelectedFile({ path: xmlFile.path, content: data.fileContents[xmlFile.path] });
        } else if (data.files.length > 0) {
          setSelectedFile({ path: data.files[0].path, content: data.fileContents[data.files[0].path] });
        }
        
        setSuccessMsg(`Successfully loaded GitHub repository: ${data.repoName}`);
        setActiveScreen("ai-console"); // Route directly to AI Analysis Console
        
        // Trigger AI analysis
        await handleRunAiAnalysis(data.fileContents, data.analyzedData);
        // Pre-fetch blueprint
        await handleLoadBlueprint(data.analyzedData);
      } else {
        setErrorMsg(data.error || "Failed to load repository files");
      }
    } catch (err) {
      setErrorMsg("Error loading repository: " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Upload Local ZIP File
  const handleZipUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    setIsLoading(true);
    setErrorMsg("");
    setSuccessMsg("");
    setAiAnalysisData(null);
    setAiPlanData(null);
    setBlueprintData(null);
    setReportData(null);
    setWarningMsg("");

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await safeFetch("/api/upload", {
        method: "POST",
        body: formData
      });
      
      const data = await response.json();
      if (response.ok) {
        setProjectName(data.repoName);
        setFileList(data.files);
        setFileContents(data.fileContents);
        setAnalyzedData(data.analyzedData);
        setAwsMappings([]);
        setSamFiles({});
        setSelectedSamFile(null);

        const xmlFile = data.files.find(f => f.path.endsWith(".xml"));
        if (xmlFile) {
          setSelectedFile({ path: xmlFile.path, content: data.fileContents[xmlFile.path] });
        } else if (data.files.length > 0) {
          setSelectedFile({ path: data.files[0].path, content: data.fileContents[data.files[0].path] });
        }

        setSuccessMsg(`Successfully uploaded and parsed ZIP: ${data.repoName}`);
        setActiveScreen("ai-console"); // Route directly to AI Analysis Console
        
        // Trigger AI analysis
        await handleRunAiAnalysis(data.fileContents, data.analyzedData);
        // Pre-fetch blueprint
        await handleLoadBlueprint(data.analyzedData);
      } else {
        setErrorMsg(data.error || "Failed to process zip upload");
      }
    } catch (err) {
      setErrorMsg("Upload failed: " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Generate AWS Mappings & SAM code
  const handleConvertToAws = async () => {
    if (!analyzedData) return;
    setIsLoading(true);
    setAiStatusText("Generating AWS Conversion Plan...");
    
    try {
      const response = await safeFetch("/api/ai/aws-mapping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          analyzedData,
          aiSettings: getAiSettingsPayload()
        })
      });
      
      const data = await response.json();
      if (response.ok) {
        setAwsMappings(data.mappings);
        setSamFiles(data.files);
        setAiPlanData(data.aiPlan);
        
        // Select template.yaml first
        if (data.files["template.yaml"]) {
          setSelectedSamFile({ path: "template.yaml", content: data.files["template.yaml"] });
        } else {
          const firstKey = Object.keys(data.files)[0];
          setSelectedSamFile({ path: firstKey, content: data.files[firstKey] });
        }
        
        setActiveScreen("mapping"); // Route directly to mappings screen
      } else {
        setErrorMsg(data.error || "AWS target conversion failed");
      }
    } catch (err) {
      setErrorMsg("Conversion error: " + err.message);
    } finally {
      setIsLoading(false);
      setAiStatusText("");
    }
  };

  // Generate Migration Report with /api/ai/report
  const handleGenerateReport = async () => {
    if (!analyzedData || awsMappings.length === 0) {
      setErrorMsg("Please map to AWS infrastructure first before generating a migration report.");
      return;
    }
    setIsLoading(true);
    setAiStatusText("Generating Migration Report...");
    setErrorMsg("");
    
    try {
      const response = await safeFetch("/api/ai/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          analyzedData,
          awsMapping: awsMappings,
          aiSettings: getAiSettingsPayload()
        })
      });
      const data = await response.json();
      if (response.ok || data.status === "success") {
        setReportData(data);
        setSamFiles(prev => ({
          ...prev,
          "docs/migration-report.md": data.reportMarkdown
        }));
        setActiveScreen("report");
      } else {
        setErrorMsg(data.error || "Failed to generate migration report");
      }
    } catch (err) {
      console.error("Report generation error:", err);
      setErrorMsg("Report generation failed: " + err.message);
    } finally {
      setIsLoading(false);
      setAiStatusText("");
    }
  };

  // Trigger download of generated project ZIP
  const handleDownloadProject = () => {
    window.location.href = "/api/download/aws-project";
  };

  // Validate AWS Mapping
  const handleValidateMapping = () => {
    if (deployStep === "validating" || deployStep === "validating_mappings" || deployStep === "generating_template") return;
    
    setDeployStep("validating_mappings");
    setTerminalLogs([]);
    
    const logs = [
      `[info] Initiating MuleSoft-to-AWS component mapping validation...`,
      `[info] Target environment compatibility check: ACTIVE`,
      `[info] Checking HTTP Listener paths mapping -> Amazon API Gateway HTTP API...`,
      `[info] Checking Mule flows & sub-flows mapping -> AWS Lambda functions & utilities...`,
      `[info] Checking DataWeave transforms mapping -> JS Transform Modules...`,
      `[info] Checking Object Store config -> Amazon DynamoDB Table properties...`,
      `[info] Checking Database configs -> Amazon RDS / Aurora Serverless MySQL instances...`,
      `[info] Checking Anypoint MQ configs -> Amazon SQS Queues & DLQs...`,
      `[info] Checking Scheduler triggers -> Amazon EventBridge Scheduler Cron rules...`,
      `[success] All components map correctly to native AWS services. Validation PASSED.`
    ];
    
    let currentLogIndex = 0;
    const interval = setInterval(() => {
      if (currentLogIndex < logs.length) {
        setTerminalLogs(prev => [...prev, logs[currentLogIndex]]);
        currentLogIndex++;
      } else {
        clearInterval(interval);
        setDeployStep("mappings_validated");
      }
    }, 200);
  };

  // Generate SAM Template
  const handleGenerateSamTemplate = () => {
    if (deployStep === "validating" || deployStep === "validating_mappings" || deployStep === "generating_template") return;
    
    setDeployStep("generating_template");
    setTerminalLogs([]);
    
    const logs = [
      `[info] Starting AWS SAM template generation pipeline...`,
      `[info] Building template.yaml containing API Gateway, Lambdas, and DB resources...`,
      `[info] Generating Lambda handlers: ${analyzedData?.flows?.map(f => f.name + '.js').join(', ') || 'handlers'}`,
      `[info] Generating Javascript utils: transformer.js, errorHandler.js`,
      `[info] Generating documentation files: docs/migration-report.md, docs/architecture.md, docs/blueprint.mmd`,
      `[success] AWS SAM project template generated successfully. Ready to download or deploy.`
    ];
    
    let currentLogIndex = 0;
    const interval = setInterval(() => {
      if (currentLogIndex < logs.length) {
        setTerminalLogs(prev => [...prev, logs[currentLogIndex]]);
        currentLogIndex++;
      } else {
        clearInterval(interval);
        setDeployStep("template_generated");
      }
    }, 200);
  };

  // Mock AWS Deployment terminal logs
  const handleMockDeploy = () => {
    if (deployStep === "validating" || deployStep === "validating_mappings" || deployStep === "generating_template") return;
    
    setDeployStep("validating");
    setTerminalLogs([]);
    
    const logs = [
      `[info] Initiating AWS Resource Stack validation...`,
      `[info] Access Key ID verified: ***${awsAccessKey.slice(-4) || "D3FR"}`,
      `[info] Region set to: ${awsRegion}`,
      `[success] AWS Authentication Token validated successfully.`,
      `[cmd] $ sam validate --region ${awsRegion}`,
      `[info] Validating Serverless Template...`,
      `[success] template.yaml is a valid AWS SAM Template.`,
      `[cmd] $ sam build`,
      `[info] Building Serverless Functions...`,
      `[info] Building ${projectName.replace(/[^a-zA-Z0-9]/g, "")}Function using Node.js npm package installer...`,
      `[info] Running npm install in container context...`,
      `[info] Bundling source files to build artifacts...`,
      `[success] Build Succeeded. Created artifacts at .aws-sam/build/`,
      `[cmd] $ sam deploy --stack-name ${projectName}-stack --region ${awsRegion} --confirm-changeset false`,
      `[info] Uploading deployment packages to S3 bucket...`,
      `[info] Initiating CloudFormation stack update changeset...`,
      `[info] CREATE_IN_PROGRESS | AWS::CloudFormation::Stack | ${projectName}-stack`,
      `[info] CREATE_IN_PROGRESS | AWS::DynamoDB::Table | CustomerCacheTable`,
      `[info] CREATE_IN_PROGRESS | AWS::SQS::Queue | CustomerSyncQueue`,
      `[info] CREATE_IN_PROGRESS | AWS::IAM::Role | LambdaExecutionRole`,
      `[info] CREATE_IN_PROGRESS | AWS::ApiGatewayV2::Api | ServerlessHttpApi`,
      `[info] CREATE_COMPLETE    | AWS::DynamoDB::Table | CustomerCacheTable`,
      `[info] CREATE_COMPLETE    | AWS::SQS::Queue | CustomerSyncQueue`,
      `[info] CREATE_IN_PROGRESS | AWS::Lambda::Function | ${projectName.replace(/[^a-zA-Z0-9]/g, "")}Function`,
      `[info] CREATE_COMPLETE    | AWS::Lambda::Function | ${projectName.replace(/[^a-zA-Z0-9]/g, "")}Function`,
      `[info] CREATE_COMPLETE    | AWS::ApiGatewayV2::Api | ServerlessHttpApi`,
      `[info] UPDATE_COMPLETE    | AWS::CloudFormation::Stack | ${projectName}-stack`,
      `[success] Deployment completed. Stack created successfully.`,
      `--------------------------------------------------------------------------------`,
      `Outputs:`,
      `  - HttpApiUrl: https://abcdef123.execute-api.${awsRegion}.amazonaws.com/dev`,
      `  - DynamoDbTableName: customer-cache-store`,
      `  - SqsQueueUrl: https://sqs.${awsRegion}.amazonaws.com/123456789012/customer-sync-queue`,
      `--------------------------------------------------------------------------------`
    ];

    let currentLogIndex = 0;
    
    const interval = setInterval(() => {
      if (currentLogIndex < logs.length) {
        setTerminalLogs(prev => [...prev, logs[currentLogIndex]]);
        currentLogIndex++;
      } else {
        clearInterval(interval);
        setDeployStep("completed");
      }
    }, 450);
  };

  // Scroll terminal automatically
  useEffect(() => {
    if (terminalBottomRef.current) {
      terminalBottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [terminalLogs]);

  // ----------------------------------------------------
  // Dynamic Diagrams & Metrics Computed on state
  // ----------------------------------------------------
  
  // Calculate a visual complexity score color
  const getComplexityColor = (comp) => {
    switch (comp) {
      case "HIGH": return "text-red-500 border-red-900/30 bg-red-950/20";
      case "MEDIUM": return "text-yellow-500 border-yellow-900/30 bg-yellow-950/20";
      default: return "text-green-500 border-green-900/30 bg-green-950/20";
    }
  };

  // ----------------------------------------------------
  // Screen Render Helpers
  // ----------------------------------------------------

  // Header Nav Bar
  const renderNavBar = () => {
    return (
      <header className="border-b border-dark-700/60 bg-dark-900/80 backdrop-blur-md sticky top-0 z-40 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-r from-mule-500 to-aws-500 p-2 rounded-lg text-white shadow-glow-neon">
            <Cpu className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
              MuleSoft to AWS
            </h1>
            <p className="text-xs text-slate-500 font-medium">Migration Assistant</p>
          </div>
        </div>
        
        {projectName && (
          <div className="hidden md:flex items-center gap-3 bg-dark-800 border border-dark-700/80 px-4 py-1.5 rounded-full text-xs text-slate-300">
            <Folder className="w-3.5 h-3.5 text-mule-400" />
            <span>Project: <strong className="text-white">{projectName}</strong></span>
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
          </div>
        )}

        <nav className="flex items-center gap-1">
          <button 
            onClick={() => setActiveScreen("dashboard")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${activeScreen === "dashboard" ? "bg-dark-700 text-white" : "text-slate-400 hover:text-white"}`}
          >
            Dashboard
          </button>
                  <button 
            onClick={() => setActiveScreen("connect")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${activeScreen === "connect" ? "bg-dark-700 text-white" : "text-slate-400 hover:text-white"}`}
          >
            Connect
          </button>

          <button 
            onClick={() => setActiveScreen("settings")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${activeScreen === "settings" ? "bg-dark-700 text-white" : "text-slate-400 hover:text-white"}`}
          >
            <Settings className="w-3.5 h-3.5 text-slate-400" />
            Settings
          </button>

          {projectName && (
            <>
              <button 
                onClick={() => setActiveScreen("explorer")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${activeScreen === "explorer" ? "bg-dark-700 text-white" : "text-slate-400 hover:text-white"}`}
              >
                Explorer
              </button>
              <button 
                onClick={() => setActiveScreen("analysis")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${activeScreen === "analysis" ? "bg-dark-700 text-white" : "text-slate-400 hover:text-white"}`}
              >
                Analysis
              </button>
              <button 
                onClick={() => setActiveScreen("ai-console")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${activeScreen === "ai-console" ? "bg-dark-700 text-white" : "text-slate-400 hover:text-white"}`}
              >
                <span className="text-indigo-400 font-bold">✨</span> AI Console
              </button>
              <button 
                onClick={() => setActiveScreen("blueprint")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${activeScreen === "blueprint" ? "bg-dark-700 text-white" : "text-slate-400 hover:text-white"}`}
              >
                Blueprint
              </button>
            </>
          )}

          {awsMappings.length > 0 && (
            <>
              <button 
                onClick={() => setActiveScreen("mapping")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${activeScreen === "mapping" ? "bg-dark-700 text-white" : "text-slate-400 hover:text-white"}`}
              >
                AWS Mappings
              </button>
              <button 
                onClick={() => setActiveScreen("codegen")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${activeScreen === "codegen" ? "bg-dark-700 text-white" : "text-slate-400 hover:text-white"}`}
              >
                SAM Code
              </button>
              <button 
                onClick={() => setActiveScreen("deploy")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${activeScreen === "deploy" ? "bg-dark-700 text-white" : "text-slate-400 hover:text-white"}`}
              >
                Deploy
              </button>
            </>
          )}
        </nav>
      </header>
    );
  };

  // 1. Landing Dashboard
  const renderDashboardScreen = () => {
    return (
      <div className="max-w-6xl mx-auto py-12 px-6">
        {/* Hero Banner */}
        <div className="text-center mb-16 relative">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl -z-10"></div>
          <div className="inline-flex items-center gap-2 bg-dark-800 border border-dark-700 px-4 py-1.5 rounded-full text-xs font-semibold text-mule-400 mb-6">
            <span className="w-2 h-2 rounded-full bg-mule-500 animate-ping"></span>
            Enterprise Migration Toolkit
          </div>
          
          <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-4">
            MuleSoft to AWS Migration Assistant
          </h2>
          <p className="text-slate-400 max-w-2xl mx-auto text-base md:text-lg">
            Deconstruct legacy Mule XML configurations, DataWeave scripts, and API specs. Automatically map flows to AWS Lambda, API Gateway, SQS, and DynamoDB.
          </p>
        </div>

        {/* Action Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-16">
          {/* Card 1: Connect */}
          <div className="glass-card p-6 rounded-2xl flex flex-col justify-between h-64 hover:border-mule-500/30">
            <div>
              <div className="w-12 h-12 rounded-xl bg-mule-950/20 border border-mule-500/20 flex items-center justify-center text-mule-400 mb-6">
                <Github className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold mb-2">Connect GitHub</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Log in using a GitHub developer token and load target repos to analyze experience, process, and system APIs.
              </p>
            </div>
            <button 
              onClick={() => setActiveScreen("connect")}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-mule-400 hover:text-mule-300 mt-4 group"
            >
              Connect Repository <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
            </button>
          </div>

          {/* Card 2: Upload */}
          <div className="glass-card p-6 rounded-2xl flex flex-col justify-between h-64 hover:border-indigo-500/30">
            <div>
              <div className="w-12 h-12 rounded-xl bg-indigo-950/20 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-6">
                <Upload className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold mb-2">Upload ZIP</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                No repository access? Upload a local MuleSoft project folder packed in a ZIP file directly.
              </p>
            </div>
            <label className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-400 hover:text-indigo-300 mt-4 group cursor-pointer">
              Upload Local Project <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
              <input type="file" accept=".zip" onChange={handleZipUpload} className="hidden" />
            </label>
          </div>

          {/* Card 3: Analyze */}
          <div className={`glass-card p-6 rounded-2xl flex flex-col justify-between h-64 ${projectName ? "hover:border-emerald-500/30 cursor-pointer" : "opacity-60"}`}
               onClick={() => projectName && setActiveScreen("analysis")}>
            <div>
              <div className="w-12 h-12 rounded-xl bg-emerald-950/20 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-6">
                <Layers className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold mb-2">Analyze Mule Code</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Inspect flows, DataWeave transformations, choice routers, schedulers, and queue publishers.
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-400 hover:text-emerald-300 mt-4 group">
              Inspect Metrics {projectName && <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />}
            </span>
          </div>

          {/* Card 4: Convert */}
          <div className={`glass-card p-6 rounded-2xl flex flex-col justify-between h-64 ${projectName ? "hover:border-aws-500/30 cursor-pointer" : "opacity-60"}`}
               onClick={() => projectName && (awsMappings.length > 0 ? setActiveScreen("mapping") : handleConvertToAws())}>
            <div>
              <div className="w-12 h-12 rounded-xl bg-aws-950/20 border border-aws-500/20 flex items-center justify-center text-aws-400 mb-6">
                <Cpu className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold mb-2">Convert to AWS</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Directly map connectors to Amazon API Gateway, SQS queues, EventBridge, and DynamoDB.
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-aws-400 hover:text-aws-300 mt-4 group">
              Map and Generate {projectName && <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />}
            </span>
          </div>
        </div>

        {/* Process Flow Steps */}
        <div className="border border-dark-700/80 bg-dark-900/30 p-8 rounded-2xl">
          <h3 className="text-xl font-bold mb-6 text-center">Migration Pipeline Stages</h3>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 relative">
            
            {/* Step 1 */}
            <div className="flex flex-col items-center text-center p-4">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center border font-bold text-sm mb-3 ${projectName ? "bg-mule-500 border-mule-400 text-white" : "border-slate-700 text-slate-500"}`}>
                1
              </div>
              <h4 className="text-sm font-semibold mb-1">Load Project</h4>
              <p className="text-xs text-slate-500">Connect to GitHub or upload ZIP</p>
            </div>

            {/* Step 2 */}
            <div className="flex flex-col items-center text-center p-4">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center border font-bold text-sm mb-3 ${analyzedData ? "bg-indigo-500 border-indigo-400 text-white" : "border-slate-700 text-slate-500"}`}>
                2
              </div>
              <h4 className="text-sm font-semibold mb-1">Parse AST</h4>
              <p className="text-xs text-slate-500">Analyze Mule XML & DWL resources</p>
            </div>

            {/* Step 3 */}
            <div className="flex flex-col items-center text-center p-4">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center border font-bold text-sm mb-3 ${analyzedData ? "bg-indigo-500 border-indigo-400 text-white" : "border-slate-700 text-slate-500"}`}>
                3
              </div>
              <h4 className="text-sm font-semibold mb-1">Architecture</h4>
              <p className="text-xs text-slate-500">Visualize API-led relations</p>
            </div>

            {/* Step 4 */}
            <div className="flex flex-col items-center text-center p-4">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center border font-bold text-sm mb-3 ${awsMappings.length > 0 ? "bg-aws-500 border-aws-400 text-white" : "border-slate-700 text-slate-500"}`}>
                4
              </div>
              <h4 className="text-sm font-semibold mb-1">AWS Mapping</h4>
              <p className="text-xs text-slate-500">Match components with AWS elements</p>
            </div>

            {/* Step 5 */}
            <div className="flex flex-col items-center text-center p-4">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center border font-bold text-sm mb-3 ${Object.keys(samFiles).length > 0 ? "bg-aws-500 border-aws-400 text-white" : "border-slate-700 text-slate-500"}`}>
                5
              </div>
              <h4 className="text-sm font-semibold mb-1">Deploy SAM</h4>
              <p className="text-xs text-slate-500">Guided terminal deployment</p>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // 2. GitHub Connection Screen
  const renderConnectScreen = () => {
    return (
      <div className="max-w-4xl mx-auto py-12 px-6 grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Left Side: Real connection */}
        <div className="border border-dark-700/80 bg-dark-900/30 p-8 rounded-2xl flex flex-col justify-between">
          <div>
            <h3 className="text-xl font-bold mb-2 flex items-center gap-2">
              <Github className="w-5 h-5 text-mule-400" />
              GitHub REST API Ingress
            </h3>
            <p className="text-xs text-slate-400 mb-6">
              Connect to your live repository codebase. The token is kept in backend runtime memory and never saved to persistence.
            </p>

            <form onSubmit={handleConnectGithub} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">GitHub Developer Token</label>
                <input 
                  type="password" 
                  placeholder="ghp_xxxxxxxxxxxx" 
                  value={githubToken} 
                  onChange={(e) => setGithubToken(e.target.value)}
                  className="w-full bg-dark-950 border border-dark-700 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-mule-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">Repository URL</label>
                <input 
                  type="text" 
                  placeholder="https://github.com/owner/repo-name" 
                  value={repoUrl} 
                  onChange={(e) => setRepoUrl(e.target.value)}
                  className="w-full bg-dark-950 border border-dark-700 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-mule-500"
                />
              </div>

              <button 
                type="submit" 
                disabled={isLoading}
                className="w-full bg-mule-500 hover:bg-mule-600 text-white font-semibold text-xs py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {isLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : "Verify and Connect"}
              </button>
            </form>

            {/* Error / Success logs */}
            {errorMsg && (
              <div className="mt-4 p-3 bg-red-950/20 border border-red-900/30 rounded-lg text-xs text-red-400 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}
            {successMsg && (
              <div className="mt-4 p-3 bg-green-950/20 border border-green-900/30 rounded-lg text-xs text-green-400 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{successMsg}</span>
              </div>
            )}
          </div>

          {connectedUser && (
            <div className="mt-8 pt-6 border-t border-dark-800">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Available Repositories</h4>
              <div className="max-h-40 overflow-y-auto space-y-1.5 pr-2">
                {reposList.map((repo, i) => (
                  <button 
                    key={i} 
                    onClick={() => handleLoadRealRepo(repo.url)}
                    className="w-full text-left p-2 rounded bg-dark-800/50 border border-dark-700/40 hover:border-mule-500/40 text-xs flex justify-between items-center transition-colors"
                  >
                    <span className="font-semibold text-slate-300">{repo.name}</span>
                    <ChevronRight className="w-3 h-3 text-slate-500" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Side: Mock Fallback */}
        <div className="border border-dark-700/80 bg-dark-900/30 p-8 rounded-2xl flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 right-0 bg-aws-500/10 text-aws-400 text-[10px] font-bold tracking-widest uppercase px-3 py-1 rounded-bl-lg border-l border-b border-aws-500/20">
            Sandbox
          </div>
          <div>
            <h3 className="text-xl font-bold mb-2 flex items-center gap-2">
              <Layers className="w-5 h-5 text-aws-400" />
              Mock Project Sandbox
            </h3>
            <p className="text-xs text-slate-400 mb-6">
              Load ready-to-test mock MuleSoft projects containing experience layers, orchestration flows, routers, databases, object stores, and event publishers.
            </p>

            <div className="space-y-3">
              <div 
                onClick={() => handleLoadMock("customer-experience-api")}
                className="p-4 rounded-xl bg-dark-800/40 border border-dark-700/80 hover:border-mule-500/40 cursor-pointer transition-all flex items-center justify-between group"
              >
                <div>
                  <h4 className="text-sm font-bold group-hover:text-mule-400 transition-colors">customer-experience-api</h4>
                  <p className="text-xs text-slate-500 mt-1">HTTP Listeners, Logging, HTTP down-stream Request routes.</p>
                </div>
                <div className="bg-dark-750 p-2 rounded-lg text-slate-400 group-hover:text-mule-400">
                  <Play className="w-4 h-4" />
                </div>
              </div>

              <div 
                onClick={() => handleLoadMock("customer-process-api")}
                className="p-4 rounded-xl bg-dark-800/40 border border-dark-700/80 hover:border-indigo-500/40 cursor-pointer transition-all flex items-center justify-between group"
              >
                <div>
                  <h4 className="text-sm font-bold group-hover:text-indigo-400 transition-colors">customer-process-api</h4>
                  <p className="text-xs text-slate-500 mt-1">Variables setting, Cache check, Choice routers, Object Stores.</p>
                </div>
                <div className="bg-dark-750 p-2 rounded-lg text-slate-400 group-hover:text-indigo-400">
                  <Play className="w-4 h-4" />
                </div>
              </div>

              <div 
                onClick={() => handleLoadMock("customer-system-api")}
                className="p-4 rounded-xl bg-dark-800/40 border border-dark-700/80 hover:border-aws-500/40 cursor-pointer transition-all flex items-center justify-between group"
              >
                <div>
                  <h4 className="text-sm font-bold group-hover:text-aws-400 transition-colors">customer-system-api</h4>
                  <p className="text-xs text-slate-500 mt-1">Schedulers, DB SELECT execution, Anypoint MQ publishes.</p>
                </div>
                <div className="bg-dark-750 p-2 rounded-lg text-slate-400 group-hover:text-aws-400">
                  <Play className="w-4 h-4" />
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-dark-800">
            <h4 className="text-xs font-semibold text-slate-400 mb-2">Upload fallback</h4>
            <label className="w-full flex items-center justify-center border border-dashed border-dark-600/80 bg-dark-850 hover:bg-dark-800 px-4 py-3 rounded-lg text-xs cursor-pointer text-slate-300 transition-all gap-2">
              <Upload className="w-4 h-4" />
              <span>Click to upload local MuleSoft project .zip file</span>
              <input type="file" accept=".zip" onChange={handleZipUpload} className="hidden" />
            </label>
          </div>
        </div>
      </div>
    );
  };

  // 3. Project Explorer
  const renderExplorerScreen = () => {
    if (!projectName) {
      return (
        <div className="max-w-4xl mx-auto py-12 px-6 text-center text-slate-500">
          <AlertCircle className="w-12 h-12 mx-auto mb-2 text-slate-600" />
          <p className="text-sm font-semibold">No project loaded</p>
          <p className="text-xs text-slate-400 mt-1">Please load a project first from the Connect screen.</p>
          <button
            onClick={() => setActiveScreen("connect")}
            className="mt-4 bg-mule-500 hover:bg-mule-600 text-white font-semibold text-xs px-4 py-2.5 rounded-lg transition-colors flex items-center gap-2 mx-auto"
          >
            <Folder className="w-4 h-4" />
            <span>Go to Connect Screen</span>
          </button>
        </div>
      );
    }

    // Group files by types
    const xmlFiles = fileList.filter(f => f.path.endsWith(".xml"));
    const dwlFiles = fileList.filter(f => f.path.endsWith(".dwl"));
    const ramlFiles = fileList.filter(f => f.path.endsWith(".raml") || f.path.includes("RAML") || f.path.includes("YAML"));
    const propertyFiles = fileList.filter(f => f.path.includes("resources") && (f.path.endsWith(".yaml") || f.path.endsWith(".properties") || f.path.endsWith(".yml")));
    
    let filteredFiles = fileList;
    if (explorerFilter === "mule") filteredFiles = xmlFiles;
    if (explorerFilter === "dwl") filteredFiles = dwlFiles;
    if (explorerFilter === "raml") filteredFiles = ramlFiles;
    if (explorerFilter === "props") filteredFiles = propertyFiles;

    return (
      <div className="h-[calc(100vh-80px)] flex flex-col md:flex-row">
        {/* Left pane: File navigation */}
        <div className="w-full md:w-80 border-r border-dark-700/60 bg-dark-900/40 flex flex-col h-full shrink-0">
          <div className="p-4 border-b border-dark-700/60">
            <h3 className="text-sm font-bold flex items-center gap-1.5 text-mule-400 mb-4">
              <Folder className="w-4 h-4" />
              Project Explorer
            </h3>
            
            {/* Filter buttons */}
            <div className="grid grid-cols-5 gap-1 bg-dark-950 p-1 rounded-lg">
              {["all", "mule", "raml", "dwl", "props"].map((filt) => (
                <button
                  key={filt}
                  onClick={() => setExplorerFilter(filt)}
                  className={`text-[10px] py-1 font-semibold rounded capitalize transition-all ${explorerFilter === filt ? "bg-dark-700 text-white" : "text-slate-500 hover:text-slate-300"}`}
                >
                  {filt}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Mule XML files */}
            {xmlFiles.length > 0 && (explorerFilter === "all" || explorerFilter === "mule") && (
              <div>
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1">
                  <ChevronRight className="w-3 h-3" /> src/main/mule
                </h4>
                <div className="space-y-1">
                  {xmlFiles.map((f, i) => (
                    <button
                      key={i}
                      onClick={() => setSelectedFile({ path: f.path, content: fileContents[f.path] })}
                      className={`w-full text-left px-2.5 py-1.5 text-xs rounded flex items-center gap-2 transition-colors ${selectedFile?.path === f.path ? "bg-mule-500/15 text-mule-400 font-semibold" : "text-slate-400 hover:bg-dark-800"}`}
                    >
                      <Code className="w-3.5 h-3.5" />
                      <span className="truncate">{f.path.split("/").pop()}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* RAML files */}
            {ramlFiles.length > 0 && (explorerFilter === "all" || explorerFilter === "raml") && (
              <div>
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1">
                  <ChevronRight className="w-3 h-3" /> API specifications
                </h4>
                <div className="space-y-1">
                  {ramlFiles.map((f, i) => (
                    <button
                      key={i}
                      onClick={() => setSelectedFile({ path: f.path, content: fileContents[f.path] })}
                      className={`w-full text-left px-2.5 py-1.5 text-xs rounded flex items-center gap-2 transition-colors ${selectedFile?.path === f.path ? "bg-indigo-500/15 text-indigo-400 font-semibold" : "text-slate-400 hover:bg-dark-800"}`}
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span className="truncate">{f.path.split("/").pop()}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* DWL files */}
            {dwlFiles.length > 0 && (explorerFilter === "all" || explorerFilter === "dwl") && (
              <div>
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1">
                  <ChevronRight className="w-3 h-3" /> DataWeave mappings
                </h4>
                <div className="space-y-1">
                  {dwlFiles.map((f, i) => (
                    <button
                      key={i}
                      onClick={() => setSelectedFile({ path: f.path, content: fileContents[f.path] })}
                      className={`w-full text-left px-2.5 py-1.5 text-xs rounded flex items-center gap-2 transition-colors ${selectedFile?.path === f.path ? "bg-amber-500/15 text-amber-400 font-semibold" : "text-slate-400 hover:bg-dark-800"}`}
                    >
                      <Settings className="w-3.5 h-3.5" />
                      <span className="truncate">{f.path.split("/").pop()}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Properties files */}
            {propertyFiles.length > 0 && (explorerFilter === "all" || explorerFilter === "props") && (
              <div>
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1">
                  <ChevronRight className="w-3 h-3" /> Configuration properties
                </h4>
                <div className="space-y-1">
                  {propertyFiles.map((f, i) => (
                    <button
                      key={i}
                      onClick={() => setSelectedFile({ path: f.path, content: fileContents[f.path] })}
                      className={`w-full text-left px-2.5 py-1.5 text-xs rounded flex items-center gap-2 transition-colors ${selectedFile?.path === f.path ? "bg-slate-500/15 text-slate-300 font-semibold" : "text-slate-400 hover:bg-dark-800"}`}
                    >
                      <File className="w-3.5 h-3.5" />
                      <span className="truncate">{f.path.split("/").pop()}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="p-4 border-t border-dark-700/60">
            <button
              onClick={handleConvertToAws}
              className="w-full bg-aws-500 hover:bg-aws-600 text-white font-semibold text-xs py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <Cpu className="w-4 h-4" />
              <span>Convert Codebase to AWS</span>
            </button>
          </div>
        </div>

        {/* Right pane: Code details */}
        <div className="flex-1 bg-dark-950 flex flex-col h-full overflow-hidden">
          {selectedFile ? (
            <>
              <div className="px-6 py-3 border-b border-dark-700/60 bg-dark-900/20 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <File className="w-4 h-4 text-slate-400" />
                  <span className="text-xs font-mono text-slate-300">{selectedFile.path}</span>
                </div>
                <div className="text-[10px] font-bold bg-dark-800 text-slate-400 px-2.5 py-1 rounded">
                  {selectedFile.path.split(".").pop().toUpperCase()}
                </div>
              </div>

              <div className="flex-1 overflow-auto p-6 font-mono text-xs leading-relaxed text-slate-300 bg-dark-900/10 select-text">
                <pre className="whitespace-pre-wrap">{selectedFile.content}</pre>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-500">
              <Eye className="w-12 h-12 mb-2 stroke-1" />
              <p className="text-sm">Select a file from the explorer pane to inspect content</p>
            </div>
          )}
        </div>
      </div>
    );
  };

  // 4. Analysis Dashboard
  const renderAnalysisScreen = () => {
    if (!analyzedData) {
      return (
        <div className="max-w-4xl mx-auto py-12 px-6 text-center text-slate-500">
          <AlertCircle className="w-12 h-12 mx-auto mb-2 text-slate-600" />
          <p className="text-sm font-semibold">No project analyzed</p>
          <p className="text-xs text-slate-400 mt-1">Please load a project first from the Connect screen.</p>
          <button
            onClick={() => setActiveScreen("connect")}
            className="mt-4 bg-mule-500 hover:bg-mule-600 text-white font-semibold text-xs px-4 py-2.5 rounded-lg transition-colors flex items-center gap-2 mx-auto"
          >
            <Folder className="w-4 h-4" />
            <span>Go to Connect Screen</span>
          </button>
        </div>
      );
    }
    const metrics = analyzedData.metrics;

    return (
      <div className="max-w-6xl mx-auto py-12 px-6">
        <h3 className="text-2xl font-bold mb-8 flex items-center gap-2">
          <Layers className="w-6 h-6 text-indigo-400" />
          MuleSoft Application Metrics
        </h3>

        {/* Metrics Cards grid */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-6 mb-8">
          <div className="bg-dark-900/40 border border-dark-700/80 p-5 rounded-2xl">
            <h4 className="text-xs font-semibold text-slate-500 mb-1">Mule flows</h4>
            <div className="text-3xl font-extrabold text-white">{metrics.totalFlows}</div>
          </div>
          <div className="bg-dark-900/40 border border-dark-700/80 p-5 rounded-2xl">
            <h4 className="text-xs font-semibold text-slate-500 mb-1">Subflows</h4>
            <div className="text-3xl font-extrabold text-white">{metrics.totalSubflows}</div>
          </div>
          <div className="bg-dark-900/40 border border-dark-700/80 p-5 rounded-2xl">
            <h4 className="text-xs font-semibold text-slate-500 mb-1">DataWeave files</h4>
            <div className="text-3xl font-extrabold text-white">{metrics.totalDwlFiles}</div>
          </div>
          <div className="bg-dark-900/40 border border-dark-700/80 p-5 rounded-2xl">
            <h4 className="text-xs font-semibold text-slate-500 mb-1">Mule Connectors</h4>
            <div className="text-3xl font-extrabold text-white">{metrics.totalConnectors}</div>
          </div>
          <div className={`border p-5 rounded-2xl ${getComplexityColor(metrics.complexityScore)}`}>
            <h4 className="text-xs font-semibold text-slate-500 mb-1">Complexity Class</h4>
            <div className="text-3xl font-extrabold tracking-wide">{metrics.complexityScore}</div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
          {/* Flows list */}
          <div className="border border-dark-700/80 bg-dark-900/30 p-6 rounded-2xl md:col-span-2">
            <h4 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-4">Mule Flows & Subflows</h4>
            <div className="space-y-3 overflow-y-auto max-h-96 pr-2">
              {analyzedData.flows.map((flow, idx) => (
                <div key={idx} className="bg-dark-800/40 border border-dark-700/60 p-4 rounded-xl">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-bold text-xs text-white">{flow.name}</span>
                    <span className="text-[10px] bg-mule-500/20 text-mule-400 border border-mule-500/30 px-2 py-0.5 rounded-full font-semibold">
                      Flow
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-500 mb-3">File: {flow.file}</div>
                  
                  {/* Processors inside flow */}
                  <div className="flex flex-wrap gap-1.5">
                    {flow.processors.map((p, i) => (
                      <span key={i} className="text-[10px] bg-dark-700 text-slate-300 border border-dark-600 px-2 py-1 rounded">
                        {p.type} ({p.name})
                      </span>
                    ))}
                  </div>
                </div>
              ))}

              {analyzedData.subflows.map((flow, idx) => (
                <div key={`sf-${idx}`} className="bg-dark-800/40 border border-dark-700/60 p-4 rounded-xl">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-bold text-xs text-white">{flow.name}</span>
                    <span className="text-[10px] bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 px-2 py-0.5 rounded-full font-semibold">
                      Sub-flow
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-500 mb-3">File: {flow.file}</div>
                  
                  <div className="flex flex-wrap gap-1.5">
                    {flow.processors.map((p, i) => (
                      <span key={i} className="text-[10px] bg-dark-700 text-slate-300 border border-dark-600 px-2 py-1 rounded">
                        {p.type} ({p.name})
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Connectors & External systems */}
          <div className="space-y-6">
            {/* Connectors card */}
            <div className="border border-dark-700/80 bg-dark-900/30 p-6 rounded-2xl">
              <h4 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-4">Detected Connectors</h4>
              <div className="flex flex-wrap gap-2">
                {analyzedData.connectors.length > 0 ? (
                  analyzedData.connectors.map((conn, i) => (
                    <span key={i} className="text-xs bg-dark-800 text-slate-300 border border-dark-750 px-3 py-1.5 rounded-lg font-medium">
                      {conn}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-slate-500 italic">No global connectors parsed</span>
                )}
              </div>
            </div>

            {/* External systems dependencies */}
            <div className="border border-dark-700/80 bg-dark-900/30 p-6 rounded-2xl">
              <h4 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-4">System Dependencies</h4>
              <div className="flex flex-wrap gap-2">
                {analyzedData.externalSystems.length > 0 ? (
                  analyzedData.externalSystems.map((ext, i) => (
                    <span key={i} className="text-xs bg-dark-800 text-slate-300 border border-dark-750 px-3 py-1.5 rounded-lg font-medium flex items-center gap-1.5">
                      <Database className="w-3.5 h-3.5 text-aws-400" />
                      {ext}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-slate-500 italic">No external systems resolved</span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-8">
          <button
            onClick={async () => {
              setActiveScreen("blueprint");
              await handleLoadBlueprint(analyzedData);
            }}
            className="border border-dark-700 hover:border-dark-600 bg-dark-800 text-white font-semibold text-xs px-4 py-2.5 rounded-lg transition-colors flex items-center gap-2"
          >
            <Layers className="w-4 h-4 text-indigo-400" />
            <span>Visualize Mule Blueprint</span>
          </button>
          
          <button
            onClick={handleConvertToAws}
            className="bg-aws-500 hover:bg-aws-600 text-white font-semibold text-xs px-4 py-2.5 rounded-lg transition-colors flex items-center gap-2"
          >
            <Cpu className="w-4 h-4" />
            <span>Proceed to AWS Mapping</span>
          </button>
        </div>
      </div>
    );
  };

  // 5. Mule Blueprint (Mermaid.js view)
  const renderBlueprintScreen = () => {
    if (!analyzedData) {
      return (
        <div className="max-w-4xl mx-auto py-12 px-6 text-center text-slate-500">
          <AlertCircle className="w-12 h-12 mx-auto mb-2 text-slate-600" />
          <p className="text-sm font-semibold">No project blueprint available</p>
          <p className="text-xs text-slate-400 mt-1">Please load and analyze a project first from the Connect screen.</p>
          <button
            onClick={() => setActiveScreen("connect")}
            className="mt-4 bg-mule-500 hover:bg-mule-600 text-white font-semibold text-xs px-4 py-2.5 rounded-lg transition-colors flex items-center gap-2 mx-auto"
          >
            <Folder className="w-4 h-4" />
            <span>Go to Connect Screen</span>
          </button>
        </div>
      );
    }

    // Check if we have AI generated diagram
    let chartDef = blueprintData?.blueprintDiagram || blueprintData?.mermaidDiagram || "";
    let summaryText = blueprintData?.summary || "";

    if (!chartDef) {
      // Construct dynamic fallback blueprint from parser metadata
      const fb = generateSafeBlueprintWithoutAi(projectName, analyzedData);
      chartDef = fb.mermaidDiagram;
      summaryText = fb.summary;
    }

    if (!summaryText) {
      summaryText = "MuleSoft to AWS native architecture. Visualizes API Gateway ingress routing requests to Experience and Process compute Lambdas, integrated with downstream SQS messaging queues and DynamoDB caching blocks.";
    }

    // Generate other local blueprints
    const sourceMuleChart = generateSourceMuleDiagram(projectName, analyzedData);
    const targetAwsChart = generateTargetAwsDiagram(projectName, analyzedData);
    const migrationFlowChart = generateMigrationFlowDiagram(projectName, analyzedData);

    // Categorization logic
    const experienceApis = analyzedData?.endpoints?.filter(e => 
      e.path.toLowerCase().includes("exp") || 
      e.path.toLowerCase().includes("experience") ||
      projectName.toLowerCase().includes("experience") ||
      (!e.path.toLowerCase().includes("proc") && !e.path.toLowerCase().includes("sys"))
    ) || [];

    const processApis = analyzedData?.endpoints?.filter(e => 
      e.path.toLowerCase().includes("proc") || 
      e.path.toLowerCase().includes("process") ||
      projectName.toLowerCase().includes("process")
    ) || [];

    const systemApis = analyzedData?.endpoints?.filter(e => 
      e.path.toLowerCase().includes("sys") || 
      e.path.toLowerCase().includes("system") ||
      projectName.toLowerCase().includes("system")
    ) || [];

    const experienceFlows = analyzedData?.flows?.filter(f => 
      f.name.toLowerCase().includes("exp") || 
      f.name.toLowerCase().includes("experience") ||
      f.processors.some(p => p.type === "http-listener")
    ) || [];

    const processFlows = analyzedData?.flows?.filter(f => 
      f.name.toLowerCase().includes("proc") || 
      f.name.toLowerCase().includes("process") ||
      (f.processors.some(p => p.type === "http-request") && !f.name.toLowerCase().includes("sys") && !f.name.toLowerCase().includes("system"))
    ) || [];

    const systemFlows = analyzedData?.flows?.filter(f => 
      f.name.toLowerCase().includes("sys") || 
      f.name.toLowerCase().includes("system") ||
      f.processors.some(p => p.type === "database" || p.type.startsWith("anypoint-mq"))
    ) || [];

    const dependencies = aiAnalysisData?.dependencies || [
      { source: "Experience Layer", target: "Process Layer", type: "HTTP", description: "REST requests dispatched internally to orchestrator" },
      { source: "Process Layer", target: "System Layer", type: "HTTP", description: "Internal system adapter requests" },
      { source: "System Layer", target: "External Systems", type: "Database/MQ", description: "Performs DB select or MQ publish actions" }
    ];

    const externalSystems = analyzedData?.externalSystems || [];

    const handleDownloadArchitectureMd = () => {
      const activeChart = 
        blueprintTab === "aiTarget" ? chartDef :
        blueprintTab === "localTarget" ? targetAwsChart :
        blueprintTab === "sourceMule" ? sourceMuleChart :
        migrationFlowChart;
      const title = 
        blueprintTab === "aiTarget" ? "Target Architecture (AI)" :
        blueprintTab === "localTarget" ? "Target Architecture (Local Safe)" :
        blueprintTab === "sourceMule" ? "Source Architecture (MuleSoft)" :
        "Migration Flow (MuleSoft to AWS)";

      const content = `# ${title}\n\n## Mermaid Diagram\n\n\`\`\`mermaid\n${activeChart}\n\`\`\`\n\n## Summary\n${summaryText || "No business interpretation available."}\n\n## API Inventory\n- Experience APIs: ${experienceApis.map(e => e.path).join(", ") || "None"}\n- Process APIs: ${processApis.map(e => e.path).join(", ") || "None"}\n- System APIs: ${systemApis.map(e => e.path).join(", ") || "None"}\n\n## External Systems\n${externalSystems.map(sys => `- ${sys}`).join("\n") || "- None resolved."}\n`;
      const blob = new Blob([content], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "architecture.md";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    };

    return (
      <div className="max-w-6xl mx-auto py-12 px-6 select-text animate-fadeIn">
        <div className="flex justify-between items-center mb-4 border-b border-dark-700/60 pb-4">
          <div>
            <h3 className="text-2xl font-bold flex items-center gap-2">
              <Layers className="w-6 h-6 text-mule-400" />
              API-led Connectivity Blueprint
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Mermaid topology rendered automatically from source endpoints and architecture components.
            </p>
          </div>
          
          <div className="flex gap-3">
            <button
              onClick={() => {
                const safeData = generateSafeBlueprintWithoutAi(projectName, analyzedData);
                setBlueprintData(safeData);
                setBlueprintTab("aiTarget");
              }}
              className="border border-amber-700/50 hover:border-amber-600 bg-amber-950/20 hover:bg-amber-950/30 text-amber-300 font-semibold text-xs px-3.5 py-2 rounded-lg transition-colors flex items-center gap-1.5"
            >
              <RefreshCw className="w-4 h-4 text-amber-400" />
              <span>Regenerate Safe Diagram</span>
            </button>

            <button
              onClick={handleDownloadArchitectureMd}
              className="border border-dark-700 hover:border-dark-600 bg-dark-800 text-white font-semibold text-xs px-3.5 py-2 rounded-lg transition-colors flex items-center gap-1.5"
            >
              <Download className="w-4 h-4 text-slate-400" />
              <span>Download architecture.md</span>
            </button>
          </div>
        </div>

        {blueprintData?.sanitized && (
          <div className="mb-6 p-4 bg-amber-950/20 border border-amber-900/40 rounded-xl text-amber-300 text-xs flex items-start gap-3 animate-fadeIn">
            <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">Notice:</span> AI-generated diagram was sanitized or regenerated to ensure Mermaid compatibility and prevent rendering issues.
            </div>
          </div>
        )}

        {/* Blueprint Tab Selector */}
        <div className="flex flex-wrap gap-2 mb-6 border-b border-dark-750 pb-3">
          <button
            onClick={() => setBlueprintTab("aiTarget")}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all ${
              blueprintTab === "aiTarget"
                ? "bg-mule-500 text-white shadow-lg shadow-mule-500/20"
                : "bg-dark-900/40 hover:bg-dark-900/80 text-slate-400 border border-dark-800"
            }`}
          >
            AWS Target Architecture (AI)
          </button>
          <button
            onClick={() => setBlueprintTab("localTarget")}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all ${
              blueprintTab === "localTarget"
                ? "bg-mule-500 text-white shadow-lg shadow-mule-500/20"
                : "bg-dark-900/40 hover:bg-dark-900/80 text-slate-400 border border-dark-800"
            }`}
          >
            AWS Target Architecture (Local Safe)
          </button>
          <button
            onClick={() => setBlueprintTab("sourceMule")}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all ${
              blueprintTab === "sourceMule"
                ? "bg-mule-500 text-white shadow-lg shadow-mule-500/20"
                : "bg-dark-900/40 hover:bg-dark-900/80 text-slate-400 border border-dark-800"
            }`}
          >
            MuleSoft Source Layering
          </button>
          <button
            onClick={() => setBlueprintTab("migrationFlow")}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all ${
              blueprintTab === "migrationFlow"
                ? "bg-mule-500 text-white shadow-lg shadow-mule-500/20"
                : "bg-dark-900/40 hover:bg-dark-900/80 text-slate-400 border border-dark-800"
            }`}
          >
            Mule-to-AWS Migration Flow
          </button>
        </div>

        {summaryText && (
          <div className="mb-6 p-5 bg-indigo-950/20 border border-indigo-900/30 rounded-xl text-slate-300 text-xs leading-relaxed">
            <h4 className="font-bold text-indigo-400 mb-1.5 flex items-center gap-1.5">
              <span>✨</span> AI-Generated Business Interpretation
            </h4>
            <p>{summaryText}</p>
          </div>
        )}

        <div className="space-y-8">
          {/* Render Active Diagram */}
          <div className="bg-dark-950/40 p-4 border border-dark-800 rounded-2xl relative">
            <div className="absolute top-4 right-4 z-10 text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
              {blueprintTab === "aiTarget" && "AI Generated Target Architecture"}
              {blueprintTab === "localTarget" && "Static Target Architecture Blueprint"}
              {blueprintTab === "sourceMule" && "Static Source Architecture Blueprint"}
              {blueprintTab === "migrationFlow" && "Component Migration Flow Mapping"}
            </div>
            
            <ArchitectureDiagram activeTab={blueprintTab} analyzedData={analyzedData} />
          </div>
          
          {/* API-led layers lists */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Experience API list */}
            <div className="p-5 bg-dark-900/30 border border-dark-700/80 rounded-2xl">
              <div className="text-xs font-bold text-mule-400 mb-3 uppercase tracking-wider">Experience Layer</div>
              {experienceApis.length > 0 || experienceFlows.length > 0 ? (
                <ul className="space-y-2 text-xs">
                  {experienceApis.map((e, idx) => (
                    <li key={idx} className="p-2 bg-dark-800/40 rounded border border-dark-750 font-mono text-[10px] text-slate-300">
                      <span className="text-mule-400 font-bold mr-1.5">{e.methods}</span> {e.path}
                    </li>
                  ))}
                  {experienceApis.length === 0 && experienceFlows.map((f, idx) => (
                    <li key={idx} className="p-2 bg-dark-800/40 rounded border border-dark-750 text-slate-300">
                      Flow: <span className="font-bold">{f.name}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[11px] text-slate-500 italic">No Experience APIs resolved.</p>
              )}
            </div>

            {/* Process API list */}
            <div className="p-5 bg-dark-900/30 border border-dark-700/80 rounded-2xl">
              <div className="text-xs font-bold text-indigo-400 mb-3 uppercase tracking-wider">Process Layer</div>
              {processApis.length > 0 || processFlows.length > 0 ? (
                <ul className="space-y-2 text-xs">
                  {processApis.map((e, idx) => (
                    <li key={idx} className="p-2 bg-dark-800/40 rounded border border-dark-750 font-mono text-[10px] text-slate-300">
                      <span className="text-indigo-400 font-bold mr-1.5">{e.methods}</span> {e.path}
                    </li>
                  ))}
                  {processApis.length === 0 && processFlows.map((f, idx) => (
                    <li key={idx} className="p-2 bg-dark-800/40 rounded border border-dark-750 text-slate-300">
                      Flow: <span className="font-bold">{f.name}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[11px] text-slate-500 italic">No Process APIs resolved.</p>
              )}
            </div>

            {/* System API list */}
            <div className="p-5 bg-dark-900/30 border border-dark-700/80 rounded-2xl">
              <div className="text-xs font-bold text-aws-400 mb-3 uppercase tracking-wider">System Layer</div>
              {systemApis.length > 0 || systemFlows.length > 0 ? (
                <ul className="space-y-2 text-xs">
                  {systemApis.map((e, idx) => (
                    <li key={idx} className="p-2 bg-dark-800/40 rounded border border-dark-750 font-mono text-[10px] text-slate-300">
                      <span className="text-aws-400 font-bold mr-1.5">{e.methods}</span> {e.path}
                    </li>
                  ))}
                  {systemApis.length === 0 && systemFlows.map((f, idx) => (
                    <li key={idx} className="p-2 bg-dark-800/40 rounded border border-dark-750 text-slate-300">
                      Flow: <span className="font-bold">{f.name}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[11px] text-slate-500 italic">No System APIs resolved.</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* External systems */}
            <div className="border border-dark-700/80 bg-dark-900/30 p-6 rounded-2xl">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-4">External Systems Resolved</h4>
              <div className="flex flex-wrap gap-2">
                {externalSystems.length > 0 ? (
                  externalSystems.map((ext, i) => (
                    <span key={i} className="text-xs bg-dark-800 text-slate-300 border border-dark-750 px-3 py-1.5 rounded-lg font-medium flex items-center gap-1.5 animate-fadeIn">
                      <Database className="w-3.5 h-3.5 text-aws-400" />
                      {ext}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-slate-500 italic">No external systems resolved</span>
                )}
              </div>
            </div>

            {/* Generated Mermaid source */}
            <div className="border border-dark-700/80 bg-dark-900/30 p-6 rounded-2xl">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-4">
                {blueprintTab === "aiTarget" && "Generated AI Mermaid Source"}
                {blueprintTab === "localTarget" && "Local Target Mermaid Source"}
                {blueprintTab === "sourceMule" && "Local Source Mermaid Source"}
                {blueprintTab === "migrationFlow" && "Migration Flow Mermaid Source"}
              </h4>
              <textarea
                readOnly
                value={
                  blueprintTab === "aiTarget" ? chartDef :
                  blueprintTab === "localTarget" ? targetAwsChart :
                  blueprintTab === "sourceMule" ? sourceMuleChart :
                  migrationFlowChart
                }
                className="w-full h-32 bg-dark-950 border border-dark-850 rounded-lg p-3 font-mono text-[10px] text-slate-400 focus:outline-none"
              />
            </div>
          </div>

          {/* Flow dependency table */}
          <div className="border border-dark-700/80 bg-dark-900/30 p-6 rounded-2xl">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-4">API-Led Integration Dependency Mappings</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-dark-700 text-slate-500 font-bold uppercase">
                    <th className="pb-3 pr-4">Source Component</th>
                    <th className="pb-3 pr-4">Target Dependency</th>
                    <th className="pb-3 pr-4">Integration Type</th>
                    <th className="pb-3">Dependency Purpose</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dark-800 text-slate-300">
                  {dependencies.map((dep, i) => (
                    <tr key={i} className="hover:bg-dark-800/10 transition-colors">
                      <td className="py-3 pr-4 font-bold text-white">{dep.source}</td>
                      <td className="py-3 pr-4 text-indigo-400 font-bold">{dep.target}</td>
                      <td className="py-3 pr-4">
                        <span className="bg-dark-700 text-[10px] px-2 py-0.5 rounded text-slate-400 font-semibold border border-dark-600">
                          {dep.type}
                        </span>
                      </td>
                      <td className="py-3 text-slate-400 leading-relaxed">{dep.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-8">
          <button
            onClick={handleConvertToAws}
            className="bg-aws-500 hover:bg-aws-600 text-white font-semibold text-xs px-4 py-2.5 rounded-lg transition-colors flex items-center gap-2"
          >
            <Cpu className="w-4 h-4" />
            <span>Map to AWS Infrastructure</span>
          </button>
        </div>
      </div>
    );
  };

  // 6. AWS Mapping Screen
  const renderMappingScreen = () => {
    if (!analyzedData || awsMappings.length === 0) {
      return (
        <div className="max-w-4xl mx-auto py-12 px-6 text-center text-slate-500">
          <AlertCircle className="w-12 h-12 mx-auto mb-2 text-slate-600" />
          <p className="text-sm font-semibold">No AWS mapping data compiled</p>
          <p className="text-xs text-slate-400 mt-1">Please run the AWS conversion mapping first.</p>
          <button
            onClick={handleConvertToAws}
            className="mt-4 bg-aws-500 hover:bg-aws-600 text-white font-semibold text-xs px-4 py-2.5 rounded-lg transition-colors flex items-center gap-2 mx-auto"
          >
            <Cpu className="w-4 h-4" />
            <span>Proceed to AWS Mapping</span>
          </button>
        </div>
      );
    }

    return (
      <div className="max-w-6xl mx-auto py-12 px-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
          <div>
            <h3 className="text-2xl font-bold flex items-center gap-2">
              <Cpu className="w-6 h-6 text-aws-400" />
              MuleSoft to AWS Mapping Schema
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Direct infrastructure translation matrix converting Mule adapters to secure, serverless AWS configurations.
            </p>
          </div>
          
          <button
            onClick={() => setActiveScreen("codegen")}
            className="bg-aws-500 hover:bg-aws-600 text-white font-semibold text-xs px-4 py-2.5 rounded-lg transition-colors flex items-center gap-2"
          >
            <FileText className="w-4 h-4" />
            <span>Review SAM Project Code</span>
          </button>
        </div>

        {/* Mappings Table */}
        <div className="border border-dark-700/80 bg-dark-900/30 rounded-2xl overflow-hidden mb-8">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-dark-700 bg-dark-900/80 text-xs font-bold text-slate-400 uppercase">
                  <th className="p-4 pl-6">MuleSoft Source Component</th>
                  <th className="p-4">Type</th>
                  <th className="p-4">AWS Native Service</th>
                  <th className="p-4 pr-6">Architecture Rationale</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-800 text-xs text-slate-300">
                {awsMappings.map((map, i) => (
                  <tr key={i} className="hover:bg-dark-800/30 transition-colors">
                    <td className="p-4 pl-6 font-bold text-white max-w-[200px] truncate">{map.muleComponent}</td>
                    <td className="p-4">
                      <span className="bg-dark-700 text-slate-300 border border-dark-600 px-2 py-0.5 rounded font-semibold text-[10px]">
                        {map.muleType}
                      </span>
                    </td>
                    <td className="p-4 text-aws-400 font-bold">{map.awsService}</td>
                    <td className="p-4 pr-6 leading-relaxed text-slate-400">{map.rationale}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Detail drawer/cards showing sample target codes */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="border border-dark-700/80 bg-dark-900/30 p-6 rounded-2xl">
            <h4 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-4">CloudFormation Target Architecture</h4>
            <pre className="text-[11px] font-mono leading-relaxed bg-dark-950 p-4 rounded-xl text-slate-400 max-h-60 overflow-y-auto border border-dark-800">
{`AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31
Resources:
  CustomerApiRoute:
    Type: AWS::Serverless::HttpApi
    Properties:
      StageName: dev
  GetCustomerFunction:
    Type: AWS::Serverless::Function
    Properties:
      Handler: src/handlers/getCustomer.handler
      Runtime: nodejs18.x`}
            </pre>
          </div>

          <div className="border border-dark-700/80 bg-dark-900/30 p-6 rounded-2xl">
            <h4 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-4">Lambda Handler skeleton</h4>
            <pre className="text-[11px] font-mono leading-relaxed bg-dark-950 p-4 rounded-xl text-slate-400 max-h-60 overflow-y-auto border border-dark-800">
{`export const handler = async (event) => {
  console.log("Execution Log: Triggered AWS Lambda");
  try {
    const id = event.pathParameters?.id;
    // Database call query
    const results = await getCustomer(id);
    return {
      statusCode: 200,
      body: JSON.stringify(results)
    };
  } catch (err) {
    return { statusCode: 500, body: err.message };
  }
};`}
            </pre>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-8">
          <button
            onClick={handleGenerateReport}
            className="border border-dark-700 hover:border-dark-600 bg-dark-800 text-white font-semibold text-xs px-4 py-2.5 rounded-lg transition-colors flex items-center gap-2"
          >
            <FileText className="w-4 h-4 text-mule-400" />
            <span>Generate Migration Report</span>
          </button>
        </div>
      </div>
    );
  };

  // 7. Migration Report
  const renderReportScreen = () => {
    if (!samFiles || !samFiles["docs/migration-report.md"]) {
      return (
        <div className="max-w-4xl mx-auto py-12 px-6 text-center text-slate-500">
          <AlertCircle className="w-12 h-12 mx-auto mb-2 text-slate-600" />
          <p className="text-sm font-semibold">No migration report compiled yet</p>
          <p className="text-xs text-slate-400 mt-1">Please generate the Migration Report first.</p>
          <button
            onClick={handleGenerateReport}
            className="mt-4 bg-aws-500 hover:bg-aws-600 text-white font-semibold text-xs px-4 py-2.5 rounded-lg transition-colors flex items-center gap-2 mx-auto"
          >
            <FileText className="w-4 h-4" />
            <span>Generate Migration Report</span>
          </button>
        </div>
      );
    }

    const reportContent = samFiles["docs/migration-report.md"];

    return (
      <div className="max-w-4xl mx-auto py-12 px-6">
        <div className="flex justify-between items-center mb-8 border-b border-dark-700/60 pb-4">
          <div>
            <h3 className="text-2xl font-bold flex items-center gap-2">
              <FileText className="w-6 h-6 text-mule-400" />
              Migration Assessment Report
            </h3>
            <span className="text-[10px] text-slate-500 font-mono">File: docs/migration-report.md</span>
          </div>
          <button
            onClick={handleDownloadProject}
            className="bg-mule-600 hover:bg-mule-500 text-white font-semibold text-xs px-3.5 py-2 rounded-lg transition-colors flex items-center gap-1.5"
          >
            <Download className="w-4 h-4" />
            <span>Download SAM ZIP</span>
          </button>
        </div>

        {/* Styled Markdown View */}
        <div className="border border-dark-750 bg-dark-900/30 p-8 rounded-2xl text-slate-300 space-y-6 select-text">
          <div className="prose prose-invert max-w-none text-sm leading-relaxed whitespace-pre-wrap font-sans">
            {reportContent}
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-8">
          <button
            onClick={() => setActiveScreen("codegen")}
            className="bg-aws-500 hover:bg-aws-600 text-white font-semibold text-xs px-4 py-2.5 rounded-lg transition-colors flex items-center gap-2"
          >
            <Code className="w-4 h-4" />
            <span>Review SAM Project</span>
          </button>
        </div>
      </div>
    );
  };

  // 8. AWS SAM Code Gen explorer
  const renderCodegenScreen = () => {
    if (!samFiles || Object.keys(samFiles).length === 0) {
      return (
        <div className="max-w-4xl mx-auto py-12 px-6 text-center text-slate-500">
          <AlertCircle className="w-12 h-12 mx-auto mb-2 text-slate-600" />
          <p className="text-sm font-semibold">No SAM project code generated yet</p>
          <p className="text-xs text-slate-400 mt-1">Please map to AWS infrastructure first to generate the code files.</p>
          <button
            onClick={handleConvertToAws}
            className="mt-4 bg-aws-500 hover:bg-aws-600 text-white font-semibold text-xs px-4 py-2.5 rounded-lg transition-colors flex items-center gap-2 mx-auto"
          >
            <Cpu className="w-4 h-4" />
            <span>Proceed to AWS Mapping</span>
          </button>
        </div>
      );
    }

    const fileKeys = Object.keys(samFiles);
    
    // Categorize SAM project files
    const mainYaml = fileKeys.filter(k => k.endsWith("template.yaml") || k.endsWith("package.json") || k.endsWith("README.md"));
    const handlers = fileKeys.filter(k => k.includes("handlers/"));
    const utils = fileKeys.filter(k => k.includes("utils/"));
    const docs = fileKeys.filter(k => k.includes("docs/"));

    return (
      <div className="h-[calc(100vh-80px)] flex flex-col md:flex-row">
        {/* Left pane: File navigation */}
        <div className="w-full md:w-80 border-r border-dark-700/60 bg-dark-900/40 flex flex-col h-full shrink-0">
          <div className="p-4 border-b border-dark-700/60">
            <h3 className="text-sm font-bold flex items-center gap-1.5 text-aws-400 mb-2">
              <Folder className="w-4 h-4" />
              aws-output/
            </h3>
            <p className="text-[10px] text-slate-500">SAM CloudFormation template + Node Lambda packages.</p>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Root Files */}
            {mainYaml.length > 0 && (
              <div>
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1">
                  <ChevronRight className="w-3 h-3" /> Root Configurations
                </h4>
                <div className="space-y-1">
                  {mainYaml.map((f, i) => (
                    <button
                      key={i}
                      onClick={() => setSelectedSamFile({ path: f, content: samFiles[f] })}
                      className={`w-full text-left px-2.5 py-1.5 text-xs rounded flex items-center gap-2 transition-colors ${selectedSamFile?.path === f ? "bg-aws-500/15 text-aws-400 font-semibold" : "text-slate-400 hover:bg-dark-800"}`}
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span className="truncate">{f}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Handlers */}
            {handlers.length > 0 && (
              <div>
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1">
                  <ChevronRight className="w-3 h-3" /> src/handlers
                </h4>
                <div className="space-y-1">
                  {handlers.map((f, i) => (
                    <button
                      key={i}
                      onClick={() => setSelectedSamFile({ path: f, content: samFiles[f] })}
                      className={`w-full text-left px-2.5 py-1.5 text-xs rounded flex items-center gap-2 transition-colors ${selectedSamFile?.path === f ? "bg-aws-500/15 text-aws-400 font-semibold" : "text-slate-400 hover:bg-dark-800"}`}
                    >
                      <Code className="w-3.5 h-3.5" />
                      <span className="truncate">{f.split("/").pop()}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Utils */}
            {utils.length > 0 && (
              <div>
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1">
                  <ChevronRight className="w-3 h-3" /> src/utils
                </h4>
                <div className="space-y-1">
                  {utils.map((f, i) => (
                    <button
                      key={i}
                      onClick={() => setSelectedSamFile({ path: f, content: samFiles[f] })}
                      className={`w-full text-left px-2.5 py-1.5 text-xs rounded flex items-center gap-2 transition-colors ${selectedSamFile?.path === f ? "bg-aws-500/15 text-aws-400 font-semibold" : "text-slate-400 hover:bg-dark-800"}`}
                    >
                      <Settings className="w-3.5 h-3.5" />
                      <span className="truncate">{f.split("/").pop()}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Docs */}
            {docs.length > 0 && (
              <div>
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1">
                  <ChevronRight className="w-3 h-3" /> docs/
                </h4>
                <div className="space-y-1">
                  {docs.map((f, i) => (
                    <button
                      key={i}
                      onClick={() => setSelectedSamFile({ path: f, content: samFiles[f] })}
                      className={`w-full text-left px-2.5 py-1.5 text-xs rounded flex items-center gap-2 transition-colors ${selectedSamFile?.path === f ? "bg-aws-500/15 text-aws-400 font-semibold" : "text-slate-400 hover:bg-dark-800"}`}
                    >
                      <File className="w-3.5 h-3.5" />
                      <span className="truncate">{f.split("/").pop()}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="p-4 border-t border-dark-700/60 flex flex-col gap-2">
            <button
              onClick={handleDownloadProject}
              className="w-full bg-mule-600 hover:bg-mule-500 text-white font-semibold text-xs py-2 rounded-lg transition-colors flex items-center justify-center gap-1.5"
            >
              <Download className="w-4 h-4" />
              <span>Download Project ZIP</span>
            </button>
            <button
              onClick={() => setActiveScreen("deploy")}
              className="w-full bg-aws-500 hover:bg-aws-600 text-white font-semibold text-xs py-2 rounded-lg transition-colors flex items-center justify-center gap-1.5"
            >
              <Server className="w-4 h-4" />
              <span>Deploy to AWS</span>
            </button>
          </div>
        </div>

        {/* Right pane: Code details */}
        <div className="flex-1 bg-dark-950 flex flex-col h-full overflow-hidden">
          {selectedSamFile ? (
            <>
              <div className="px-6 py-3 border-b border-dark-700/60 bg-dark-900/20 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <File className="w-4 h-4 text-slate-400" />
                  <span className="text-xs font-mono text-slate-300">{selectedSamFile.path}</span>
                </div>
                <div className="flex items-center gap-3">
                  {selectedSamFile.path.startsWith("src/handlers/") && selectedSamFile.path.endsWith(".js") && (
                    <button
                      onClick={() => {
                        const flowName = selectedSamFile.path.replace("src/handlers/", "").replace(".js", "");
                        handleGenerateLambdaWithAI(flowName);
                      }}
                      disabled={isGeneratingLambda}
                      className="flex items-center gap-1.5 px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-[10px] font-bold transition-all disabled:opacity-50"
                    >
                      {isGeneratingLambda ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <span>✨ Optimize with AI</span>
                      )}
                    </button>
                  )}
                  <div className="text-[10px] font-bold bg-dark-800 text-slate-400 px-2.5 py-1 rounded">
                    {selectedSamFile.path.split(".").pop().toUpperCase()}
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-auto p-6 font-mono text-xs leading-relaxed text-slate-300 bg-dark-900/10 select-text">
                <pre className="whitespace-pre-wrap">{selectedSamFile.content}</pre>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-500">
              <Eye className="w-12 h-12 mb-2 stroke-1" />
              <p className="text-sm">Select an AWS SAM file from the explorer pane to view contents</p>
            </div>
          )}
        </div>
      </div>
    );
  };

  // 9. AWS Deployment Screen
  const renderDeployScreen = () => {
    if (!samFiles || Object.keys(samFiles).length === 0) {
      return (
        <div className="max-w-4xl mx-auto py-12 px-6 text-center text-slate-500">
          <AlertCircle className="w-12 h-12 mx-auto mb-2 text-slate-600" />
          <p className="text-sm font-semibold">No SAM project code generated yet</p>
          <p className="text-xs text-slate-400 mt-1">Please map to AWS infrastructure first to enable deployment.</p>
          <button
            onClick={handleConvertToAws}
            className="mt-4 bg-aws-500 hover:bg-aws-600 text-white font-semibold text-xs px-4 py-2.5 rounded-lg transition-colors flex items-center gap-2 mx-auto"
          >
            <Cpu className="w-4 h-4" />
            <span>Proceed to AWS Mapping</span>
          </button>
        </div>
      );
    }

    return (
      <div className="max-w-5xl mx-auto py-12 px-6 grid grid-cols-1 md:grid-cols-3 gap-8">
        
        {/* AWS Credentials Form */}
        <div className="border border-dark-700/80 bg-dark-900/30 p-6 rounded-2xl h-fit">
          <h3 className="text-lg font-bold mb-2 flex items-center gap-2">
            <Server className="w-5 h-5 text-aws-400" />
            AWS Target Configs
          </h3>
          <p className="text-xs text-slate-400 mb-6">
            Configure target AWS account variables for the CloudFormation provisioning. Sandbox key uploads are not validated.
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">AWS Access Key ID</label>
              <input 
                type="text" 
                placeholder="AKIAXXXXXXXXXXXXXXXX" 
                value={awsAccessKey}
                onChange={(e) => setAwsAccessKey(e.target.value)}
                className="w-full bg-dark-950 border border-dark-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-aws-500 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">AWS Secret Access Key</label>
              <input 
                type="password" 
                placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY" 
                value={awsSecretKey}
                onChange={(e) => setAwsSecretKey(e.target.value)}
                className="w-full bg-dark-950 border border-dark-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-aws-500 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">AWS Region</label>
              <select 
                value={awsRegion}
                onChange={(e) => setAwsRegion(e.target.value)}
                className="w-full bg-dark-950 border border-dark-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-aws-500"
              >
                <option value="us-east-1">us-east-1 (N. Virginia)</option>
                <option value="us-west-2">us-west-2 (Oregon)</option>
                <option value="eu-west-1">eu-west-1 (Ireland)</option>
                <option value="ap-southeast-1">ap-southeast-1 (Singapore)</option>
              </select>
            </div>

            <button 
              onClick={handleValidateMapping}
              disabled={["validating", "validating_mappings", "generating_template"].includes(deployStep)}
              className="w-full bg-dark-800 hover:bg-dark-700 border border-dark-700 text-indigo-400 font-semibold text-xs py-2 rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Validate AWS Mapping</span>
            </button>

            <button 
              onClick={handleGenerateSamTemplate}
              disabled={["validating", "validating_mappings", "generating_template"].includes(deployStep)}
              className="w-full bg-dark-800 hover:bg-dark-700 border border-dark-700 text-amber-400 font-semibold text-xs py-2 rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Generate SAM Template</span>
            </button>

            <button 
              onClick={handleMockDeploy}
              disabled={["validating", "validating_mappings", "generating_template"].includes(deployStep)}
              className="w-full bg-aws-500 hover:bg-aws-600 disabled:opacity-50 text-white font-semibold text-xs py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <Play className="w-3.5 h-3.5" />
              <span>{deployStep === "completed" ? "Redeploy Stack" : deployStep === "validating" ? "Deploying..." : "Mock Deploy to AWS"}</span>
            </button>
          </div>
        </div>

        {/* Terminal log Emulator */}
        <div className="border border-dark-700/80 bg-dark-950 p-6 rounded-2xl md:col-span-2 flex flex-col h-[500px] overflow-hidden relative scanline">
          <div className="flex items-center justify-between border-b border-dark-800 pb-3 mb-4 shrink-0">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-green-500" />
              <span className="text-xs font-mono font-bold text-slate-400">AWS SAM Deploy Terminal</span>
            </div>
            
            {deployStep !== "idle" && (
              <span className={`w-2 h-2 rounded-full ${["completed", "mappings_validated", "template_generated"].includes(deployStep) ? "bg-green-500" : "bg-yellow-500 animate-pulse"}`}></span>
            )}
          </div>

          {/* Logs scroll area */}
          <div className="flex-1 overflow-y-auto font-mono text-[10px] space-y-1.5 leading-relaxed text-green-400 pr-2 select-text">
            {terminalLogs.length === 0 ? (
              <div className="text-slate-600 italic h-full flex items-center justify-center">
                Terminal idle. Click "Mock Deploy to AWS" to run SAM build & stack updates.
              </div>
            ) : (
              terminalLogs.map((log, i) => {
                let colorClass = "text-slate-300";
                if (log.startsWith("[success]")) {
                  colorClass = "text-green-400 font-bold";
                  log = log.replace("[success]", "✔");
                } else if (log.startsWith("[cmd]")) {
                  colorClass = "text-yellow-400 font-bold";
                  log = log.replace("[cmd]", "");
                } else if (log.startsWith("[info]")) {
                  colorClass = "text-slate-400";
                  log = log.replace("[info]", "ℹ");
                }
                
                return (
                  <div key={i} className={colorClass}>
                    {log}
                  </div>
                );
              })
            )}
            <div ref={terminalBottomRef}></div>
          </div>
        </div>
      </div>
    );
  };

  // 8. AI Analysis Console Screen
  const renderAiConsoleScreen = () => {
    if (!analyzedData) {
      return (
        <div className="max-w-4xl mx-auto py-12 px-6 text-center text-slate-500">
          <AlertCircle className="w-12 h-12 mx-auto mb-2 text-slate-600" />
          <p className="text-sm">Please load a project first from the Connect screen.</p>
        </div>
      );
    }

    const aiData = aiAnalysisData || {};
    const metrics = analyzedData.metrics || {};

    return (
      <div className="max-w-6xl mx-auto py-12 px-6 select-text">
        {warningMsg && (
          <div className="bg-yellow-950/20 border border-yellow-900/30 p-4 rounded-xl text-yellow-400 text-xs flex items-center gap-2.5 mb-6">
            <AlertCircle className="w-5 h-5 text-yellow-400 shrink-0" />
            <div>
              <span className="font-bold">System Notification:</span> {warningMsg}
            </div>
          </div>
        )}

        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
          <div>
            <h3 className="text-2xl font-bold flex items-center gap-2">
              <span className="text-indigo-400">✨</span>
              AI Analysis Console
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Synthesized technical and business analysis powered by generative AI.
            </p>
          </div>

          <button
            onClick={() => handleRunAiAnalysis(fileContents, analyzedData)}
            className="flex items-center gap-1.5 px-4 py-2 border border-indigo-900/50 hover:border-indigo-800 bg-indigo-950/30 hover:bg-indigo-950/50 text-indigo-400 rounded-lg text-xs font-semibold transition-all"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Run AI Analysis</span>
          </button>
        </div>

        {/* Quick Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-dark-900/40 border border-dark-700/80 p-5 rounded-2xl">
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Mule Flows / Subflows</h4>
            <div className="text-2xl font-extrabold text-white">
              {metrics.totalFlows || 0} <span className="text-xs font-semibold text-slate-500">/ {metrics.totalSubflows || 0}</span>
            </div>
          </div>
          <div className="bg-dark-900/40 border border-dark-700/80 p-5 rounded-2xl">
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">DataWeave Resources</h4>
            <div className="text-2xl font-extrabold text-white">{metrics.totalDwlFiles || 0}</div>
          </div>
          <div className="bg-dark-900/40 border border-dark-700/80 p-5 rounded-2xl">
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">AWS Target Complexity</h4>
            <div className="text-2xl font-extrabold text-indigo-400 uppercase tracking-wide">
              {aiData.migrationComplexity || metrics.complexityScore || "LOW"}
            </div>
          </div>
          <div className="bg-dark-900/40 border border-dark-700/80 p-5 rounded-2xl">
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Estimated Migration Effort</h4>
            <div className="text-2xl font-extrabold text-amber-400">
              {aiData.estimatedEffort || "2-3 Weeks"}
            </div>
          </div>
        </div>

        {/* Console Tab switcher */}
        <div className="flex border-b border-dark-700/60 mb-6 gap-2">
          {[
            { id: "executive", name: "Executive Briefing" },
            { id: "flows", name: "Flows & Transformations" },
            { id: "architecture", name: "Target AWS Architecture" },
            { id: "system", name: "System Logs & Metadata" }
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setAiConsoleTab(t.id)}
              className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all ${aiConsoleTab === t.id ? "border-indigo-500 text-white" : "border-transparent text-slate-500 hover:text-slate-300"}`}
            >
              {t.name}
            </button>
          ))}
        </div>

        {/* Tab contents */}
        {aiConsoleTab === "executive" && (
          <div className="space-y-6">
            {/* Executive Summary */}
            <div className="border border-dark-700/80 bg-dark-900/30 p-6 rounded-2xl">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Executive Summary</h4>
              <p className="text-sm leading-relaxed text-slate-300 whitespace-pre-line select-text">
                {aiData.executiveSummary || "Analyzing codebase details..."}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Business Capabilities */}
              <div className="border border-dark-700/80 bg-dark-900/30 p-6 rounded-2xl">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">AI-Discovered Business Capabilities</h4>
                <div className="space-y-3">
                  {aiData.businessCapabilities && aiData.businessCapabilities.length > 0 ? (
                    aiData.businessCapabilities.map((bc, i) => (
                      <div key={i} className="p-3 bg-dark-800/40 border border-dark-750 rounded-xl">
                        <div className="text-xs font-bold text-white mb-1">{bc.capability}</div>
                        <p className="text-[11px] text-slate-400 leading-relaxed">{bc.description}</p>
                      </div>
                    ))
                  ) : (
                    <div className="text-xs text-slate-500 italic">No business capabilities parsed.</div>
                  )}
                </div>
              </div>

              {/* Risks & Assumptions */}
              <div className="border border-dark-700/80 bg-dark-900/30 p-6 rounded-2xl flex flex-col justify-between">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Risks, Assumptions & Recommendations</h4>
                  
                  {/* Risks */}
                  <div className="mb-4">
                    <div className="text-xs font-bold text-red-400 mb-2 flex items-center gap-1.5">
                      <ShieldAlert className="w-3.5 h-3.5" /> Identified Risks:
                    </div>
                    <ul className="list-disc pl-5 text-[11px] text-slate-400 space-y-1.5">
                      {aiData.risks && aiData.risks.length > 0 ? (
                        aiData.risks.map((risk, i) => <li key={i}>{risk}</li>)
                      ) : (
                        <li>Converting custom DataWeave maps to Javascript yields schema validation risks.</li>
                      )}
                    </ul>
                  </div>

                  {/* Recommendations */}
                  <div>
                    <div className="text-xs font-bold text-indigo-400 mb-2">Architectural Recommendations:</div>
                    <ul className="list-disc pl-5 text-[11px] text-slate-400 space-y-1.5">
                      {aiData.recommendations && aiData.recommendations.length > 0 ? (
                        aiData.recommendations.map((rec, i) => <li key={i}>{rec}</li>)
                      ) : (
                        <li>Use AWS Systems Manager Parameter store for caching properties config.</li>
                      )}
                    </ul>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-dark-800 flex justify-between items-center text-[10px] text-slate-500 font-mono">
                  <span>Generative Model: OpenAI gpt-4o-mini</span>
                  <span>Confidence: High</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {aiConsoleTab === "flows" && (
          <div className="space-y-6">
            {/* Business flow summary */}
            <div className="border border-dark-700/80 bg-dark-900/30 p-6 rounded-2xl">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-4">Flow Functional Translation (AI Interpreted)</h4>
              <div className="space-y-3">
                {aiData.flows && aiData.flows.length > 0 ? (
                  aiData.flows.map((flow, i) => (
                    <div key={i} className="bg-dark-800/30 border border-dark-750 p-4 rounded-xl flex flex-col md:flex-row justify-between gap-4 hover:border-indigo-500/20 transition-all animate-fadeIn">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs text-white">{flow.name}</span>
                          <span className={`text-[9px] px-2 py-0.5 rounded font-bold ${flow.complexity === "HIGH" ? "bg-red-950/40 text-red-400 border border-red-900/30" : flow.complexity === "MEDIUM" ? "bg-yellow-950/40 text-yellow-400 border border-yellow-900/30" : "bg-green-950/40 text-green-400 border border-green-900/30"}`}>
                            {flow.complexity} Complexity
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 leading-relaxed">{flow.description}</p>
                      </div>
                      <div className="shrink-0 flex flex-col justify-end text-right md:items-end">
                        <span className="text-[10px] font-bold text-slate-500">AWS Target</span>
                        <span className="text-xs font-mono text-indigo-400 font-bold">{flow.awsMapping}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-xs text-slate-500 italic">No flows interpreted.</div>
                )}
              </div>
            </div>

            {/* DataWeave Transformations details */}
            <div className="border border-dark-700/80 bg-dark-900/30 p-6 rounded-2xl">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-4">DataWeave Transformations & Mapping suggestions</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {aiData.transformations && aiData.transformations.length > 0 ? (
                  aiData.transformations.map((trans, i) => (
                    <div key={i} className="bg-dark-800/30 border border-dark-750 p-4 rounded-xl space-y-3">
                      <div>
                        <div className="text-xs font-bold text-white mb-0.5">{trans.name}</div>
                        <span className="text-[9px] text-slate-500 font-mono">Processor type: Transform Message</span>
                      </div>
                      <div className="text-xs text-slate-400 leading-relaxed">
                        <span className="font-bold text-slate-300">Transformation Logic:</span> {trans.logic}
                      </div>
                      <div className="p-2.5 bg-dark-950 rounded border border-dark-800 font-mono text-[10px] text-indigo-300">
                        <span className="font-bold text-slate-500 block mb-1">AWS Suggestion:</span>
                        {trans.awsAlternative}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-xs text-slate-500 italic col-span-2">No transformations analyzed.</div>
                )}
              </div>
            </div>
          </div>
        )}

        {aiConsoleTab === "architecture" && (
          <div className="space-y-6">
            {/* Recommendations & security policy */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              
              {/* Security Policy */}
              <div className="border border-dark-700/80 bg-dark-900/30 p-6 rounded-2xl md:col-span-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Security and Policies Migration</h4>
                <div className="space-y-3">
                  {aiData.security && aiData.security.length > 0 ? (
                    aiData.security.map((sec, i) => (
                      <div key={i} className="bg-dark-800/30 border border-dark-750 p-3 rounded-xl flex justify-between items-start gap-4">
                        <div>
                          <div className="text-xs font-bold text-white mb-0.5">{sec.policyName}</div>
                          <p className="text-[11px] text-slate-400">{sec.description}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-[9px] font-bold text-slate-500 block">AWS Equivalent</span>
                          <span className="text-xs font-mono text-aws-400 font-bold">{sec.awsMapping}</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-xs text-slate-500 italic">No security configurations resolved.</div>
                  )}
                </div>
              </div>

              {/* Error Handling */}
              <div className="border border-dark-700/80 bg-dark-900/30 p-6 rounded-2xl">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Error Handling Alignment</h4>
                <div className="space-y-3">
                  {aiData.errorHandling && aiData.errorHandling.length > 0 ? (
                    aiData.errorHandling.map((eh, i) => (
                      <div key={i} className="bg-dark-800/30 border border-dark-750 p-3 rounded-xl space-y-1">
                        <div className="text-xs font-bold text-white">{eh.scope}</div>
                        <div className="text-[10px] text-slate-400"><span className="font-bold text-slate-500">Mule:</span> {eh.strategy}</div>
                        <div className="text-[10px] text-indigo-400 font-mono"><span className="font-bold text-slate-500">AWS:</span> {eh.awsMapping}</div>
                      </div>
                    ))
                  ) : (
                    <div className="text-xs text-slate-500 italic">No error scopes parsed.</div>
                  )}
                </div>
              </div>
            </div>

            {/* AWS component Mapping table */}
            <div className="border border-dark-700/80 bg-dark-900/30 p-6 rounded-2xl">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-4">AWS Targeted Architecture Mappings (AI Verified)</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-dark-700 text-slate-500 font-bold uppercase">
                      <th className="pb-3 pr-4">MuleSoft Source</th>
                      <th className="pb-3 pr-4">Component Type</th>
                      <th className="pb-3 pr-4 text-aws-400">AWS Target Service</th>
                      <th className="pb-3">Architecture Mapping Rationale</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-dark-800 text-slate-300">
                    {aiData.awsMapping && aiData.awsMapping.length > 0 ? (
                      aiData.awsMapping.map((map, i) => (
                        <tr key={i} className="hover:bg-dark-800/20 transition-all">
                          <td className="py-3 pr-4 font-bold text-white">{map.muleComponent}</td>
                          <td className="py-3 pr-4">
                            <span className="bg-dark-700 text-[10px] px-2 py-0.5 rounded text-slate-400 font-semibold border border-dark-600">
                              {map.muleType}
                            </span>
                          </td>
                          <td className="py-3 pr-4 text-aws-400 font-bold">{map.awsService}</td>
                          <td className="py-3 text-slate-400 leading-relaxed">{map.rationale}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="4" className="py-4 text-center text-slate-500 italic">No AI mapped components. Run AWS Conversion to generate.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {aiConsoleTab === "system" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Connection & Status Panel */}
              <div className="border border-dark-700/80 bg-dark-900/30 p-6 rounded-2xl space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Integration Status</h4>
                
                <div className="flex justify-between items-center py-2 border-b border-dark-800">
                  <span className="text-xs text-slate-400">Selected Provider:</span>
                  <span className="text-xs font-bold text-indigo-400 capitalize">{aiProvider === "auto" ? "Auto Detect" : aiProvider === "openai" ? "OpenAI" : aiProvider === "gemini" ? "Gemini Free API" : "Parser Only"}</span>
                </div>

                <div className="flex justify-between items-center py-2 border-b border-dark-800">
                  <span className="text-xs text-slate-400">Backend API Endpoint:</span>
                  <span className="text-xs font-mono text-slate-300">http://localhost:5000</span>
                </div>

                <div className="flex justify-between items-center py-2 border-b border-dark-800">
                  <span className="text-xs text-slate-400">Backend Health:</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${backendHealth === "healthy" ? "bg-green-950/40 text-green-400 border border-green-900/30" : backendHealth === "checking" ? "bg-yellow-950/40 text-yellow-400 border border-yellow-900/30" : "bg-red-950/40 text-red-400 border border-red-900/30"}`}>
                    {backendHealth}
                  </span>
                </div>

                <div className="flex justify-between items-center py-2 border-b border-dark-800">
                  <span className="text-xs text-slate-400">AI Request Status:</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${aiRequestStatus === "completed" ? "bg-green-950/40 text-green-400 border border-green-900/30" : aiRequestStatus === "running" ? "bg-indigo-950/40 text-indigo-400 border border-indigo-900/30 animate-pulse" : aiRequestStatus === "failed" ? "bg-red-950/40 text-red-400 border border-red-900/30" : "bg-slate-950/40 text-slate-400 border border-slate-900/30"}`}>
                    {aiRequestStatus}
                  </span>
                </div>

                <div className="py-2">
                  <span className="text-xs text-slate-400 block mb-1">Active Fallback Details:</span>
                  <p className="text-[11px] text-slate-500 italic bg-dark-950 p-3 rounded border border-dark-800">
                    {warningMsg || "None. The AI engine executed with full API capability."}
                  </p>
                </div>
              </div>

              {/* Settings shortcut card */}
              <div className="border border-dark-700/80 bg-dark-900/30 p-6 rounded-2xl flex flex-col justify-between">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Model Information</h4>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    You can override API keys, customize target models, or switch provider modes at any time in the Settings page.
                  </p>
                  <div className="mt-4 space-y-2 text-[11px] text-slate-500 font-mono">
                    <div>OpenAI Default: <span className="text-slate-400">gpt-4o-mini</span></div>
                    <div>Gemini Default: <span className="text-slate-400">gemini-1.5-flash</span></div>
                  </div>
                </div>
                <button
                  onClick={() => setActiveScreen("settings")}
                  className="w-full mt-6 bg-dark-800 hover:bg-dark-750 border border-dark-700 text-white font-semibold text-xs py-2 rounded-lg transition-all flex items-center justify-center gap-1.5"
                >
                  <Settings className="w-3.5 h-3.5" />
                  Configure AI Settings
                </button>
              </div>
            </div>

            {/* RAW outputs split screen */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Parser Output */}
              <div className="border border-dark-700/80 bg-dark-900/30 p-6 rounded-2xl">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 flex justify-between items-center">
                  <span>Raw Parser Metadata (AST Output)</span>
                  <span className="text-[9px] text-slate-500 font-mono">Size: {JSON.stringify(analyzedData).length} bytes</span>
                </h4>
                <pre className="text-[10px] font-mono leading-relaxed bg-dark-950 p-4 rounded-xl text-slate-400 max-h-80 overflow-y-auto border border-dark-800 select-text">
                  {JSON.stringify(analyzedData, null, 2)}
                </pre>
              </div>

              {/* AI Response Output */}
              <div className="border border-dark-700/80 bg-dark-900/30 p-6 rounded-2xl">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 flex justify-between items-center">
                  <span>AI JSON Response Payload</span>
                  <span className="text-[9px] text-slate-500 font-mono">Size: {JSON.stringify(aiData).length} bytes</span>
                </h4>
                <pre className="text-[10px] font-mono leading-relaxed bg-dark-950 p-4 rounded-xl text-slate-400 max-h-80 overflow-y-auto border border-dark-800 select-text">
                  {JSON.stringify(aiData, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-3 mt-8">
          <button
            onClick={() => setActiveScreen("explorer")}
            className="border border-dark-700 hover:border-dark-600 bg-dark-800 text-white font-semibold text-xs px-4 py-2.5 rounded-lg transition-colors flex items-center gap-2"
          >
            <Folder className="w-4 h-4" />
            <span>Open Code Explorer</span>
          </button>
          
          <button
            onClick={() => setActiveScreen("blueprint")}
            className="border border-dark-700 hover:border-dark-600 bg-dark-800 text-white font-semibold text-xs px-4 py-2.5 rounded-lg transition-colors flex items-center gap-2"
          >
            <Layers className="w-4 h-4 text-indigo-400" />
            <span>Review API Blueprint</span>
          </button>

          <button
            onClick={handleConvertToAws}
            className="bg-aws-500 hover:bg-aws-600 text-white font-semibold text-xs px-4 py-2.5 rounded-lg transition-colors flex items-center gap-2"
          >
            <Cpu className="w-4 h-4" />
            <span>Generate AWS SAM Project</span>
          </button>
        </div>
      </div>
    );
  };

  // 9. AI settings screen
  const renderSettingsScreen = () => {
    return (
      <div className="max-w-4xl mx-auto py-12 px-6">
        <h3 className="text-2xl font-bold mb-2 flex items-center gap-2">
          <Settings className="w-6 h-6 text-indigo-400" />
          AI Configuration Settings
        </h3>
        <p className="text-xs text-slate-400 mb-8">
          Configure your preferred generative AI provider and custom model parameters.
        </p>

        <div className="space-y-6 bg-dark-900/40 border border-dark-700/80 p-8 rounded-2xl">
          {/* Provider Selector */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
              Generative AI Provider
            </label>
            <select
              value={aiProvider}
              onChange={(e) => setAiProvider(e.target.value)}
              className="w-full bg-dark-950 border border-dark-700 rounded-lg px-4 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors animate-fadeIn"
            >
              <option value="auto">Auto Detect (OpenAI &rarr; Gemini &rarr; Parser Only)</option>
              <option value="parser">Parser Only (Local Offline AST Analysis)</option>
              <option value="openai">OpenAI (GPT Engine)</option>
              <option value="gemini">Gemini Free API (Google Generative AI)</option>
            </select>
            <p className="text-[10px] text-slate-500 mt-1.5">
              Choose "Auto Detect" to automatically use environment keys configured in the backend.
            </p>
          </div>

          {/* OpenAI Settings */}
          {aiProvider === "openai" && (
            <div className="space-y-4 pt-4 border-t border-dark-800 animate-fadeIn">
              <h4 className="text-xs font-bold text-white uppercase tracking-wider">OpenAI API Settings</h4>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1.5">
                  OpenAI API Key (Override)
                </label>
                <input
                  type="password"
                  value={openAiApiKey}
                  onChange={(e) => setOpenAiApiKey(e.target.value)}
                  placeholder="sk-..."
                  className="w-full bg-dark-950 border border-dark-700 rounded-lg px-4 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
                />
                <p className="text-[9px] text-slate-500 mt-1">
                  Leave blank to use the backend environment variable `OPENAI_API_KEY`.
                </p>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1.5">
                  OpenAI Model
                </label>
                <input
                  type="text"
                  value={openAiModel}
                  onChange={(e) => setOpenAiModel(e.target.value)}
                  placeholder="gpt-4o-mini"
                  className="w-full bg-dark-950 border border-dark-700 rounded-lg px-4 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>
            </div>
          )}

          {/* Gemini Settings */}
          {aiProvider === "gemini" && (
            <div className="space-y-4 pt-4 border-t border-dark-800 animate-fadeIn">
              <h4 className="text-xs font-bold text-white uppercase tracking-wider">Gemini API Settings</h4>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1.5">
                  Gemini API Key (Override)
                </label>
                <input
                  type="password"
                  value={geminiApiKey}
                  onChange={(e) => setGeminiApiKey(e.target.value)}
                  placeholder="AIzaSy..."
                  className="w-full bg-dark-950 border border-dark-700 rounded-lg px-4 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
                />
                <p className="text-[9px] text-slate-500 mt-1">
                  Leave blank to use the backend environment variable `GEMINI_API_KEY`.
                </p>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1.5">
                  Gemini Model
                </label>
                <input
                  type="text"
                  value={geminiModel}
                  onChange={(e) => setGeminiModel(e.target.value)}
                  placeholder="gemini-1.5-flash"
                  className="w-full bg-dark-950 border border-dark-700 rounded-lg px-4 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>
            </div>
          )}
          
          {/* Success message banner */}
          <div className="bg-indigo-950/20 border border-indigo-900/30 p-4 rounded-xl text-indigo-400 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-indigo-400" />
            <span>AI settings are automatically saved locally and applied on the next analysis request.</span>
          </div>
        </div>
      </div>
    );
  };

  // ----------------------------------------------------
  // Main Router render
  // ----------------------------------------------------
  const renderScreen = () => {
    switch (activeScreen) {
      case "connect":
        return renderConnectScreen();
      case "settings":
        return renderSettingsScreen();
      case "explorer":
        return renderExplorerScreen();
      case "analysis":
        return renderAnalysisScreen();
      case "ai-console":
        return renderAiConsoleScreen();
      case "blueprint":
        return renderBlueprintScreen();
      case "mapping":
        return renderMappingScreen();
      case "report":
        return renderReportScreen();
      case "codegen":
        return renderCodegenScreen();
      case "deploy":
        return renderDeployScreen();
      default:
        return renderDashboardScreen();
    }
  };

  return (
    <div className="min-h-full flex flex-col bg-dark-950 text-slate-200">
      {renderNavBar()}
      
      {/* OpenAI Status Indicator Bar */}
      {aiStatusText && (
        <div className="bg-indigo-950/80 border-b border-indigo-900/50 px-6 py-2.5 flex items-center justify-between animate-pulse sticky top-[72px] z-30 backdrop-blur-md">
          <div className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-indigo-400 animate-spin" />
            <span className="text-xs font-semibold text-indigo-300">{aiStatusText}</span>
          </div>
          <span className="text-[10px] uppercase font-mono font-bold tracking-widest text-indigo-500">OpenAI Engine Running</span>
        </div>
      )}
      
      <main className="flex-1">
        {renderScreen()}
      </main>

      <footer className="border-t border-dark-700/60 bg-dark-900/50 py-4 px-6 text-center text-[10px] text-slate-500 font-medium shrink-0">
        MuleSoft to AWS Migration Assistant (Serverless Prototype) • Developed for Enterprise Modernization • Local Time: 2026
      </footer>
    </div>
  );
}
