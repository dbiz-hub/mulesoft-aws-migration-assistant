import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();

// Helper to truncate text to avoid token overflows
function truncateText(text, maxChars = 2000) {
  if (!text) return "";
  if (text.length <= maxChars) return text;
  return text.substring(0, maxChars) + "\n... [truncated for token safety] ...";
}

// Helper to sanitize JSON response from AI (in case markdown wrapper is included)
export function cleanJsonString(str) {
  if (!str) return "";
  let cleaned = str.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.substring(7);
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.substring(3);
  }
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.substring(0, cleaned.length - 3);
  }
  return cleaned.trim();
}

// Helper to parse JSON safely with regex extraction and fallback
export function parseSafeJson(text, fallback) {
  try {
    const cleaned = cleanJsonString(text);
    return JSON.parse(cleaned);
  } catch (e) {
    console.warn("[AI Provider] Failed to parse JSON directly. Attempting regex extract...", e);
    try {
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        return JSON.parse(cleanJsonString(match[0]));
      }
    } catch (regexErr) {
      console.error("[AI Provider] Regex extraction failed.", regexErr);
    }
    return fallback;
  }
}

// Default Mermaid Diagram to use when AI does not return one or in parserOnly mode
const DEFAULT_MERMAID_DIAGRAM = `flowchart LR
  GitHub["GitHub Mule Repository"] --> Parser["Mule Parser Engine"]
  Parser --> EXP["Experience API"]
  EXP --> PRC["Process API"]
  PRC --> SYS["System API"]
  SYS --> EXT["External Systems"]
  Parser --> AI["AI Analysis Engine"]
  AI --> REPORT["Migration Report"]
  AI --> AWS["AWS Target Mapping"]
  AWS --> APIGW["Amazon API Gateway"]
  AWS --> LAMBDA["AWS Lambda"]
  AWS --> SQS["Amazon SQS"]
  AWS --> DDB["Amazon DynamoDB"]
  AWS --> CW["Amazon CloudWatch"]`;

// Resolve provider settings based on user options and environment variables
export function resolveProvider(options = {}) {
  let provider = options.provider || "auto";
  let apiKey = options.apiKey || "";
  let model = options.model || "";

  const systemOpenAiKey = process.env.OPENAI_API_KEY || "";
  const systemGeminiKey = process.env.GEMINI_API_KEY || "";

  if (provider === "openai") {
    return {
      type: "openai",
      apiKey: apiKey || systemOpenAiKey,
      model: model || process.env.OPENAI_MODEL || "gpt-4o-mini"
    };
  } else if (provider === "gemini") {
    return {
      type: "gemini",
      apiKey: apiKey || systemGeminiKey,
      model: model || process.env.GEMINI_MODEL || "gemini-1.5-flash"
    };
  } else if (provider === "parser") {
    return { type: "parser" };
  }

  // Auto resolution
  if (systemOpenAiKey && systemOpenAiKey.trim() !== "") {
    return {
      type: "openai",
      apiKey: systemOpenAiKey,
      model: process.env.OPENAI_MODEL || "gpt-4o-mini"
    };
  } else if (systemGeminiKey && systemGeminiKey.trim() !== "") {
    return {
      type: "gemini",
      apiKey: systemGeminiKey,
      model: process.env.GEMINI_MODEL || "gemini-1.5-flash"
    };
  } else {
    return { type: "parser" };
  }
}

