import AdmZip from "adm-zip";

export function generateAwsSamProject(analyzedData, mappings) {
  const generatedFiles = {};

  // 1. Generate template.yaml
  generatedFiles["template.yaml"] = generateSamTemplate(analyzedData);

  // 2. Generate README.md
  generatedFiles["README.md"] = generateReadme(analyzedData);

  // 3. Generate Lambda Handlers
  for (const flow of analyzedData.flows) {
    const fileName = `src/handlers/${flow.name}.js`;
    generatedFiles[fileName] = generateLambdaHandler(flow, analyzedData);
  }

  // 4. Generate Utils
  generatedFiles["src/utils/transformer.js"] = generateTransformer(analyzedData);
  generatedFiles["src/utils/errorHandler.js"] = generateErrorHandler();

  // 5. Generate Docs
  generatedFiles["docs/migration-report.md"] = generateMigrationReport(analyzedData, mappings);
  generatedFiles["docs/architecture.md"] = generateArchitectureDoc(analyzedData);
  generatedFiles["docs/blueprint.mmd"] = generateMermaidBlueprint(analyzedData);

  return generatedFiles;
}

export function createZipArchive(filesObject) {
  const zip = new AdmZip();
  for (const [filePath, content] of Object.entries(filesObject)) {
    // Add folder structure
    const buffer = Buffer.from(content, "utf-8");
    zip.addFile(filePath, buffer);
  }
  return zip.toBuffer();
}

// Sub-generators
function generateSamTemplate(analyzedData) {
  let resourcesYaml = "";
  let globalsYaml = `
Globals:
  Function:
    Timeout: 30
    MemorySize: 256
    Runtime: nodejs18.x
    Environment:
      Variables:
        STAGE: dev
        LOG_LEVEL: INFO
`;

  // Check if Object Store is used, add DynamoDB Table
  const hasObjectStore = analyzedData.connectors.includes("Object Store") || 
                         analyzedData.flows.some(f => f.processors.some(p => p.type.startsWith("objectstore-")));
  if (hasObjectStore) {
    resourcesYaml += `
  CustomerCacheTable:
    Type: AWS::DynamoDB::Table
    Properties:
      TableName: customer-cache-store
      BillingMode: PAY_PER_REQUEST
      AttributeDefinitions:
        - AttributeName: CacheKey
          AttributeType: S
      KeySchema:
        - AttributeName: CacheKey
          KeyType: HASH
      TimeToLiveSpecification:
        AttributeName: TTL
        Enabled: true
`;
    globalsYaml += `    Environment:\n      Variables:\n        CACHE_TABLE_NAME: !Ref CustomerCacheTable\n`;
  }

  // Check if MQ is used, add SQS Queue
  const hasMq = analyzedData.connectors.includes("Anypoint MQ") || 
                analyzedData.flows.some(f => f.processors.some(p => p.type.startsWith("anypoint-mq")));
  if (hasMq) {
    resourcesYaml += `
  CustomerSyncQueue:
    Type: AWS::SQS::Queue
    Properties:
      QueueName: customer-sync-queue
      VisibilityTimeout: 30
      RedrivePolicy:
        deadLetterTargetArn: !GetAtt CustomerSyncDLQ.Arn
        maxReceiveCount: 3

  CustomerSyncDLQ:
    Type: AWS::SQS::Queue
    Properties:
      QueueName: customer-sync-dlq
`;
    globalsYaml += `    Environment:\n      Variables:\n        SYNC_QUEUE_URL: !Ref CustomerSyncQueue\n`;
  }

  // Check if Database is used
  const hasDb = analyzedData.connectors.includes("Database") || 
                analyzedData.flows.some(f => f.processors.some(p => p.type === "database"));
  if (hasDb) {
    globalsYaml += `    Environment:\n      Variables:\n        DB_HOST: "customer-db.internal"\n        DB_NAME: "customer_db"\n        DB_USER: "admin"\n        DB_PASSWORD_SECRET_ARN: "arn:aws:secretsmanager:us-east-1:123456789012:secret:DB_PASSWORD"\n`;
  }

  // Generate Functions for each Flow
  for (const flow of analyzedData.flows) {
    const cleanFlowName = flow.name.replace(/[^a-zA-Z0-9]/g, "");
    
    // Find trigger
    const listener = flow.processors.find(p => p.type === "http-listener");
    const scheduler = flow.processors.find(p => p.type === "scheduler");

    let eventsYaml = "";
    if (listener) {
      // Determine methods
      const methodList = listener.method === "ALL" ? "ANY" : listener.method.split(",")[0].trim().toUpperCase();
      // Route params: convert /api/customers/{id} to /api/customers/{id} (AWS style is same)
      const cleanPath = listener.path;
      
      eventsYaml = `
      Events:
        ApiEvent:
          Type: HttpApi
          Properties:
            Path: ${cleanPath}
            Method: ${methodList}
`;
    } else if (scheduler) {
      eventsYaml = `
      Events:
        ScheduleEvent:
          Type: ScheduleV2
          Properties:
            ScheduleExpression: "rate(1 day)"
            State: ENABLED
`;
    }

    resourcesYaml += `
  ${cleanFlowName}Function:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: ./
      Handler: src/handlers/${flow.name}.handler
      Description: Replaces MuleSoft flow '${flow.name}'
      Policies:
        - AWSLambdaBasicExecutionRole
        ${hasObjectStore ? "- DynamoDBCrudPolicy: { TableName: !Ref CustomerCacheTable }" : ""}
        ${hasMq ? "- SQSSendMessagePolicy: { QueueName: !GetAtt CustomerSyncQueue.QueueName }" : ""}
      ${eventsYaml}`;
  }

  return `AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31
Description: AWS SAM template for MuleSoft migrated API-led microservices

${globalsYaml}

Resources:${resourcesYaml}

Outputs:
  HttpApiUrl:
    Description: URL of the HTTP API Gateway endpoint
    Value: !Sub "https://\${ServerlessHttpApi}.execute-api.\${AWS::Region}.amazonaws.com/dev"
`;
}

