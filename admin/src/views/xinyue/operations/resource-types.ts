export type ResourceRow = Record<string, any>

export type ResourceColumn = {
  key: string
  label: string
  width?: number
  minWidth?: number
  type?: 'status' | 'date' | 'bytes' | 'number' | 'image'
}

export type ResourceConfig = {
  title: string
  description: string
  icon: string
  endpoint: string
  serverPagination?: boolean
  columns: ResourceColumn[]
}

export type ResourceSelectOption = { label: string; value: string | number | boolean }

export type ResourceEditorField = {
  key: string
  label: string
  type?: 'input' | 'textarea' | 'number' | 'switch' | 'select'
  required?: boolean
  span?: number
  placeholder?: string
  maxlength?: number
  rows?: number
  min?: number
  max?: number
  multiple?: boolean
  filterable?: boolean
  allowCreate?: boolean
  options?: ResourceSelectOption[]
  optionsFrom?:
    | 'groups'
    | 'models'
    | 'tools'
    | 'knowledgeBases'
    | 'promptTemplates'
    | 'users'
    | 'assistants'
    | 'pluginCategories'
  createOnly?: boolean
  editOnly?: boolean
  omitEmpty?: boolean
  when?: { key: string; value: string | number | boolean }
}

export type ResourceEditorConfig = {
  canCreate?: boolean
  canEdit?: boolean
  canDelete?: boolean
  createLabel?: string
  createUrl?: string
  updateUrl?: (row: ResourceRow) => string
  deleteUrl?: (row: ResourceRow) => string
  fields: ResourceEditorField[]
  defaults: ResourceRow
}
