# MuleSoft to AWS Migration Assistant

An enterprise-grade full-stack prototype application designed to analyze MuleSoft XML applications, properties files, DataWeave scripts, and RAML specifications, and automatically map them to equivalent, serverless, AWS-native services.

## Technology Stack

- **Frontend**: React, Tailwind CSS, Lucide Icons, Mermaid.js (for dynamic architecture blueprint rendering).
- **Backend**: Node.js, Express, `@google/generative-ai` (Gemini API integration), `openai` (OpenAI API integration), `xml2js` (Mule XML AST parsing), `js-yaml` (RAML & properties YAML parsing), `adm-zip` (ZIP upload parsing and SAM project bundle generation).
- **Output Target**: AWS Serverless Application Model (SAM) CloudFormation Template, Javascript AWS SDK Lambda handlers, mapping guides, and migration reports.

## Project Directory Structure

```text
mulesoft-aws-migration-assistant/
├── package.json                   # Root package.json (concurrent script launcher)
├── README.md                      # General documentation
├── backend/                       # Express API Server
│   ├── package.json
│   ├── server.js                  # Main server routing entries
│   ├── githubService.js           # GitHub API client & mock load routines
│   ├── parserService.js           # xml2js / js-yaml Mule AST analyzer
│   ├── awsMapperService.js        # Mule to AWS component mapper
│   ├── codeGeneratorService.js    # SAM template & Lambda builder
│   ├── src/services/
│   │   ├── aiProviderService.js   # Unified AI router (Parser-only, OpenAI, Gemini)
│   │   └── openaiAnalysisService.js
│   └── samples/                   # Pre-seeded mock Mule projects
│       ├── customer-experience-api/
│       ├── customer-process-api/
│       └── customer-system-api/
└── frontend/                      # Vite + React Client
    ├── package.json
    ├── index.html
    ├── vite.config.js
    ├── tailwind.config.js
    ├── postcss.config.js
    └── src/
        ├── main.jsx
        ├── App.jsx                # Main workspace application controller
        ├── index.css              # Custom styling, scrollbars & glassmorphism
        └── components/
            └── MermaidDiagram.jsx # Robust rendering component for Mermaid topology
```

## Running the Application

### Prerequisites
Make sure you have [Node.js](https://nodejs.org/) installed (version 18+ recommended).

### 1. Install Dependencies
Run npm install in both the backend and frontend directories:
```bash
# In backend/ directory
npm install

# In frontend/ directory
npm install
```

### 2. Configure Environment Variables
In the `backend` directory, create a `.env` file copied from `.env.example`:
```bash
PORT=5000
OPENAI_API_KEY=your_openai_key
OPENAI_MODEL=gpt-4o-mini
GEMINI_API_KEY=your_gemini_key
GEMINI_MODEL=gemini-1.5-flash
```

### 3. Testing Backend Health
You can verify the backend API server status by querying:
```bash
curl http://localhost:5000/api/health
```
Expected JSON response:
```json
{
  "status": "ok",
  "message": "Backend API is running"
}
```

### 4. AI Provider Modes
The Migration Assistant supports three execution modes:
- **Parser Only**: Local AST parsing of your Mule project. No external API calls are made. Activated if no API keys are configured or selected in Settings.
- **OpenAI**: Utilizes GPT engines to summarize endpoints and generate migration plans. Uses `OPENAI_API_KEY`.
- **Gemini Free API**: Utilizes Gemini 1.5 Flash to generate blueprints and conversion logic. Uses `GEMINI_API_KEY`.

Fallback Rules:
1. If OpenAI key is missing, it automatically falls back to Gemini.
2. If Gemini key is missing, it falls back to local Parser-Only mode.
*Note: You can override API keys and specify custom models on the fly using the **Settings** screen in the application.*

### 5. Start Local Development Servers

- **Backend**:
  ```bash
  cd backend
  npm run dev
  ```
- **Frontend**:
  ```bash
  cd frontend
  npm run dev
  ```

Once started:
- **Frontend**: [http://localhost:5173](http://localhost:5173) (Proxies `/api` requests to backend automatically)
- **Backend**: [http://localhost:5000](http://localhost:5000)

## Demo Guide (Zero Configuration Flow)

1. Open [http://localhost:5173](http://localhost:5173) in your browser.
2. Select **Settings** to configure providers or review defaults.
3. Select **Connect** in the navigation bar.
4. Click any of the pre-seeded mock projects in the **Mock Project Sandbox** (e.g. `customer-process-api` or `customer-system-api`).
5. Inspect the parsed MuleSoft configuration files and structure in the **Explorer**.
6. Navigate to **Analysis** / **Blueprint** / **AWS Mappings** / **SAM Code** / **Deploy** to trace the step-by-step migration blueprint, code compilation, and terminal deployment.
