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

    return { flows, subflows, globalConfigs };
  } catch (error) {
    console.error("XML Parsing Error:", error);
    return null;
  }
}

export function parseRaml(ramlContent) {
  try {
    // RAML is often written in YAML structure.
    // If it starts with #%RAML, we can try striping the header and parsing as YAML
    const cleanContent = ramlContent.replace(/^#%RAML[^\n]*/, "");
    const doc = yaml.load(cleanContent);
    
    const endpoints = [];
    
    // Simple helper to recursively extract endpoints
    function traverse(obj, path = "") {
      if (!obj || typeof obj !== "object") return;
      
      for (const key of Object.keys(obj)) {
        if (key.startsWith("/")) {
          const currentPath = path + key;
          
          // Find methods
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
    // Return simple text-based fallback
    return { title: "API Spec", version: "unknown", endpoints: [] };
  }
}

export function parseProperties(content) {
  const properties = {};
  try {
    // Try as YAML first
    const doc = yaml.load(content);
    if (doc && typeof doc === "object") {
      // Flatten YAML properties
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
    // Fallback to standard properties parsing (key=value)
  }

  // Key=Value parsing
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
  
  // Categorized files
  const categorizedFiles = {
    mule: [],
    resources: [],
    raml: [],
    dwl: [],
    properties: []
  };

  for (const filePath of Object.keys(files)) {
    const content = files[filePath];
    
    if (filePath.endsWith(".xml") && (filePath.includes("src/main/mule") || content.includes("<mule"))) {
      categorizedFiles.mule.push(filePath);
      const parsedXml = await parseMuleXml(content);
      if (parsedXml) {
        totalFlows += parsedXml.flows.length;
        totalSubflows += parsedXml.subflows.length;
        flowsList.push(...parsedXml.flows.map(f => ({ ...f, file: filePath })));
        subflowsList.push(...parsedXml.subflows.map(sf => ({ ...sf, file: filePath })));

        // Analyze connectors
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

        // Check processors inside flows
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
    } else if (filePath.endsWith(".raml") || filePath.endsWith("openapi.yaml") || filePath.endsWith("openapi.json")) {
      categorizedFiles.raml.push(filePath);
      const parsedRaml = parseRaml(content);
      if (parsedRaml && parsedRaml.endpoints) {
        endpoints.push(...parsedRaml.endpoints);
      }
    } else if (filePath.endsWith(".properties") || filePath.endsWith(".yaml") || filePath.endsWith(".yml")) {
      // Check if it's in resources/
      if (filePath.includes("src/main/resources")) {
        categorizedFiles.properties.push(filePath);
        const props = parseProperties(content);
        properties = { ...properties, ...props };
      } else {
        categorizedFiles.resources.push(filePath);
      }
    } else {
      categorizedFiles.resources.push(filePath);
    }
  }

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
    files: categorizedFiles
  };
}
