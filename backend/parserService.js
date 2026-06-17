import xml2js from "xml2js";
import yaml from "js-yaml";

// Helper to recursively find processors in a flow element
function extractProcessors(element, processors = []) {
  if (!element || typeof element !== "object") return processors;

  // If it's an array, iterate items
  if (Array.isArray(element)) {
    for (const item of element) {
      extractProcessors(item, processors);
    }
    return processors;
  }

  // Check key names (namespaces are preserved by xml2js or prefixed)
  for (const key of Object.keys(element)) {
    // Check if it is a processor we care about
    if (key.includes("listener") && !key.includes("config")) {
      const details = element[key][0]?.$;
      processors.push({
        type: "http-listener",
        name: details?.doc_name || details?.name || "HTTP Listener",
        path: details?.path || "/",
        method: details?.allowedMethods || "ALL",
        configRef: details?.["config-ref"]
      });
    } else if (key.includes("request") && !key.includes("config")) {
      const details = element[key][0]?.$;
      processors.push({
        type: "http-request",
        name: details?.doc_name || details?.name || "HTTP Request",
        path: details?.path || "/",
        method: details?.method || "GET",
        configRef: details?.["config-ref"]
      });
    } else if (key.includes("transform")) {
      const details = element[key][0]?.$;
      // Check if it references a file
      let resource = null;
      const setPayload = element[key][0]?.["ee:message"]?.[0]?.["ee:set-payload"]?.[0];
      if (setPayload) {
        resource = setPayload.$?.resource;
      }
      processors.push({
        type: "transform",
        name: details?.doc_name || "Transform Message",
        resource: resource || "inline"
      });
    } else if (key.includes("logger")) {
      const details = element[key][0]?.$;
      processors.push({
        type: "logger",
        name: details?.doc_name || "Logger",
        level: details?.level || "INFO",
        message: details?.message || ""
      });
    } else if (key.includes("choice")) {
      processors.push({
        type: "choice",
        name: element[key][0]?.$?.doc_name || "Choice Router"
      });
      // Recurse down choice branches (when and otherwise)
      if (element[key][0]?.when) {
        for (const w of element[key][0].when) {
          extractProcessors(w, processors);
        }
      }
      if (element[key][0]?.otherwise) {
        extractProcessors(element[key][0].otherwise, processors);
      }
    } else if (key.includes("select") || key.includes("insert") || key.includes("update") || key.includes("delete")) {
      const details = element[key][0]?.$;
      const queryType = key.split(":").pop();
      processors.push({
        type: "database",
        operation: queryType,
        name: details?.doc_name || `DB ${queryType}`,
        configRef: details?.["config-ref"]
      });
    } else if (key.includes("store") && key.includes("os:")) {
      const details = element[key][0]?.$;
      processors.push({
        type: "objectstore-store",
        name: details?.doc_name || "ObjectStore Store",
        key: details?.key
      });
    } else if (key.includes("retrieve") && key.includes("os:")) {
      const details = element[key][0]?.$;
      processors.push({
        type: "objectstore-retrieve",
        name: details?.doc_name || "ObjectStore Retrieve",
        key: details?.key
      });
    } else if (key.includes("contains") && key.includes("os:")) {
      const details = element[key][0]?.$;
      processors.push({
        type: "objectstore-contains",
        name: details?.doc_name || "ObjectStore Contains",
        key: details?.key
      });
    } else if (key.includes("publish") && key.includes("mq")) {
      const details = element[key][0]?.$;
      processors.push({
        type: "anypoint-mq-publish",
        name: details?.doc_name || "MQ Publish",
        destination: details?.destination
      });
    } else if (key.includes("scheduler")) {
      processors.push({
        type: "scheduler",
        name: "Scheduler"
      });
    } else if (key.includes("foreach")) {
      processors.push({
        type: "foreach",
        name: element[key][0]?.$?.doc_name || "For Each Loop"
      });
      extractProcessors(element[key][0], processors);
    } else if (key !== "$" && typeof element[key] === "object") {
      // Recurse into other tags (like sub-elements, error-handlers, etc.)
      extractProcessors(element[key], processors);
    }
  }

  return processors;
}

