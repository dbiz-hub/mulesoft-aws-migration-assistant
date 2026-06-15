import React, { useState, useEffect, useRef } from "react";
import mermaid from "mermaid";
import { AlertCircle, Code, Check } from "lucide-react";
import { sanitizeMermaidDiagram, DEFAULT_SAFE_DIAGRAM } from "../utils/mermaidSanitizer";

// Initialize mermaid with dark theme variables suitable for the application style
mermaid.initialize({
  startOnLoad: false,
  theme: "dark",
  securityLevel: "loose",
  themeVariables: {
    background: "#090d16",
    primaryColor: "#00a2df",
    primaryTextColor: "#fff",
    lineColor: "#ff9900",
    secondaryColor: "#1c2333"
  }
});

export default function MermaidDiagram({ chart }) {
  const ref = useRef(null);
  const [svg, setSvg] = useState("");
  const [error, setError] = useState(null);
  const [showSource, setShowSource] = useState(false);
  const [copied, setCopied] = useState(false);

  // First, sanitize the incoming chart
  const sanitizedChart = sanitizeMermaidDiagram(chart);

  useEffect(() => {
    if (!sanitizedChart) return;
    setError(null);
    setSvg("");

    // Create a unique id for mermaid to render
    const uniqueId = `mermaid-${Math.floor(Math.random() * 1000000)}`;

    // Create a temporary container element for rendering
    const renderDiv = document.createElement("div");
    renderDiv.id = `temp-${uniqueId}`;
    renderDiv.style.display = "none";
    document.body.appendChild(renderDiv);

    let isMounted = true;

    async function renderChartWithFallback(chartText, isFallback = false) {
      try {
        // Parse diagram first to check for syntax errors
        await mermaid.parse(chartText);
        
        if (!isMounted) return;

        // Render diagram
        const { svg: renderedSvg } = await mermaid.render(uniqueId, chartText, renderDiv);
        
        if (isMounted) {
          setSvg(renderedSvg);
          setError(null);
        }
      } catch (err) {
        console.error(`[Mermaid Component] Render error (${isFallback ? "fallback" : "primary"}):`, err);
        if (!isFallback) {
          // If the primary render fails (even after sanitization), try default safe diagram
          console.warn("[Mermaid Component] Primary render failed, falling back to DEFAULT_SAFE_DIAGRAM");
          await renderChartWithFallback(DEFAULT_SAFE_DIAGRAM, true);
        } else {
          if (isMounted) {
            setError(err.message || String(err));
          }
        }
      } finally {
        // Clean up temporary container
        if (renderDiv.parentNode) {
          renderDiv.parentNode.removeChild(renderDiv);
        }
        const badEl = document.getElementById(uniqueId);
        if (badEl) badEl.remove();
      }
    }

    renderChartWithFallback(sanitizedChart, false);

    return () => {
      isMounted = false;
      if (renderDiv.parentNode) {
        renderDiv.parentNode.removeChild(renderDiv);
      }
      const badEl = document.getElementById(uniqueId);
      if (badEl) badEl.remove();
    };
  }, [sanitizedChart]);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(sanitizedChart);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-6 bg-dark-900 border border-red-900/30 rounded-xl text-red-400 font-sans my-4 w-full">
        <AlertCircle className="w-8 h-8 mb-2" />
        <span className="text-sm font-semibold">Diagram rendering error</span>
        <p className="text-[11px] text-slate-500 mt-2 font-mono whitespace-pre-wrap max-w-full overflow-x-auto bg-dark-950 p-3 rounded border border-dark-800 w-full text-left">
          {error}
        </p>
        <p className="text-[10px] text-slate-400 mt-4 font-sans w-full text-left">Diagram Source:</p>
        <pre className="text-[11px] text-slate-300 mt-1 font-mono whitespace-pre-wrap max-w-full overflow-x-auto bg-dark-950 p-3 rounded border border-dark-800 w-full text-left">
          {sanitizedChart}
        </pre>
      </div>
    );
  }

  if (!svg) {
    return (
      <div className="flex items-center justify-center p-8 bg-dark-900/40 border border-dark-700/50 rounded-xl my-4 w-full h-48">
        <div className="text-xs text-slate-400 animate-pulse">Rendering diagram...</div>
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col my-4">
      <div 
        ref={ref} 
        className="flex justify-center p-4 bg-dark-900/40 border border-dark-700/50 rounded-xl overflow-x-auto w-full"
        dangerouslySetInnerHTML={{ __html: svg }} 
      />
      
      <div className="mt-2 flex flex-col w-full border border-slate-700/30 rounded-lg overflow-hidden bg-slate-900/20">
        <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900/60 border-b border-slate-700/30 text-[11px] text-slate-400">
          <span className="flex items-center gap-1">
            <Code className="w-3.5 h-3.5" />
            Sanitized Mermaid Diagram Source
          </span>
          <div className="flex gap-2">
            <button 
              onClick={copyToClipboard}
              className="hover:text-white transition-colors duration-150 px-2 py-0.5 bg-slate-800/80 rounded border border-slate-700/50 text-[10px]"
            >
              {copied ? <span className="flex items-center gap-1 text-emerald-400"><Check className="w-3 h-3" /> Copied!</span> : "Copy Code"}
            </button>
            <button 
              onClick={() => setShowSource(!showSource)}
              className="hover:text-white transition-colors duration-150 px-2 py-0.5 bg-slate-800/80 rounded border border-slate-700/50 text-[10px]"
            >
              {showSource ? "Hide" : "Show"}
            </button>
          </div>
        </div>
        
        {showSource && (
          <pre className="text-[10px] text-slate-300 font-mono whitespace-pre p-3 max-w-full overflow-x-auto bg-slate-950/80 text-left">
            {sanitizedChart}
          </pre>
        )}
      </div>
    </div>
  );
}
