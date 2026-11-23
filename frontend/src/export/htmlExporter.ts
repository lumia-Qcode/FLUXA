import { DeckDocument } from "../editor/store/types";
import { fontStack } from "../rendering/typography";
import { resolveDeckTheme, Theme } from "../rendering/themes";

/**
 * Builds a 100% self-contained standalone HTML presentation file.
 * Contains the complete deck JSON, theme tokens, reactive variable engine,
 * live Chart & KPI rendering, interactive slider controls, and fullscreen navigation.
 * Requires ZERO external network calls and works directly from file://.
 */
/** The heading and body font families an exported deck uses. */
export function deckFontFamilies(doc: DeckDocument): string[] {
  const theme = resolveDeckTheme(doc.theme?.themeId || "clean-light", doc.brand, (doc.theme as any)?.fontPairing);
  return Array.from(new Set([theme.fonts.heading, theme.fonts.body]));
}

/** `fontCss` is optional embedded @font-face CSS (see embedFonts.ts) so the file works offline. */
export function buildStandaloneHtml(doc: DeckDocument, fontCss = ""): string {
  const themeId = doc.theme?.themeId || "clean-light";
  const theme: Theme = resolveDeckTheme(themeId, doc.brand, (doc.theme as any)?.fontPairing);
  const headingStack = fontStack(theme.fonts.heading).replace(/"/g, "'");
  const bodyStack = fontStack(theme.fonts.body).replace(/"/g, "'");
  const deckJson = JSON.stringify(doc).replace(/</g, "\\u003c");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(doc.title || "FLUXA Presentation")}</title>
  <style>
    ${fontCss}
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: #000000;
      color: ${theme.colors.text};
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      user-select: none;
    }
    #viewport {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #000000;
    }
    #stage-container {
      position: relative;
      width: 1920px;
      height: 1080px;
      transform-origin: center center;
      background: ${theme.colors.bg};
      font-family: ${bodyStack};
      overflow: hidden;
      box-shadow: 0 20px 50px rgba(0,0,0,0.5);
    }
    .fluxa-block {
      position: absolute;
      box-sizing: border-box;
    }
    /* Controls styling */
    .fluxa-slider {
      -webkit-appearance: none;
      width: 100%;
      height: 8px;
      border-radius: 4px;
      background: #E5E7EB;
      outline: none;
      cursor: pointer;
    }
    .fluxa-slider::-webkit-slider-thumb {
      -webkit-appearance: none;
      width: 22px;
      height: 22px;
      border-radius: 50%;
      background: ${theme.colors.primary};
      cursor: pointer;
      box-shadow: 0 2px 6px rgba(0,0,0,0.2);
    }
    /* Floating HUD Navigation */
    #hud {
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      align-items: center;
      gap: 12px;
      background: rgba(18, 18, 22, 0.88);
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 24px;
      padding: 6px 16px;
      color: #FFFFFF;
      font-size: 13px;
      font-weight: 500;
      z-index: 10000;
      box-shadow: 0 8px 24px rgba(0,0,0,0.3);
      transition: opacity 0.3s ease;
    }
    #hud button {
      background: none;
      border: none;
      color: #FFFFFF;
      font-size: 14px;
      cursor: pointer;
      padding: 4px 8px;
      border-radius: 4px;
      transition: background 0.15s ease;
    }
    #hud button:hover:not(:disabled) {
      background: rgba(255, 255, 255, 0.2);
    }
    #hud button:disabled {
      opacity: 0.3;
      cursor: default;
    }
    .hud-badge {
      font-size: 11px;
      padding: 2px 6px;
      background: rgba(255,255,255,0.15);
      border-radius: 10px;
      margin-left: 4px;
    }
  </style>