// Metadata-driven analysis generator to build summaries, risks, and recommendations from evidence
export function generateMetadataDrivenAnalysis(evidence, metrics) {
  const flowCount = evidence.flows?.length || 0;
  const subflowCount = evidence.subflows?.length || 0;
  const listenerCount = evidence.httpListeners?.length || 0;
  const schedulerCount = evidence.schedulers?.length || 0;
  const dwlCount = evidence.dataweaves?.length || 0;
  const dbCount = evidence.databaseConnectors?.length || 0;
  const sfCount = evidence.salesforceConnectors?.length || 0;
  const mqCount = evidence.mqConnectors?.length || 0;
  const fileCount = evidence.fileConnectors?.length || 0;
  const osCount = evidence.objectStoreUsage?.length || 0;
  const errorCount = evidence.errorHandlers?.length || 0;

  // 1. Business Functionality Detection
  let businessKeywords = [];
  const allNames = [
    ...(evidence.flows || []),
    ...(evidence.subflows || []),
    ...(evidence.endpoints || []).map(e => e.path),
    ...(evidence.ramlFiles || [])
  ].map(n => n.toLowerCase());

  if (allNames.some(n => n.includes("customer") || n.includes("user") || n.includes("account"))) {
    businessKeywords.push("Customer Management");
  }
  if (allNames.some(n => n.includes("order") || n.includes("cart") || n.includes("checkout") || n.includes("validation"))) {
    businessKeywords.push("Order Processing");
  }
  if (allNames.some(n => n.includes("invoice") || n.includes("bill") || n.includes("payment"))) {
    businessKeywords.push("Invoice & Payments");
  }
  if (allNames.some(n => n.includes("notify") || n.includes("email") || n.includes("sms") || n.includes("alert"))) {
    businessKeywords.push("Notification Service");
  }
  if (allNames.some(n => n.includes("product") || n.includes("item") || n.includes("catalog"))) {
    businessKeywords.push("Catalog Management");
  }
  if (allNames.some(n => n.includes("sync") || n.includes("migrate") || n.includes("batch"))) {
    businessKeywords.push("Data Synchronization");
  }
  if (businessKeywords.length === 0) {
    businessKeywords.push("Generic Integration Services");
  }

  const primaryFunc = businessKeywords.join(" and ");

  // 2. Build Executive Summary details
  const parts = [];
  parts.push(`Repository contains:`);
  if (flowCount > 0) parts.push(`- ${flowCount} flow${flowCount > 1 ? "s" : ""}`);
  if (subflowCount > 0) parts.push(`- ${subflowCount} subflow${subflowCount > 1 ? "s" : ""}`);
  if (listenerCount > 0) parts.push(`- ${listenerCount} HTTP listener${listenerCount > 1 ? "s" : ""}`);
  if (dwlCount > 0) parts.push(`- ${dwlCount} DataWeave transformation${dwlCount > 1 ? "s" : ""}`);
  if (schedulerCount > 0) parts.push(`- ${schedulerCount} Scheduler job${schedulerCount > 1 ? "s" : ""}`);
  if (dbCount > 0) parts.push(`- ${dbCount} Database connector${dbCount > 1 ? "s" : ""}`);
  if (sfCount > 0) parts.push(`- ${sfCount} Salesforce connector${sfCount > 1 ? "s" : ""}`);
  if (mqCount > 0) parts.push(`- ${mqCount} MQ/VM message broker interface${mqCount > 1 ? "s" : ""}`);
  if (fileCount > 0) parts.push(`- ${fileCount} File/FTP transfer channel${fileCount > 1 ? "s" : ""}`);
  if (osCount > 0) parts.push(`- ${osCount} Object Store cache lookup${osCount > 1 ? "s" : ""}`);
  if (errorCount > 0) parts.push(`- ${errorCount} Error handler scope${errorCount > 1 ? "s" : ""}`);

  const detailsList = parts.join("\n");
  
  // Conditionally recommend target AWS services based strictly on findings
  const targets = [];
  if (listenerCount > 0) targets.push("Amazon API Gateway");
  if (flowCount > 0 || subflowCount > 0) targets.push("AWS Lambda");
  if (schedulerCount > 0) targets.push("Amazon EventBridge");
  if (dbCount > 0) targets.push("Amazon RDS/Aurora Serverless");
  if (sfCount > 0) targets.push("AWS AppFlow / Custom Salesforce client");
  if (mqCount > 0) targets.push("Amazon SQS / SNS");
  if (fileCount > 0) targets.push("Amazon S3 / AWS Transfer Family");
  if (osCount > 0) targets.push("Amazon DynamoDB");

  const targetsText = targets.length > 0 ? `Proposed target architecture employs ${targets.join(", ")}.` : "No AWS target resources suggested.";

  const executiveSummary = `This repository is a MuleSoft integration application focused on ${primaryFunc}.

${detailsList}

${targetsText}

Migration complexity is assessed as ${metrics.complexityScore || "LOW"} because of the presence of ${[
    listenerCount > 0 ? "HTTP endpoints" : null,
    schedulerCount > 0 ? "scheduled jobs" : null,
    dbCount > 0 ? "database transactions" : null,
    dwlCount > 0 ? "DataWeave mapping logic" : null,
    mqCount > 0 ? "asynchronous queue messaging" : null
  ].filter(Boolean).join(", ") || "simple routing modules"}.`;

  // 3. Risks
  const risks = [];
  if (dwlCount > 0) {
    risks.push("DataWeave transformations require JavaScript conversion (Node.js helper modules).");
  }
  if (dbCount > 0) {
    risks.push("Connection pooling redesign required for serverless deployment to prevent Aurora DB exhaustion.");
  }
  if (schedulerCount > 0) {
    risks.push("Scheduled jobs must be migrated to Amazon EventBridge rules to trigger target Lambda runtimes.");
  }
  if (mqCount > 0) {
    risks.push("Asynchronous Anypoint MQ/VM message listeners must be mapped to Amazon SQS event source triggers.");
  }
  if (osCount > 0) {
    risks.push("Mule Object Store lookups need conversion to Amazon DynamoDB key-value caching layers.");
  }
  if (sfCount > 0) {
    risks.push("Salesforce soap/rest connectivity needs replacement using custom AWS Lambda API clients or AWS AppFlow.");
  }
  if (fileCount > 0) {
    risks.push("Local/SFTP file writes must be converted to Amazon S3 uploads or AWS Transfer Family configurations.");
  }
  if (errorCount > 0) {
    risks.push("Flow-level On-Error scopes require translation to JavaScript try-catch frameworks or Lambda DLQs.");
  }

  // 4. Recommendations
  const recommendations = [];
  if (listenerCount > 0) {
    recommendations.push("API Gateway: Map HTTP Listeners to API Gateway HTTP APIs to proxy incoming REST queries.");
  }
  if (flowCount > 0 || subflowCount > 0) {
    recommendations.push("AWS Lambda: Port flow entry points to Node.js handlers and subflows to shared utility libraries.");
  }
  if (schedulerCount > 0) {
    recommendations.push("EventBridge: Establish EventBridge Schedule rules to invoke Lambda helper execution routines.");
  }
  if (dbCount > 0) {
    recommendations.push("RDS Proxy: Utilize Amazon RDS Proxy to manage connection pooling dynamically from Lambda functions.");
  }
  if (mqCount > 0) {
    recommendations.push("Amazon SQS: Replace queue components with Amazon SQS standard/FIFO message queues.");
  }
  if (osCount > 0) {
    recommendations.push("Amazon DynamoDB: Set up DynamoDB on-demand tables to host fast key-value session cache state.");
  }
  if (fileCount > 0) {
    recommendations.push("Amazon S3: Replace file persistence and FTP drops with Amazon S3 storage buckets.");
  }
  if (sfCount > 0) {
    recommendations.push("AWS AppFlow: Automate CRM syncs utilizing native AWS AppFlow connectors for Salesforce.");
  }

  return {
    executiveSummary,
    risks,
    recommendations,
    businessCapabilities: businessKeywords.map(cap => ({
      capability: cap,
      description: `Handles orchestration and operational mapping workflows related to ${cap.toLowerCase()} capabilities.`
    }))
  };
}

