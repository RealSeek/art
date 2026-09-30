import type { StudioAsset } from '../types'

/**
 * 合并服务器素材与本机副本：服务器副本已被清理的文件仍然出现在文件库里，
 * 同一 id 以服务器素材为准（标题、团队、权限等元信息更完整）。
 */
export function mergeLocalAssets(serverAssets: StudioAsset[], localAssets: StudioAsset[]) {
  const known = new Set(serverAssets.map((asset) => asset.id))
  return [...serverAssets, ...localAssets.filter((asset) => !known.has(asset.id))]
    .sort((left, right) => right.createdAt - left.createdAt)
}
