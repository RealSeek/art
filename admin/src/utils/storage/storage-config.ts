export class StorageConfig {
  static readonly STORAGE_PREFIX = 'sys'
  static readonly THEME_KEY = 'sys-theme'
  static readonly LAST_USER_ID_KEY = 'sys-last-user-id'
  static readonly RESPONSIVE_MENU_TYPE_KEY = 'sys-responsive-menu-type'

  static generateStorageKey(storeId: string): string {
    return `${this.STORAGE_PREFIX}-${storeId}`
  }
}
