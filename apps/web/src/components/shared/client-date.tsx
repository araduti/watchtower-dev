"use client"

import { useEffect, useState } from "react"

const VARIANT_OPTIONS: Record<string, Intl.DateTimeFormatOptions> = {
  date: {
    year: "numeric",
    month: "short",
    day: "numeric",
  },
  datetime: {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  },
  "datetime-seconds": {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  },
}

interface ClientDateProps {
  value: string | Date | null | undefined
  variant?: "date" | "datetime" | "datetime-seconds"
  options?: Intl.DateTimeFormatOptions
  fallback?: string
  className?: string
}

export function ClientDate({
  value,
  variant = "date",
  options,
  fallback = "—",
  className,
}: ClientDateProps) {
  const [formatted, setFormatted] = useState<string>(() => {
    if (!value) return fallback
    try {
      return new Date(value).toISOString()
    } catch {
      return fallback
    }
  })

  useEffect(() => {
    if (!value) {
      setFormatted(fallback)
      return
    }
    try {
      const d = new Date(value)
      const fmt = options ?? VARIANT_OPTIONS[variant]
      setFormatted(d.toLocaleString(undefined, fmt))
    } catch {
      setFormatted(fallback)
    }
  }, [value, variant, options, fallback])

  return (
    <span className={className} suppressHydrationWarning>
      {formatted}
    </span>
  )
}
