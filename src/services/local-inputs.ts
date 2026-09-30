/**
 * 生成任务的本地参考素材（gpt-image-studio 式本地优先）：
 * 参考图与蒙版只存在当前浏览器，提交生成时以 base64 Data URL 随请求发给上游，
 * 服务器不落库、不占存储，也不受媒体保留期影响。
 */
export type LocalInputKind = 'reference' | 'audio' | 'mask'

export type LocalInputRecord = {
  id: string
  name: string
  mimeType: string
  size: number
  kind: LocalInputKind
  /** 原始像素尺寸，用于按参考图比例推导输出尺寸。 */
  width: number
  height: number
  createdAt: number
  blob: Blob
}

const DB_NAME = 'xinyue-local-inputs'
const STORE_NAME = 'files'
const DB_VERSION = 1

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME, { keyPath: 'id' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('无法打开本机素材库'))
  })
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('本机素材库操作失败'))
  })
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await openDatabase()
  try {
    const transaction = database.transaction(STORE_NAME, mode)
    const result = await requestResult(run(transaction.objectStore(STORE_NAME)))
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error || new Error('本机素材库写入失败'))
      transaction.onabort = () => reject(transaction.error || new Error('本机素材库写入中止'))
    })
    return result
  } finally {
    database.close()
  }
}

export function saveLocalInput(record: LocalInputRecord) {
  return withStore('readwrite', (store) => store.put(record))
}

export function deleteLocalInput(id: string) {
  return withStore('readwrite', (store) => store.delete(id))
}

export async function listLocalInputs(kind?: LocalInputKind) {
  const records = await withStore<LocalInputRecord[]>('readonly', (store) => store.getAll())
  return records.filter((record) => !kind || record.kind === kind).sort((left, right) => left.createdAt - right.createdAt)
}

export async function clearLocalInputs() {
  const records = await listLocalInputs()
  await withStore('readwrite', (store) => {
    for (const record of records) store.delete(record.id)
    return store.count()
  })
  return records.length
}

const dataUrlCache = new Map<string, string>()

/** Data URL（含缓存），提交生成时使用。 */
export async function localInputDataUrl(record: LocalInputRecord) {
  const cached = dataUrlCache.get(record.id)
  if (cached) return cached
  const buffer = await record.blob.arrayBuffer()
  let binary = ''
  const bytes = new Uint8Array(buffer)
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  }
  const dataUrl = `data:${record.mimeType};base64,${btoa(binary)}`
  dataUrlCache.set(record.id, dataUrl)
  return dataUrl
}

const objectUrls = new Map<string, string>()

/** 预览地址（同一 id 复用）。 */
export function localInputPreviewUrl(record: LocalInputRecord) {
  const existing = objectUrls.get(record.id)
  if (existing) return existing
  const url = URL.createObjectURL(record.blob)
  objectUrls.set(record.id, url)
  return url
}

export function releaseLocalInput(id: string) {
  dataUrlCache.delete(id)
  const url = objectUrls.get(id)
  if (url) {
    URL.revokeObjectURL(url)
    objectUrls.delete(id)
  }
}
