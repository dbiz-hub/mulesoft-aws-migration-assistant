export function mapMuleToAws(analyzedData) {
  const mappings = [];
  
  // 1. Process HTTP Listeners -> API Gateway
  const listeners = [];
  for (const flow of analyzedData.flows) {
    const listenerProc = flow.processors.find(p => p.type === 'http-listener');
    if (listenerProc) {
      listeners.push({ flowName: flow.name, ...listenerProc });
    }
  }
  
  for (const listener of listeners) {
    mappings.push({
      muleComponent: `HTTP Listener (${listener.path})`,
      muleType: "Connector",
      awsService: "Amazon API Gateway (HTTP API)",
      awsType: "Gateway",
      rationale: `Exposes HTTP REST endpoint '${listener.path}' with allowed methods [${listener.method}]. API Gateway handles routing and rate limiting, proxying requests to AWS Lambda.`,
      awsCode: `CustomerApiRoute:\n  Type: AWS::Serverless::HttpApi\n  Properties:\n    StageName: dev\n    CorsConfiguration:\n      AllowOrigins:\n        - '*'\n      AllowMethods:\n        - ${listener.method.split(",").join("\n        - ")}`
    });
  }

  // 2. Process Flows -> AWS Lambda
  for (const flow of analyzedData.flows) {
    const cleanFlowName = flow.name.replace(/[^a-zA-Z0-9]/g, "");
    mappings.push({
      muleComponent: `Flow: ${flow.name}`,
      muleType: "Flow",
      awsService: "AWS Lambda",
      awsType: "Compute",
      rationale: `Encapsulates flow orchestration and processing logic. Replaced by an AWS Lambda function running Node.js handler code.`,
      awsCode: `${cleanFlowName}Function:\n  Type: AWS::Serverless::Function\n  Properties:\n    Handler: src/handlers/${flow.name}.handler\n    Runtime: nodejs18.x\n    Events:\n      ApiEvent:\n        Type: HttpApi\n        Properties:\n          Path: /api/customers/{id}\n          Method: GET`
    });
  }
  
  // 3. Process Sub-flows -> AWS Lambda Helper Functions
  for (const sf of analyzedData.subflows) {
    const cleanSfName = sf.name.replace(/[^a-zA-Z0-9]/g, "");
    mappings.push({
      muleComponent: `Sub-flow: ${sf.name}`,
      muleType: "Sub-Flow",
      awsService: "AWS Lambda (Utility Module)",
      awsType: "Compute",
      rationale: `Subflows act as reusable utility logic. Replaced by a module helper function or nested Lambda functions depending on modularity requirements.`,
      awsCode: `// Imported utility function in Lambda Handler\nimport { ${cleanSfName} } from '../utils/${sf.name}.js';\n\n// Trigger utility\nconst enrichedData = await ${cleanSfName}(payload);`
    });
  }

  // 4. Look for DataWeave transforms
  let dwCount = 0;
  for (const flow of analyzedData.flows) {
    const transforms = flow.processors.filter(p => p.type === 'transform');
    for (const trans of transforms) {
      dwCount++;
      const resourceName = trans.resource.split("/").pop().replace(".dwl", "");
      mappings.push({
        muleComponent: `Transform Message: ${trans.name} (${trans.resource})`,
        muleType: "Processor",
        awsService: "AWS Lambda (JS Transform Module)",
        awsType: "Logic",
        rationale: `MuleSoft DataWeave (.dwl) mapping converted to a native Node.js/JavaScript map function or using JSONata inside the Lambda execution environment.`,
        awsCode: `// Translated from ${trans.resource}\nexport function transform(payload) {\n  return {\n    status: "SUCCESS",\n    timestamp: new Date().toISOString(),\n    data: {\n      customerId: payload.id,\n      fullName: \`\${payload.firstName} \${payload.lastName}\`,\n      active: payload.status === "ACTIVE"\n    }\n  };\n}`
      });
    }
  }

  // 5. Look for Object Store
  const osProc = [];
  for (const flow of analyzedData.flows) {
    const procs = flow.processors.filter(p => p.type.startsWith('objectstore-'));
    osProc.push(...procs);
  }
  if (osProc.length > 0 || analyzedData.connectors.includes("Object Store")) {
    mappings.push({
      muleComponent: "Object Store Cache",
      muleType: "Connector",
      awsService: "Amazon DynamoDB (Cache)",
      awsType: "Storage",
      rationale: "Provides shared key-value lookup state. DynamoDB provides low-latency persistence for key-value records with automatic TTL configuration to clear expired sessions.",
      awsCode: `CustomerCacheTable:\n  Type: AWS::DynamoDB::Table\n  Properties:\n    TableName: customer-cache-store\n    AttributeDefinitions:\n      - AttributeName: CacheKey\n        AttributeType: S\n    KeySchema:\n      - AttributeName: CacheKey\n        KeyType: HASH\n    TimeToLiveSpecification:\n      AttributeName: TTL\n      Enabled: true`
    });
  }

  // 6. Database Connector -> RDS / DynamoDB Query
  const dbProc = [];
  for (const flow of analyzedData.flows) {
    const procs = flow.processors.filter(p => p.type === 'database');
    dbProc.push(...procs);
  }
  if (dbProc.length > 0 || analyzedData.connectors.includes("Database")) {
    mappings.push({
      muleComponent: "Database Select/Insert Connector",
      muleType: "Connector",
      awsService: "Amazon RDS / Aurora Serverless",
      awsType: "Database",
      rationale: "Relational database connection. Migrated to Amazon Aurora Serverless (MySQL/PostgreSQL) with database credentials securely stored in AWS Secrets Manager.",
      awsCode: `import mysql from 'mysql2/promise';\n\nconst connection = await mysql.createConnection({\n  host: process.env.DB_HOST,\n  user: process.env.DB_USER,\n  password: process.env.DB_PASSWORD,\n  database: process.env.DB_NAME\n});\nconst [rows] = await connection.execute('SELECT * FROM customers WHERE id = ?', [id]);`
    });
  }

  // 7. MQ / Messaging -> SQS
  const mqProc = [];
  for (const flow of analyzedData.flows) {
    const procs = flow.processors.filter(p => p.type.startsWith('anypoint-mq'));
    mqProc.push(...procs);
  }
  if (mqProc.length > 0 || analyzedData.connectors.includes("Anypoint MQ")) {
    mappings.push({
      muleComponent: "Anypoint MQ Connector",
      muleType: "Connector",
      awsService: "Amazon SQS (Simple Queue Service)",
      awsType: "Messaging",
      rationale: "Enterprise messaging queue publishing. Mapped to Amazon SQS standard/FIFO queue with AWS Lambda event source triggers to process messages asynchronously.",
      awsCode: `CustomerSyncQueue:\n  Type: AWS::SQS::Queue\n  Properties:\n    QueueName: customer-sync-queue\n    VisibilityTimeout: 30\n    RedrivePolicy:\n      deadLetterTargetArn: !GetAtt DLQ.Arn\n      maxReceiveCount: 3`
    });
  }

  // 8. Scheduler -> EventBridge
  let schedCount = 0;
  for (const flow of analyzedData.flows) {
    const scheds = flow.processors.filter(p => p.type === 'scheduler');
    if (scheds.length > 0) {
      schedCount++;
      mappings.push({
        muleComponent: `Scheduler Flow Trigger (${flow.name})`,
        muleType: "Trigger",
        awsService: "Amazon EventBridge Scheduler",
        awsType: "Event",
        rationale: "Triggers flows periodically. Mapped to an EventBridge Scheduled Rule targeting the corresponding Lambda function (cron scheduler rate).",
        awsCode: `DailyTriggerRule:\n  Type: AWS::Events::Rule\n  Properties:\n    Name: DailySyncScheduler\n    ScheduleExpression: "rate(1 day)"\n    State: ENABLED\n    Targets:\n      - Arn: !GetAtt SyncFunction.Arn\n        Id: "SyncFunctionTarget"`
      });
    }
  }

  // 9. Error Handler -> Lambda try-catch + SQS DLQ
  let hasErrors = false;
  for (const flow of analyzedData.flows) {
    if (flow.hasErrorHandler) hasErrors = true;
  }
  if (hasErrors) {
    mappings.push({
      muleComponent: "Mule Error Handler (On-Error-Propagate / Continue)",
      muleType: "Logic",
      awsService: "Lambda try-catch + SQS DLQ",
      awsType: "Resilience",
      rationale: "Mule error handling scopes are mapped to JavaScript native try-catch-finally blocks, and failed queue items are automatically sent to SQS Dead Letter Queues.",
      awsCode: `try {\n  const data = await getCustomerFromDB(id);\n} catch (error) {\n  console.error("DB Query failed:", error);\n  if (error.name === 'CUSTOMER_NOT_FOUND') {\n    return { statusCode: 404, body: JSON.stringify({ message: "Customer not found" }) };\n  }\n  throw error; // Throw triggers SQS redrive policy / DLQ\n}`
    });
  }

  // 10. Security policies -> API Gateway Cognito/WAF
  if (analyzedData.properties["security.policy"] === "client-id-enforcement" || analyzedData.properties["security.token-validate"] === "true") {
    mappings.push({
      muleComponent: "Security Policy: Client ID Enforcement / API Manager",
      muleType: "Policy",
      awsService: "Amazon API Gateway Cognito Authorizer / WAF",
      awsType: "Security",
      rationale: "Secures API endpoints. Mapped to Amazon API Gateway JWT Authorizer verifying tokens via Cognito User Pools, and AWS WAF filtering request payloads.",
      awsCode: `ApiCognitoAuthorizer:\n  Type: AWS::ApiGatewayV2::Authorizer\n  Properties:\n    ApiId: !Ref CustomerApi\n    AuthorizerType: JWT\n    Name: CognitoAuth\n    IdentitySource:\n      - '$request.header.Authorization'\n    JwtConfiguration:\n      Audience:\n        - !Ref CognitoClientId\n      Issuer: !GetAtt CognitoUserPool.ProviderURL`
    });
  }

  // Add Default Logging
  mappings.push({
    muleComponent: "Logger component",
    muleType: "Processor",
    awsService: "Amazon CloudWatch Logs",
    awsType: "Monitoring",
    rationale: "Mule logger statements map to standard Node.js console.log() statements, which are automatically captured by Amazon CloudWatch Logs for logging and analytics.",
    awsCode: `console.log(JSON.stringify({\n  message: "Received GET request for customer ID",\n  level: "INFO",\n  timestamp: new Date().toISOString(),\n  context: { customerId: id }\n}));`
  });

  return mappings;
}
