import React, { useState, useEffect } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  ArcElement,
  RadialLinearScale,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import { Bar, Line, Pie, Doughnut, Radar, Scatter } from "react-chartjs-2";
import { Block, Dataset, Variable } from "../../../../shared/spec";
import { buildReactiveScope } from "../../runtime/reactiveEngine";
import { Isometric3DChart } from "./Isometric3DChart";
import { Box, BarChart2 } from "lucide-react";

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  ArcElement,
  RadialLinearScale,
  Title,
  Tooltip,
  Legend,
  Filler
);

type ChartBlock = Extract<Block, { type: "chart" }>;

interface Props {
  block: ChartBlock;
  dataset?: Dataset;
  datasets?: Record<string, Dataset>;
  variables?: Record<string, Variable>;
  themeChartColors?: string[];
  /** False in thumbnails, print and export: no toolbar, no tween (the final state is drawn). */
  interactive?: boolean;
}

const DEFAULT_CHART_COLORS = [
  "#2563EB",
  "#047857",
  "#B45309",
  "#7C3AED",
  "#BE185D",
  "#0369A1",
];

export const ChartBlockRenderer: React.FC<Props> = ({
  block,
  dataset,
  datasets = {},
  variables = {},
  themeChartColors = DEFAULT_CHART_COLORS,
  interactive = true,
}) => {
  const normalizedKind =
    block.kind ||
    (block as any).props?.kind ||
    (block as any).props?.chartType ||
    "bar";
  const kind = normalizedKind;

  const { xField = "label", series = [], options = {} } = block;

  const customLabels =
    (block as any).labels ||
    (block as any).props?.labels ||
    (block as any).props?.data?.labels;

  const customValues =
    (block as any).values ||
    (block as any).props?.values ||
    (block as any).props?.data?.values;

  const reactiveScope = React.useMemo(() => {
    return buildReactiveScope(datasets, variables);
  }, [datasets, variables]);

  const rows = React.useMemo(() => {
    const valueField = (series as any[])[0]?.field || "value";
    if (Array.isArray(customLabels) && Array.isArray(customValues) && customLabels.length > 0) {
      return customLabels.map((lbl: any, idx: number) => ({
        [xField]: String(lbl),
        [valueField]: Number(customValues[idx] ?? 0),
        ...(valueField !== "value" ? { value: Number(customValues[idx] ?? 0) } : {}),
      }));
    }
    const activeDataset = dataset || (block.dataset ? datasets[block.dataset] : undefined);
    if (activeDataset) {
      return reactiveScope.datasets[activeDataset.id]?.rows || activeDataset.rows;
    }
    // No data: draw nothing rather than invented sample bars.
    return [];
  }, [customLabels, customValues, dataset, block.dataset, datasets, reactiveScope, xField, series]);

  const labels = rows.map((r: any) => String(r[xField] ?? ""));

  const seriesDefs =
    series.length > 0
      ? series
      : [{ field: "value", label: options.unit || "Value" }];

  // Reactive slider scaling: checks if there is an associated slider variable on this slide or deck
  // Only an explicit binding scales a chart; any slider in the deck used to rescale every chart.
  const boundVarName = (block as any).variable || (block as any).props?.variable;
  const boundVar = boundVarName ? variables[boundVarName] : undefined;
  const scaleMultiplier =
    boundVar && typeof boundVar.value === "number" && boundVar.value !== 50
      ? boundVar.value / 50
      : 1;

  const chartSeriesDatasets = seriesDefs.map((s, idx) => {
    const color = s.color || themeChartColors[idx % themeChartColors.length];
    const dataValues = rows.map((r: any) => {
      const rawVal = Number(r[s.field] ?? 0);
      return scaleMultiplier !== 1 ? Math.round(rawVal * scaleMultiplier) : rawVal;
    });

    if (kind === "pie" || kind === "donut") {
      return {
        label: s.label || s.field,
        data: dataValues,
        backgroundColor: themeChartColors,
        borderColor: "transparent",
      };
    }

    if (kind === "line" || kind === "area") {
      return {
        label: s.label || s.field,
        data: dataValues,
        borderColor: color,
        backgroundColor: kind === "area" ? `${color}33` : "transparent",
        fill: kind === "area",
        tension: 0.3,
        pointRadius: 4,
        pointBackgroundColor: color,
      };
    }

    // Default bar / column / stacked
    const barBgColor =
      (options as any)?.highlightLast || block.dataset === "adoption"
        ? dataValues.map((_, i) => (i === dataValues.length - 1 ? (s.color || "#0D9488") : "#94A3B8"))
        : color;

    return {
      label: s.label || s.field,
      data: dataValues,
      backgroundColor: barBgColor,
      borderRadius: 6,
      maxBarThickness: 48,
      stack: kind === "stacked" ? "total" : undefined,
    };
  });

  const chartData = {
    labels,
    datasets: chartSeriesDatasets,
  };

  const isHorizontal = kind === "bar";
  const prefersReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const animateDuration = prefersReducedMotion || !interactive ? 0 : (options.animateMs ?? 700);

  const chartOptions: any = {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: isHorizontal ? ("y" as const) : ("x" as const),
    animation: animateDuration > 0 ? {
      duration: animateDuration,
      easing: "easeInOutQuart",
    } : false,
    plugins: {
      legend: {
        display: options.legend !== "off",
        position: options.legend === "bottom" ? "bottom" : "top",
        labels: {
          color: "var(--theme-text, #111827)",
          font: { family: "var(--theme-font-body, sans-serif)", size: 14 },
        },
      },
      tooltip: {
        enabled: true,
      },
    },
    scales:
      kind === "pie" || kind === "donut" || kind === "radar"
        ? undefined
        : {
            x: {
              grid: { color: "rgba(128, 128, 128, 0.15)" },
              ticks: {
                color: "var(--theme-secondary, #6B7280)",
                font: { family: "var(--theme-font-body, sans-serif)", size: 14 },
              },
            },
            y: {
              grid: { color: "rgba(128, 128, 128, 0.15)" },
              ticks: {
                color: "var(--theme-secondary, #6B7280)",
                font: { family: "var(--theme-font-body, sans-serif)", size: 14 },
              },
            },
          },
  };

  const [is3DMode, setIs3DMode] = useState(true);
  const initialKind = normalizedKind;
  const [activeKind, setActiveKind] = useState<string>(initialKind);

  useEffect(() => {
    setActiveKind(normalizedKind);
  }, [normalizedKind]);

  // Extract primary series data for 3D engine
  const primarySeries = chartSeriesDatasets[0] || { data: [], label: "" };
  const dataValues = (primarySeries.data as number[]) || [];

  const chartTitle: string = (block as any).props?.title || (block as any).title || "";
  const sourceNote: string = (block as any).props?.sourceNote || "";
  const sourceDataset = dataset || ((block as any).dataset ? datasets[(block as any).dataset] : undefined);
  const isSample = sourceDataset?.source === "ai-estimate";

  return (
    <div className="block-chart" style={{ width: "100%", height: "100%", position: "relative", display: "flex", flexDirection: "column" }}>
      {chartTitle && (
        <div style={{ fontSize: 22, fontWeight: 600, lineHeight: 1.25, marginBottom: 6, paddingRight: interactive ? 320 : 0, color: "var(--theme-text, inherit)" }}>
          {chartTitle}
        </div>
      )}
      {/* 2D / 3D Mode Toggle Switcher + Chart Type Pills */}
      {interactive && (<div
        style={{
          position: "absolute",
          top: -2,
          left: 0,
          zIndex: 12,
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        {/* 3D / 2D Toggle */}
        <div
          style={{
            display: "flex",
            backgroundColor: "#F1F5F9",
            padding: 2,
            borderRadius: 8,
            border: "1px solid #CBD5E1",
            boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
          }}
        >
          <button
            type="button"
            onClick={() => setIs3DMode(true)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              padding: "3px 8px",
              fontSize: 11,
              fontWeight: is3DMode ? 700 : 500,
              borderRadius: 6,
              border: "none",
              cursor: "pointer",
              backgroundColor: is3DMode ? "#2563EB" : "transparent",
              color: is3DMode ? "#FFFFFF" : "#64748B",
              boxShadow: is3DMode ? "0 1px 2px rgba(37,99,235,0.3)" : "none",
              transition: "all 150ms ease",
            }}
          >
            <Box size={12} />
            <span>3D Visual</span>
          </button>
          <button
            type="button"
            onClick={() => setIs3DMode(false)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              padding: "3px 8px",
              fontSize: 11,
              fontWeight: !is3DMode ? 700 : 500,
              borderRadius: 6,
              border: "none",
              cursor: "pointer",
              backgroundColor: !is3DMode ? "#FFFFFF" : "transparent",
              color: !is3DMode ? "#0F172A" : "#64748B",
              boxShadow: !is3DMode ? "0 1px 2px rgba(0,0,0,0.08)" : "none",
              transition: "all 150ms ease",
            }}
          >
            <BarChart2 size={12} />
            <span>2D Flat</span>
          </button>
        </div>

        {/* Chart Kind Switcher: Bar / Line / Donut */}
        <div
          style={{
            display: "flex",
            backgroundColor: "#F1F5F9",
            padding: 2,
            borderRadius: 8,
            border: "1px solid #CBD5E1",
            boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
          }}
        >
          <button
            type="button"
            onClick={() => setActiveKind("bar")}
            style={{
              padding: "3px 7px",
              fontSize: 11,
              fontWeight: activeKind === "bar" || activeKind === "column" ? 700 : 500,
              borderRadius: 5,
              border: "none",
              cursor: "pointer",
              backgroundColor: activeKind === "bar" || activeKind === "column" ? "#0F172A" : "transparent",
              color: activeKind === "bar" || activeKind === "column" ? "#FFFFFF" : "#64748B",
              transition: "all 150ms ease",
            }}
          >
            Columns
          </button>
          <button
            type="button"
            onClick={() => setActiveKind("line")}
            style={{
              padding: "3px 7px",
              fontSize: 11,
              fontWeight: activeKind === "line" || activeKind === "area" ? 700 : 500,
              borderRadius: 5,
              border: "none",
              cursor: "pointer",
              backgroundColor: activeKind === "line" || activeKind === "area" ? "#0F172A" : "transparent",
              color: activeKind === "line" || activeKind === "area" ? "#FFFFFF" : "#64748B",
              transition: "all 150ms ease",
            }}
          >
            Ribbon
          </button>
          <button
            type="button"
            onClick={() => setActiveKind("donut")}
            style={{
              padding: "3px 7px",
              fontSize: 11,
              fontWeight: activeKind === "donut" || activeKind === "pie" ? 700 : 500,
              borderRadius: 5,
              border: "none",
              cursor: "pointer",
              backgroundColor: activeKind === "donut" || activeKind === "pie" ? "#0F172A" : "transparent",
              color: activeKind === "donut" || activeKind === "pie" ? "#FFFFFF" : "#64748B",
              transition: "all 150ms ease",
            }}
          >
            Cylinder
          </button>
        </div>
      </div>)}

      {/* Visual Chart Rendering (3D Isometric Engine or ChartJS 2D) */}
      <div style={{ width: "100%", flex: 1, minHeight: 0, paddingTop: interactive && !chartTitle ? 28 : 0, boxSizing: "border-box" }}>
        {is3DMode ? (
          <Isometric3DChart
            kind={activeKind}
            labels={labels}
            dataValues={dataValues}
            seriesLabel={primarySeries.label}
            themeColors={themeChartColors}
            unit={options.unit || ""}
          />
        ) : (
          <>
            {(activeKind === "bar" || activeKind === "column" || activeKind === "stacked") && (
              <Bar data={chartData} options={chartOptions} />
            )}
            {(activeKind === "line" || activeKind === "area") && (
              <Line data={chartData} options={chartOptions} />
            )}
            {activeKind === "pie" && <Pie data={chartData} options={chartOptions} />}
            {activeKind === "donut" && <Doughnut data={chartData} options={chartOptions} />}
            {activeKind === "radar" && <Radar data={chartData} options={chartOptions} />}
            {activeKind === "scatter" && <Scatter data={chartData} options={chartOptions} />}
          </>
        )}
      </div>

      {(sourceNote || isSample) && (
        <div className="chart-source" style={{ fontSize: 15, marginTop: 6, color: "var(--ink-2, #4B5563)" }}>
          {isSample ? "Sample data: values are not from a source" : sourceNote}
        </div>
      )}

      {/* Visually Hidden Accessible Data Table for Screen Readers & Tests */}
      <table
        className="sr-only"
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: "hidden",
          clip: "rect(0, 0, 0, 0)",
          whiteSpace: "nowrap",
          border: 0,
        }}
        aria-label={`Data table for ${block.id} chart`}
      >
        <thead>
          <tr>
            <th scope="col">{xField}</th>
            {seriesDefs.map((s) => (
              <th key={s.field} scope="col">
                {s.label || s.field}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row: any, rIdx: number) => (
            <tr key={rIdx}>
              <th scope="row">{String(row[xField] ?? "")}</th>
              {seriesDefs.map((s) => (
                <td key={s.field}>{String(row[s.field] ?? "")}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