export async function parseMuleXml(xmlContent) {
  try {
    const parser = new xml2js.Parser({ tagNameProcessors: [xml2js.processors.stripPrefix] });
    const result = await parser.parseStringPromise(xmlContent);
    
    // Parse without stripping prefixes for exact connector metadata
    const parserNoStrip = new xml2js.Parser();
    const resultNoStrip = await parserNoStrip.parseStringPromise(xmlContent);

    const muleNode = result?.mule;

    if (!muleNode) return null;

    const flows = [];
    const subflows = [];
    const globalConfigs = [];

    // Extract global configs
    const configKeys = Object.keys(muleNode).filter(k => k.endsWith("-config") || k.includes("config"));
    for (const key of configKeys) {
      const items = muleNode[key];
      if (Array.isArray(items)) {
        for (const item of items) {
          globalConfigs.push({
            type: key,
            name: item.$?.name || item.$?.doc_name || "Config",
            details: item.$ || {}
          });
        }
      }
    }

    // Extract flows
    if (muleNode.flow) {
      for (const f of muleNode.flow) {
        const flowName = f.$?.name;
        const flowProcessors = extractProcessors(f);
        
        // Check for error handler
        const hasErrorHandler = !!f["error-handler"];

        flows.push({
          name: flowName,
          processors: flowProcessors,
          hasErrorHandler
        });
      }
    }

    // Extract subflows
    if (muleNode["sub-flow"]) {
      for (const sf of muleNode["sub-flow"]) {
        const subflowName = sf.$?.name;
        const subflowProcessors = extractProcessors(sf);
        subflows.push({
          name: subflowName,
          processors: subflowProcessors
        });
      }
    }

    return { flows, subflows, globalConfigs, rawXmlObj: resultNoStrip };
  } catch (error) {
    console.error("XML Parsing Error:", error);
    return null;
  }
}

export function parseRaml(ramlContent) {
  try {
    const cleanContent = ramlContent.replace(/^#%RAML[^\n]*/, "");
    const doc = yaml.load(cleanContent);
    
    const endpoints = [];
    
    function traverse(obj, path = "") {
      if (!obj || typeof obj !== "object") return;
      
      for (const key of Object.keys(obj)) {
        if (key.startsWith("/")) {
          const currentPath = path + key;
          
          const methods = [];
          for (const innerKey of Object.keys(obj[key])) {
            if (["get", "post", "put", "delete", "patch", "options"].includes(innerKey.toLowerCase())) {
              methods.push(innerKey.toUpperCase());
            }
          }
          
          endpoints.push({
            path: currentPath,
            methods,
            description: obj[key].description || ""
          });
          
          traverse(obj[key], currentPath);
        }
      }
    }
    
    traverse(doc);
    return { title: doc.title || "Mule API", version: doc.version || "1.0", endpoints };
  } catch (e) {
    console.error("Failed to parse RAML:", e);
    return { title: "API Spec", version: "unknown", endpoints: [] };
  }
}

export function parseProperties(content) {
  const properties = {};
  try {
    const doc = yaml.load(content);
    if (doc && typeof doc === "object") {
      function flatten(obj, prefix = "") {
        for (const k of Object.keys(obj)) {
          const val = obj[k];
          const fullKey = prefix ? `${prefix}.${k}` : k;
          if (val && typeof val === "object" && !Array.isArray(val)) {
            flatten(val, fullKey);
          } else {
            properties[fullKey] = String(val);
          }
        }
      }
      flatten(doc);
      return properties;
    }
  } catch (e) {
    // Fallback
  }

  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
      const idx = trimmed.indexOf("=");
      const k = trimmed.substring(0, idx).trim();
      const v = trimmed.substring(idx + 1).trim();
      properties[k] = v;
    }
  }
  return properties;
}

