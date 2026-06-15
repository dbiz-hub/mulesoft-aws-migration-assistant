import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

const apiKey = process.env.OPENAI_API_KEY;
const modelName = process.env.OPENAI_MODEL || "gpt-4o-mini";

let openai = null;
if (apiKey && apiKey.trim() !== "") {
  console.log(`[OpenAI Service] Initializing with model: ${modelName}`);
  openai = new OpenAI({ apiKey });
} else {
  console.warn("[OpenAI Service] WARNING: OPENAI_API_KEY is not set. Running in parser-only fallback mode.");
}

// Helper to truncate text to avoid token overflows
function truncateText(text, maxChars = 2000) {
  if (!text) return "";
  if (text.length <= maxChars) return text;
  return text.substring(0, maxChars) + "\n... [truncated for token safety] ...";
}

// Helper to sanitize JSON response from OpenAI (in case markdown wrapper is included)
function cleanJsonString(str) {
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

/**
 * 1. Analyze MuleSoft project code base with AI
 */
export async function analyzeMuleProjectWithAI(projectFiles, parsedMetadata) {
  if (!openai) {
    return getFallbackAnalysis(parsedMetadata);
  }

  try {
    // Construct a concise file content snippet log
    let codebaseSnippet = "";
    for (const [filePath, content] of Object.entries(projectFiles)) {
      if (filePath.includes("node_modules") || filePath.includes("target/") || filePath.includes(".git")) {
        continue;
      }
      codebaseSnippet += `--- File: ${filePath} ---\n${truncateText(content, 1200)}\n\n`;
    }
    // Limit total snippet size to ~12000 chars to avoid model input saturation
    codebaseSnippet = truncateText(codebaseSnippet, 12000);

    const prompt = `You are an expert MuleSoft and AWS migration architect. Analyze the provided MuleSoft project metadata and source snippets. Identify business capabilities, API-led architecture layers, flow dependencies, transformations, external systems, error handling, and security. Then recommend an AWS-native target architecture using API Gateway, Lambda, SQS, EventBridge, DynamoDB, Cognito, CloudWatch, Step Functions, and S3 where appropriate. Return structured JSON only.

Codebase source snippets:
${codebaseSnippet}

Parsed technical metadata:
${JSON.stringify(parsedMetadata, null, 2)}

Return a structured JSON object strictly matching this schema:
{
  "executiveSummary": "A concise executive explanation of the API, its business value, and target AWS architecture.",
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
  "businessCapabilities": [
    {
      "capability": "Business Capability Name",
      "description": "Detailed explanation of what business logic it covers"
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
  "migrationComplexity": "LOW / MEDIUM / HIGH",
  "recommendations": [
    "AWS-native architectural recommendations specific to this codebase"
  ],
  "risks": [
    "Specific risks associated with converting this flow/system to AWS"
  ],
  "estimatedEffort": "e.g. 3-4 Weeks developer effort (includes design, conversion, and validation)"
}`;

    const response = await openai.chat.completions.create({
      model: modelName,
      messages: [
        { role: "system", content: "You are an AI assistant specialized in MuleSoft-to-AWS code migration. You respond ONLY in valid JSON matching the requested schema." },
        { role: "user", content: prompt }
      ],
      response_format: { type: "json_object" },
      temperature: 0.2
    });

    const textResponse = response.choices[0].message.content;
    return JSON.parse(cleanJsonString(textResponse));
  } catch (error) {
    console.error("[OpenAI Service] Analysis failed. Returning fallback.", error);
    return getFallbackAnalysis(parsedMetadata, error.message);
  }
}

/**
 * 2. Generate API-led business blueprint (relationship & mermaid diagram)
 */
export async function generateBusinessBlueprintWithAI(parsedMetadata) {
  if (!openai) {
    return getFallbackBlueprint(parsedMetadata);
  }

  try {
    const prompt = `You are a MuleSoft and AWS migration architect.
Based on the following MuleSoft metadata, generate a modern business blueprint.
This must include:
1. An explanation of the API-led connectivity layers (Experience layer -> Process layer -> System layer -> External Systems).
2. A detailed Mermaid.js graph code block showing the source API-led relationships, but also showing how they map to AWS services. 
Make sure the Mermaid diagram uses a clean layout: Client -> API Gateway -> Lambda Functions -> DynamoDB Cache/SQS Queues/Aurora Databases.

Metadata:
${JSON.stringify(parsedMetadata, null, 2)}

Return a structured JSON object containing:
{
  "summary": "Explanation of the API-led layered relationships and business capabilities.",
  "mermaidDiagram": "The raw Mermaid diagram text (starting with graph TD or graph LR, no markdown wrappers inside this string value)"
}`;

    const response = await openai.chat.completions.create({
      model: modelName,
      messages: [
        { role: "system", content: "You are an expert serverless architect. Return ONLY a JSON object containing 'summary' and 'mermaidDiagram'." },
        { role: "user", content: prompt }
      ],
      response_format: { type: "json_object" },
      temperature: 0.3
    });

    const result = JSON.parse(cleanJsonString(response.choices[0].message.content));
    return result;
  } catch (error) {
    console.error("[OpenAI Service] Blueprint generation failed. Returning fallback.", error);
    return getFallbackBlueprint(parsedMetadata, error.message);
  }
}

/**
 * 3. Generate detailed 15-section Migration Report
 */
export async function generateMigrationReportWithAI(parsedMetadata, awsMapping) {
  if (!openai) {
    return getFallbackReport(parsedMetadata, awsMapping);
  }

  try {
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

    const response = await openai.chat.completions.create({
      model: modelName,
      messages: [
        { role: "system", content: "You are a professional technical writer and migration architect. Output the markdown document directly. Do not wrap it in a JSON object." },
        { role: "user", content: prompt }
      ],
      temperature: 0.3
    });

    return response.choices[0].message.content;
  } catch (error) {
    console.error("[OpenAI Service] Report generation failed. Returning fallback.", error);
    return getFallbackReport(parsedMetadata, awsMapping, error.message);
  }
}

/**
 * 4. Generate AWS Conversion Plan
 */
export async function generateAwsConversionPlanWithAI(parsedMetadata) {
  if (!openai) {
    return getFallbackAwsPlan(parsedMetadata);
  }

  try {
    const prompt = `You are a Serverless Cloud Architect.
Analyze the following parsed MuleSoft metadata:
${JSON.stringify(parsedMetadata, null, 2)}

Suggest a target AWS native architecture using API Gateway, Lambda, SQS, DynamoDB, RDS, Cognito, EventBridge, CloudWatch, and Secrets Manager.
Provide recommendations on:
- Lambda sizing (Memory size, timeouts)
- Database connections handling (RDS Proxy, DynamoDB connection reuse)
- Security (WAF, IAM roles, KMS encryption keys)
- Logging & Monitoring (CloudWatch alarms, X-Ray tracing)

Return a structured JSON object containing:
{
  "targetArchitectureDescription": "Overview of AWS-native serverless architecture",
  "computeRecommendations": "Lambda memory, runtime, concurrency settings",
  "databaseRecommendations": "Database scaling and migration (RDS Proxy vs DynamoDB)",
  "integrationRecommendations": "SQS/EventBridge messaging triggers",
  "securityRecommendations": "Cognito IAM, Secrets Manager configuration",
  "monitoringRecommendations": "CloudWatch logs, alarms and tracing setup"
}`;

    const response = await openai.chat.completions.create({
      model: modelName,
      messages: [
        { role: "system", content: "You are a cloud architect. Return ONLY a JSON object containing the recommendations fields." },
        { role: "user", content: prompt }
      ],
      response_format: { type: "json_object" },
      temperature: 0.2
    });

    return JSON.parse(cleanJsonString(response.choices[0].message.content));
  } catch (error) {
    console.error("[OpenAI Service] Conversion plan failed. Returning fallback.", error);
    return getFallbackAwsPlan(parsedMetadata, error.message);
  }
}

/**
 * 5. Generate sample Lambda handler logic from flow summary and details
 */
export async function generateLambdaHandlerWithAI(flowName, flowSummary, analyzedData) {
  if (!openai) {
    return getFallbackLambdaHandler(flowName, flowSummary, analyzedData);
  }

  try {
    const prompt = `You are an AWS Serverless Developer. Translate the following MuleSoft flow details into a clean, AWS-native Node.js ES6 Lambda handler.
Make sure to:
- Use standard AWS SDK v3 imports (like @aws-sdk/client-dynamodb, @aws-sdk/client-sqs) if cache store or queues are used.
- Import relative utils if needed (e.g. formatErrorResponse from '../utils/errorHandler.js' or transform from '../utils/transformer.js').
- Add comments explaining what MuleSoft components (e.g. <http:listener>, <db:select>, <ee:transform>) are replaced by this code block.
- Keep the handler clean, production-ready, and performant.

Flow name: ${flowName}
Flow description/summary: ${JSON.stringify(flowSummary, null, 2)}
Overall metadata: ${JSON.stringify(analyzedData?.metrics || {}, null, 2)}

Return ONLY the executable JavaScript code. Do not include markdown code block syntax (like \`\`\`javascript) in your response, just the plain code.`;

    const response = await openai.chat.completions.create({
      model: modelName,
      messages: [
        { role: "system", content: "You are an AWS developer. Return ONLY valid, executable Javascript code. No markdown wrapper, no extra explanations." },
        { role: "user", content: prompt }
      ],
      temperature: 0.3
    });

    return response.choices[0].message.content.trim();
  } catch (error) {
    console.error("[OpenAI Service] Lambda generation failed. Returning fallback.", error);
    return getFallbackLambdaHandler(flowName, flowSummary, analyzedData, error.message);
  }
}


// ====================================================
// FALLBACK GENERATORS (Used when OpenAI API is absent/fails)
// ====================================================

function getFallbackAnalysis(metadata, errMessage = "") {
  const note = errMessage ? `(AI call failed: ${errMessage})` : "(OpenAI API Key not configured)";
  const complexity = metadata?.metrics?.complexityScore || "LOW";
  const metrics = metadata?.metrics || {};

  const flows = (metadata?.flows || []).map(f => {
    const isListener = f.processors.some(p => p.type === "http-listener");
    return {
      name: f.name,
      description: `Static analysis of MuleSoft flow. Contains ${f.processors.length} processors.`,
      complexity: f.processors.length > 5 ? "MEDIUM" : "LOW",
      awsMapping: isListener ? `AWS Lambda function triggering on API Gateway route` : `AWS Lambda utility execution`
    };
  });

  const apis = (metadata?.endpoints || []).map(e => ({
    path: e.path,
    method: e.methods.join(", "),
    description: e.description || "Parsed HTTP listener path",
    awsService: "Amazon API Gateway (HTTP API)"
  }));

  const external = (metadata?.externalSystems || []).map(sys => ({
    name: sys,
    type: sys.toLowerCase().includes("database") || sys.toLowerCase().includes("mysql") ? "Database" : "REST API / Downstream System",
    awsAlternative: sys.toLowerCase().includes("database") ? "Amazon RDS/Aurora Serverless Cluster" : "Amazon EventBridge / HTTP Client"
  }));

  const mapping = [];
  if (metadata?.connectors?.includes("HTTP Listener")) {
    mapping.push({ muleComponent: "HTTP Listener", muleType: "Connector", awsService: "Amazon API Gateway", rationale: "Exposes HTTP routes to the web" });
  }
  if (metadata?.connectors?.includes("Database")) {
    mapping.push({ muleComponent: "Database Connector", muleType: "Connector", awsService: "Amazon RDS / Aurora Serverless", rationale: "Relational database mapping" });
  }
  if (metadata?.connectors?.includes("Anypoint MQ")) {
    mapping.push({ muleComponent: "Anypoint MQ", muleType: "Connector", awsService: "Amazon SQS", rationale: "Queued async message transport" });
  }
  if (metadata?.connectors?.includes("Object Store")) {
    mapping.push({ muleComponent: "Object Store", muleType: "Connector", awsService: "Amazon DynamoDB (Cache)", rationale: "Key-value caching layer" });
  }

  return {
    executiveSummary: `MuleSoft to AWS Migration Analysis ${note}. Successfully analyzed codebase containing ${metrics.totalFlows || 0} flows, ${metrics.totalSubflows || 0} sub-flows, and ${metrics.totalDwlFiles || 0} DataWeave scripts. Assessed complexity: ${complexity}. Target state uses API Gateway proxying stateless Node.js Lambdas with SQS queue asynchronous routing and DynamoDB cache storing.`,
    apis,
    flows,
    dependencies: [
      { source: "Experience Layer", target: "Process Layer", type: "HTTP", description: "Direct REST call from boundary router to orchestrator." },
      { source: "Process Layer", target: "System Layer", type: "HTTP", description: "Internal orchestrator requesting base system adapters." },
      { source: "System Layer", target: "External Systems", type: "Database/Queue", description: "Reads/Writes persisting state to storage grids." }
    ],
    businessCapabilities: [
      { capability: "API Gateway Integration", description: "Handles incoming API contracts and routes requests securely." },
      { capability: "Data Transformation", description: "Translates XML payloads into standardized JSON representations." }
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
    migrationComplexity: complexity,
    recommendations: [
      "Adopt a Serverless first paradigm utilizing AWS Lambda and HTTP APIs.",
      "Use Amazon RDS Proxy to prevent database connection limits from running thin on high Lambda scale.",
      "Translate DataWeave scripts to standard JavaScript Map functions inside Lambda."
    ],
    risks: [
      "Converting complex nested DataWeave arrays map logic can introduce syntax offsets.",
      "Stateless Lambda connection spikes can exhaust backend relational database pools."
    ],
    estimatedEffort: complexity === "HIGH" ? "8-12 Weeks" : complexity === "MEDIUM" ? "4-6 Weeks" : "2-3 Weeks"
  };
}

function getFallbackBlueprint(metadata, errMessage = "") {
  const note = errMessage ? `(Blueprint generated in fallback mode due to error: ${errMessage})` : "";
  
  let chart = `graph TD
    Client[Client App] -->|HTTP Request| Experience[Experience Layer]
    Experience -->|Routing Call| Process[Process Layer]
    Process -->|Cache Lookup| Cache[Object Store Cache]
    Process -->|DB Query / Push| System[System Layer]
    System -->|Store Data| DB[(Database)]
  `;

  // Customise basic diagram from metrics
  const flows = metadata?.flows || [];
  const hasListener = flows.some(f => f.processors.some(p => p.type === "http-listener"));
  const hasDb = flows.some(f => f.processors.some(p => p.type === "database")) || metadata?.connectors?.includes("Database");
  const hasMq = flows.some(f => f.processors.some(p => p.type.startsWith("anypoint-mq"))) || metadata?.connectors?.includes("Anypoint MQ");

  if (hasListener || hasDb || hasMq) {
    chart = `graph TD
      Consumer[Consumer Client] -->|HTTPS| APIGateway[Amazon API Gateway]
      APIGateway -->|Route API Request| LambdaExp[Experience API Lambda]
      LambdaExp -->|Call Orchestration| LambdaProc[Process API Lambda]
      ${hasMq ? "LambdaProc -->|Queue Async Message| SQSQueue[Amazon SQS Queue]\nSQSQueue -->|Trigger Poll| LambdaSys[System API Lambda]" : "LambdaProc -->|Call Adapters| LambdaSys[System API Lambda]"}
      ${hasDb ? "LambdaSys -->|SQL Transaction| RDSDatabase[(Amazon RDS / Aurora Serverless)]" : ""}
    `;
  }

  return {
    summary: `Technical blueprint mapping MuleSoft architecture to AWS services ${note}. Visualizes API Gateway ingress routing requests to Experience and Process compute Lambdas, integrated with downstream SQS messaging queues and DynamoDB caching blocks.`,
    mermaidDiagram: chart
  };
}

function getFallbackReport(metadata, awsMapping, errMessage = "") {
  const metrics = metadata?.metrics || {};
  let mappingRows = "";
  for (const m of (awsMapping || [])) {
    mappingRows += `| **${m.muleComponent}** | *${m.muleType}* | **${m.awsService}** | ${m.rationale} |\n`;
  }

  return `# MuleSoft to AWS Migration Analysis Report
*(Generated in Fallback Mode ${errMessage ? `due to error: ${errMessage}` : "due to unconfigured OpenAI key"})*

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

function getFallbackAwsPlan(metadata, errMessage = "") {
  const note = errMessage ? `(Fallback mode due to error: ${errMessage})` : "";
  const complexity = metadata?.metrics?.complexityScore || "LOW";

  return {
    targetArchitectureDescription: `AWS target serverless cloud structure containing Amazon API Gateway proxying to stateless Node.js Lambda functions ${note}.`,
    computeRecommendations: `AWS Lambda memory size should be set between 128MB and 512MB based on complexity. Use Node.js 18.x or 20.x runtime settings.`,
    databaseRecommendations: `Configure RDS Proxy for relational databases to handle connection pool reuse. Set DynamoDB table billing to Pay-per-request (On-Demand).`,
    integrationRecommendations: `Create SQS Standard queues with visibility timeout set to 30 seconds (matching Lambda timeout) and configure dead-letter-queues.`,
    securityRecommendations: `Store database credentials in AWS Secrets Manager. Secure API Gateway HTTP endpoints using Cognito User Pool authorizers.`,
    monitoringRecommendations: `Enable AWS X-Ray active tracing on Lambda. Set up CloudWatch alarms for Lambda errors and duration spikes.`
  };
}

function getFallbackLambdaHandler(flowName, flowSummary, analyzedData, errMessage = "") {
  const note = errMessage ? `// AI code generation failed: ${errMessage}. Showing static skeleton.\n` : "";
  return `${note}/**
 * AWS Lambda Handler for MuleSoft Flow: ${flowName}
 * Replaces: ${flowSummary?.description || "MuleSoft flow logic"}
 */
import { formatErrorResponse } from '../utils/errorHandler.js';

export const handler = async (event) => {
  console.log(JSON.stringify({
    message: "Lambda execution started",
    flow: "${flowName}",
    requestId: event.requestContext?.requestId,
    path: event.requestContext?.http?.path
  }));

  try {
    // 1. Extract inputs from event
    const pathParameters = event.pathParameters || {};
    const body = event.body ? JSON.parse(event.body) : {};
    
    // 2. Perform business logic (simulated migration target)
    let payload = {
      message: "Successfully executed migrated logic for flow ${flowName}",
      timestamp: new Date().toISOString(),
      status: "SUCCESS",
      context: { pathParameters, body }
    };

    // 3. Return JSON API response
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    };
  } catch (error) {
    console.error("Error encountered in lambda execution:", error);
    return formatErrorResponse(error);
  }
};`;
}