// 1. Parser Only (Static Analysis Fallback)
export function parserOnlyAnalyze(files, parsedMetadata) {
  if (parsedMetadata && parsedMetadata.isMuleProject === false) {
    return {
      isMuleProject: false,
      executiveSummary: "This repository does not appear to be a MuleSoft application.",
      businessCapabilities: [],
      apis: [],
      flows: [],
      dependencies: [],
      transformations: [],
      externalSystems: [],
      security: [],
      errorHandling: [],
      awsMapping: [],
      risks: [],
      recommendations: [],
      migrationComplexity: "LOW",
      estimatedEffort: "N/A",
      architectureDiagram: ""
    };
  }

  const metrics = parsedMetadata?.metrics || {};
  const complexity = metrics?.complexityScore || "LOW";
  const evidence = parsedMetadata?.evidence || { flows: [], subflows: [], httpListeners: [], dataweaves: [], connectors: [] };

  const derived = generateMetadataDrivenAnalysis(evidence, metrics);

  const flows = (parsedMetadata?.flows || []).map(f => {
    const hasHttp = f.processors.some(p => p.type === "http-listener");
    return {
      name: f.name,
      description: `Discovered flow '${f.name}' containing ${f.processors.length} message processors.`,
      complexity: f.processors.length > 5 ? "MEDIUM" : "LOW",
      awsMapping: hasHttp ? "Amazon API Gateway + AWS Lambda" : "AWS Lambda (Utility module)"
    };
  });

  const apis = (parsedMetadata?.endpoints || []).map(e => ({
    path: e.path,
    method: e.methods.join(", "),
    description: e.description || `Exposed path ${e.path}`,
    awsService: "Amazon API Gateway (HTTP API)"
  }));

  const transformations = (evidence.dataweaves || []).map(dw => ({
    name: dw.resource,
    logic: `Data transformation in ${dw.flow || "external module"}`,
    awsAlternative: "JavaScript map() or JSONata transform inside Lambda"
  }));

  const externalSystemsList = [];
  if (evidence.databaseConnectors?.length > 0) {
    externalSystemsList.push({ name: "Relational Database", type: "Database", awsAlternative: "Amazon RDS / Aurora Serverless" });
  }
  if (evidence.salesforceConnectors?.length > 0) {
    externalSystemsList.push({ name: "Salesforce CRM", type: "CRM API", awsAlternative: "AWS AppFlow" });
  }
  if (evidence.mqConnectors?.length > 0) {
    const destinations = Array.from(new Set(evidence.mqConnectors.map(mq => mq.destination).filter(Boolean)));
    if (destinations.length > 0) {
      destinations.forEach(dest => {
        externalSystemsList.push({ name: `Anypoint MQ: ${dest}`, type: "Messaging", awsAlternative: "Amazon SQS Queue" });
      });
    } else {
      externalSystemsList.push({ name: "Messaging Queue", type: "Messaging", awsAlternative: "Amazon SQS Queue" });
    }
  }
  if (evidence.fileConnectors?.length > 0) {
    externalSystemsList.push({ name: "File System / SFTP Adapter", type: "File Server", awsAlternative: "Amazon S3 Bucket" });
  }
  if (evidence.externalEndpoints?.length > 0) {
    externalSystemsList.push({ name: "Downstream HTTP REST Service", type: "REST API", awsAlternative: "HTTP Client call inside AWS Lambda" });
  }

  const mapping = [];
  if (evidence.connectors?.includes("HTTP Listener")) {
    mapping.push({ muleComponent: "HTTP Listener", muleType: "Connector", awsService: "Amazon API Gateway", rationale: "Exposes HTTP routes to the web" });
  }
  if (evidence.connectors?.includes("Database")) {
    mapping.push({ muleComponent: "Database Connector", muleType: "Connector", awsService: "Amazon RDS / Aurora Serverless", rationale: "Relational database mapping" });
  }
  if (evidence.connectors?.includes("Anypoint MQ")) {
    mapping.push({ muleComponent: "Anypoint MQ", muleType: "Connector", awsService: "Amazon SQS", rationale: "Queued async message transport" });
  }
  if (evidence.connectors?.includes("Object Store")) {
    mapping.push({ muleComponent: "Object Store", muleType: "Connector", awsService: "Amazon DynamoDB (Cache)", rationale: "Key-value caching layer" });
  }

  const result = {
    isMuleProject: true,
    executiveSummary: derived.executiveSummary,
    businessCapabilities: derived.businessCapabilities,
    apis,
    flows,
    dependencies: [
      { source: "Experience Layer", target: "Process Layer", type: "HTTP", description: "Direct REST call from boundary router to orchestrator." },
      { source: "Process Layer", target: "System Layer", type: "HTTP", description: "Internal orchestrator requesting base system adapters." }
    ],
    transformations,
    externalSystems: externalSystemsList,
    security: [
      { policyName: "Client ID Enforcement", description: "Validates API consumers using client ID & secret headers.", awsMapping: "API Gateway API Keys / Cognito Token validation" }
    ],
    errorHandling: [
      { scope: "Global Error Handler", strategy: "Propagates transaction failure codes upstream", awsMapping: "Lambda standard try-catch blocks returning custom status codes" }
    ],
    awsMapping: mapping,
    risks: derived.risks,
    recommendations: derived.recommendations,
    migrationComplexity: complexity,
    estimatedEffort: complexity === "HIGH" ? "8-12 Weeks" : complexity === "MEDIUM" ? "4-6 Weeks" : "2-3 Weeks",
    architectureDiagram: DEFAULT_MERMAID_DIAGRAM
  };

  result.debug = {
    extractedMetadata: evidence,
    aiPrompt: "Parser-Only Mode: Metadata-driven rule engine applied. No AI API keys or prompt sent.",
    aiResponse: JSON.stringify({
      executiveSummary: derived.executiveSummary,
      risks: derived.risks,
      recommendations: derived.recommendations,
      businessCapabilities: derived.businessCapabilities
    }, null, 2)
  };

  return result;
}

