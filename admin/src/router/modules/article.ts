import { AppRouteRecord } from '@/types/router'

export const articleRoutes: AppRouteRecord = {
  path: '/article',
  name: 'Article',
  component: '/index/index',
  meta: {
    title: 'menus.about.title',
    icon: 'ri:book-2-line',
    isHide: true,
    roles: ['R_SUPER', 'R_ADMIN']
  },
  children: [
    {
      path: 'article-list',
      name: 'ArticleList',
      component: '/article/list',
      meta: {
        title: 'menus.about.contentList',
        icon: 'ri:article-line',
        keepAlive: true,
        authList: [
          { title: '新增', authMark: 'add' },
          { title: '编辑', authMark: 'edit' }
        ]
      }
    },
    {
      path: 'detail/:id',
      name: 'ArticleDetail',
      component: '/article/detail',
      meta: {
        title: 'menus.about.contentDetail',
        isHide: true,
        keepAlive: true,
        activePath: '/article/article-list'
      }
    },
    {
      path: 'publish',
      name: 'ArticlePublish',
      component: '/article/publish',
      meta: {
        title: 'menus.about.contentEdit',
        isHide: true,
        keepAlive: true,
        activePath: '/article/article-list',
        authList: [{ title: '发布', authMark: 'add' }]
      }
    }
  ]
}
