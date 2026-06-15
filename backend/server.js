import express from "express";
import cors from "cors";
import multer from "multer";
import path from "path";
import fs from "fs";
import AdmZip from "adm-zip";
import dotenv from "dotenv";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { 
  checkGithubConnection, 
  parseGithubUrl, 
  fetchGithubRepoTree, 
  fetchGithubFileContent, 
  loadMockLocalRepo 
} from "./githubService.js";
import { analyzeRepository } from "./parserService.js";
import { mapMuleToAws } from "./awsMapperService.js";
import { generateAwsSamProject, createZipArchive } from "./codeGeneratorService.js";
import {
  generateLambdaHandlerWithAI
} from "./src/services/openaiAnalysisService.js";
import {
  resolveProvider,
  parserOnlyAnalyze,
  openAiAnalyze,
  geminiAnalyze,
  generateBlueprint,
  generateReport,
  generateAwsMapping,
  generateArchitectureDiagram
} from "./src/services/aiProviderService.js";

const app = express();
const PORT = process.env.PORT || 5000;

// Memory cache for generated project files
let lastGeneratedProject = null;
let lastAnalyzedData = null;

// Multer in-memory upload configuration
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

// Configure CORS
app.use(cors({
  origin: [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "https://mulesoft-aws-migration-assistant-1.onrender.com"
  ],
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
}));

app.options("*", cors());

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// 1. Connect to GitHub
app.post("/api/github/connect", async (req, res) => {
  const { token } = req.body;
  if (!token) {
    return res.status(400).json({ error: "GitHub token is required" });
  }
  
  const connection = await checkGithubConnection(token);
  if (connection.success) {
    res.json({ success: true, user: connection.user });
  } else {
    res.status(401).json({ error: "Failed to connect to GitHub. Verify your token." });
  }
});

// 2. Fetch Repositories list (real user repos + mock templates)
app.post("/api/github/repos", async (req, res) => {
  const { token } = req.body;
  const mockRepos = [
    { name: "customer-experience-api", description: "MuleSoft Experience layer exposing customer REST APIs", mock: true },
    { name: "customer-process-api", description: "MuleSoft Process layer orchestrating cache and downstream APIs", mock: true },
    { name: "customer-system-api", description: "MuleSoft System layer query database and push messaging events", mock: true }
  ];

  if (!token) {
    // Return only mock options
    return res.json({ repos: mockRepos, isMocked: true });
  }

  try {
    const response = await fetch("https://api.github.com/user/repos?per_page=100&sort=updated", {
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "MuleSoft-AWS-Migration-Assistant-Prototype"
      }
    });

    if (response.ok) {
      const realRepos = await response.json();
      const formattedReal = realRepos.map(r => ({
        name: r.full_name,
        description: r.description || "No description",
        url: r.html_url,
        mock: false
      }));
      res.json({ repos: [...mockRepos, ...formattedReal], isMocked: false });
    } else {
      res.json({ repos: mockRepos, isMocked: true, warning: "Could not fetch user repos, returned mocks." });
    }
  } catch (error) {
    res.json({ repos: mockRepos, isMocked: true, warning: "GitHub API error: " + error.message });
  }
});