// Helper to recursively find and catalog Mule components in un-stripped XML trees
function findMetadataNodes(obj, evidence, currentFlow = null) {
  if (!obj || typeof obj !== "object") return;

  if (Array.isArray(obj)) {
    for (const item of obj) {
      findMetadataNodes(item, evidence, currentFlow);
    }
    return;
  }

  for (const key of Object.keys(obj)) {
    const cleanKey = key.split(":").pop();
    const element = obj[key];

    let nextFlow = currentFlow;
    if (cleanKey === "flow" || cleanKey === "sub-flow") {
      const name = element[0]?.$?.name || "unnamed";
      nextFlow = name;
      if (cleanKey === "flow") {
        if (!evidence.flows.includes(name)) evidence.flows.push(name);
      } else {
        if (!evidence.subflows.includes(name)) evidence.subflows.push(name);
      }
    }

    // HTTP Listener
    if (cleanKey === "listener" && key.startsWith("http:")) {
      const details = element[0]?.$;
      evidence.httpListeners.push({
        path: details?.path || "/",
        method: details?.allowedMethods || "ALL",
        configRef: details?.["config-ref"] || "",
        flow: nextFlow
      });
      if (!evidence.connectors.includes("HTTP Listener")) {
        evidence.connectors.push("HTTP Listener");
      }
    }

    // Scheduler
    if (cleanKey === "scheduler") {
      const scheduleStrategy = element[0]?.["scheduling-strategy"]?.[0];
      let detailsText = "Scheduled";
      if (scheduleStrategy?.["fixed-frequency"]) {
        const freq = scheduleStrategy["fixed-frequency"][0]?.$;
        detailsText = `Fixed Frequency: ${freq?.frequency} ${freq?.timeUnit}`;
      } else if (scheduleStrategy?.cron) {
        const cron = scheduleStrategy.cron[0]?.$;
        detailsText = `Cron: ${cron?.expression}`;
      }
      evidence.schedulers.push({
        name: element[0]?.$?.doc_name || element[0]?.$?.name || "Scheduler",
        schedule: detailsText,
        flow: nextFlow
      });
      if (!evidence.connectors.includes("Scheduler")) {
        evidence.connectors.push("Scheduler");
      }
    }

    // DataWeave / Transform
    if ((cleanKey === "transform" || cleanKey === "transform-message") && key.startsWith("ee:")) {
      const details = element[0]?.$;
      let resource = "inline";
      let inlineCode = "";

      const setPayload = element[0]?.["ee:message"]?.[0]?.["ee:set-payload"]?.[0] || element[0]?.["message"]?.[0]?.["set-payload"]?.[0] || element[0]?.["set-payload"]?.[0];
      if (setPayload) {
        if (setPayload.$?.resource) {
          resource = setPayload.$?.resource;
        } else if (setPayload._) {
          inlineCode = setPayload._.trim();
        }
      }

      evidence.dataweaves.push({
        name: details?.doc_name || "Transform Message",
        resource,
        inlineCode: inlineCode ? (inlineCode.substring(0, 150) + "...") : null,
        flow: nextFlow
      });
      if (!evidence.connectors.includes("DataWeave / Transform")) {
        evidence.connectors.push("DataWeave / Transform");
      }
    }

    // Database Connectors
    if (key.startsWith("db:") && ["select", "insert", "update", "delete", "bulk-insert", "bulk-update", "bulk-delete", "execute-ddl"].includes(cleanKey)) {
      evidence.databaseConnectors.push({
        operation: cleanKey,
        configRef: element[0]?.$?.["config-ref"] || "",
        flow: nextFlow
      });
      if (!evidence.connectors.includes("Database")) {
        evidence.connectors.push("Database");
      }
    }

    // Salesforce Connectors
    if (key.startsWith("salesforce:")) {
      evidence.salesforceConnectors.push({
        operation: cleanKey,
        configRef: element[0]?.$?.["config-ref"] || "",
        flow: nextFlow
      });
      if (!evidence.connectors.includes("Salesforce")) {
        evidence.connectors.push("Salesforce");
      }
    }

    // MQ / VM Messaging Connectors
    if (key.startsWith("anypoint-mq:") || key.startsWith("vm:") || key.startsWith("jms:")) {
      const type = key.split(":")[0];
      evidence.mqConnectors.push({
        type,
        operation: cleanKey,
        destination: element[0]?.$?.destination || element[0]?.$?.queue || "",
        flow: nextFlow
      });
      const connName = type === "anypoint-mq" ? "Anypoint MQ" : (type === "vm" ? "VM Queue" : "JMS Broker");
      if (!evidence.connectors.includes(connName)) {
        evidence.connectors.push(connName);
      }
    }

    // File System / FTP Connectors
    if (key.startsWith("file:") || key.startsWith("ftp:") || key.startsWith("sftp:")) {
      const type = key.split(":")[0];
      evidence.fileConnectors.push({
        type,
        operation: cleanKey,
        path: element[0]?.$?.path || element[0]?.$?.directory || "",
        flow: nextFlow
      });
      const connName = type === "file" ? "File System" : (type === "ftp" ? "FTP Server" : "SFTP Server");
      if (!evidence.connectors.includes(connName)) {
        evidence.connectors.push(connName);
      }
    }

    // Object Store
    if (key.startsWith("os:") && ["store", "retrieve", "clear", "contains", "remove"].includes(cleanKey)) {
      evidence.objectStoreUsage.push({
        operation: cleanKey,
        key: element[0]?.$?.key || "",
        objectStore: element[0]?.$?.objectStore || "",
        flow: nextFlow
      });
      if (!evidence.connectors.includes("Object Store")) {
        evidence.connectors.push("Object Store");
      }
    }

    // Error Handlers
    if (cleanKey === "error-handler" || cleanKey === "on-error-propagate" || cleanKey === "on-error-continue") {
      evidence.errorHandlers.push({
        type: cleanKey,
        name: element[0]?.$?.name || element[0]?.$?.doc_name || "Error Scope",
        typePattern: element[0]?.$?.type || "ALL",
        flow: nextFlow
      });
    }

    // External Endpoint calls (HTTP requests)
    if (cleanKey === "request" && key.startsWith("http:")) {
      const details = element[0]?.$;
      evidence.externalEndpoints.push({
        path: details?.path || "/",
        method: details?.method || "GET",
        configRef: details?.["config-ref"] || "",
        flow: nextFlow
      });
    }

    if (typeof element === "object") {
      findMetadataNodes(element, evidence, nextFlow);
    }
  }
}