</head>
<body>
  <div id="viewport">
    <div id="stage-container"></div>
  </div>

  <div id="hud">
    <button id="btn-prev" aria-label="Previous slide">◀</button>
    <span id="slide-counter">1 / 1</span>
    <button id="btn-next" aria-label="Next slide">▶</button>
    <button id="btn-fullscreen" aria-label="Toggle fullscreen" title="Fullscreen (F)">⛶</button>
    <span class="hud-badge">Standalone HTML</span>
  </div>

  <script id="deck-data" type="application/json">
    ${deckJson}
  </script>

  <script>
    (function() {
      var deck = JSON.parse(document.getElementById("deck-data").textContent);
      var currentSlideIdx = 0;
      var totalSlides = deck.slides.length;
      var stage = document.getElementById("stage-container");
      var counter = document.getElementById("slide-counter");
      var btnPrev = document.getElementById("btn-prev");
      var btnNext = document.getElementById("btn-next");
      var btnFs = document.getElementById("btn-fullscreen");

      // State for live reactive variables
      var variables = {};
      if (deck.variables) {
        Object.keys(deck.variables).forEach(function(k) {
          variables[k] = deck.variables[k].value;
        });
      }

      // Responsive Stage Scaling (1920x1080 uniform fit)
      function resizeStage() {
        var vw = window.innerWidth;
        var vh = window.innerHeight;
        var scale = Math.min(vw / 1920, vh / 1080);
        stage.style.transform = "scale(" + scale + ")";
      }
      window.addEventListener("resize", resizeStage);
      resizeStage();

      // Simple expression evaluation for bound values (e.g., "$bind: forecast_growth")
      function resolveBoundValue(val, fallback) {
        if (typeof val === "string" && val.indexOf("$bind:") === 0) {
          var varName = val.replace("$bind:", "").trim();
          if (variables[varName] !== undefined) {
            return variables[varName];
          }
        }
        return fallback !== undefined ? fallback : val;
      }

      function renderCurrentSlide() {
        if (!deck.slides || deck.slides.length === 0) return;
        var slide = deck.slides[currentSlideIdx];
        stage.innerHTML = "";

        // Background
        stage.style.background = slide.background?.color || "${theme.colors.bg}";

        // Render each block
        (slide.blocks || []).forEach(function(block) {
          var el = document.createElement("div");
          el.className = "fluxa-block";
          el.style.left = block.x + "px";
          el.style.top = block.y + "px";
          el.style.width = block.w + "px";
          el.style.height = block.h + "px";

          if (block.type === "text") {
            var fontSize = block.style && block.style.fontSize ? block.style.fontSize + "px" : "18px";
            var color = block.style && block.style.color ? block.style.color : "${theme.colors.text}";
            var align = block.style && block.style.align ? block.style.align : "left";
            var weight = block.style && block.style.fontWeight ? block.style.fontWeight : "normal";

            el.style.fontSize = fontSize;
            el.style.color = color;
            el.style.textAlign = align;
            el.style.fontWeight = weight;
            el.style.lineHeight = "1.35";
            // Titles and big statements use the heading font; everything else the body font.
            if (parseFloat(fontSize) >= 36) el.style.fontFamily = "${headingStack}";

            // Extract paragraphs or bullet list
            var html = "";
            if (block.doc && block.doc.content) {
              block.doc.content.forEach(function(node) {
                if (node.type === "paragraph") {
                  var pText = (node.content || []).map(function(c) {
                    var t = c.text || "";
                    if (c.marks) {
                      c.marks.forEach(function(m) {
                        if (m.type === "bold") t = "<strong>" + t + "</strong>";
                        if (m.type === "italic") t = "<em>" + t + "</em>";
                        if (m.type === "underline") t = "<u>" + t + "</u>";
                      });
                    }
                    return t;
                  }).join("");
                  html += "<p style='margin-bottom:8px;'>" + pText + "</p>";
                } else if (node.type === "bulletList") {
                  html += "<ul style='margin-left:24px; margin-bottom:8px;'>";
                  (node.content || []).forEach(function(li) {
                    var liText = "";
                    if (li.content && li.content[0] && li.content[0].content) {
                      liText = li.content[0].content.map(function(c) { return c.text || ""; }).join("");
                    }
                    html += "<li style='margin-bottom:6px;'>" + liText + "</li>";
                  });
                  html += "</ul>";
                }
              });
            } else if (block.props && block.props.bullets) {
              html = "<ul style='margin-left:24px;'>";
              block.props.bullets.forEach(function(b) {
                html += "<li style='margin-bottom:6px;'>" + b + "</li>";
              });
              html += "</ul>";
            } else if (block.props && block.props.text) {
              html = "<p>" + block.props.text + "</p>";
            }
            el.innerHTML = html;
          } else if (block.type === "kpi") {
            var rawVal = resolveBoundValue(block.value, block.value || "0");
            var numVal = Number(rawVal);
            var displayVal = isNaN(numVal) ? rawVal : numVal;

            el.style.display = "flex";
            el.style.flexDirection = "column";
            el.style.justifyContent = "center";
            el.style.alignItems = "center";
            el.style.textAlign = "center";

            el.innerHTML =
              "<div data-testid='standalone-kpi-value' style='font-size:72px; font-weight:700; color:${theme.colors.primary}; line-height:1;'>" +
              displayVal +
              "</div>" +
              "<div style='font-size:16px; color:${theme.colors.secondary}; margin-top:8px; font-weight:500;'>" +
              (block.label || "") +
              "</div>";
          } else if (block.type === "control") {
            var varName = block.variable || block.name || "forecast_growth";
            var currentVal = variables[varName] !== undefined ? variables[varName] : (block.value || 50);
            var min = block.min !== undefined ? block.min : 0;
            var max = block.max !== undefined ? block.max : 100;
            var step = block.step !== undefined ? block.step : 1;

            el.style.display = "flex";
            el.style.flexDirection = "column";
            el.style.justifyContent = "center";
            el.style.padding = "16px";
            el.style.background = "rgba(0,0,0,0.04)";
            el.style.borderRadius = "8px";
            el.style.border = "1px solid rgba(0,0,0,0.08)";

            el.innerHTML =
              "<div style='display:flex; justify-content:space-between; margin-bottom:8px; font-size:15px; font-weight:600; color:${theme.colors.text};'>" +
              "<span>" + (block.label || varName) + "</span>" +
              "<span id='slider-val-" + varName + "'>" + currentVal + "</span>" +
              "</div>" +
              "<input type='range' class='fluxa-slider' data-testid='standalone-slider' min='" + min + "' max='" + max + "' step='" + step + "' value='" + currentVal + "' />";

            var input = el.querySelector("input");
            input.addEventListener("input", function(e) {
              var nVal = Number(e.target.value);
              variables[varName] = nVal;
              var labelSpan = el.querySelector("#slider-val-" + varName);
              if (labelSpan) labelSpan.textContent = nVal;
              // Re-render live dependent blocks
              renderCurrentSlide();
            });
          } else if (block.type === "chart") {
            // Live SVG Chart with interactive bars/lines
            var activeDataset = block.dataset ? deck.datasets[block.dataset] : null;
            var rows = activeDataset ? activeDataset.rows : [
              { label: "Q1", value: 35 },
              { label: "Q2", value: 55 },
              { label: "Q3", value: 75 },
              { label: "Q4", value: 95 }
            ];

            // If a variable affects the chart values, apply reactive calculation
            var firstVar = Object.keys(variables)[0];
            var scaleMultiplier = firstVar && variables[firstVar] !== undefined ? (variables[firstVar] / 50) : 1;

            var svgHtml = "<svg width='100%' height='100%' viewBox='0 0 " + block.w + " " + block.h + "'>";
            var barWidth = (block.w - 80) / rows.length;
            var maxVal = 100 * Math.max(1, scaleMultiplier);

            rows.forEach(function(row, rIdx) {
              var baseVal = Number(row.value || row.val || 50);
              var computedVal = Math.round(baseVal * scaleMultiplier);
              var barHeight = Math.max(8, (computedVal / maxVal) * (block.h - 80));
              var bx = 40 + rIdx * barWidth + barWidth * 0.15;
              var by = block.h - 40 - barHeight;
              var bw = barWidth * 0.7;

              // Bar rect
              svgHtml += "<rect data-testid='standalone-chart-bar' x='" + bx + "' y='" + by + "' width='" + bw + "' height='" + barHeight + "' fill='${theme.colors.primary}' rx='4' />";
              // Value label above bar
              svgHtml += "<text x='" + (bx + bw / 2) + "' y='" + (by - 8) + "' fill='${theme.colors.text}' font-size='14' font-weight='600' text-anchor='middle'>" + computedVal + "</text>";
              // X label below bar
              svgHtml += "<text x='" + (bx + bw / 2) + "' y='" + (block.h - 16) + "' fill='${theme.colors.secondary}' font-size='13' text-anchor='middle'>" + (row.label || row[block.xField || "label"] || ("Item " + (rIdx + 1))) + "</text>";
            });

            svgHtml += "</svg>";
            el.innerHTML = svgHtml;
          } else if (block.type === "shape") {
            var fill = block.fill && block.fill.color ? block.fill.color : "${theme.colors.primary}";
            var stroke = block.stroke && block.stroke.color ? block.stroke.color : "transparent";
            el.style.backgroundColor = fill;
            el.style.border = "1px solid " + stroke;
            if (block.shape === "ellipse") el.style.borderRadius = "50%";
            else if (block.shape === "roundRect" || block.shape === "pill") el.style.borderRadius = "20px";
            else el.style.borderRadius = "4px";
          }

          stage.appendChild(el);
        });

        // Update HUD
        counter.textContent = (currentSlideIdx + 1) + " / " + totalSlides;
        btnPrev.disabled = currentSlideIdx <= 0;
        btnNext.disabled = currentSlideIdx >= totalSlides - 1;
      }

      function nextSlide() {
        if (currentSlideIdx < totalSlides - 1) {
          currentSlideIdx++;
          renderCurrentSlide();
        }
      }

      function prevSlide() {
        if (currentSlideIdx > 0) {
          currentSlideIdx--;
          renderCurrentSlide();
        }
      }

      btnNext.addEventListener("click", nextSlide);
      btnPrev.addEventListener("click", prevSlide);

      btnFs.addEventListener("click", function() {
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(function() {});
        } else {
          document.exitFullscreen().catch(function() {});
        }
      });

      window.addEventListener("keydown", function(e) {
        if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") {
          e.preventDefault();
          nextSlide();
        } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
          e.preventDefault();
          prevSlide();
        } else if (e.key === "f" || e.key === "F") {
          btnFs.click();
        }
      });

      // Initial render
      renderCurrentSlide();
    })();
  </script>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