// Build standard analysis prompt
function getAnalysisPrompt(files, parsedMetadata) {
  let codebaseSnippet = "";
  for (const [filePath, content] of Object.entries(files)) {
    if (filePath.includes("node_modules") || filePath.includes("target/") || filePath.includes(".git")) {
      continue;
    }
    codebaseSnippet += `--- File: ${filePath} ---\n${truncateText(content, 1200)}\n\n`;
  }
  codebaseSnippet = truncateText(codebaseSnippet, 12000);

  const evidence = parsedMetadata.evidence || {};

  return `You are a MuleSoft and AWS migration architect. Analyze the provided codebase files and the extracted metadata.
Your executive summary, risks, recommendations, and business capabilities MUST be based strictly on the discovered components in the 'evidence' object.
Do NOT mention target services like DynamoDB, SQS, or EventBridge unless their respective source components (Object Store, MQ/VM, Schedulers) are present in the evidence.
Do NOT output template-driven or generic AWS boilerplate. Build custom risks for each detected component (e.g. DataWeave requires JS translation, database connection pool concerns for RDS, scheduler to EventBridge mapping). Only show a risk if its component is detected.
Return structured JSON only.

Codebase source snippets:
${codebaseSnippet}

Extracted repository evidence metadata:
${JSON.stringify(evidence, null, 2)}

Return a structured JSON object strictly matching this schema:
{
  "executiveSummary": "A concise executive explanation of the API, its business value, and target AWS architecture, based ONLY on the evidence.",
  "businessCapabilities": [
    {
      "capability": "Business Capability Name (e.g. Customer Management or Order Processing)",
      "description": "Detailed explanation of what business logic it covers based strictly on repository evidence"
    }
  ],
  "apis": [
    {
      "path": "HTTP route path",
      "method": "HTTP method",
      "description": "API description",
      "awsService": "Target AWS service (e.g., API Gateway HTTP API)"
    }
  ],
  "flows": [
    {
      "name": "Mule flow name",
      "description": "Functional summary of the business logic",
      "complexity": "LOW/MEDIUM/HIGH",
      "awsMapping": "Target compute service e.g., AWS Lambda function name"
    }
  ],
  "dependencies": [
    {
      "source": "Experience API / Process API / System API",
      "target": "Experience API / Process API / System API / External System",
      "type": "HTTP / Messaging / Database / Cache",
      "description": "Rationale for the link"
    }
  ],
  "transformations": [
    {
      "name": "Transform name / DWL script path",
      "logic": "Business logic mapping rules summary",
      "awsAlternative": "Lambda JS implementation / JSONata template suggestion"
    }
  ],
  "externalSystems": [
    {
      "name": "External System Name",
      "type": "Database / CRM / ERP / Messaging / REST API",
      "awsAlternative": "Direct SDK/AppFlow/Secret RDS integration option"
    }
  ],
  "security": [
    {
      "policyName": "Client ID Enforcement / OAuth 2.0 etc.",
      "description": "MuleSoft policy description",
      "awsMapping": "AWS equivalent e.g., Cognito User Pool, WAF, API Gateway API Key"
    }
  ],
  "errorHandling": [
    {
      "scope": "Flow / Global Error handler description",
      "strategy": "On-Error-Propagate or Continue behavior",
      "awsMapping": "Lambda try-catch structure, SQS Dead Letter Queue (DLQ), or Step Functions Catch"
    }
  ],
  "awsMapping": [
    {
      "muleComponent": "Mule component name (e.g. Object Store)",
      "muleType": "Connector/Processor/Flow",
      "awsService": "Equivalent AWS service",
      "rationale": "Why this service was chosen and how it is configured"
    }
  ],
  "risks": [
    "Specific risks associated with converting this flow/system to AWS (only if supported by evidence)"
  ],
  "recommendations": [
    "AWS-native architectural recommendations specific to this codebase (only if supported by evidence)"
  ],
  "migrationComplexity": "LOW / MEDIUM / HIGH",
  "estimatedEffort": "e.g. 3-4 Weeks developer effort (includes design, conversion, and validation)",
  "architectureDiagram": "Mermaid diagram TD or LR string showing the AWS target architecture."
}`;
}

// 2. OpenAI Analysis
export async function openAiAnalyze(files, parsedMetadata, providerInfo) {
  if (parsedMetadata && parsedMetadata.isMuleProject === false) {
    return parserOnlyAnalyze(files, parsedMetadata);
  }
  if (!providerInfo.apiKey) {
    return parserOnlyAnalyze(files, parsedMetadata);
  }

  try {
    const openai = new OpenAI({ apiKey: providerInfo.apiKey });
    const prompt = getAnalysisPrompt(files, parsedMetadata);
    const response = await openai.chat.completions.create({
      model: providerInfo.model,
      messages: [
        { role: "system", content: "You are an AI assistant specialized in MuleSoft-to-AWS code migration. You respond ONLY in valid JSON matching the requested schema." },
        { role: "user", content: prompt }
      ],
      response_format: { type: "json_object" },
      temperature: 0.2
    });

    const parsed = parseSafeJson(response.choices[0].message.content, null);
    if (!parsed) {
      throw new Error("Invalid JSON returned by OpenAI");
    }
    
    // Ensure architectureDiagram is present
    if (!parsed.architectureDiagram) {
      parsed.architectureDiagram = DEFAULT_MERMAID_DIAGRAM;
    }
    parsed.debug = {
      extractedMetadata: parsedMetadata.evidence || parsedMetadata,
      aiPrompt: prompt,
      aiResponse: rawResponse
    };
    return parsed;
  } catch (err) {
    console.error("[OpenAI Analyze] Failed. Falling back to parserOnly.", err);
    return parserOnlyAnalyze(files, parsedMetadata);
  }
}

