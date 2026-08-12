const compactDateTime = new Intl.DateTimeFormat('zh-CN', {
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

const fullDateTime = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

const dateOnly = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

export function formatDateTime(value?: string | null, includeYear = false) {
  if (!value) return '无'
  return (includeYear ? fullDateTime : compactDateTime).format(new Date(value))
}

export function formatDate(value?: string | null) {
  if (!value) return '无'
  return dateOnly.format(new Date(value))
}

export function formatCurrency(cents: number, currency = 'CNY') {
  return new Intl.NumberFormat('zh-CN', { style: 'currency', currency }).format(cents / 100)
}

export function formatFileSize(value: number) {
  if (!value) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1)
  return `${(value / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`
}

export function initial(value?: string | null, fallback = 'U') {
  return (value?.trim().slice(0, 1) || fallback).toUpperCase()
}
