import { AppRouteRecord } from '@/types/router'
import { dashboardRoutes } from './dashboard'
import { articleRoutes } from './article'
import { enterpriseRoutes } from './enterprise'

/**
 * 导出所有模块化路由
 */
export const routeModules: AppRouteRecord[] = [
  dashboardRoutes,
  ...enterpriseRoutes,
  articleRoutes
]
