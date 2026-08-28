export function formatServerDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

export function formatInvitationExpiry(value: string) {
  return `${new Date(value).toLocaleDateString()} 到期`
}