// 3. Load Repository content and run Parser
app.post("/api/github/load-repo", async (req, res) => {
  const { token, repoUrl, useMock, mockRepoName } = req.body;

  try {
    let repoName = mockRepoName;
    let fileContents = {};
    let fileList = [];

    if (useMock) {
      console.log(`Loading local mock repository: ${mockRepoName}`);
      const mockRepo = await loadMockLocalRepo(mockRepoName);
      repoName = mockRepo.name;
      fileContents = mockRepo.contents;
      fileList = mockRepo.files;
    } else {
      if (!token || !repoUrl) {
        return res.status(400).json({ error: "Token and Repository URL are required for real clone" });
      }

      const info = parseGithubUrl(repoUrl);
      if (!info) {
        return res.status(400).json({ error: "Invalid GitHub Repository URL" });
      }
      
      repoName = info.repo;
      console.log(`Cloning file tree from real GitHub repo: ${info.owner}/${info.repo}`);
      const tree = await fetchGithubRepoTree(token, info.owner, info.repo);
      
      // Filter tree for files we care about (XML, dwl, raml, properties, yaml, yml)
      const allowedExtensions = [".xml", ".dwl", ".raml", ".properties", ".yaml", ".yml", ".json"];
      const filesToFetch = tree.filter(node => 
        node.type === "file" && 
        allowedExtensions.some(ext => node.path.toLowerCase().endsWith(ext))
      );

      console.log(`Fetching contents for ${filesToFetch.length} matched codebase files...`);
      for (const node of filesToFetch) {
        try {
          const content = await fetchGithubFileContent(token, info.owner, info.repo, node.path);
          fileContents[node.path] = content;
          fileList.push({
            path: node.path,
            type: "file",
            size: node.size
          });
        } catch (fileErr) {
          console.warn(`Skipping file ${node.path} due to fetch error:`, fileErr.message);
        }
      }
    }

    if (Object.keys(fileContents).length === 0) {
      return res.status(400).json({ error: "No parseable MuleSoft files found in the repository" });
    }

    // Run analyzer
    console.log("Analyzing project file contents...");
    const analyzedData = await analyzeRepository(fileContents);
    lastAnalyzedData = analyzedData;

    res.json({
      repoName,
      files: fileList,
      fileContents, // Return file contents for explorer
      analyzedData
    });

  } catch (error) {
    console.error("Failed to load repository:", error);
    res.status(500).json({ error: "Error loading repository: " + error.message });
  }
});

// 4. Local ZIP upload fallback
app.post("/api/upload", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  try {
    const zip = new AdmZip(req.file.buffer);
    const zipEntries = zip.getEntries();
    
    const fileContents = {};
    const fileList = [];
    const allowedExtensions = [".xml", ".dwl", ".raml", ".properties", ".yaml", ".yml", ".json"];

    console.log(`Processing uploaded zip: ${req.file.originalname} (${zipEntries.length} items)`);
    
    for (const entry of zipEntries) {
      if (!entry.isDirectory) {
        const entryPath = entry.entryName;
        const lowerPath = entryPath.toLowerCase();
        
        if (allowedExtensions.some(ext => lowerPath.endsWith(ext))) {
          // Read text content
          const content = entry.getData().toString("utf8");
          fileContents[entryPath] = content;
          
          fileList.push({
            path: entryPath,
            type: "file",
            size: entry.header.size
          });
        }
      } else {
        fileList.push({
          path: entry.entryName,
          type: "dir"
        });
      }
    }

    if (Object.keys(fileContents).length === 0) {
      return res.status(400).json({ error: "No parseable MuleSoft configuration files found in ZIP" });
    }

    // Run analyzer
    console.log("Analyzing uploaded ZIP codebase...");
    const analyzedData = await analyzeRepository(fileContents);
    lastAnalyzedData = analyzedData;

    res.json({
      repoName: req.file.originalname.replace(".zip", ""),
      files: fileList,
      fileContents,
      analyzedData
    });

  } catch (error) {
    console.error("ZIP Upload processing failed:", error);
    res.status(500).json({ error: "Failed to process ZIP file: " + error.message });
  }
});

// 5. Analyze payload endpoint (Combined technical + AI analysis)
app.post("/api/analyze", async (req, res) => {
  const { files } = req.body;
  if (!files || typeof files !== "object") {
    return res.status(400).json({ error: "Invalid codebase files payload" });
  }
  
  try {
    console.log("[API /api/analyze] Running technical AST parser...");
    const analyzedData = await analyzeRepository(files);
    lastAnalyzedData = analyzedData;
    
    console.log("[API /api/analyze] Running OpenAI analysis service...");
    const aiAnalysis = await analyzeMuleProjectWithAI(files, analyzedData);
    
    // Check if OpenAI key warning is relevant
    const warning = process.env.OPENAI_API_KEY ? null : "OpenAI API key is not configured. Parser-only analysis is available.";
    
    res.json({
      ...analyzedData,
      aiAnalysis,
      warning
    });
  } catch (err) {
    res.status(500).json({ error: "Analysis failed: " + err.message });
  }
});