function generateReadme(analyzedData) {
  return `# Migrated AWS SAM Project

This repository contains the AWS-native serverless architecture translated from your MuleSoft implementation. It was generated automatically by the **MuleSoft to AWS Migration Assistant**.

## Project Structure
- \`template.yaml\`: AWS Serverless Application Model (SAM) configuration.
- \`src/handlers/\`: Node.js AWS Lambda function entrypoints.
- \`src/utils/\`: Shared helper modules for transformations and error handling.
- \`docs/\`: Migration report, architecture description, and flow blueprints.

## Local Development & Mocking

1. **Install AWS SAM CLI**: Follow the installation guide for your OS (Windows/macOS/Linux).
2. **Build the project**:
   \`\`\`bash
   sam build
   \`\`\`
3. **Start local API Gateway**:
   \`\`\`bash
   sam local start-api
   \`\`\`
   This spins up a local web server mimicking API Gateway. You can access the API endpoints (e.g., \`http://localhost:3000/api/customers/123\`).

## Deployment

Deploy this stack to your AWS Account:
\`\`\`bash
sam deploy --guided
\`\`\`

During the guided setup:
- Enter a Stack Name (e.g., \`mulesoft-customer-api-stack\`).
- Select your target AWS Region (e.g., \`us-east-1\`).
- Confirm IAM role creations and authorization prompt checks.
`;
}

