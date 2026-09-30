/**
 * 平台生成结果的本机副本（IndexedDB）。
 *
 * 服务器只做临时中转（默认保留 1 天），生成成功后把图片/视频存到浏览器本地，
 * 文件库即使服务器副本被清理也能继续预览、下载。
 */
export type LocalMediaRecord = {
  id: string
  name: string
  mimeType: string
  size: number
  kind: string
  prompt: string
  model: string
  /** 服务器上的创建时间（毫秒）。 */
  createdAt: number
  /** 保存到本机的时间（毫秒）。 */
  savedAt: number
  blob: Blob
}

const DB_NAME = 'xinyue-local-media'
const STORE_NAME = 'assets'
const DB_VERSION = 1

const previewUrls = new Map<string, string>()

/** 本机副本的预览地址（同一 id 复用，删除时释放）。 */
export function previewUrlFor(record: LocalMediaRecord) {
  const existing = previewUrls.get(record.id)
  if (existing) return existing
  const url = URL.createObjectURL(record.blob)
  previewUrls.set(record.id, url)
  return url
}

export function releasePreviewUrl(id: string) {
  const url = previewUrls.get(id)
  if (!url) return
  URL.revokeObjectURL(url)
  previewUrls.delete(id)
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME, { keyPath: 'id' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('无法打开本机媒体库'))
  })
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('本机媒体库操作失败'))
  })
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await openDatabase()
  try {
    const transaction = database.transaction(STORE_NAME, mode)
    const result = await requestResult(run(transaction.objectStore(STORE_NAME)))
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error || new Error('本机媒体库写入失败'))
      transaction.onabort = () => reject(transaction.error || new Error('本机媒体库写入中止'))
    })
    return result
  } finally {
    database.close()
  }
}

export function saveLocalMedia(record: LocalMediaRecord) {
  return withStore('readwrite', (store) => store.put(record))
}

export async function readLocalMedia(id: string) {
  return (await withStore<LocalMediaRecord | undefined>('readonly', (store) => store.get(id))) || null
}

export async function listLocalMedia() {
  const records = await withStore<LocalMediaRecord[]>('readonly', (store) => store.getAll())
  return records.sort((left, right) => right.savedAt - left.savedAt)
}

export async function deleteLocalMedia(id: string) {
  releasePreviewUrl(id)
  return withStore('readwrite', (store) => store.delete(id))
}

export async function clearLocalMedia() {
  const records = await listLocalMedia()
  for (const record of records) releasePreviewUrl(record.id)
  await withStore('readwrite', (store) => {
    for (const record of records) store.delete(record.id)
    return store.count()
  })
  return records.length
}

/** 已占用空间与浏览器配额（不支持时配额为 0）。 */
export async function localMediaUsage() {
  const records = await listLocalMedia()
  const bytes = records.reduce((total, record) => total + (record.blob?.size || record.size || 0), 0)
  const estimate = await navigator.storage?.estimate?.().catch(() => null)
  return { count: records.length, bytes, quota: estimate?.quota || 0, usage: estimate?.usage || bytes }
}