// 6. Generate Blueprint (AI-powered API-led architecture & diagram)
app.post("/api/generate-blueprint", async (req, res) => {
  const { analyzedData } = req.body;
  if (!analyzedData) {
    return res.status(400).json({ error: "Analyzed data payload is required" });
  }

  try {
    console.log("[API /api/generate-blueprint] Querying OpenAI for business blueprint...");
    const aiBlueprint = await generateBusinessBlueprintWithAI(analyzedData);
    
    res.json({
      blueprintDiagram: aiBlueprint.mermaidDiagram,
      summary: aiBlueprint.summary
    });
  } catch (error) {
    console.error("[API /api/generate-blueprint] AI generation failed, using fallback:", error);
    // Fallback blueprint
    let diagram = `graph TD
    Client[Client App] -->|HTTP Request| Experience[Experience Layer]
`;
    const listeners = [];
    const dbCalls = [];
    const queuePubs = [];
    for (const flow of analyzedData.flows) {
      if (flow.processors.some(p => p.type === "http-listener")) listeners.push(flow.name);
      if (flow.processors.some(p => p.type === "database")) dbCalls.push(flow.name);
      if (flow.processors.some(p => p.type === "anypoint-mq-publish")) queuePubs.push(flow.name);
    }
    res.json({
      blueprintDiagram: diagram,
      summary: {
        listeners,
        dbCalls,
        queuePubs,
        note: "Fallback mode activated"
      }
    });
  }
});

// 7. Convert/Map to AWS Services (AI-powered recommendations + code gen)
app.post("/api/convert/aws", async (req, res) => {
  const { analyzedData } = req.body;
  if (!analyzedData) {
    return res.status(400).json({ error: "Analyzed project data is required" });
  }

  try {
    console.log("[API /api/convert/aws] Fetching AI AWS plan and mapping recommendations...");
    const aiPlan = await generateAwsConversionPlanWithAI(analyzedData);
    
    console.log("Generating AWS target mappings...");
    const mappings = mapMuleToAws(analyzedData);
    
    // Enrich mappings rationale or add custom AI recommended services if needed
    if (aiPlan && aiPlan.targetArchitectureDescription) {
      console.log("Enriched AWS architecture details generated by AI");
    }

    console.log("Compiling AWS SAM project files...");
    const samProjectFiles = generateAwsSamProject(analyzedData, mappings);
    
    // Use AI to generate a detailed migration report in docs/migration-report.md
    console.log("Generating AI Migration Report for SAM output...");
    const aiReportMd = await generateMigrationReportWithAI(analyzedData, mappings);
    samProjectFiles["docs/migration-report.md"] = aiReportMd;
    
    // Save in memory for later ZIP download
    lastGeneratedProject = samProjectFiles;

    res.json({
      mappings,
      files: samProjectFiles,
      aiPlan
    });
  } catch (error) {
    console.error("AWS conversion failed:", error);
    res.status(500).json({ error: "AWS Conversion failed: " + error.message });
  }
});

// ====================================================
// NEW OPENAI / GEMINI / PARSER INGRESS API ENDPOINTS
// ====================================================

// 9. POST /api/ai/analyze
app.post("/api/ai/analyze", async (req, res) => {
  const { files, analyzedData, aiSettings } = req.body;
  if (!files || typeof files !== "object" || !analyzedData) {
    return res.status(400).json({ error: "Invalid codebase files or parsed metadata payload" });
  }

  try {
    lastAnalyzedData = analyzedData;
    const providerInfo = resolveProvider(aiSettings);
    console.log(`[API /api/ai/analyze] Using provider: ${providerInfo.type}`);
    let result;
    if (providerInfo.type === "openai") {
      result = await openAiAnalyze(files, analyzedData, providerInfo);
    } else if (providerInfo.type === "gemini") {
      result = await geminiAnalyze(files, analyzedData, providerInfo);
    } else {
      result = parserOnlyAnalyze(files, analyzedData);
    }
    res.json(result);
  } catch (err) {
    console.error("Route /api/ai/analyze error:", err);
    res.status(500).json({ error: "AI analysis failed: " + err.message });
  }
});