// 3. Gemini Analysis
export async function geminiAnalyze(files, parsedMetadata, providerInfo) {
  if (parsedMetadata && parsedMetadata.isMuleProject === false) {
    return parserOnlyAnalyze(files, parsedMetadata);
  }
  if (!providerInfo.apiKey) {
    return parserOnlyAnalyze(files, parsedMetadata);
  }

  try {
    const genAI = new GoogleGenerativeAI(providerInfo.apiKey);
    const model = genAI.getGenerativeModel({ model: providerInfo.model || "gemini-1.5-flash" });
    const prompt = getAnalysisPrompt(files, parsedMetadata);

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json"
      }
    });

    const text = result.response.text();
    const parsed = parseSafeJson(text, null);
    if (!parsed) {
      throw new Error("Invalid JSON returned by Gemini");
    }

    if (!parsed.architectureDiagram) {
      parsed.architectureDiagram = DEFAULT_MERMAID_DIAGRAM;
    }
    parsed.debug = {
      extractedMetadata: parsedMetadata.evidence || parsedMetadata,
      aiPrompt: prompt,
      aiResponse: text
    };
    return parsed;
  } catch (err) {
    console.error("[Gemini Analyze] Failed. Falling back to parserOnly.", err);
    return parserOnlyAnalyze(files, parsedMetadata);
  }
}

const DEFAULT_SAFE_DIAGRAM = `flowchart LR
  GitHub["GitHub Mule Repository"] --> Parser["Mule Parser Engine"]
  Parser --> Experience["Experience API"]
  Experience --> Process["Process API"]
  Process --> System["System API"]
  System --> External["External Systems"]
  Parser --> AI["AI Analysis Engine"]
  AI --> Report["Migration Report"]
  AI --> AWS["AWS Target Mapping"]
  AWS --> APIGateway["Amazon API Gateway"]
  AWS --> Lambda["AWS Lambda"]
  AWS --> SQS["Amazon SQS"]
  AWS --> DynamoDB["Amazon DynamoDB"]
  AWS --> CloudWatch["Amazon CloudWatch"]`;

function isValidMermaid(chart) {
  if (!chart || typeof chart !== "string" || !chart.trim()) return false;
  const cleaned = chart.trim();
  
  // Must start with graph or flowchart or contains flowchart LR
  const startsWithHeader = cleaned.startsWith("graph") || cleaned.startsWith("flowchart") || 
                           cleaned.startsWith("```mermaid") || cleaned.includes("flowchart LR") ||
                           cleaned.includes("graph LR") || cleaned.includes("graph TD");
  // Must contain connection arrow
  const containsArrow = cleaned.includes("-->") || cleaned.includes("->");

  // Check for unbalanced double quotes
  const doubleQuotesCount = (cleaned.match(/"/g) || []).length;
  if (doubleQuotesCount % 2 !== 0) {
    return false;
  }

  return startsWithHeader && containsArrow;
}

// 4. Generate Blueprint
export async function generateBlueprint(parsedMetadata, providerInfo) {
  if (!providerInfo || providerInfo.type === "parser" || !providerInfo.apiKey) {
    const fb = getFallbackBlueprint(parsedMetadata);
    fb.sanitized = true;
    return fb;
  }

  const prompt = `You are a MuleSoft and AWS migration architect.
Based on the following MuleSoft metadata, generate a modern business blueprint.
This must include:
1. An explanation of the API-led connectivity layers (Experience layer -> Process layer -> System layer -> External Systems).
2. A detailed Mermaid.js graph code block showing the source API-led relationships, but also showing how they map to AWS services. 
Make sure the Mermaid diagram uses a clean layout: Client -> API Gateway -> Lambda Functions -> DynamoDB Cache/SQS Queues/Aurora Databases.

Return Mermaid using only this safe syntax:
flowchart LR
NodeId["Simple Label"] --> OtherNode["Simple Label"]
Do not use edge labels.
Do not use pipes.
Do not use parentheses.
Do not use special characters.
Do not use emojis.
Do not use semicolons.
Use only ASCII characters.
Use one edge per line.

Metadata:
${JSON.stringify(parsedMetadata, null, 2)}

Return a structured JSON object containing:
{
  "summary": "Explanation of the API-led layered relationships and business capabilities.",
  "mermaidDiagram": "The raw Mermaid diagram text (starting with flowchart LR, no markdown wrappers inside this string value)"
}`;

  try {
    let result = null;
    if (providerInfo.type === "openai") {
      const openai = new OpenAI({ apiKey: providerInfo.apiKey });
      const response = await openai.chat.completions.create({
        model: providerInfo.model,
        messages: [
          { role: "system", content: "You are an expert serverless architect. Return ONLY a JSON object containing 'summary' and 'mermaidDiagram'." },
          { role: "user", content: prompt }
        ],
        response_format: { type: "json_object" },
        temperature: 0.3
      });
      result = parseSafeJson(response.choices[0].message.content, null);
    } else {
      // Gemini
      const genAI = new GoogleGenerativeAI(providerInfo.apiKey);
      const model = genAI.getGenerativeModel({ model: providerInfo.model || "gemini-1.5-flash" });
      const response = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" }
      });
      result = parseSafeJson(response.response.text(), null);
    }

    if (result) {
      if (!isValidMermaid(result.mermaidDiagram)) {
        console.log("[AI Provider] Invalid Mermaid diagram returned by AI, replacing with default.");
        result.mermaidDiagram = DEFAULT_SAFE_DIAGRAM;
        result.sanitized = true;
      }
      return result;
    }
    
    throw new Error("Failed to parse AI response JSON");
  } catch (err) {
    console.error("[Blueprint Generation] AI failed. Falling back.", err);
    const fb = getFallbackBlueprint(parsedMetadata);
    fb.sanitized = true;
    return fb;
  }
}