export async function analyzeRepository(files) {
  let totalFlows = 0;
  let totalSubflows = 0;
  let totalConnectors = 0;
  let totalDwlFiles = 0;
  let complexityScore = "LOW";
  let flowsList = [];
  let subflowsList = [];
  let connectorTypes = new Set();
  let properties = {};
  let endpoints = [];
  let externalSystems = new Set();
  
  const categorizedFiles = {
    mule: [],
    resources: [],
    raml: [],
    dwl: [],
    properties: []
  };

  const evidence = {
    muleXmlFiles: [],
    flows: [],
    subflows: [],
    httpListeners: [],
    schedulers: [],
    dataweaves: [],
    connectors: [],
    errorHandlers: [],
    endpoints: [],
    properties: [],
    externalEndpoints: [],
    ramlFiles: [],
    yamlFiles: [],
    propertiesFiles: [],
    databaseConnectors: [],
    salesforceConnectors: [],
    mqConnectors: [],
    fileConnectors: [],
    objectStoreUsage: []
  };

  for (const filePath of Object.keys(files)) {
    const content = files[filePath];
    
    if (filePath.endsWith(".xml") && (filePath.includes("src/main/mule") || content.includes("<mule"))) {
      categorizedFiles.mule.push(filePath);
      evidence.muleXmlFiles.push(filePath);
      
      const parsedXml = await parseMuleXml(content);
      if (parsedXml) {
        totalFlows += parsedXml.flows.length;
        totalSubflows += parsedXml.subflows.length;
        flowsList.push(...parsedXml.flows.map(f => ({ ...f, file: filePath })));
        subflowsList.push(...parsedXml.subflows.map(sf => ({ ...sf, file: filePath })));

        // Run recursive evidence collection
        findMetadataNodes(parsedXml.rawXmlObj, evidence);

        // Analyze connectors (for backward compatibility metrics)
        for (const config of parsedXml.globalConfigs) {
          if (config.type.includes("listener")) connectorTypes.add("HTTP Listener");
          if (config.type.includes("request")) connectorTypes.add("HTTP Request");
          if (config.type.includes("db") || config.type.includes("mysql")) {
            connectorTypes.add("Database");
            externalSystems.add("MySQL Database");
          }
          if (config.type.includes("anypoint-mq")) {
            connectorTypes.add("Anypoint MQ");
            externalSystems.add("Anypoint MQ Queue");
          }
          if (config.type.includes("os")) connectorTypes.add("Object Store");
        }

        for (const f of parsedXml.flows) {
          for (const proc of f.processors) {
            if (proc.type === "database") {
              connectorTypes.add("Database");
              externalSystems.add("Database Server");
            }
            if (proc.type === "anypoint-mq-publish") {
              connectorTypes.add("Anypoint MQ");
              externalSystems.add(`Anypoint MQ (${proc.destination})`);
            }
            if (proc.type === "objectstore-store" || proc.type === "objectstore-retrieve") {
              connectorTypes.add("Object Store");
            }
            if (proc.type === "http-request") {
              connectorTypes.add("HTTP Request");
              externalSystems.add("Downstream HTTP Endpoint");
            }
          }
        }
      }
    } else if (filePath.endsWith(".dwl") || filePath.includes("dwl/")) {
      categorizedFiles.dwl.push(filePath);
      totalDwlFiles++;
      
      if (!evidence.dataweaves.some(dw => dw.resource === filePath)) {
        evidence.dataweaves.push({
          name: filePath.split("/").pop(),
          resource: filePath,
          inlineCode: content ? (content.substring(0, 150) + "...") : null,
          flow: "External DWL File"
        });
        if (!evidence.connectors.includes("DataWeave / Transform")) {
          evidence.connectors.push("DataWeave / Transform");
        }
      }
    } else if (filePath.endsWith(".raml") || filePath.endsWith("openapi.yaml") || filePath.endsWith("openapi.json")) {
      categorizedFiles.raml.push(filePath);
      if (filePath.endsWith(".raml")) {
        evidence.ramlFiles.push(filePath);
      } else {
        evidence.yamlFiles.push(filePath);
      }
      
      const parsedRaml = parseRaml(content);
      if (parsedRaml && parsedRaml.endpoints) {
        endpoints.push(...parsedRaml.endpoints);
        for (const ep of parsedRaml.endpoints) {
          evidence.endpoints.push({
            path: ep.path,
            methods: ep.methods,
            description: ep.description || "",
            file: filePath
          });
        }
      }
    } else if (filePath.endsWith(".properties") || filePath.endsWith(".yaml") || filePath.endsWith(".yml")) {
      if (filePath.includes("src/main/resources")) {
        categorizedFiles.properties.push(filePath);
        evidence.propertiesFiles.push(filePath);
        const props = parseProperties(content);
        properties = { ...properties, ...props };
        for (const [k, v] of Object.entries(props)) {
          evidence.properties.push({ key: k, value: v, file: filePath });
        }
      } else {
        categorizedFiles.resources.push(filePath);
      }
    } else {
      categorizedFiles.resources.push(filePath);
    }
  }

  // Ensure unique connector names in evidence.connectors
  evidence.connectors = Array.from(new Set(evidence.connectors));

  totalConnectors = connectorTypes.size;

  // Calculate complexity
  const score = totalFlows * 2 + totalSubflows + totalConnectors * 3 + totalDwlFiles * 2;
  if (score > 25) {
    complexityScore = "HIGH";
  } else if (score > 12) {
    complexityScore = "MEDIUM";
  } else {
    complexityScore = "LOW";
  }

  const repos = new Set();
  for (const filePath of Object.keys(files)) {
    const parts = filePath.split('/');
    if (parts.length > 1) {
      repos.add(parts[0]);
    }
  }

  const isMuleProject = categorizedFiles.mule.length > 0 || categorizedFiles.raml.length > 0 || categorizedFiles.dwl.length > 0;

  return {
    metrics: {
      totalFlows,
      totalSubflows,
      totalConnectors,
      totalDwlFiles,
      complexityScore,
      score
    },
    flows: flowsList,
    subflows: subflowsList,
    connectors: Array.from(connectorTypes),
    externalSystems: Array.from(externalSystems),
    properties,
    endpoints,
    files: categorizedFiles,
    isMuleProject,
    repos: Array.from(repos),
    evidence
  };
}