// 10. POST /api/ai/blueprint
app.post("/api/ai/blueprint", async (req, res) => {
  const { analyzedData, aiSettings } = req.body;
  if (!analyzedData) {
    return res.status(400).json({ error: "Analyzed metadata is required" });
  }

  try {
    const providerInfo = resolveProvider(aiSettings);
    console.log(`[API /api/ai/blueprint] Using provider: ${providerInfo.type}`);
    const blueprint = await generateBlueprint(analyzedData, providerInfo);
    res.json(blueprint);
  } catch (err) {
    console.error("Route /api/ai/blueprint error:", err);
    res.status(500).json({ error: "AI blueprint generation failed: " + err.message });
  }
});

// 11. POST /api/ai/report
app.post("/api/ai/report", async (req, res) => {
  const { analyzedData, awsMapping, aiSettings } = req.body;
  if (!analyzedData || !awsMapping) {
    return res.status(400).json({ error: "Analyzed metadata and AWS mappings are required" });
  }

  try {
    const providerInfo = resolveProvider(aiSettings);
    console.log(`[API /api/ai/report] Using provider: ${providerInfo.type}`);
    const markdownReport = await generateReport(analyzedData, awsMapping, providerInfo);
    const diagram = await generateArchitectureDiagram(analyzedData, providerInfo);
    res.json({
      reportMarkdown: markdownReport,
      architectureDiagram: diagram,
      status: "success"
    });
  } catch (err) {
    console.error("Route /api/ai/report error:", err);
    res.status(500).json({ error: "AI report generation failed: " + err.message });
  }
});

// 12. POST /api/ai/aws-mapping
app.post("/api/ai/aws-mapping", async (req, res) => {
  const { analyzedData, aiSettings } = req.body;
  if (!analyzedData) {
    return res.status(400).json({ error: "Analyzed metadata is required" });
  }

  try {
    const providerInfo = resolveProvider(aiSettings);
    console.log(`[API /api/ai/aws-mapping] Using provider: ${providerInfo.type}`);
    const mappings = mapMuleToAws(analyzedData);
    const samProjectFiles = generateAwsSamProject(analyzedData, mappings);
    const aiPlan = await generateAwsMapping(analyzedData, providerInfo);

    // Generate the report so it can be packaged in SAM docs/migration-report.md
    const reportMarkdown = await generateReport(analyzedData, mappings, providerInfo);
    samProjectFiles["docs/migration-report.md"] = reportMarkdown;
    
    // Save in memory for later ZIP download
    lastGeneratedProject = samProjectFiles;

    res.json({
      mappings,
      files: samProjectFiles,
      aiPlan
    });
  } catch (err) {
    console.error("Route /api/ai/aws-mapping error:", err);
    res.status(500).json({ error: "AWS mapping failed: " + err.message });
  }
});

// 13. POST /api/ai/generate-lambda
app.post("/api/ai/generate-lambda", async (req, res) => {
  const { flowName, flowSummary, analyzedData } = req.body;
  if (!flowName || !flowSummary) {
    return res.status(400).json({ error: "flowName and flowSummary are required" });
  }

  try {
    const lambdaCode = await generateLambdaHandlerWithAI(flowName, flowSummary, analyzedData);
    res.json({ code: lambdaCode });
  } catch (err) {
    res.status(500).json({ error: "AI Lambda code generation failed: " + err.message });
  }
});

// 8. Download generated AWS project zip archive
app.get("/api/download/aws-project", (req, res) => {
  if (!lastGeneratedProject) {
    return res.status(404).json({ error: "No compiled AWS migration files found. Please convert first." });
  }

  try {
    console.log("Zipping generated AWS SAM files for client download...");
    const zipBuffer = createZipArchive(lastGeneratedProject);
    
    res.set({
      "Content-Type": "application/zip",
      "Content-Disposition": "attachment; filename=aws-sam-migrated-project.zip",
      "Content-Length": zipBuffer.length
    });
    
    res.send(zipBuffer);
  } catch (error) {
    console.error("ZIP packaging failed:", error);
    res.status(500).json({ error: "ZIP generation error: " + error.message });
  }
});