// 5. Generate Report
export async function generateReport(parsedMetadata, awsMapping, providerInfo) {
  if (!providerInfo || providerInfo.type === "parser" || !providerInfo.apiKey) {
    return getFallbackReport(parsedMetadata, awsMapping);
  }

  const prompt = `You are a Senior Enterprise Cloud Migration Architect.
Analyze the following MuleSoft metadata and AWS component mapping.
Generate a professional, detailed Migration Report in markdown format.

Metadata:
${JSON.stringify(parsedMetadata, null, 2)}

AWS Mappings:
${JSON.stringify(awsMapping, null, 2)}

The report MUST contain exactly these 12 sections in order:
1. Executive Summary
2. Business View
3. Technical View
4. API-led Connectivity
5. Endpoint Dependency Matrix
6. DataWeave Transformation Summary
7. External System Inventory
8. Error Handling
9. Security/Policies
10. Migration Recommendation
11. AWS Target Architecture
12. Assumptions and Gaps

Include specific details about the endpoints, flows, and DB/MQ integrations discovered in the metadata. Return the markdown text directly.`;

  try {
    if (providerInfo.type === "openai") {
      const openai = new OpenAI({ apiKey: providerInfo.apiKey });
      const response = await openai.chat.completions.create({
        model: providerInfo.model,
        messages: [
          { role: "system", content: "You are a professional technical writer and migration architect. Output the markdown document directly. Do not wrap it in a JSON object." },
          { role: "user", content: prompt }
        ],
        temperature: 0.3
      });
      return response.choices[0].message.content;
    } else {
      // Gemini
      const genAI = new GoogleGenerativeAI(providerInfo.apiKey);
      const model = genAI.getGenerativeModel({ model: providerInfo.model || "gemini-1.5-flash" });
      const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }]
      });
      return result.response.text();
    }
  } catch (err) {
    console.error("[Report Generation] AI failed. Falling back.", err);
    return getFallbackReport(parsedMetadata, awsMapping);
  }
}

// 6. Generate AWS Mapping
export async function generateAwsMapping(parsedMetadata, providerInfo) {
  if (!providerInfo || providerInfo.type === "parser" || !providerInfo.apiKey) {
    return getFallbackAwsPlan(parsedMetadata);
  }

  const prompt = `You are a Serverless Cloud Architect.
Analyze the following parsed MuleSoft metadata:
${JSON.stringify(parsedMetadata, null, 2)}

Suggest a target AWS native architecture using API Gateway, Lambda, SQS, DynamoDB, RDS, Cognito, EventBridge, CloudWatch, and Secrets Manager.
Provide recommendations on:
- Lambda sizing (Memory size, timeouts)
- Database connections handling (RDS Proxy, DynamoDB connection reuse)
- Security (WAF, IAM roles, KMS encryption keys)
- Logging & Monitoring (CloudWatch logs, alarms and tracing setup)

Return a structured JSON object containing:
{
  "targetArchitectureDescription": "Overview of AWS-native serverless architecture",
  "computeRecommendations": "Lambda memory, runtime, concurrency settings",
  "databaseRecommendations": "Database scaling and migration (RDS Proxy vs DynamoDB)",
  "integrationRecommendations": "SQS/EventBridge messaging triggers",
  "securityRecommendations": "Cognito IAM, Secrets Manager configuration",
  "monitoringRecommendations": "CloudWatch logs, alarms and tracing setup"
}`;

  try {
    if (providerInfo.type === "openai") {
      const openai = new OpenAI({ apiKey: providerInfo.apiKey });
      const response = await openai.chat.completions.create({
        model: providerInfo.model,
        messages: [
          { role: "system", content: "You are a cloud architect. Return ONLY a JSON object containing the recommendations fields." },
          { role: "user", content: prompt }
        ],
        response_format: { type: "json_object" },
        temperature: 0.2
      });
      return parseSafeJson(response.choices[0].message.content, getFallbackAwsPlan(parsedMetadata));
    } else {
      // Gemini
      const genAI = new GoogleGenerativeAI(providerInfo.apiKey);
      const model = genAI.getGenerativeModel({ model: providerInfo.model || "gemini-1.5-flash" });
      const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" }
      });
      return parseSafeJson(result.response.text(), getFallbackAwsPlan(parsedMetadata));
    }
  } catch (err) {
    console.error("[AWS Mapping Plan] AI failed. Falling back.", err);
    return getFallbackAwsPlan(parsedMetadata);
  }
}

// 7. Generate Architecture Diagram
export async function generateArchitectureDiagram(parsedMetadata, providerInfo) {
  if (!providerInfo || providerInfo.type === "parser" || !providerInfo.apiKey) {
    return DEFAULT_MERMAID_DIAGRAM;
  }

  const prompt = `Based on the following MuleSoft project metadata, generate a Mermaid.js diagram illustrating the target AWS architecture. Use AWS best practices (API Gateway, Lambdas, SQS, DynamoDB, RDS, etc.). Output ONLY the raw Mermaid code. No markdown wrappers.

Return Mermaid using only this safe syntax:
flowchart LR
NodeId["Simple Label"] --> OtherNode["Simple Label"]
Do not use edge labels.
Do not use pipes.
Do not use parentheses.
Do not use special characters.
Do not use emojis.
Do not use semicolons.
Use only ASCII characters.
Use one edge per line.

Metadata:
${JSON.stringify(parsedMetadata, null, 2)}`;

  try {
    let resultText = "";
    if (providerInfo.type === "openai") {
      const openai = new OpenAI({ apiKey: providerInfo.apiKey });
      const response = await openai.chat.completions.create({
        model: providerInfo.model,
        messages: [
          { role: "system", content: "You are a professional software architect. Return ONLY the raw Mermaid diagram code." },
          { role: "user", content: prompt }
        ],
        temperature: 0.2
      });
      resultText = response.choices[0].message.content;
    } else {
      // Gemini
      const genAI = new GoogleGenerativeAI(providerInfo.apiKey);
      const model = genAI.getGenerativeModel({ model: providerInfo.model || "gemini-1.5-flash" });
      const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }]
      });
      resultText = result.response.text();
    }
    const cleaned = cleanJsonString(resultText);
    if (!isValidMermaid(cleaned)) {
      console.log("[Architecture Diagram] Invalid Mermaid returned by AI, returning default.");
      return DEFAULT_MERMAID_DIAGRAM;
    }
    return cleaned;
  } catch (err) {
    console.error("[Architecture Diagram] AI failed. Returning default.", err);
    return DEFAULT_MERMAID_DIAGRAM;
  }
}

