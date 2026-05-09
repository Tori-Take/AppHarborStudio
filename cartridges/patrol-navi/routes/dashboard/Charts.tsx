'use client'

import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend,
} from 'recharts'

export type MonthlyPoint = { month: string; sheets: number; ng: number }
export type CategoryPoint = { name: string; count: number }

export function MonthlyTrendChart({ data }: { data: MonthlyPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data}>
        <CartesianGrid stroke="#eee" strokeDasharray="3 3" />
        <XAxis dataKey="month" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
        <Tooltip />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line type="monotone" dataKey="sheets" name="シート数" stroke="#3b82f6" strokeWidth={2} />
        <Line type="monotone" dataKey="ng"     name="NG件数"   stroke="#ef4444" strokeWidth={2} />
      </LineChart>
    </ResponsiveContainer>
  )
}

export function CategoryBarChart({ data }: { data: CategoryPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(180, data.length * 28)}>
      <BarChart data={data} layout="vertical" margin={{ left: 80 }}>
        <CartesianGrid stroke="#eee" strokeDasharray="3 3" />
        <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
        <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={140} />
        <Tooltip />
        <Bar dataKey="count" name="NG件数" fill="#ef4444" />
      </BarChart>
    </ResponsiveContainer>
  )
}