// Helper to generate React Flow nodes and edges from parsed project data
function generateDiagramData(analyzedData) {
  const nodes = [];
  const edges = [];
  
  // Always have a consumer client
  nodes.push({ id: "client", label: "Consumer Client", type: "client" });
  
  if (!analyzedData) {
    // Return default AWS Target Architecture nodes and edges
    nodes.push(
      { id: "apigw", label: "Amazon API Gateway", type: "aws" },
      { id: "lambdaExp", label: "Experience API Lambda", type: "aws" },
      { id: "lambdaProc", label: "Process API Lambda", type: "aws" },
      { id: "lambdaSys", label: "System API Lambda", type: "aws" },
      { id: "sqs", label: "Amazon SQS Queue", type: "aws" },
      { id: "dynamodb", label: "Amazon DynamoDB (Cache)", type: "aws" },
      { id: "cloudwatch", label: "Amazon CloudWatch", type: "aws" },
      { id: "external", label: "External Systems", type: "external" }
    );
    
    edges.push(
      { id: "e1", source: "client", target: "apigw" },
      { id: "e2", source: "apigw", target: "lambdaExp" },
      { id: "e3", source: "lambdaExp", target: "lambdaProc" },
      { id: "e4", source: "lambdaProc", target: "lambdaSys" },
      { id: "e5", source: "lambdaSys", target: "external" },
      { id: "e6", source: "lambdaSys", target: "sqs" },
      { id: "e7", source: "lambdaProc", target: "dynamodb" },
      { id: "e8", source: "lambdaExp", target: "cloudwatch" }
    );
    return { nodes, edges };
  }

  const flows = analyzedData.flows || [];
  const connectors = analyzedData.connectors || [];
  
  const hasHttpListener = connectors.includes("HTTP Listener") || flows.some(f => f.processors?.some(p => p.type === "http-listener"));
  const hasHttpRequest = connectors.includes("HTTP Request") || flows.some(f => f.processors?.some(p => p.type === "http-request"));
  const hasDb = connectors.includes("Database") || flows.some(f => f.processors?.some(p => p.type === "database"));
  const hasMq = connectors.includes("Anypoint MQ") || connectors.includes("VM") || flows.some(f => f.processors?.some(p => p.type?.startsWith("anypoint-mq") || p.type?.startsWith("vm")));
  const hasObjectStore = connectors.includes("Object Store") || flows.some(f => f.processors?.some(p => p.type === "object-store"));
  const hasLogger = flows.some(f => f.processors?.some(p => p.type === "logger"));

  let lastNodeId = "client";

  if (hasHttpListener) {
    nodes.push({ id: "apigw", label: "Amazon API Gateway", type: "aws" });
    edges.push({ id: "e-client-apigw", source: "client", target: "apigw" });
    lastNodeId = "apigw";
  }

  // Check flows naming and layers
  const experienceFlows = flows.filter(f => f.name.toLowerCase().includes("exp") || f.name.toLowerCase().includes("experience") || f.processors?.some(p => p.type === "http-listener"));
  const processFlows = flows.filter(f => f.name.toLowerCase().includes("proc") || f.name.toLowerCase().includes("process"));
  const systemFlows = flows.filter(f => f.name.toLowerCase().includes("sys") || f.name.toLowerCase().includes("system") || f.processors?.some(p => p.type === "database"));

  let expNodeAdded = false;
  let procNodeAdded = false;
  let sysNodeAdded = false;

  if (experienceFlows.length > 0 || flows.length > 0) {
    nodes.push({ id: "lambdaExp", label: "Experience API Lambda", type: "aws" });
    edges.push({ id: "e-apigw-lambdaExp", source: lastNodeId, target: "lambdaExp" });
    lastNodeId = "lambdaExp";
    expNodeAdded = true;
  }

  if (processFlows.length > 0 || (flows.length > 1 && expNodeAdded)) {
    nodes.push({ id: "lambdaProc", label: "Process API Lambda", type: "aws" });
    edges.push({ id: "e-lambdaExp-lambdaProc", source: "lambdaExp", target: "lambdaProc" });
    lastNodeId = "lambdaProc";
    procNodeAdded = true;
  }

  if (systemFlows.length > 0 || (flows.length > 2 && procNodeAdded) || hasDb) {
    nodes.push({ id: "lambdaSys", label: "System API Lambda", type: "aws" });
    const sourceNode = procNodeAdded ? "lambdaProc" : (expNodeAdded ? "lambdaExp" : "client");
    edges.push({ id: "e-lambdaProc-lambdaSys", source: sourceNode, target: "lambdaSys" });
    lastNodeId = "lambdaSys";
    sysNodeAdded = true;
  }

  if (hasHttpRequest) {
    nodes.push({ id: "external", label: "External Systems", type: "external" });
    edges.push({ id: "e-lambda-external", source: lastNodeId, target: "external" });
  }

  if (hasMq) {
    nodes.push({ id: "sqs", label: "Amazon SQS Queue", type: "aws" });
    const sourceNode = procNodeAdded ? "lambdaProc" : "client";
    edges.push({ id: "e-lambda-sqs", source: sourceNode, target: "sqs" });
    if (sysNodeAdded) {
      edges.push({ id: "e-sqs-lambdaSys", source: "sqs", target: "lambdaSys" });
    }
  }

  if (hasObjectStore) {
    nodes.push({ id: "dynamodb", label: "Amazon DynamoDB (Cache)", type: "aws" });
    const sourceNode = procNodeAdded ? "lambdaProc" : (expNodeAdded ? "lambdaExp" : "client");
    edges.push({ id: "e-lambda-dynamodb", source: sourceNode, target: "dynamodb" });
  }

  if (hasLogger) {
    nodes.push({ id: "cloudwatch", label: "Amazon CloudWatch", type: "aws" });
    const sourceNode = expNodeAdded ? "lambdaExp" : "client";
    edges.push({ id: "e-lambda-cloudwatch", source: sourceNode, target: "cloudwatch" });
  }

  if (hasDb) {
    nodes.push({ id: "rds", label: "Amazon RDS / Aurora", type: "aws" });
    const sourceNode = sysNodeAdded ? "lambdaSys" : (procNodeAdded ? "lambdaProc" : "client");
    edges.push({ id: "e-lambda-rds", source: sourceNode, target: "rds" });
  }

  return { nodes, edges };
}

