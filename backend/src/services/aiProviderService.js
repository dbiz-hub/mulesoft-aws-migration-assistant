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

// 1. Parser Only (Static Analysis Fallback)
export function parserOnlyAnalyze(files, parsedMetadata) {
  const metrics = parsedMetadata?.metrics || {};
  const complexity = metrics?.complexityScore || "LOW";

  const flows = (parsedMetadata?.flows || []).map(f => {
    const isListener = f.processors.some(p => p.type === "http-listener");
    return {
      name: f.name,
      description: `Static analysis of MuleSoft flow. Contains ${f.processors.length} processors.`,
      complexity: f.processors.length > 5 ? "MEDIUM" : "LOW",
      awsMapping: isListener ? `AWS Lambda function triggering on API Gateway route` : `AWS Lambda utility execution`
    };
  });

  const apis = (parsedMetadata?.endpoints || []).map(e => ({
    path: e.path,
    method: e.methods.join(", "),
    description: e.description || "Parsed HTTP listener path",
    awsService: "Amazon API Gateway (HTTP API)"
  }));

  const external = (parsedMetadata?.externalSystems || []).map(sys => ({
    name: sys,
    type: sys.toLowerCase().includes("database") || sys.toLowerCase().includes("mysql") ? "Database" : "REST API / Downstream System",
    awsAlternative: sys.toLowerCase().includes("database") ? "Amazon RDS/Aurora Serverless Cluster" : "Amazon EventBridge / HTTP Client"
  }));

  const mapping = [];
  if (parsedMetadata?.connectors?.includes("HTTP Listener")) {
    mapping.push({ muleComponent: "HTTP Listener", muleType: "Connector", awsService: "Amazon API Gateway", rationale: "Exposes HTTP routes to the web" });
  }
  if (parsedMetadata?.connectors?.includes("Database")) {
    mapping.push({ muleComponent: "Database Connector", muleType: "Connector", awsService: "Amazon RDS / Aurora Serverless", rationale: "Relational database mapping" });
  }
  if (parsedMetadata?.connectors?.includes("Anypoint MQ")) {
    mapping.push({ muleComponent: "Anypoint MQ", muleType: "Connector", awsService: "Amazon SQS", rationale: "Queued async message transport" });
  }
  if (parsedMetadata?.connectors?.includes("Object Store")) {
    mapping.push({ muleComponent: "Object Store", muleType: "Connector", awsService: "Amazon DynamoDB (Cache)", rationale: "Key-value caching layer" });
  }

  return {
    executiveSummary: `MuleSoft to AWS Migration Analysis (Parser-Only Mode). Successfully parsed codebase containing ${metrics.totalFlows || 0} flows, ${metrics.totalSubflows || 0} sub-flows, and ${metrics.totalDwlFiles || 0} DataWeave scripts. Assessed complexity: ${complexity}. Target state uses API Gateway proxying stateless Node.js Lambdas with SQS queue asynchronous routing and DynamoDB cache storing.`,
    businessCapabilities: [
      { capability: "API Gateway Integration", description: "Handles incoming API contracts and routes requests securely." },
      { capability: "Data Transformation", description: "Translates XML payloads into standardized JSON representations." }
    ],
    apis,
    flows,
    dependencies: [
      { source: "Experience Layer", target: "Process Layer", type: "HTTP", description: "Direct REST call from boundary router to orchestrator." },
      { source: "Process Layer", target: "System Layer", type: "HTTP", description: "Internal orchestrator requesting base system adapters." },
      { source: "System Layer", target: "External Systems", type: "Database/Queue", description: "Reads/Writes persisting state to storage grids." }
    ],
    transformations: [
      { name: "dwl/transformer.dwl", logic: "Translates raw source message into standardized target schema.", awsAlternative: "Node.js JS transform script" }
    ],
    externalSystems: external,
    security: [
      { policyName: "Client ID Enforcement", description: "Validates API consumers using client ID & secret headers.", awsMapping: "API Gateway API Keys / Cognito Token validation" }
    ],
    errorHandling: [
      { scope: "Global Error Handler", strategy: "Propagates transaction failure codes upstream", awsMapping: "Lambda standard try-catch blocks returning custom status codes" }
    ],
    awsMapping: mapping,
    risks: [
      "Converting complex nested DataWeave arrays map logic can introduce syntax offsets.",
      "Stateless Lambda connection spikes can exhaust backend relational database pools."
    ],
    recommendations: [
      "Adopt a Serverless first paradigm utilizing AWS Lambda and HTTP APIs.",
      "Use Amazon RDS Proxy to prevent database connection limits from running thin on high Lambda scale.",
      "Translate DataWeave scripts to standard JavaScript Map functions inside Lambda."
    ],
    migrationComplexity: complexity,
    estimatedEffort: complexity === "HIGH" ? "8-12 Weeks" : complexity === "MEDIUM" ? "4-6 Weeks" : "2-3 Weeks",
    architectureDiagram: DEFAULT_MERMAID_DIAGRAM
  };
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

  return `You are an expert MuleSoft and AWS migration architect. Analyze the provided MuleSoft project metadata and source snippets. Identify business capabilities, API-led architecture layers, flow dependencies, transformations, external systems, error handling, and security. Then recommend an AWS-native target architecture using API Gateway, Lambda, SQS, EventBridge, DynamoDB, Cognito, CloudWatch, Step Functions, and S3 where appropriate. Return structured JSON only.

Codebase source snippets:
${codebaseSnippet}

Parsed technical metadata:
${JSON.stringify(parsedMetadata, null, 2)}

Return a structured JSON object strictly matching this schema:
{
  "executiveSummary": "A concise executive explanation of the API, its business value, and target AWS architecture.",
  "businessCapabilities": [
    {
      "capability": "Business Capability Name",
      "description": "Detailed explanation of what business logic it covers"
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
    "Specific risks associated with converting this flow/system to AWS"
  ],
  "recommendations": [
    "AWS-native architectural recommendations specific to this codebase"
  ],
  "migrationComplexity": "LOW / MEDIUM / HIGH",
  "estimatedEffort": "e.g. 3-4 Weeks developer effort (includes design, conversion, and validation)",
  "architectureDiagram": "Mermaid diagram TD or LR string showing the AWS target architecture."
}`;
}

