import React from "react";
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
}) => {
  const { kind, xField = "label", series = [], options = {} } = block;

  const reactiveScope = React.useMemo(() => {
    return buildReactiveScope(datasets, variables);
  }, [datasets, variables]);

  const activeDataset = dataset || (block.dataset ? datasets[block.dataset] : undefined);
  const rows = activeDataset
    ? reactiveScope.datasets[activeDataset.id]?.rows || activeDataset.rows
    : [
        { [xField]: "2023", value: 35 },
        { [xField]: "2024", value: 55 },
        { [xField]: "2025", value: 75 },
        { [xField]: "2026", value: 95 },
      ];

  const labels = rows.map((r: any) => String(r[xField] ?? ""));

  const seriesDefs =
    series.length > 0
      ? series
      : [{ field: "value", label: options.unit || "Value" }];

  const chartSeriesDatasets = seriesDefs.map((s, idx) => {
    const color = s.color || themeChartColors[idx % themeChartColors.length];
    const dataValues = rows.map((r: any) => Number(r[s.field] ?? 0));

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
    return {
      label: s.label || s.field,
      data: dataValues,
      backgroundColor: color,
      borderRadius: 4,
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
  const animateDuration = prefersReducedMotion ? 0 : (options.animateMs ?? 700);

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
          font: { family: "var(--theme-font-body, sans-serif)", size: 12 },
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
                font: { family: "var(--theme-font-body, sans-serif)", size: 12 },
              },
            },
            y: {
              grid: { color: "rgba(128, 128, 128, 0.15)" },
              ticks: {
                color: "var(--theme-secondary, #6B7280)",
                font: { family: "var(--theme-font-body, sans-serif)", size: 12 },
              },
            },
          },
  };

  return (
    <div className="block-chart" style={{ width: "100%", height: "100%", position: "relative" }}>
      {/* Visual Chart */}
      <div style={{ width: "100%", height: "100%" }}>
        {(kind === "bar" || kind === "column" || kind === "stacked") && (
          <Bar data={chartData} options={chartOptions} />
        )}
        {(kind === "line" || kind === "area") && (
          <Line data={chartData} options={chartOptions} />
        )}
        {kind === "pie" && <Pie data={chartData} options={chartOptions} />}
        {kind === "donut" && <Doughnut data={chartData} options={chartOptions} />}
        {kind === "radar" && <Radar data={chartData} options={chartOptions} />}
        {kind === "scatter" && <Scatter data={chartData} options={chartOptions} />}
      </div>

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