// GET /api/architecture/diagram-data
app.get("/api/architecture/diagram-data", (req, res) => {
  const data = generateDiagramData(lastAnalyzedData);
  res.json(data);
});

// GET /api/health
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    message: "Backend API is running"
  });
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date() });
});

// Global API 404 Handler
app.use('/api', (req, res) => {
  res.status(404).json({
    error: true,
    message: `API route not found: ${req.originalUrl}`
  });
});

// Serve static frontend files in production
const frontendDistPath = path.resolve(__dirname, "../frontend/dist");
if (fs.existsSync(frontendDistPath)) {
  console.log(`[Production] Serving static files from: ${frontendDistPath}`);
  app.use(express.static(frontendDistPath));
  app.get("*", (req, res, next) => {
    // If request starts with /api, pass it to next handlers (e.g. 404)
    if (req.path.startsWith("/api")) {
      return next();
    }
    res.sendFile(path.join(frontendDistPath, "index.html"));
  });
} else {
  console.log(`[Development] Static files folder not found at: ${frontendDistPath}. Running API-only server.`);
}

// Start Express server
app.listen(PORT, () => {
  console.log(`===========================================================`);
  console.log(`  MuleSoft to AWS Migration Assistant Backend Running`);
  console.log(`  Port: ${PORT}`);
  console.log(`  Health Check URL: http://localhost:${PORT}/health`);
  console.log(`===========================================================`);
});