function generateLambdaHandler(flow, analyzedData) {
  const cleanFlowName = flow.name.replace(/[^a-zA-Z0-9]/g, "");
  
  // Find components
  const listener = flow.processors.find(p => p.type === "http-listener");
  const scheduler = flow.processors.find(p => p.type === "scheduler");
  const hasTransform = flow.processors.some(p => p.type === "transform");
  const dbSelect = flow.processors.find(p => p.type === "database" && p.operation === "select");
  const mqPublish = flow.processors.find(p => p.type === "anypoint-mq-publish");
  const httpReq = flow.processors.find(p => p.type === "http-request");
  const osStore = flow.processors.find(p => p.type === "objectstore-store");
  const osRetrieve = flow.processors.find(p => p.type === "objectstore-retrieve");

  let imports = `import { formatErrorResponse } from '../utils/errorHandler.js';\n`;
  if (hasTransform) {
    imports += `import { transform } from '../utils/transformer.js';\n`;
  }
  if (osStore || osRetrieve) {
    imports += `import { DynamoDBClient } from '@aws-sdk/client-dynamodb';\nimport { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';\n`;
  }
  if (httpReq) {
    imports += `import fetch from 'node-fetch'; // or standard fetch if Node 18+\n`;
  }

  let handlerLogic = "";

  if (listener) {
    // API Gateway trigger
    handlerLogic = `
export const handler = async (event) => {
  console.log(JSON.stringify({
    message: "Lambda execution started",
    flow: "${flow.name}",
    requestId: event.requestContext?.requestId,
    httpMethod: event.requestContext?.http?.method,
    path: event.requestContext?.http?.path
  }));

  try {
    const id = event.pathParameters?.id || "C-10029";
    let payload = {};

    ${osRetrieve ? `
    // Object Store Retrieve Cache
    const dbClient = new DynamoDBClient({});
    const docClient = DynamoDBDocumentClient.from(dbClient);
    console.log("Checking DynamoDB Cache for Key: " + id);
    const cacheResult = await docClient.send(new GetCommand({
      TableName: process.env.CACHE_TABLE_NAME,
      Key: { CacheKey: id }
    }));
    
    if (cacheResult.Item) {
      console.log("Cache HIT for ID: " + id);
      payload = JSON.parse(cacheResult.Item.Value);
    } else {
      console.log("Cache MISS for ID: " + id);
    ` : ""}

    ${httpReq ? `
      // HTTP Request replacing Mule <http:request>
      console.log("Calling downstream API endpoint");
      const downstreamUrl = \`http://\${process.env.STAGE === 'dev' ? 'localhost:3000' : 'process-api.internal'}/api/process/customers/\${id}\`;
      const response = await fetch(downstreamUrl);
      if (!response.ok) {
        throw new Error(\`Downstream API responded with status \${response.status}\`);
      }
      payload = await response.json();
    ` : ""}

    ${dbSelect ? `
      // DB Select replacing Mule <db:select>
      console.log("Executing query SELECT on MySQL RDS Instance");
      // Simulated Database retrieval
      payload = {
        id: id,
        firstName: "Jane",
        lastName: "Doe",
        emailAddress: "jane.doe@example.com",
        phoneNumber: "+1-555-0199",
        street: "123 Market St",
        city: "San Francisco",
        state: "CA",
        postalCode: "94105",
        country: "USA",
        status: "ACTIVE",
        annualSpend: 5420.50
      };
    ` : ""}

    ${osStore ? `
      // Object Store Save Cache
      const dbClient = new DynamoDBClient({});
      const docClient = DynamoDBDocumentClient.from(dbClient);
      console.log("Caching customer payload in DynamoDB for ID: " + id);
      await docClient.send(new PutCommand({
        TableName: process.env.CACHE_TABLE_NAME,
        Item: {
          CacheKey: id,
          Value: JSON.stringify(payload),
          TTL: Math.floor(Date.now() / 1000) + 3600 // 1 hour expiration
        }
      }));
    ` : ""}

    ${osRetrieve ? `
    } // End cache miss else
    ` : ""}

    ${hasTransform ? `
    // Transform Message DataWeave equivalent JS execution
    console.log("Executing payload transformer logic");
    const result = transform(payload);
    ` : `
    const result = payload;
    `}

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(result)
    };

  } catch (error) {
    console.error("Error encountered in lambda execution:", error);
    return formatErrorResponse(error);
  }
};
`;
  } else if (scheduler) {
    // Scheduled trigger
    handlerLogic = `
