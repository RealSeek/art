export type StudioMode = 'chat' | 'images' | 'videos' | 'commerce' | 'prompts' | 'projects' | 'assets' | 'api'

export type AssetKind = 'image' | 'video' | 'text' | 'product-pack'

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: number
  attachmentIds?: string[]
  model?: string
  feedback?: 'UP' | 'DOWN' | null
}

export interface CodeArtifact {
  code: string
  language: string
  title: string
}

export interface ConversationSummary {
  id: string
  title: string
  model: string
  projectId?: string | null
  pinnedAt?: number | null
  sharedAt?: number | null
  createdAt: number
  updatedAt: number
}

export interface StudioAsset {
  id: string
  kind: AssetKind
  title: string
  prompt: string
  preview: string
  status: 'queued' | 'running' | 'done'
  createdAt: number
  tags: string[]
  source?: 'generated' | 'upload'
  purpose?: 'generated' | 'reference' | 'mask' | 'attachment' | 'library'
  contentUrl?: string
  mimeType?: string
  size?: number
  jobId?: string
  position?: number
  moduleLabel?: string
  creationType?: string
  platform?: string
  options?: Record<string, unknown>
}

export interface Project {
  id: string
  name: string
  brief: string
  updatedAt: number
  assetIds: string[]
  archived?: boolean
  description?: string
  instructions?: string
  workflowStatus: ProjectWorkflowStatus
  workflowConfig: ProjectWorkflowConfig
  defaultModel: string
  defaultAssistantId?: string | null
  revision: number
}

export type ProjectWorkflowStatus = 'PLANNING' | 'IN_PROGRESS' | 'REVIEW' | 'COMPLETED' | 'ARCHIVED'
export type ProjectStepStatus = 'TODO' | 'IN_PROGRESS' | 'DONE'

export interface ProjectWorkflowStep {
  id: string
  title: string
  description: string
  status: ProjectStepStatus
  sortOrder: number
}

export interface ProjectWorkflowConfig {
  steps: ProjectWorkflowStep[]
  defaultPrompt: string
  outputRequirements: string
}

export interface ProjectVersion {
  id: string
  projectId: string
  version: number
  label: string
  changeSummary: string
  snapshot: {
    name: string
    description: string
    instructions: string
    workflowStatus: ProjectWorkflowStatus
    workflowConfig: ProjectWorkflowConfig
    defaultModel: string
    defaultAssistantId: string | null
    revision: number
  }
  createdAt: number
}

export interface GenerationOptions {
  mode: StudioMode
  prompt: string
  model: string
  ratio: string
  count: number
  quality?: string
  modules?: number
  referenceAssetIds?: string[]
  maskAssetId?: string
  creationType?: string
  platform?: string
  outputFormat?: 'png' | 'jpeg' | 'webp'
  background?: 'auto' | 'opaque' | 'transparent'
  outputCompression?: number
  resolution?: string
  duration?: number
  aspectRatio?: string
  creditCost?: number
}

export type GenerationRunStatus = 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED'

export interface GenerationRun {
  id: string
  conversationId?: string
  prompt: string
  model: string
  mode: 'images' | 'videos' | 'commerce'
  status: GenerationRunStatus
  error: string
  assets: StudioAsset[]
  request: GenerationOptions
  createdAt: number
}
