import request from '@/utils/http'
import type { AdminTeam, AdminTeamResources, AdminUser, TeamAuditLog, UserGroup } from './types'

export type { AdminTeam, AdminTeamResources, AdminUser, TeamAuditLog, UserGroup } from './types'

export const customerApi = {
  users: (params?: Record<string, string>) =>
    request.get<AdminUser[]>({ url: '/v1/admin/users', params }),
  user: (id: string) => request.get<AdminUser>({ url: `/v1/admin/users/${id}` }),
  updateUserProfile: (id: string, data: Record<string, unknown>) =>
    request.request<AdminUser>({ url: `/v1/admin/users/${id}/profile`, method: 'PATCH', data }),
  updateUserGroups: (id: string, groupIds: string[]) =>
    request.request<{ groupIds: string[] }>({
      url: `/v1/admin/users/${id}/groups`,
      method: 'PATCH',
      data: { groupIds }
    }),
  revokeUserSessions: (id: string) =>
    request.post<{ revoked: number }>({
      url: `/v1/admin/users/${id}/revoke-sessions`,
      params: {},
      showSuccessMessage: true
    }),
  setUserStatus: (id: string, status: AdminUser['status']) =>
    request.request({
      url: `/v1/admin/users/${id}/status`,
      method: 'PATCH',
      data: { status },
      showSuccessMessage: true
    }),
  adjustCredits: (id: string, amount: number, reason: string) =>
    request.post({
      url: `/v1/admin/users/${id}/credits`,
      params: { amount, reason },
      showSuccessMessage: true
    }),
  groups: () => request.get<UserGroup[]>({ url: '/v1/admin/groups' }),
  saveGroup: (data: Record<string, unknown>, id?: string) =>
    request.request<UserGroup>({
      url: id ? `/v1/admin/groups/${id}` : '/v1/admin/groups',
      method: id ? 'PATCH' : 'POST',
      data,
      showSuccessMessage: true
    }),
  deleteGroup: (id: string) =>
    request.del({ url: `/v1/admin/groups/${id}`, showSuccessMessage: true }),
  setDefaultGroup: (id: string) =>
    request.post({ url: `/v1/admin/groups/${id}/default`, params: {}, showSuccessMessage: true }),
  saveGroupPolicy: (id: string, data: Record<string, unknown>) =>
    request.request({
      url: `/v1/admin/groups/${id}/policy`,
      method: 'PATCH',
      data,
      showSuccessMessage: true
    }),
  groupMembers: (id: string) =>
    request.get<Array<{ user: AdminUser }>>({ url: `/v1/admin/groups/${id}/members` }),
  addGroupMembers: (id: string, userIds: string[]) =>
    request.post({
      url: `/v1/admin/groups/${id}/members`,
      data: { userIds },
      showSuccessMessage: true
    }),
  removeGroupMember: (id: string, userId: string) =>
    request.del({ url: `/v1/admin/groups/${id}/members/${userId}`, showSuccessMessage: true }),
  teams: () => request.get<AdminTeam[]>({ url: '/v1/admin/teams' }),
  saveTeam: (
    id: string,
    data: {
      name?: string
      seatLimit?: number
      status?: AdminTeam['status']
      billingEnabled?: boolean
    }
  ) =>
    request.request<AdminTeam>({
      url: `/v1/admin/teams/${id}`,
      method: 'PATCH',
      data,
      showSuccessMessage: true
    }),
  adjustTeamCredits: (id: string, data: { amount: number; reason: string }) =>
    request.post({ url: `/v1/admin/teams/${id}/credits`, data, showSuccessMessage: true }),
  saveTeamMemberQuota: (id: string, userId: string, monthlyCreditLimit: number | null) =>
    request.request({
      url: `/v1/admin/teams/${id}/members/${userId}/quota`,
      method: 'PATCH',
      data: { monthlyCreditLimit },
      showSuccessMessage: true
    }),
  teamAuditLogs: (id: string) =>
    request.get<TeamAuditLog[]>({ url: `/v1/admin/teams/${id}/audit-logs` }),
  teamResources: (id: string) =>
    request.get<AdminTeamResources>({ url: `/v1/admin/teams/${id}/resources` })
}
