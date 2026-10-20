import React, { useEffect, useRef } from "react";
import { Block } from "../../../../shared/spec";

type HtmlBlock = Extract<Block, { type: "html" }>;

interface Props {
  block: HtmlBlock;
  variables?: Record<string, any>;
  onVariableChange?: (name: string, val: any) => void;
  interactive?: boolean;
}

export const HtmlBlockRenderer: React.FC<Props> = ({
  block,
  variables = {},
  onVariableChange,
  interactive = true,
}) => {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const blockId = block.id;

  const flatVariables = React.useMemo(() => {
    const flat: Record<string, any> = {};
    for (const [k, v] of Object.entries(variables)) {
      flat[k] = v && typeof v === "object" && "value" in v ? v.value : v;
    }
    return flat;
  }, [variables]);

  // Build the sandboxed HTML document with CSP & the Fluxa postMessage bridge
  const srcDoc = React.useMemo(() => {
    const rawHtml = block.code?.html || "";
    const rawCss = block.code?.css || "";
    const rawJs = block.code?.js || "";

    const bridgeScript = `
      <script>
        (function() {
          const listeners = [];
          let currentVars = ${JSON.stringify(flatVariables)};

          window.fluxa = {
            get: function(name) {
              return currentVars[name];
            },
            set: function(name, val) {
              currentVars[name] = val;
              window.parent.postMessage({
                type: "fluxa:set",
                blockId: "${blockId}",
                variable: name,
                value: val
              }, "*");
            },
            on: function(event, callback) {
              if (event === "change") {
                listeners.push(callback);
              }
            }
          };

          window.addEventListener("message", function(e) {
            if (e.data && e.data.type === "fluxa:change") {
              currentVars = e.data.variables || {};
              listeners.forEach(function(fn) {
                try { fn(currentVars); } catch(err) { console.error(err); }
              });
            }
          });
        })();
      </script>
    `;

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:;">
          <style>
            html, body {
              margin: 0;
              padding: 0;
              width: 100%;
              height: 100%;
              overflow: hidden;
              font-family: var(--theme-font-body, system-ui, sans-serif);
              color: var(--theme-text, inherit);
              background: transparent;
            }
            ${rawCss}
          </style>
          ${bridgeScript}
        </head>
        <body>
          ${rawHtml}
          <script>
            try {
              ${rawJs}
            } catch (err) {
              console.error("Widget JS error:", err);
            }
          </script>
        </body>
      </html>
    `;
  }, [block.code?.html, block.code?.css, block.code?.js, blockId]);

  // Listen for postMessage from the sandboxed iframe
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      // Validate sender and shape
      if (
        iframeRef.current &&
        e.source === iframeRef.current.contentWindow &&
        e.data &&
        e.data.type === "fluxa:set" &&
        e.data.blockId === blockId
      ) {
        if (onVariableChange && typeof e.data.variable === "string") {
          onVariableChange(e.data.variable, e.data.value);
        }
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [blockId, onVariableChange]);

  // Broadcast variable updates into the iframe
  useEffect(() => {
    if (iframeRef.current && iframeRef.current.contentWindow) {
      iframeRef.current.contentWindow.postMessage(
        {
          type: "fluxa:change",
          variables: flatVariables,
        },
        "*"
      );
    }
  }, [flatVariables]);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        overflow: "hidden",
      }}
      className="block-html-widget"
    >
      <iframe
        ref={iframeRef}
        srcDoc={srcDoc}
        sandbox="allow-scripts"
        title={`Widget ${blockId}`}
        style={{
          width: "100%",
          height: "100%",
          border: "none",
          display: "block",
          pointerEvents: interactive ? "auto" : "none",
        }}
      />
    </div>
  );
};
