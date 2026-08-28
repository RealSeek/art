import type { AppRouteRecord } from '@/types/router'

type MenuTitleFormatter = (title: string) => string

const normalize = (value: unknown) =>
  String(value || '')
    .toLocaleLowerCase()
    .replace(/[\s_\-/]+/g, '')

export function searchMenuItems(
  items: AppRouteRecord[],
  query: string,
  formatTitle: MenuTitleFormatter
): AppRouteRecord[] {
  const terms = query.trim().split(/\s+/).map(normalize).filter(Boolean)

  if (!terms.length) return []

  const result: AppRouteRecord[] = []

  const visit = (item: AppRouteRecord, ancestors: AppRouteRecord[] = []) => {
    if (item.meta?.isHide) return

    const lineage = [...ancestors, item]
    if (item.children?.length) {
      item.children.forEach((child) => visit(child, lineage))
      return
    }

    if (!((item.path && item.path.trim()) || item.meta.link || item.meta.isIframe)) return

    const searchable = normalize(
      lineage
        .flatMap((route) => [
          formatTitle(route.meta.title),
          route.name,
          route.path,
          route.meta.resource,
          ...(route.meta.searchKeywords || [])
        ])
        .join(' ')
    )

    if (!terms.every((term) => searchable.includes(term))) return

    result.push({
      ...item,
      children: undefined,
      meta: {
        ...item.meta,
        searchBreadcrumb: ancestors.map((route) => formatTitle(route.meta.title)).filter(Boolean)
      }
    })
  }

  items.forEach((item) => visit(item))
  return result
}