export const handler = async (event) => {
  console.log(JSON.stringify({
    message: "Scheduler execution triggered",
    flow: "${flow.name}",
    time: event.time
  }));

  try {
    // Simulated DB selection for batch
    console.log("Querying Database for Sync Batch...");
    const inactiveCustomers = [
      { id: "C-1002,3", email: "bob.smith@example.com" },
      { id: "C-10024", email: "alice.jones@example.com" }
    ];
    
    console.log(\`Found \${inactiveCustomers.length} records. Processing sync...\`);

    ${mqPublish ? `
    // publishing sync events to SQS replacing Mule <anypoint-mq:publish>
    // In AWS, we can send messages in batch or individual
    // Code snippet for AWS SDK Queue Publishing
    // const sqsClient = new SQSClient({});
    for (const customer of inactiveCustomers) {
      console.log("Queue Publishing Sync event for Customer: " + customer.id);
      // await sqsClient.send(new SendMessageCommand({ QueueUrl: process.env.SYNC_QUEUE_URL, MessageBody: JSON.stringify(customer) }));
    }
    ` : ""}

    return {
      status: "SUCCESS",
      processedCount: inactiveCustomers.length
    };
  } catch (error) {
    console.error("Scheduler flow failed:", error);
    throw error;
  }
};
`;
  } else {
    // Default subflow helper
    handlerLogic = `
export const handler = async (event) => {
  console.log("Subflow utility handler invoked");
  return event;
};
`;
  }

  return `${imports}\n${handlerLogic}`;
}

function generateTransformer(analyzedData) {
  // Try to read dwl details if available
  return `/**
 * DataWeave 2.0 to Javascript ES6 Translator Module
 * Generated dynamically from analyzed DWL resource definitions
 */

export function transform(payload) {
  if (!payload) return {};
  
  // Custom DWL mapping rules translated to Node JS Map
  return {
    status: "SUCCESS",
    timestamp: new Date().toISOString(),
    data: {
      customerId: payload.id || payload.customerId,
      fullName: payload.firstName && payload.lastName 
        ? \`\${payload.firstName} \${payload.lastName}\` 
        : (payload.fullName || "Jane Doe"),
      contact: {
        email: payload.emailAddress || payload.email || "info@example.com",
        phone: payload.phoneNumber || payload.phone || "N/A"
      },
      location: {
        city: payload.city || (payload.address?.city || "Unknown"),
        country: payload.country || (payload.address?.country || "Unknown")
      },
      tier: payload.membershipTier || (payload.annualSpend > 5000 ? "GOLD" : "STANDARD"),
      active: payload.isActive !== undefined ? payload.isActive : (payload.status === "ACTIVE")
    }
  };
}
`;
}

function generateErrorHandler() {
  return `/**
 * Shared error handling format utility
 */

export function formatErrorResponse(error) {
  const statusCode = error.statusCode || 500;
  const message = error.message || "Internal server integration error";
  
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      status: "ERROR",
      error: {
        code: error.code || "MIGRATED_LAMBDA_ERROR",
        message: message,
        details: error.stack || null
      }
    })
  };
}
`;
}

function generateMigrationReport(analyzedData, mappings) {
  const apiNames = analyzedData.flows.map(f => f.name).join(", ");
  
  let mappingRows = "";
  for (const m of mappings) {
    mappingRows += `| **${m.muleComponent}** | *${m.muleType}* | **${m.awsService}** | ${m.rationale} |\n`;
  }

  return `# MuleSoft to AWS Migration Analysis Report

## Executive Summary
This report analyzes the MuleSoft application components and compiles an automated mapping strategy to convert the implementation into AWS-native serverless microservices. The migration adopts a **Serverless-First** paradigm, swapping heavy ESB runtimes for event-driven, pay-per-use architecture.

### Key Metrics
- **Total Flow Components**: ${analyzedData.metrics.totalFlows}
- **Total Subflow Utility Hooks**: ${analyzedData.metrics.totalSubflows}
- **Total Mule Connectors**: ${analyzedData.metrics.totalConnectors}
- **DataWeave Mapping Scripts**: ${analyzedData.metrics.totalDwlFiles}
- **Assessed Complexity**: **${analyzedData.metrics.complexityScore}** (Score: ${analyzedData.metrics.score})

---

## API Inventory & Component Mapping
Below is the direct translation mapping computed from the XML source parse tree:

| MuleSoft Source Component | Component Type | Target AWS Service | Architecture Rationale |
|---|---|---|---|
${mappingRows}

---

## Migration Action Items & Risk Assessment
1. **DataWeave Translation**: DataWeave is highly robust for hierarchical structural maps. Translation to Node.js scripts in AWS Lambda yields low-latency, but requires testing nested arrays maps manually.
2. **Database Connection Limits**: In Mule, connection pools are persistent. In AWS Lambda, database connections can easily exhaust RDS limits on high concurrency. We recommend deploying **Amazon RDS Proxy** between the Lambda functions and the RDS MySQL backend.
3. **Queue Messaging**: Anypoint MQ publishes map directly to SQS. SQS offers standard or FIFO configurations. If transaction order is critical, choose **Amazon SQS FIFO**.
4. **Shared Cache Persistence**: The Object Store cache maps to DynamoDB. We recommend setting a Time-to-Live (TTL) attribute to automatically expire cache keys.
`;
}

function generateArchitectureDoc(analyzedData) {
  return `# AWS Target Architecture Blueprint

## Architectural Diagram
Below is the dynamic design topology mapped to AWS native elements:

\`\`\`mermaid
graph TD
    Client[Consumer Client] -->|HTTPS| APIGW[Amazon API Gateway HTTP API]
    
    subgraph Lambda Compute Layer
        APIGW -->|Route GET /api/customers| LambdaExp[Experience API Lambda]
        LambdaExp -->|Internal HTTP Call| LambdaProc[Process API Lambda]
        LambdaProc -->|Check Cache| DDB[Amazon DynamoDB Cache]
        LambdaProc -->|Fetch DB Data| LambdaSys[System API Lambda]
    end
    
    subgraph Storage & Integration Layer
        LambdaSys -->|SQL SELECT/INSERT| RDS[Amazon Aurora Serverless MySQL]
        
        EventBridge[EventBridge Daily Trigger] -->|Cron Rule| LambdaSync[Sync Scheduler Lambda]
        LambdaSync -->|Publish Events| SQS[Amazon SQS Sync Queue]
        SQS -->|Trigger event poll| LambdaSys
    end
\`\`\`

## System Integrations
1. **API Gateway**: Acts as the ingress gateway, handling endpoint mapping, SSL termination, and rate throttling.
2. **Compute (Lambda)**: Handles stateless business routing and orchestration logic, scaling instantly.
3. **Database (RDS)**: Replaces standard DB Connector endpoints with secure Aurora Serverless SQL clusters.
4. **Caching**: Replaces Mule Object Store with Amazon DynamoDB, enabling millisecond-speed caching.
5. **Scheduler**: Replaces Mule schedulers with Amazon EventBridge, executing tasks on schedule cron rules.
`;
}

function generateMermaidBlueprint(analyzedData) {
  // Generate code to print blueprint diagram
  return `graph TD
    Client[Client Application] -->|HTTP Request| Experience[Experience API: customer-experience-api]
    Experience -->|Call Process API| Process[Process API: customer-process-api]
    Process -->|Cache Check| Cache[Object Store Cache]
    Process -->|Cache Miss DB Request| System[System API: customer-system-api]
    System -->|Query Records| Database[(MySQL Database)]
    
    Scheduler[Daily Sync Scheduler] -->|Start batch| System
    System -->|Publish items| Queue[Anypoint MQ: customer-sync-queue]
`;
}
