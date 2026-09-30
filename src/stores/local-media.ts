import { defineStore } from 'pinia'
import { apiUrl } from '../services/api'
import { clearLocalMedia, deleteLocalMedia, listLocalMedia, localMediaUsage, previewUrlFor, readLocalMedia, saveLocalMedia, type LocalMediaRecord } from '../services/local-media'
import type { StudioAsset } from '../types'

const enabledKey = 'xinyue:local-media:auto-save'
/** 单文件上限：超过则只保留服务器副本并提示手动下载（避免占用浏览器配额）。 */
const MAX_LOCAL_BYTES = 300 * 1024 * 1024

type LocalMediaState = {
  enabled: boolean
  hydrated: boolean
  loading: boolean
  records: LocalMediaRecord[]
  savingIds: string[]
  error: string
  usageBytes: number
  quotaBytes: number
}

function kindOf(record: LocalMediaRecord): StudioAsset['kind'] {
  if (record.kind === 'VIDEO' || record.mimeType.startsWith('video/')) return 'video'
  if (record.kind === 'AUDIO' || record.mimeType.startsWith('audio/')) return 'audio'
  if (record.kind === 'PRODUCT_PACK') return 'product-pack'
  return record.mimeType.startsWith('image/') ? 'image' : 'text'
}

export const useLocalMediaStore = defineStore('local-media', {
  state: (): LocalMediaState => ({
    enabled: typeof window === 'undefined' ? true : window.localStorage.getItem(enabledKey) !== 'off',
    hydrated: false,
    loading: false,
    records: [],
    savingIds: [],
    error: '',
    usageBytes: 0,
    quotaBytes: 0,
  }),
  getters: {
    savedIds: (state) => new Set(state.records.map((record) => record.id)),
    /** 服务器副本已被清理、只存在本机的素材，合并进文件库展示。 */
    localOnlyAssets(state): StudioAsset[] {
      return state.records.map((record) => ({
        id: record.id,
        kind: kindOf(record),
        title: record.name,
        prompt: record.prompt,
        preview: '',
        status: 'done' as const,
        createdAt: record.createdAt || record.savedAt,
        expiresAt: null,
        tags: ['本机副本'],
        source: 'generated' as const,
        purpose: 'generated' as const,
        contentUrl: previewUrlFor(record),
        mimeType: record.mimeType,
        size: record.blob?.size || record.size,
        options: record.model ? { requestedModel: record.model } : undefined,
      }))
    },
  },
  actions: {
    async hydrate() {
      if (this.hydrated || typeof indexedDB === 'undefined') return
      this.loading = true
      try {
        this.records = await listLocalMedia()
        await this.refreshUsage()
        this.hydrated = true
      } catch (reason) {
        this.error = reason instanceof Error ? reason.message : '无法读取本机媒体库'
      } finally {
        this.loading = false
      }
    },
    setEnabled(enabled: boolean) {
      this.enabled = enabled
      if (typeof window !== 'undefined') window.localStorage.setItem(enabledKey, enabled ? 'on' : 'off')
    },
    async refreshUsage() {
      const usage = await localMediaUsage()
      this.usageBytes = usage.bytes
      this.quotaBytes = usage.quota
    },
    /** 生成成功后自动把结果存到本机（失败只记录提示，不影响生成流程）。 */
    async captureGenerated(assets: StudioAsset[]) {
      if (!this.enabled) return
      await this.hydrate()
      for (const asset of assets) {
        if (asset.source !== 'generated' && asset.purpose !== 'generated') continue
        if (asset.status !== 'done' || !asset.contentUrl) continue
        await this.saveAsset(asset).catch(() => undefined)
      }
    },
    async saveAsset(asset: StudioAsset) {
      if (asset.kind === 'text' || !asset.contentUrl) return
      if (this.savedIds.has(asset.id)) return
      this.savingIds = [...this.savingIds, asset.id]
      this.error = ''
      try {
        const response = await fetch(apiUrl(asset.contentUrl), { credentials: 'include' })
        if (!response.ok) throw new Error(`素材下载失败 (${response.status})`)
        const blob = await response.blob()
        if (blob.size > MAX_LOCAL_BYTES) throw new Error(`素材超过 ${Math.round(MAX_LOCAL_BYTES / 1024 / 1024)} MB，请直接下载到本地文件夹`)
        const record: LocalMediaRecord = {
          id: asset.id,
          name: asset.title,
          mimeType: asset.mimeType || blob.type || 'application/octet-stream',
          size: blob.size,
          kind: asset.kind === 'video' ? 'VIDEO' : asset.kind === 'audio' ? 'AUDIO' : asset.kind === 'product-pack' ? 'PRODUCT_PACK' : 'IMAGE',
          prompt: asset.prompt,
          model: String(asset.options?.requestedModel || ''),
          createdAt: asset.createdAt,
          savedAt: Date.now(),
          blob,
        }
        await saveLocalMedia(record)
        this.records = [record, ...this.records.filter((item) => item.id !== record.id)]
        await this.refreshUsage()
      } catch (reason) {
        this.error = reason instanceof Error ? reason.message : '保存到本机失败'
        throw reason
      } finally {
        this.savingIds = this.savingIds.filter((id) => id !== asset.id)
      }
    },
    async removeLocal(id: string) {
      await deleteLocalMedia(id)
      this.records = this.records.filter((record) => record.id !== id)
      await this.refreshUsage()
    },
    async clearAll() {
      const removed = await clearLocalMedia()
      this.records = []
      await this.refreshUsage()
      return removed
    },
    async read(id: string) {
      const cached = this.records.find((record) => record.id === id)
      return cached || readLocalMedia(id)
    },
  },
})
