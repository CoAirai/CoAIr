"use client";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { SqlArtifact } from "@/lib/chat/types";

export default function SqlResultChart({ artifact, chart }: {
    artifact: SqlArtifact;
    chart: NonNullable<SqlArtifact["chart"]>;
}) {
    const colors = ["#335cff", "#1fc16b", "#ff8447", "#7d52f4"];
    const axes = <><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey={chart.x} /><YAxis /><Tooltip /><Legend /></>;
    return <ResponsiveContainer width="100%" height="100%">
        {chart.type === "line" ? <LineChart data={artifact.preview_rows} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
            {axes}{chart.y.map((key, i) => <Line key={key} dataKey={key} type="linear" stroke={colors[i % colors.length]} connectNulls={false} />)}
        </LineChart> : <BarChart data={artifact.preview_rows} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
            {axes}{chart.y.map((key, i) => <Bar key={key} dataKey={key} fill={colors[i % colors.length]} />)}
        </BarChart>}
    </ResponsiveContainer>;
}
