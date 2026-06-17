export function mapMuleToAws(analyzedData) {
  const mappings = [];
  if (!analyzedData) return mappings;

  const flows = analyzedData.flows || [];
  const subflows = analyzedData.subflows || [];
  const connectors = analyzedData.connectors || [];

  // Group flows into Triggers vs. Internal/Orchestration helper modules
  const entryPoints = [];
  const internalOrchestrations = [];

  for (const flow of flows) {
    const hasHttpListener = flow.processors.some(p => p.type === 'http-listener');
    const hasScheduler = flow.processors.some(p => p.type === 'scheduler');
    const hasQueueListener = flow.processors.some(p => p.type.includes('mq') || p.type.includes('vm'));

    if (hasHttpListener || hasScheduler || hasQueueListener) {
      entryPoints.push({
        flow,
        type: hasHttpListener ? 'http' : (hasScheduler ? 'scheduler' : 'queue'),
        listener: flow.processors.find(p => p.type === 'http-listener' || p.type === 'scheduler' || p.type.includes('mq') || p.type.includes('vm'))
      });
    } else {
      internalOrchestrations.push(flow);
    }
  }

  // 1. Map Triggers / Entry Points to API Gateway / EventBridge / SQS + Lambdas
  for (const ep of entryPoints) {
    const { flow, type, listener } = ep;
    const cleanFlowName = flow.name.replace(/[^a-zA-Z0-9]/g, "");

    if (type === 'http') {
      const path = listener.path || "/";
      const method = listener.method || "GET";
      mappings.push({
        sourceTrigger: `HTTP Listener exposing path '${path}' (${method})`,
        muleComponent: `HTTP Listener Trigger (Flow: ${flow.name})`,
        muleType: "Trigger",
        awsService: "Amazon API Gateway + AWS Lambda",
        recommendedAwsService: "Amazon API Gateway + AWS Lambda",
        awsType: "Ingress",
        rationale: `The HTTP Listener exposing '${path}' (${method}) is mapped to an Amazon API Gateway HTTP API route proxying to a dedicated AWS Lambda function.`,
        reason: `Exposes public REST endpoint. API Gateway routes requests to Lambda compute.`,
        migrationComplexity: "LOW",
        generatedCodeArtifact: `src/handlers/${cleanFlowName}.js & template.yaml`,
        awsCode: `${cleanFlowName}Function:\n  Type: AWS::Serverless::Function\n  Properties:\n    Handler: src/handlers/${cleanFlowName}.handler\n    Runtime: nodejs18.x\n    Events:\n      ApiRoute:\n        Type: HttpApi\n        Properties:\n          Path: ${path}\n          Method: ${method}`
      });
    } else if (type === 'scheduler') {
      mappings.push({
        sourceTrigger: `Scheduler Trigger (Flow: ${flow.name})`,
        muleComponent: `Scheduler Trigger (Flow: ${flow.name})`,
        muleType: "Trigger",
        awsService: "Amazon EventBridge + AWS Lambda",
        recommendedAwsService: "Amazon EventBridge + AWS Lambda",
        awsType: "Event",
        rationale: `The periodic flow Scheduler is mapped to an Amazon EventBridge Schedule rule triggering the target AWS Lambda function.`,
        reason: `Periodic execution logic. EventBridge rules trigger Lambda on a scheduled interval.`,
        migrationComplexity: "LOW",
        generatedCodeArtifact: `template.yaml (Events::Rule)`,
        awsCode: `${cleanFlowName}Rule:\n  Type: AWS::Events::Rule\n  Properties:\n    Name: ${cleanFlowName}Scheduler\n    ScheduleExpression: "rate(1 hour)"\n    State: ENABLED\n    Targets:\n      - Arn: !GetAtt ${cleanFlowName}Function.Arn\n        Id: "${cleanFlowName}Target"`
      });
    } else if (type === 'queue') {
      mappings.push({
        sourceTrigger: `Anypoint MQ listener / subscriber in Flow ${flow.name}`,
        muleComponent: `Queue Listener Trigger (Flow: ${flow.name})`,
        muleType: "Trigger",
        awsService: "Amazon SQS + AWS Lambda Trigger",
        recommendedAwsService: "Amazon SQS Queue + AWS Lambda Trigger",
        awsType: "Messaging",
        rationale: `The Anypoint MQ/VM message listener is mapped to an Amazon SQS Queue trigger invoking the AWS Lambda function.`,
        reason: `Asynchronous message consumer. SQS events trigger Lambda worker dynamically.`,
        migrationComplexity: "MEDIUM",
        generatedCodeArtifact: `src/handlers/${cleanFlowName}.js & template.yaml`,
        awsCode: `${cleanFlowName}QueueTrigger:\n  Type: AWS::Serverless::Function\n  Properties:\n    Handler: src/handlers/${cleanFlowName}.handler\n    Events:\n      QueueEvent:\n        Type: SQS\n        Properties:\n          Queue: !GetAtt ${cleanFlowName}Queue.Arn\n          BatchSize: 10`
      });
    }
  }

  // 2. Map Internal Flows (with no triggers) to Internal Functions
  for (const flow of internalOrchestrations) {
    const cleanFlowName = flow.name.replace(/[^a-zA-Z0-9]/g, "");
    mappings.push({
      sourceTrigger: `Internal Subroutine: ${flow.name}`,
      muleComponent: `Orchestration Flow: ${flow.name}`,
      muleType: "Orchestration Logic",
      awsService: "Lambda Internal Function / Module",
      recommendedAwsService: "AWS Lambda Internal Function",
      awsType: "Compute",
      rationale: `Mule flows without triggers act as internal orchestration subroutines. Instead of separate Lambdas, they are converted into internal functions/helper modules within the parent Lambda handler environment.`,
      reason: `Consolidating sub-flows and orchestration flows into single Lambda modules avoids cold start overhead and lowers costs.`,
      migrationComplexity: "MEDIUM",
      generatedCodeArtifact: `src/handlers/ (internal helper function)`,
      awsCode: `// Internal Orchestration function inside AWS Lambda handler\nasync function ${flow.name}(event, context) {\n  // Orchestration logic goes here\n  // ...\n}`
    });
  }

  // 3. Process Sub-flows -> Helper Functions
  for (const sf of subflows) {
    const cleanSfName = sf.name.replace(/[^a-zA-Z0-9]/g, "");
    mappings.push({
      sourceTrigger: `Reusable helper block: ${sf.name}`,
      muleComponent: `Sub-flow: ${sf.name}`,
      muleType: "Sub-Flow",
      awsService: "Lambda Helper Module / Shared Code",
      recommendedAwsService: "JavaScript Shared Module / Utility",
      awsType: "Compute",
      rationale: `Subflows act as reusable utility subroutines in MuleSoft. They are translated into utility JavaScript functions imported by Lambda handlers.`,
      reason: `Reusable logic subroutines should become standard ES6 function utilities loaded by multiple trigger handlers.`,
      migrationComplexity: "LOW",
      generatedCodeArtifact: `src/utils/${sf.name}.js`,
      awsCode: `// Imported utility function in Lambda Handler\nimport { ${cleanSfName} } from '../utils/${sf.name}.js';\n\n// Trigger utility\nconst enrichedData = await ${cleanSfName}(payload);`
    });
  }

  // 4. Look for DataWeave transforms
  for (const flow of flows) {
    const transforms = flow.processors.filter(p => p.type === 'transform');
    for (const trans of transforms) {
      const resourceName = trans.resource.split("/").pop().replace(".dwl", "");
      mappings.push({
        sourceTrigger: `Data transformation in Flow ${flow.name}`,
        muleComponent: `Transform Message: ${trans.name} (${trans.resource})`,
        muleType: "Processor",
        awsService: "Lambda JS Transform helper function",
        recommendedAwsService: "JavaScript map() helper function",
        awsType: "Logic",
        rationale: `MuleSoft DataWeave (.dwl) mapping converted to a native Node.js/JavaScript map function inside the Lambda execution environment.`,
        reason: `Replaces proprietary DataWeave engine with native Node.js functional map transforms for low latency.`,
        migrationComplexity: "MEDIUM",
        generatedCodeArtifact: `src/utils/${resourceName || "transform"}.js`,
        awsCode: `// Translated from DWL: ${trans.resource}\nexport function transform(payload) {\n  return {\n    status: "SUCCESS",\n    timestamp: new Date().toISOString(),\n    data: {\n      customerId: payload.id,\n      fullName: \`\${payload.firstName} \${payload.lastName}\`\n    }\n  };\n}`
      });
    }
  }

  // 5. Look for Object Store -> DynamoDB
  const osProc = [];
  for (const flow of flows) {
    const procs = flow.processors.filter(p => p.type.startsWith('objectstore-'));
    osProc.push(...procs);
  }
  if (osProc.length > 0 || connectors.includes("Object Store")) {
    mappings.push({
      sourceTrigger: `Key-value cache state store / retrieve`,
      muleComponent: "Object Store Cache",
      muleType: "Connector",
      awsService: "Amazon DynamoDB (Cache)",
      recommendedAwsService: "Amazon DynamoDB / ElastiCache",
      awsType: "Storage",
      rationale: "Provides shared key-value cache lookup state. DynamoDB provides low-latency key-value records persistence with automatic TTL configuration to clear expired entries.",
      reason: `Provides millisecond latency distributed cache persistence. DynamoDB TTL handles cache expiration natively.`,
      migrationComplexity: "LOW",
      generatedCodeArtifact: `template.yaml (DynamoDB::Table)`,
      awsCode: `CustomerCacheTable:\n  Type: AWS::DynamoDB::Table\n  Properties:\n    TableName: customer-cache-store\n    AttributeDefinitions:\n      - AttributeName: CacheKey\n        AttributeType: S\n    KeySchema:\n      - AttributeName: CacheKey\n        KeyType: HASH\n    TimeToLiveSpecification:\n      AttributeName: TTL\n      Enabled: true`
    });
  }

  // 6. Database Connector -> RDS / DynamoDB
  const dbProc = [];
  for (const flow of flows) {
    const procs = flow.processors.filter(p => p.type === 'database');
    dbProc.push(...procs);
  }
  if (dbProc.length > 0 || connectors.includes("Database")) {
    mappings.push({
      sourceTrigger: `Relational SQL queries execution`,
      muleComponent: "Database Connector",
      muleType: "Connector",
      awsService: "Amazon RDS / Aurora Serverless",
      recommendedAwsService: "Amazon Aurora Serverless v2 + RDS Proxy",
      awsType: "Database",
      rationale: "Relational database connection. Migrated to Amazon Aurora Serverless with database credentials securely stored in AWS Secrets Manager.",
      reason: `Aurora Serverless scales compute based on load, while RDS Proxy handles connection pooling from stateless Lambdas.`,
      migrationComplexity: "MEDIUM",
      generatedCodeArtifact: `template.yaml & database client`,
      awsCode: `import mysql from 'mysql2/promise';\n\nconst connection = await mysql.createConnection({\n  host: process.env.DB_HOST,\n  user: process.env.DB_USER,\n  password: process.env.DB_PASSWORD,\n  database: process.env.DB_NAME\n});\nconst [rows] = await connection.execute('SELECT * FROM customers WHERE id = ?', [id]);`
    });
  }

  // 7. MQ / Messaging -> SQS
  const mqProc = [];
  for (const flow of flows) {
    const procs = flow.processors.filter(p => p.type.startsWith('anypoint-mq'));
    mqProc.push(...procs);
  }
  if (mqProc.length > 0 || connectors.includes("Anypoint MQ") || connectors.includes("VM")) {
    mappings.push({
      sourceTrigger: `Message publishing / event broadcasting`,
      muleComponent: "Anypoint MQ / VM Queue Connector",
      muleType: "Connector",
      awsService: "Amazon SQS (Simple Queue Service)",
      recommendedAwsService: "Amazon SQS (Simple Queue Service)",
      awsType: "Messaging",
      rationale: "Enterprise messaging queue publishing. Mapped to Amazon SQS standard/FIFO queue with AWS Lambda event source triggers to process messages asynchronously.",
      reason: `Stateless, fully-managed messaging queue to decouple microservices and process events asynchronously.`,
      migrationComplexity: "LOW",
      generatedCodeArtifact: `template.yaml (SQS::Queue)`,
      awsCode: `CustomerSyncQueue:\n  Type: AWS::SQS::Queue\n  Properties:\n    QueueName: customer-sync-queue\n    VisibilityTimeout: 30`
    });
  }

  // 8. Logger -> CloudWatch Logs
  mappings.push({
    sourceTrigger: `Application logging / monitoring`,
    muleComponent: "Logger component",
    muleType: "Processor",
    awsService: "Amazon CloudWatch Logs",
    recommendedAwsService: "Amazon CloudWatch Logs",
    awsType: "Monitoring",
    rationale: "Mule logger statements map to standard Node.js console.log() statements, which are automatically captured by Amazon CloudWatch Logs for logging and analytics.",
    reason: `Standard runtime logs are automatically captured by CloudWatch from standard outputs, avoiding custom logging connector overlays.`,
    migrationComplexity: "LOW",
    generatedCodeArtifact: `src/handlers/ (console.log calls)`,
    awsCode: `console.log(JSON.stringify({\n  message: "Received GET request for customer ID",\n  level: "INFO",\n  timestamp: new Date().toISOString(),\n  context: { customerId: id }\n}));`
  });

  return mappings;
}