// Fallback Blueprint helper
function getFallbackBlueprint(metadata, errMessage = "") {
  const note = errMessage ? `(Blueprint generated in fallback mode due to error: ${errMessage})` : "";
  
  let chart = `flowchart LR
    Client["Client App"] --> Experience["Experience Layer"]
    Experience --> Process["Process Layer"]
    Process --> Cache["Object Store Cache"]
    Process --> System["System Layer"]
    System --> DB["Database"]
  `;

  const flows = metadata?.flows || [];
  const hasDb = flows.some(f => f.processors.some(p => p.type === "database")) || metadata?.connectors?.includes("Database");
  const hasMq = flows.some(f => f.processors.some(p => p.type.startsWith("anypoint-mq"))) || metadata?.connectors?.includes("Anypoint MQ");

  if (flows.length > 0) {
    chart = `flowchart LR
      Consumer["Consumer Client"] --> APIGateway["Amazon API Gateway"]
      APIGateway --> LambdaExp["Experience API Lambda"]
      LambdaExp --> LambdaProc["Process API Lambda"]
      ${hasMq ? "LambdaProc --> SQSQueue[\"Amazon SQS Queue\"]\n      SQSQueue --> LambdaSys[\"System API Lambda\"]" : "LambdaProc --> LambdaSys[\"System API Lambda\"]"}
      ${hasDb ? "LambdaSys --> RDSDatabase[\"Amazon RDS / Aurora Serverless\"]" : ""}
    `;
  }

  return {
    summary: `Technical blueprint mapping MuleSoft architecture to AWS services ${note}. Visualizes API Gateway ingress routing requests to Experience and Process compute Lambdas, integrated with downstream SQS messaging queues and DynamoDB caching blocks.`,
    mermaidDiagram: chart
  };
}

