import request from '@/utils/http'
import type { AdminAccountIdentity, CapabilityRegistrySnapshot, SystemSettings } from './types'

export type {
  AdminAccountIdentity,
  CapabilityRegistrySnapshot,
  ChatHomeContent,
  ChatQuickAction,
  ChatUiPreset,
  SiteContent,
  SystemSettings
} from './types'

export const settingsApi = {
  systemSettings: () => request.get<SystemSettings>({ url: '/v1/admin/system-settings' }),
  newApiGroups: () => request.get<string[]>({ url: '/v1/admin/new-api/groups' }),
  capabilityRegistry: () =>
    request.get<CapabilityRegistrySnapshot>({ url: '/v1/admin/capability-registry' }),
  updateAdminAccount: (data: { currentPassword: string; email?: string; newPassword?: string }) =>
    request.request<{ user: AdminAccountIdentity }>({
      url: '/v1/auth/admin/account',
      method: 'PATCH',
      data
    }),
  uploadChatHomeImage: (data: FormData) =>
    request.post<{ assetId: string; imageUrl: string }>({
      url: '/v1/admin/system-settings/chat-home-image',
      data,
      showSuccessMessage: true
    }),
  saveSystemSettings: (data: Record<string, unknown>) =>
    request.request<SystemSettings>({
      url: '/v1/admin/system-settings',
      method: 'PATCH',
      data,
      showSuccessMessage: true
    })
}
