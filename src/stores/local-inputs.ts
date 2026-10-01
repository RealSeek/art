import { defineStore } from 'pinia'
import { clearLocalInputs, deleteLocalInput, listLocalInputs, localInputDataUrl, localInputPreviewUrl, releaseLocalInput, saveLocalInput, type LocalInputKind, type LocalInputRecord } from '../services/local-inputs'
import { compressImageForUpload } from '../utils/image-compress'

type LocalInputsState = {
  records: LocalInputRecord[]
  hydrated: boolean
  loading: boolean
}

export type GenerationInputPayload = {
  references: Array<{ id: string; name: string; mimeType: string; dataUrl: string }>
  audios: Array<{ id: string; name: string; mimeType: string; dataUrl: string }>
  mask?: { id?: string; name: string; mimeType: string; dataUrl: string }
}

async function imageDimensions(blob: Blob) {
  try {
    const bitmap = await createImageBitmap(blob)
    const size = { width: bitmap.width, height: bitmap.height }
    bitmap.close()
    return size
  } catch {
    return { width: 0, height: 0 }
  }
}

/**
 * 生成用的本机素材：参考图 / 参考音频 / 蒙版都存在浏览器里，
 * 提交生成时以 Data URL 直发上游，服务器不再保存这些素材。
 */
export const useLocalInputsStore = defineStore('local-inputs', {
  state: (): LocalInputsState => ({ records: [], hydrated: false, loading: false }),
  getters: {
    references: (state) => state.records.filter((record) => record.kind === 'reference'),
    audios: (state) => state.records.filter((record) => record.kind === 'audio'),
    mask: (state) => state.records.find((record) => record.kind === 'mask') || null,
    images: (state) => state.records.filter((record) => record.kind === 'reference' && record.mimeType.startsWith('image/')),
  },
  actions: {
    async hydrate() {
      if (this.hydrated || typeof indexedDB === 'undefined') return
      this.loading = true
      try {
        this.records = await listLocalInputs()
        this.hydrated = true
      } finally {
        this.loading = false
      }
    },
    async addFiles(files: File[], kind: LocalInputKind) {
      await this.hydrate()
      const added: LocalInputRecord[] = []
      for (const file of files) {
        const prepared = kind === 'mask' ? file : await compressImageForUpload(file)
        const dimensions = prepared.type.startsWith('image/') ? await imageDimensions(prepared) : { width: 0, height: 0 }
        const record: LocalInputRecord = {
          id: `local:${crypto.randomUUID()}`,
          name: prepared.name,
          mimeType: prepared.type || 'application/octet-stream',
          size: prepared.size,
          kind,
          width: dimensions.width,
          height: dimensions.height,
          createdAt: Date.now(),
          blob: prepared,
        }
        await saveLocalInput(record)
        added.push(record)
      }
      this.records = [...this.records, ...added]
      return added
    },
    /** 区域编辑器产出的蒙版（本机保存，尺寸与参考图一致）。 */
    async setMask(blob: Blob, width: number, height: number) {
      await this.hydrate()
      await this.clearMask()
      const record: LocalInputRecord = {
        id: `local:${crypto.randomUUID()}`,
        name: `region-mask-${Date.now()}.png`,
        mimeType: blob.type || 'image/png',
        size: blob.size,
        kind: 'mask',
        width,
        height,
        createdAt: Date.now(),
        blob,
      }
      await saveLocalInput(record)
      this.records = [...this.records, record]
      return record
    },
    async remove(id: string) {
      await deleteLocalInput(id)
      releaseLocalInput(id)
      this.records = this.records.filter((record) => record.id !== id)
    },
    async clearMask() {
      for (const record of this.records.filter((item) => item.kind === 'mask')) await this.remove(record.id)
    },
    async clearAll() {
      await clearLocalInputs()
      for (const record of this.records) releaseLocalInput(record.id)
      this.records = []
      this.hydrated = true
    },
    previewUrl(record: LocalInputRecord) {
      return localInputPreviewUrl(record)
    },
    /** 参考图按列表顺序编号，与 @参考图N 标记一一对应。 */
    mentionOptions() {
      return [
        ...this.images.map((record, index) => ({ token: `@参考图${index}`, label: `参考图${index}`, kind: 'image' as const, thumbnail: localInputPreviewUrl(record), title: record.name })),
        ...this.records.filter((record) => record.kind === 'audio').map((record, index) => ({ token: `@参考音频${index}`, label: `参考音频${index}`, kind: 'audio' as const, thumbnail: '', title: record.name })),
      ]
    },
    /** 提交生成时的内联素材（顺序与界面编号一致）。 */
    async payload(): Promise<GenerationInputPayload> {
      const references = await Promise.all(this.images.map(async (record) => ({ id: record.id, name: record.name, mimeType: record.mimeType, dataUrl: await localInputDataUrl(record) })))
      const audios = await Promise.all(this.records.filter((record) => record.kind === 'audio').map(async (record) => ({ id: record.id, name: record.name, mimeType: record.mimeType, dataUrl: await localInputDataUrl(record) })))
      const mask = this.mask
      return { references, audios, ...(mask ? { mask: { id: mask.id, name: mask.name, mimeType: mask.mimeType, dataUrl: await localInputDataUrl(mask) } } : {}) }
    },
    /**
     * 按提交时的素材 id 还原内联素材（重试路径）：任务记录里没有本机素材的数据，只有这份 id。
     * 任一素材已被清理就返回 null，让上层给出可溯源的提示，而不是静默换成别的素材。
     */
    async payloadForIds(ids: { referenceIds: string[]; audioIds: string[]; maskId?: string }): Promise<GenerationInputPayload | null> {
      await this.hydrate()
      const byId = new Map(this.records.map((record) => [record.id, record]))
      const readList = async (recordIds: string[], kind: LocalInputKind) => {
        const items: GenerationInputPayload['references'] = []
        for (const id of recordIds) {
          const record = byId.get(id)
          if (!record || record.kind !== kind) return null
          items.push({ id: record.id, name: record.name, mimeType: record.mimeType, dataUrl: await localInputDataUrl(record) })
        }
        return items
      }
      const references = await readList(ids.referenceIds, 'reference')
      const audios = await readList(ids.audioIds, 'audio')
      const mask = ids.maskId ? byId.get(ids.maskId) : undefined
      if (!references || !audios || (ids.maskId && mask?.kind !== 'mask')) return null
      return { references, audios, ...(mask ? { mask: { id: mask.id, name: mask.name, mimeType: mask.mimeType, dataUrl: await localInputDataUrl(mask) } } : {}) }
    },
  },
})
