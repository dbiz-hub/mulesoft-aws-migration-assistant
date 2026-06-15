export const DEFAULT_SAFE_DIAGRAM = `flowchart LR
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

export function sanitizeMermaidDiagram(input) {
  if (!input || typeof input !== "string" || !input.trim()) {
    return DEFAULT_SAFE_DIAGRAM;
  }

  const lines = input.split(/\r?\n/);
  const resultLines = [];
  let headerFound = false;

  for (let line of lines) {
    let trimmed = line.trim();
    if (!trimmed) continue;

    // Keep comments
    if (trimmed.startsWith("%%")) {
      resultLines.push(trimmed);
      continue;
    }

    // Replace header graph configurations with flowchart LR
    if (
      trimmed.startsWith("graph TD") ||
      trimmed.startsWith("graph LR") ||
      trimmed.startsWith("flowchart TD") ||
      trimmed.startsWith("flowchart LR")
    ) {
      resultLines.push("flowchart LR");
      headerFound = true;
      continue;
    }

    let processed = trimmed;

    // Replace unicode arrows with -->
    processed = processed.replace(/[\u2190-\u21FF]|[\u27F0-\u27FF]|[\u2900-\u297F]/g, "-->");

    // Remove emojis
    processed = processed.replace(/[\uD83C-\uDBFF\uDC00-\uDFFF]+/g, "");

    // Remove semicolons
    processed = processed.replace(/;/g, "");

    // Remove edge labels -->|label| or -.->|label|
    processed = processed.replace(/(--+>)\|[^|]*\|/g, "$1");
    processed = processed.replace(/(-\.-+>)\|[^|]*\|/g, "$1");
    processed = processed.replace(/(==+>)\|[^|]*\|/g, "$1");
    processed = processed.replace(/-->\|[^|]*\|/g, "-->");
    processed = processed.replace(/-\.->\|[^|]*\|/g, "-.->");
    processed = processed.replace(/==>\|[^|]*\|/g, "==>");

    // Ensure every node label uses double quotes and clean invalid chars
    // Matches NodeId[LabelText], NodeId(LabelText), NodeId["LabelText"], etc.
    // Cleans up node IDs and ensures label uses double quotes.
    processed = processed.replace(/([a-zA-Z0-9_\-\s]+)\s*(?:\[\"([^\"]*)\"\]|\(\"([^\"]*)\"\)|\[([^\]]*)\]|\(([^)]*)\))/g, (match, nodeIdPart, g2, g3, g4, g5) => {
      const trimmedId = nodeIdPart.trim();
      
      // Reserved flowchart keywords
      const reserved = ["flowchart", "graph", "subgraph", "end", "direction", "client", "server"];
      if (reserved.includes(trimmedId.toLowerCase())) {
        return match;
      }
      
      // Clean invalid characters from node ID (keep alphanumeric and underscore only)
      const cleanedId = trimmedId.replace(/[^a-zA-Z0-9_]/g, "");
      
      let label = g2 || g3 || g4 || g5 || cleanedId;
      
      // Replace parentheses inside labels with plain spaces
      label = label.replace(/[()]/g, " ");
      
      return `${cleanedId}["${label.trim()}"]`;
    });

    resultLines.push(processed);
  }

  // Prepend flowchart LR header if not present
  if (!headerFound) {
    resultLines.unshift("flowchart LR");
  }

  // Keep one statement per line, clean empty statements
  return resultLines.filter(l => l.trim().length > 0).join("\n");
}