// Fallback Report helper
function getFallbackReport(metadata, awsMapping, errMessage = "") {
  const metrics = metadata?.metrics || {};
  const isMule = metadata?.isMuleProject !== false;

  if (!isMule) {
    return `# MuleSoft to AWS Migration Report

## 1. Executive Summary
This repository does not appear to be a MuleSoft application. No MuleSoft configuration XML files, RAML/OAS API definitions, or DataWeave scripts were detected in the source repository files.

## 2. Business View
No business capabilities or exposed endpoints were discovered because this codebase is not recognized as a MuleSoft application.

## 3. Technical View
- **Mule XML Files**: 0
- **RAML/YAML Files**: 0
- **DataWeave Files**: 0
- **Properties Files**: 0
- **Components Found**: None

## 4. API-led Connectivity
No API-led architecture layers could be determined.

## 5. Endpoint Dependency Matrix
No dependencies found.

## 6. DataWeave Transformation Summary
No transformations discovered.

## 7. External System Inventory
No external systems connected.

## 8. Error Handling
No error handlers detected.

## 9. Security/Policies
No security configuration detected.

## 10. Migration Recommendation
N/A - This repository does not contain MuleSoft application structures.

## 11. AWS Target Architecture
N/A - No target architecture recommended.

## 12. Assumptions and Gaps
- **Assumptions**: Code base is a non-Mule project.
- **Gaps**: No Mule code found.`;
  }

  const flows = metadata?.flows || [];
  const subflows = metadata?.subflows || [];
  const apis = metadata?.endpoints || [];
  const connectors = metadata?.connectors || [];
  const externalSystems = metadata?.externalSystems || [];
  const properties = metadata?.properties || {};
  const files = metadata?.files || {};

  let mappingRows = "";
  for (const m of (awsMapping || [])) {
    mappingRows += `| **${m.muleComponent}** | **${m.awsService}** | ${m.rationale} | **${m.awsType || "Compute"}** |\n`;
  }

  // Segment flows into triggers
  const entryPoints = [];
  const internalOrchestrations = [];
  for (const f of flows) {
    const hasHttpListener = f.processors.some(p => p.type === 'http-listener');
    const hasScheduler = f.processors.some(p => p.type === 'scheduler');
    const hasQueueListener = f.processors.some(p => p.type.includes('mq') || f.name.toLowerCase().includes('queue') || f.name.toLowerCase().includes('listener'));
    if (hasHttpListener || hasScheduler || hasQueueListener) {
      let t = "Event";
      if (hasHttpListener) t = "HTTP Listener";
      else if (hasScheduler) t = "Scheduler";
      else if (hasQueueListener) t = "Queue / MQ";
      entryPoints.push({ name: f.name, type: t, file: f.file });
    } else {
      internalOrchestrations.push(f);
    }
  }

  const generatedModeText = errMessage ? ("due to error: " + errMessage) : "due to unconfigured AI key";
  const apiLines = apis.map(e => "  - `" + e.methods.join(", ") + "` `" + e.path + "` - " + (e.description || "API Route")).join("\n") || "  - None explicitly defined in RAML.";
  const triggerLines = entryPoints.map(ep => "  - **" + ep.name + "**: Activated by **" + ep.type + "** trigger.").join("\n") || "  - None detected.";
  const systemLines = externalSystems.map(sys => "  - Calls downstream system: **" + sys + "**").join("\n") || "  - No downstream external systems detected.";
  const flowLines = flows.map(f => "  - `Flow`: **" + f.name + "** (Processors: " + f.processors.length + ", Error Handler: " + (f.hasErrorHandler ? "Yes" : "No") + ")").join("\n");
  const subflowLines = subflows.map(sf => "  - `Subflow`: **" + sf.name + "** (Processors: " + sf.processors.length + ")").join("\n");
  const externalSystemLines = externalSystems.map(sys => "- **" + sys + "**: Mapped to native AWS target resources (e.g. SQS queues, Aurora RDS tables).").join("\n") || "- No external systems resolved.";

  return `# MuleSoft to AWS Migration Report
*(Generated in Fallback Mode ${generatedModeText})*

## 1. Executive Summary
This report analyzes the MuleSoft application components and compiles an automated mapping strategy to convert the implementation into AWS-native serverless microservices. The migration adopts a **Serverless-First** paradigm, swapping heavy ESB runtimes for event-driven, pay-per-use architecture.

## 2. Business View
The following business capabilities and exposed functionalities were discovered in the repository:
- **Exposed APIs & Endpoints**:
${apiLines}
- **Functional Triggers**:
${triggerLines}
- **Downstream Operations**:
${systemLines}

## 3. Technical View
A technical breakdown of MuleSoft assets:
- **File Inventory**:
  - **Mule XML Files**: ${(files.mule || []).length} files
  - **RAML/YAML API Specs**: ${(files.raml || []).length} files
  - **DataWeave (.dwl) Scripts**: ${(files.dwl || []).length} files
  - **Properties Files**: ${(files.properties || []).length} files
- **Inventory Metrics**:
  - **Total Flows**: ${metrics.totalFlows || 0}
  - **Total Subflows**: ${metrics.totalSubflows || 0}
  - **Complexity Assessed**: **${metrics.complexityScore || "LOW"}**
- **Flow Details**:
${flowLines}
${subflowLines}

## 4. API-led Connectivity
Mapped architectural layers based on naming conventions and connectors:
- **Experience Layer**: Handles external API exposure and HTTP routing. Exposes REST boundaries.
- **Process Layer**: Handles core orchestration, branching routers, caching logic, and state lookup.
- **System Layer**: Adapter services containing direct queries to databases or publishes to messaging systems.

## 5. Endpoint Dependency Matrix
Visual routing chain and call stack identified in this codebase:
- **Client App** → calling → **Experience API** (HTTP Router)
- **Experience API** → calling → **Process API** (Orchestrator & Object Store cache)
- **Process API** → calling → **System API** (Database & MQ Publisher adapters)
- **System API** → writing/fetching → **Backend Storage Grids / MQ Queue Broker**

## 6. DataWeave Transformation Summary
There are **${metrics.totalDwlFiles || 0}** DataWeave mapping scripts in the codebase:
- DWL transformations are used for translating hierarchical request payloads to flat SQL inputs or JSON models.
- **AWS Target Alternative**: Replaces with standard JavaScript Map/Reduce functions or JSONata template transforms inside Lambda handler helper modules.

## 7. External System Inventory
Discovered downstream integrations and dependencies:
${externalSystemLines}

## 8. Error Handling
- **Flow Level Handlers**: Found ${flows.filter(f => f.hasErrorHandler).length} flow error handler configurations.
- **AWS Mapping**: Mapped to standard JavaScript try-catch blocks returning custom status code JSON payloads, or SQS Dead Letter Queues (DLQ) for asynchronous event failures.

## 9. Security/Policies
- **Policies Detected**: Client ID Enforcement and security parameters.
- **AWS Mapping**: Secured using API Gateway API Keys, Cognito JWT Authorizers, or AWS WAF firewall rate-limiting filters.

## 10. Migration Recommendation
- **Compute Conversion**: Do NOT map every single flow to a separate Lambda function.
- **Triggers mapping**:
  - HTTP Listeners → Amazon API Gateway HTTP routes + Lambda handlers.
  - Schedulers → EventBridge Scheduled Rules + Lambda triggers.
  - Queue listeners → Amazon SQS Queue Event triggers + Lambda.
- **Subflows mapping**: Reusable subflows must be converted into shared JavaScript modules/functions in the \`src/utils\` directory instead of dedicated compute runtimes.
- **DWL mapping**: Replaced with utility JS helper functions.

## 11. AWS Target Architecture
The proposed architecture maps the application to a serverless state:
- **Amazon API Gateway**: Receives HTTPS REST calls and handles routing boundaries.
- **AWS Lambda**: Code execution engine (Node.js runtime) representing mapped trigger flows.
- **Amazon DynamoDB**: Key-value data cache replacing Object Store caches.
- **Amazon SQS**: Event queues replacing Anypoint MQ or VM queue systems.
- **Amazon CloudWatch**: Gathers logging statements from Lambda output.

## 12. Assumptions and Gaps
- **Assumptions**: Mapped resources are deployed in the same AWS region and VPC environment.
- **Gaps**: DataWeave scripts containing complex custom Java helper methods must be manually refactored to equivalent Node.js libraries.`;
}

// Fallback Plan helper
function getFallbackAwsPlan(metadata, errMessage = "") {
  const note = errMessage ? `(Fallback mode due to error: ${errMessage})` : "";
  return {
    targetArchitectureDescription: `AWS target serverless cloud structure containing Amazon API Gateway proxying to stateless Node.js Lambda functions ${note}.`,
    computeRecommendations: `AWS Lambda memory size should be set between 128MB and 512MB based on complexity. Use Node.js 18.x or 20.x runtime settings.`,
    databaseRecommendations: `Configure RDS Proxy for relational databases to handle connection pool reuse. Set DynamoDB table billing to Pay-per-request (On-Demand).`,
    integrationRecommendations: `Create SQS Standard queues with visibility timeout set to 30 seconds (matching Lambda timeout) and configure dead-letter-queues.`,
    securityRecommendations: `Store database credentials in AWS Secrets Manager. Secure API Gateway HTTP endpoints using Cognito User Pool authorizers.`,
    monitoringRecommendations: `Enable AWS X-Ray active tracing on Lambda. Set up CloudWatch alarms for Lambda errors and duration spikes.`
  };
}
