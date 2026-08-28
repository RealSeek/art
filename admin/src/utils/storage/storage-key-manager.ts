import { StorageConfig } from './storage-config'

export class StorageKeyManager {
  getStorageKey(storeId: string): string {
    return StorageConfig.generateStorageKey(storeId)
  }
}