// 2. OpenAI Analysis
export async function openAiAnalyze(files, parsedMetadata, providerInfo) {
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
    return parsed;
  } catch (err) {
    console.error("[OpenAI Analyze] Failed. Falling back to parserOnly.", err);
    return parserOnlyAnalyze(files, parsedMetadata);
  }
}

// 3. Gemini Analysis
export async function geminiAnalyze(files, parsedMetadata, providerInfo) {
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

The report MUST contain exactly these 15 sections in order:
1. Executive Summary
2. Current MuleSoft Landscape
3. API Inventory
4. Experience / Process / System API Mapping
5. Flow-by-Flow Functional Analysis
6. DataWeave Transformation Summary
7. External System Dependencies
8. Security and Policy Analysis
9. Error Handling Analysis
10. AWS Target Architecture
11. MuleSoft to AWS Component Mapping
12. Migration Complexity
13. Risks and Assumptions
14. Recommended Migration Phases
15. Estimated Effort

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
  let mappingRows = "";
  for (const m of (awsMapping || [])) {
    mappingRows += `| **${m.muleComponent}** | *${m.muleType}* | **${m.awsService}** | ${m.rationale} |\n`;
  }

  return `# MuleSoft to AWS Migration Analysis Report
*(Generated in Fallback Mode ${errMessage ? `due to error: ${errMessage}` : "due to unconfigured AI key"})*

## 1. Executive Summary
This report analyzes the MuleSoft application components and compiles an automated mapping strategy to convert the implementation into AWS-native serverless microservices.

## 2. Current MuleSoft Landscape
A technical breakdown of flows, subflows, connectors, and configuration properties.
- **Total Flows**: ${metrics.totalFlows || 0}
- **Total Subflows**: ${metrics.totalSubflows || 0}
- **Complexity assessed**: ${metrics.complexityScore || "LOW"}

## 3. API Inventory
List of REST endpoint paths and methods resolved from Mule source code.
${(metadata?.endpoints || []).map(e => `- \`${e.methods.join(", ")}\` : \`${e.path}\``).join("\n") || "- No endpoints detected."}

## 4. Experience / Process / System API Mapping
API-led integration structure maps:
- Experience layer -> API Gateway routing entries.
- Process layer -> Compute lambda orchestration handlers.
- System layer -> Direct database or messaging system adapters.

## 5. Flow-by-Flow Functional Analysis
Detailed functional audit for all parsed flows:
${(metadata?.flows || []).map(f => `- **${f.name}**: Flow contains ${f.processors.length} processors, including: ${f.processors.map(p => p.type).join(", ") || "none"}`).join("\n")}

## 6. DataWeave Transformation Summary
Conversion summary of DataWeave mapping scripts. Found ${metrics.totalDwlFiles || 0} DWL scripts. Suggested implementation: Native Node.js JS functions.

## 7. External System Dependencies
Interactions mapped to target storage grids or external messaging hubs:
${(metadata?.externalSystems || []).map(sys => `- **${sys}** -> Amazon target connector service.`).join("\n") || "- No external systems resolved."}

## 8. Security and Policy Analysis
MuleSoft API Gateway client policies mapped to AWS equivalents (Cognito User Pools, JWT verification, and WAF protection rules).

## 9. Error Handling Analysis
Mule error handlers mapped to Lambda standard JavaScript native try-catch structures and failed message SQS DLQ redrive policies.

## 10. AWS Target Architecture
An event-driven serverless ecosystem utilizing AWS Gateway, Lambda compute, DynamoDB caching, SQS queues, and RDS Aurora storage.

## 11. MuleSoft to AWS Component Mapping
Below is the direct translation mapping computed from the XML source parse tree:

| MuleSoft Source Component | Component Type | Target AWS Service | Architecture Rationale |
|---|---|---|---|
${mappingRows || "| No mappings found | | | |"}

## 12. Migration Complexity
- **Overall Score**: ${metrics.score || 0}
- **Complexity Assessment**: **${metrics.complexityScore || "LOW"}**

## 13. Risks and Assumptions
- Assumes target AWS CLI permissions and CLI deployment frameworks are pre-configured.
- Relies on testing custom JS transformation alternatives manually to match complex DataWeave mappings.

## 14. Recommended Migration Phases
- Phase 1: Ingress API Gateway route setups.
- Phase 2: Lambda function handler conversions and environment configuration settings.
- Phase 3: Database schema migrations and SQS queue setups.
- Phase 4: Integration testing, CI/CD setup, and cutover validation.

## 15. Estimated Effort
Estimated developer time to execute and validate migration: **${metrics.complexityScore === "HIGH" ? "8-12 Weeks" : metrics.complexityScore === "MEDIUM" ? "4-6 Weeks" : "2-3 Weeks"}**.`;
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
