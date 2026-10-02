import { Injectable, Logger } from '@nestjs/common'
import { AssetKind, GenerationJob, PluginCapability, Prisma, ProviderType } from '@prisma/client'
import { AssetsService } from '../../assets/assets.service'
import { PrismaService } from '../../prisma/prisma.service'
import { ProvidersService, ResolvedProvider } from '../../providers/providers.service'
import { GenerationJobCancelledError, GenerationRunner } from '../generation-runners'
import { GenerationOutputService } from '../generation-output.service'
import { PublicEndpointPolicyService } from '../../common/public-endpoint-policy.service'
import { readResponseBytes } from '../../common/response-bytes'
import { fetchNoRedirect, fetchPublicNoRedirect, fetchPublicManualRedirect } from '../../common/outbound-http'

const MAX_GENERATED_VIDEO_BYTES = 500 * 1024 * 1024
import { ProviderRequestError, ReconciliationRequiredError, TerminalProviderJobError, TerminalSettlementError } from '../generation-provider-errors'
import { MAX_VIDEO_AUDIO_BYTES, MAX_VIDEO_REFERENCE_BYTES, normalizeVideoOptions, videoCapabilities } from '../video-options'
import { GenerationSettlementService } from '../generation-settlement.service'
import { ProviderAttemptAuditService } from '../provider-attempt-audit.service'

type ProviderPayload = {
  [key: string]: unknown
  data?: Array<Record<string, unknown>> | Record<string, unknown>
}

class JobCancelledError extends GenerationJobCancelledError {}

@Injectable()
export class VideoGenerationRunner implements GenerationRunner {
  readonly kind = 'VIDEO' as const
  private readonly logger = new Logger(VideoGenerationRunner.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly assets: AssetsService,
    private readonly providers: ProvidersService,
    private readonly outputs: GenerationOutputService,
    private readonly endpointPolicy: PublicEndpointPolicyService,
    private readonly attemptAudit: ProviderAttemptAuditService,
    private readonly settlement: GenerationSettlementService,
  ) {}

  private async provider(resolved: ResolvedProvider, path: string, body: unknown, timeoutMs = resolved.timeoutMs) {
    if (!resolved.apiKey) throw new ProviderRequestError('AI provider is not configured')
    let response: Response
    try {
      response = await this.providerFetch(resolved, `${resolved.baseUrl}${path}`, { method: 'POST', headers: this.providers.buildRequestHeaders(resolved), body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) })
    } catch (error) {
      if (videoCapabilities(resolved.videoCapabilities).referenceMode === 'CONTENT_JSON') throw new ReconciliationRequiredError(`Seedance 创建结果不明，请核对原请求，禁止自动重发：${error instanceof Error ? error.message : String(error)}`)
      throw new ProviderRequestError(error instanceof Error ? error.message : 'Provider network request failed')
    }
    if (videoCapabilities(resolved.videoCapabilities).referenceMode === 'CONTENT_JSON' && (response.status >= 500 || response.status === 408)) throw new ReconciliationRequiredError(`Seedance 创建结果不明，HTTP ${response.status}：${(await response.text()).slice(0, 500)}`)
    if (!response.ok) throw new ProviderRequestError(`Provider returned ${response.status}: ${(await response.text()).slice(0, 500)}`, response.status)
    try { return await response.json() as ProviderPayload }
    catch (error) {
      if (videoCapabilities(resolved.videoCapabilities).referenceMode === 'CONTENT_JSON') throw new ReconciliationRequiredError(`Seedance 创建响应无法解析，请核对原请求：${error instanceof Error ? error.message : String(error)}`)
      throw error
    }
  }

  private async providerForm(resolved: ResolvedProvider, path: string, form: FormData) {
    if (!resolved.apiKey) throw new ProviderRequestError('AI provider is not configured')
    let response: Response
    try {
      response = await this.providerFetch(resolved, `${resolved.baseUrl}${path}`, { method: 'POST', headers: this.providers.buildRequestHeaders(resolved, 'openai', undefined), body: form, signal: AbortSignal.timeout(resolved.timeoutMs) })
    } catch (error) {
      throw new ProviderRequestError(error instanceof Error ? error.message : 'Provider network request failed')
    }
    if (!response.ok) throw new ProviderRequestError(`Provider returned ${response.status}: ${(await response.text()).slice(0, 500)}`, response.status)
    return response.json() as Promise<ProviderPayload>
  }

  private canFailover(error: unknown) {
    if (error instanceof TerminalProviderJobError) return false
    if (!(error instanceof ProviderRequestError)) return false
    if (error.status === undefined) return true
    return [401, 403, 404, 408, 409, 425, 429].includes(error.status) || error.status >= 500
  }

  private async withProviderFailover<T>(task: GenerationJob, capability: 'CHAT' | 'IMAGE' | 'VIDEO', execute: (provider: ResolvedProvider) => Promise<T>) {
    const { referenceImages: _images, referenceAudios: _audios, ...options } = task.options as Record<string, unknown>
    const candidates = await this.providers.resolveCandidates(task.userId, String(options.requestedModel || task.model), capability, options)
    const nativeTask = task.providerJobId && (candidates.some(candidate => videoCapabilities(candidate.videoCapabilities).referenceMode === 'CONTENT_JSON') || /seedance/i.test(task.model))
    const runnable = nativeTask ? candidates.filter(candidate => (task.providerChannelId || undefined) === candidate.providerId && (task.userCredentialId || undefined) === candidate.credentialId) : candidates
    if (nativeTask && !runnable.length) throw new ReconciliationRequiredError(`Seedance 任务 ${task.providerJobId} 的原渠道不可用，请核对原任务`)
    const attempts: Array<Record<string, unknown>> = Array.isArray(options.providerAttempts) ? [...options.providerAttempts] : []
    let lastError: unknown
    for (const candidate of runnable) {
      const startedAt = Date.now()
      const attemptMetadata = { providerId: candidate.providerId || null, routeId: candidate.routeId || null, credentialId: candidate.credentialId || null }
      const providerAttempt = await this.attemptAudit.start({ generationId: task.id, provider: `${candidate.source}:${candidate.type}`, model: candidate.model, metadata: attemptMetadata as Prisma.InputJsonValue })
      let result: T
      try {
        result = await execute(candidate)
      } catch (error) {
        lastError = error
        const message = error instanceof Error ? error.message : 'Provider request failed'
        await this.attemptAudit.fail({ id: providerAttempt.id, generationId: task.id, errorCode: error instanceof ProviderRequestError && error.status ? `HTTP_${error.status}` : 'PROVIDER_ERROR', errorMessage: message, metadata: { ...attemptMetadata, latencyMs: Date.now() - startedAt } as Prisma.InputJsonValue })
        attempts.push({ source: candidate.source, providerId: candidate.providerId, credentialId: candidate.credentialId, routeId: candidate.routeId, label: candidate.label, model: candidate.model, status: 'failed', latencyMs: Date.now() - startedAt, error: message.slice(0, 500), at: new Date().toISOString() })
        try { await this.providers.recordCandidateResult(candidate, false, message) } catch (reason) { this.logger.warn(`Provider health write failed: ${reason instanceof Error ? reason.message : String(reason)}`) }
        await this.updateRunningTask(task, { options: { ...options, providerAttempts: attempts } as Prisma.InputJsonValue })
        if (!this.canFailover(error)) break
        continue
      }
      await this.attemptAudit.succeed({ id: providerAttempt.id, generationId: task.id, metadata: { ...attemptMetadata, latencyMs: Date.now() - startedAt } as Prisma.InputJsonValue })
      attempts.push({ source: candidate.source, providerId: candidate.providerId, credentialId: candidate.credentialId, routeId: candidate.routeId, label: candidate.label, model: candidate.model, status: 'succeeded', latencyMs: Date.now() - startedAt, at: new Date().toISOString() })
      try { await this.providers.recordCandidateResult(candidate, true) } catch (reason) { this.logger.warn(`Provider health write failed: ${reason instanceof Error ? reason.message : String(reason)}`) }
      const originalPricing = task.pricingSnapshot && typeof task.pricingSnapshot === 'object' && !Array.isArray(task.pricingSnapshot) ? task.pricingSnapshot as Record<string, unknown> : {}
      await this.updateRunningTask(task, { provider: `${candidate.source}:${candidate.type}`, providerChannelId: candidate.providerId || null, userCredentialId: candidate.credentialId || null, userModelRouteId: candidate.source === 'user' ? candidate.routeId || null : null, model: candidate.model, pricingSnapshot: { ...originalPricing, source: candidate.source, presetKey: candidate.presetKey || '', model: candidate.model, settlementCurrency: candidate.settlementCurrency, creditValueMicros: candidate.creditValueMicros, pricingUsdExchangeRateMicros: candidate.pricingUsdExchangeRateMicros, inputCreditsPerMillion: candidate.inputCreditsPerMillion, outputCreditsPerMillion: candidate.outputCreditsPerMillion, inputCostMicrosPerMillion: candidate.inputCostMicrosPerMillion, outputCostMicrosPerMillion: candidate.outputCostMicrosPerMillion, imageCostMicros: candidate.imageCostMicros, videoCostMicros: candidate.videoCostMicros } as Prisma.InputJsonValue, options: { ...options, providerAttempts: attempts, successfulRouteId: candidate.routeId, successfulCredentialId: candidate.credentialId } as Prisma.InputJsonValue, settlementStatus: 'RECONCILING' }, true)
      return { result, provider: candidate, providerAttemptId: providerAttempt.id }
    }
    throw lastError || new Error('没有可用的模型渠道')
  }

  async run(task: GenerationJob) {
    await this.outputs.cleanup(task, { requireActiveLease: true })
    const options = task.options as Record<string, unknown>
    const { referenceImages: _images, referenceAudios: _audios, ...storedOptions } = options
    const prompt = await this.pluginPrompt(task, PluginCapability.VIDEO)
    const execution = await this.withProviderFailover(task, 'VIDEO', async (resolved) => {
      const capabilities = videoCapabilities(resolved.videoCapabilities)
      const normalized = normalizeVideoOptions(options, resolved.videoCapabilities)
      let payload: ProviderPayload = {}
      let providerJobId = task.providerJobId && (task.providerChannelId || undefined) === resolved.providerId && (task.userCredentialId || undefined) === resolved.credentialId ? task.providerJobId : undefined
      if (!providerJobId) {
        const fields: Record<string, unknown> = {
          model: resolved.model,
          prompt,
          duration: normalized.duration,
          aspect_ratio: normalized.aspectRatio,
          ...(capabilities.resolutionLocked ? {} : { resolution: normalized.resolution }),
          ...(resolved.type === ProviderType.SUB2API || /minimax|hailuo/i.test(resolved.model) ? {} : {
            size: normalized.resolution,
            seconds: String(normalized.duration),
          }),
        }
        if (capabilities.referenceMode === 'CONTENT_JSON') {
          const images = [
            ...normalized.referenceImages.map((item) => item.dataUrl),
            ...await this.referenceDataUrls(task.userId, normalized.referenceAssetIds, 'image', MAX_VIDEO_REFERENCE_BYTES, '参考图'),
          ]
          const audios = [
            ...normalized.referenceAudios.map((item) => item.dataUrl),
            ...await this.referenceDataUrls(task.userId, normalized.audioAssetIds, 'audio', MAX_VIDEO_AUDIO_BYTES, '参考音频'),
          ]
          const content = [
            { type: 'text', text: prompt },
            ...images.map((url, index) => ({ type: 'image_url', image_url: { url }, role: normalized.imageRole === 'first_last_frame' ? index === 0 ? 'first_frame' : 'last_frame' : normalized.imageRole })),
            ...normalized.referenceVideoUrls.map((url) => ({ type: 'video_url', video_url: { url }, role: 'reference_video' })),
            ...audios.map((url) => ({ type: 'audio_url', audio_url: { url }, role: 'reference_audio' })),
          ]
          payload = await this.provider(resolved, capabilities.createPath, {
            model: resolved.model, content, duration: normalized.duration, resolution: normalized.resolution, ratio: normalized.aspectRatio,
            ...(normalized.generateAudio !== undefined ? { generate_audio: normalized.generateAudio } : {}),
            ...(normalized.watermark !== undefined ? { watermark: normalized.watermark } : {}),
            ...(normalized.returnLastFrame !== undefined ? { return_last_frame: normalized.returnLastFrame } : {}),
            ...(normalized.videoTaskType ? { omni_reference_task_type: normalized.videoTaskType } : {}),
            ...(normalized.videoFormat ? { video_format: normalized.videoFormat } : {}),
          })
        } else if (capabilities.referenceMode === 'DATA_URL_JSON') {
          // 上游文档：images/audios 可直接使用 base64 Data URL（图片 30 MB、音频 15 MB）。
          // 本机参考素材（浏览器直发）排在前，与界面 @参考图 / @参考音频 编号一致。
          const images = [
            ...normalized.referenceImages.map((item) => item.dataUrl),
            ...await this.referenceDataUrls(task.userId, normalized.referenceAssetIds, 'image', MAX_VIDEO_REFERENCE_BYTES, '参考图'),
          ]
          const audios = [
            ...normalized.referenceAudios.map((item) => item.dataUrl),
            ...await this.referenceDataUrls(task.userId, normalized.audioAssetIds, 'audio', MAX_VIDEO_AUDIO_BYTES, '参考音频'),
          ]
          if (images.length) fields.images = images
          if (audios.length) fields.audios = audios
          payload = await this.provider(resolved, capabilities.createPath, fields)
        } else if (normalized.referenceAssetIds.length || normalized.referenceImages.length) {
          const reference = normalized.referenceImages[0]
            ? { file: Buffer.from(normalized.referenceImages[0].dataUrl.slice(normalized.referenceImages[0].dataUrl.indexOf(',') + 1), 'base64'), name: normalized.referenceImages[0].name, mimeType: normalized.referenceImages[0].mimeType }
            : await this.assets.readForUser(task.userId, normalized.referenceAssetIds[0])
          const form = new FormData()
          for (const [key, value] of Object.entries(fields)) form.append(key, String(value))
          form.append('input_reference', new Blob([new Uint8Array(reference.file)], { type: reference.mimeType }), reference.name)
          payload = await this.providerForm(resolved, capabilities.createPath, form)
        } else {
          payload = await this.provider(resolved, capabilities.createPath, fields)
        }
        const immediateUrl = this.videoResultUrl(payload)
        if (['failed', 'error', 'cancelled', 'canceled', 'rejected'].includes(this.videoStatus(payload))) throw new TerminalProviderJobError(this.videoError(payload) || '视频上游生成失败', 502)
        if (immediateUrl) return { resolved, payload, url: immediateUrl }
        providerJobId = this.videoJobId(payload)
        if (!providerJobId) {
          if (capabilities.referenceMode === 'CONTENT_JSON') throw new ReconciliationRequiredError('Seedance 未返回任务 ID，请核对原请求，禁止自动重发')
          throw new ProviderRequestError('视频上游未返回任务 ID 或结果地址', 502)
        }
        await this.updateRunningTask(task, { providerJobId, providerChannelId: resolved.providerId || null, userCredentialId: resolved.credentialId || null, userModelRouteId: resolved.source === 'user' ? resolved.routeId || null : null, updatedAt: new Date() }, true)
      }
      // 上游视频任务常见耗时数分钟到数十分钟（参考图/音频任务更慢），不再使用固定超时：
      // 只在任务终态、取消或部署方显式配置 maxPollSeconds 上限时结束轮询。
      const startedAt = Date.now()
      const deadline = capabilities.maxPollSeconds > 0 ? startedAt + capabilities.maxPollSeconds * 1000 : 0
      let pollCount = 0
      let progress = 0
      while (!deadline || Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, this.pollDelay(capabilities.pollIntervalMs, Date.now() - startedAt, pollCount)))
        pollCount += 1
        await this.assertNotCancelled(task.id)
        try { payload = await this.providerGet(resolved, this.videoPath(capabilities.statusPath, providerJobId)) }
        catch (error) {
          if (capabilities.referenceMode !== 'CONTENT_JSON') throw error
          if (error instanceof ProviderRequestError && (error.status === undefined || [408, 429, 502, 503, 504].includes(error.status))) continue
          throw new ReconciliationRequiredError(`Seedance 任务 ${providerJobId} 查询失败：${error instanceof Error ? error.message : String(error)}`)
        }
        const status = this.videoStatus(payload)
        const resultUrl = this.videoResultUrl(payload)
        const nextProgress = this.videoProgress(payload)
        if (nextProgress !== null && nextProgress > progress) {
          progress = nextProgress
          // 进度写回任务 options，前端通过任务快照流实时读取。
          await this.updateRunningTask(task, { updatedAt: new Date(), options: { ...storedOptions, progress } as Prisma.InputJsonValue }, true)
        } else {
          await this.updateRunningTask(task, { updatedAt: new Date() }, true)
        }
        if (['failed', 'error', 'cancelled', 'canceled', 'rejected'].includes(status)) throw new TerminalProviderJobError(this.videoError(payload) || '视频上游生成失败', 502)
        if (resultUrl) return { resolved, payload, url: resultUrl }
        if (['completed', 'succeeded', 'success', 'done'].includes(status)) return { resolved, payload, url: `${resolved.baseUrl}${this.videoPath(capabilities.contentPath, providerJobId)}` }
      }
      if (capabilities.referenceMode === 'CONTENT_JSON') throw new ReconciliationRequiredError(`Seedance 任务 ${providerJobId} 等待超时，请继续查询原任务`)
      throw new ProviderRequestError('视频生成等待超时', 504)
    })

    const { resolved, url, payload } = execution.result
    await this.assertNotCancelled(task.id)
    let result: { bytes: Uint8Array; mimeType: string }
    try { result = await this.videoBytes(url, resolved) }
    catch (error) {
      if (videoCapabilities(resolved.videoCapabilities).referenceMode === 'CONTENT_JSON') throw new ReconciliationRequiredError(`Seedance 已完成，结果下载失败，请使用原任务核对：${error instanceof Error ? error.message : String(error)}`)
      throw error
    }
    await this.assertNotCancelled(task.id)
    const extension = result.mimeType.includes('webm') ? 'webm' : result.mimeType.includes('quicktime') ? 'mov' : 'mp4'
    const normalized = normalizeVideoOptions(options, resolved.videoCapabilities)
    const { referenceImages: _outputImages, referenceAudios: _outputAudios, ...outputOptions } = normalized
    const asset = await this.outputs.storeAndLink(task, {
      data: result.bytes,
      projectId: task.projectId || undefined,
      name: `生成视频.${extension}`,
      mimeType: result.mimeType,
      kind: AssetKind.VIDEO,
      metadata: { purpose: 'generated', prompt: task.prompt, model: resolved.model, jobId: task.id, position: 0, options: outputOptions, ...(payload.usage ? { upstreamUsage: payload.usage } : {}), ...(this.videoLastFrameUrl(payload) ? { lastFrameUrl: this.videoLastFrameUrl(payload) } : {}) },
    })
    try { await this.assertNotCancelled(task.id) } catch (error) { await this.assets.remove(task.userId, asset.id); throw error }
    await this.updateRunningTask(task, {
      upstreamCostMicros: this.localizedCostMicros(execution.provider.videoCostMicros, execution.provider.pricingUsdExchangeRateMicros),
    }, true)
    await this.settlement.settleNonChat(task.id, execution.providerAttemptId)
  }

  private async updateRunningTask(task: GenerationJob, data: Prisma.GenerationJobUncheckedUpdateManyInput, reconciliationRequired = false) {
    try {
      const updated = await this.prisma.generationJob.updateMany({
        where: { id: task.id, status: 'RUNNING', lockedBy: task.lockedBy, leaseVersion: task.leaseVersion, leaseExpiresAt: { gt: new Date() } },
        data,
      })
      if (updated.count !== 1) throw new Error('Generation worker lease was lost')
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误'
      if (reconciliationRequired) throw new ReconciliationRequiredError(`视频任务持久化失败：${message}`)
      throw new TerminalSettlementError(`视频任务状态写入失败：${message}`)
    }
  }

  private localizedCostMicros(usdMicros: number, exchangeRateMicros: number) {
    return Math.min(2_000_000_000, Math.ceil(usdMicros * exchangeRateMicros / 1_000_000))
  }

  /** 轮询间隔：前 5 分钟按模型配置，之后逐步放慢到 20 秒，避免长任务压垮上游。 */
  private pollDelay(baseMs: number, elapsedMs: number, pollCount: number) {
    const base = Math.max(500, Math.min(30_000, baseMs || 3000))
    if (elapsedMs < 60_000) return base
    if (elapsedMs < 300_000) return Math.max(base, 10_000)
    return Math.max(base, pollCount % 4 === 0 ? 20_000 : 12_000)
  }

  /** 读取上游进度（0-100），无法识别时返回 null。 */
  private videoProgress(payload: ProviderPayload) {
    const raw = payload.progress ?? (payload.data && !Array.isArray(payload.data) ? (payload.data as Record<string, unknown>).progress : undefined)
    const value = Number(raw)
    return Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : null
  }

  /** 将本地参考素材转成上游接受的 base64 Data URL，并在服务端提前拦截超大文件。 */
  private async referenceDataUrls(userId: string, assetIds: string[], kind: 'image' | 'audio', maxBytes: number, label: string) {
    const values: string[] = []
    for (const assetId of assetIds) {
      const asset = await this.assets.readForUser(userId, assetId)
      if (kind === 'audio' && !asset.mimeType.startsWith('audio/')) throw new ProviderRequestError(`${label} ${asset.name} 不是音频文件`, 422)
      if (asset.file.length > maxBytes) throw new ProviderRequestError(`${label} ${asset.name} 超过 ${Math.round(maxBytes / 1024 / 1024)} MB`, 413)
      values.push(`data:${asset.mimeType};base64,${Buffer.from(asset.file).toString('base64')}`)
    }
    return values
  }

  private videoPath(template: string, id: string) {
    return template.replaceAll('{id}', encodeURIComponent(id))
  }

  private videoJobId(payload: ProviderPayload) {
    const data = payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data) ? payload.data as Record<string, unknown> : {}
    return [payload.task_id, payload.id, payload.request_id, payload.requestId, payload.taskId, data.task_id, data.id, data.request_id, data.requestId, data.taskId]
      .find((value): value is string => typeof value === 'string' && value.length > 0)
  }

  private videoStatus(payload: ProviderPayload) {
    const data = payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data) ? payload.data as Record<string, unknown> : {}
    return String(payload.status || payload.state || data.status || data.state || '').toLowerCase()
  }

  private videoError(payload: ProviderPayload) {
    const error = payload.error
    if (typeof error === 'string') return error
    if (error && typeof error === 'object' && !Array.isArray(error) && typeof (error as Record<string, unknown>).message === 'string') return String((error as Record<string, unknown>).message)
    return typeof payload.message === 'string' ? payload.message : ''
  }

  private videoResultUrl(payload: ProviderPayload): string | undefined {
    const direct = [payload.output_url, payload.video_url, payload.url].find((value): value is string => typeof value === 'string' && value.length > 0)
    if (direct) return direct
    const data = payload.data
    if (Array.isArray(data)) {
      const first = data.find((item) => item && typeof item === 'object') as Record<string, unknown> | undefined
      return first ? [first.output_url, first.video_url, first.url].find((value): value is string => typeof value === 'string' && value.length > 0) : undefined
    }
    if (data && typeof data === 'object') return this.videoResultUrl(data as ProviderPayload)
    const output = payload.output
    if (output && typeof output === 'object' && !Array.isArray(output)) return this.videoResultUrl(output as ProviderPayload)
    for (const value of [payload.metadata, payload.result, payload.content]) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const url = this.videoResultUrl(value as ProviderPayload)
        if (url) return url
      }
    }
    return undefined
  }

  private videoLastFrameUrl(payload: ProviderPayload) {
    for (const value of [payload.metadata, payload.result, payload.content]) {
      if (value && typeof value === 'object' && !Array.isArray(value) && typeof (value as Record<string, unknown>).last_frame_url === 'string') return (value as Record<string, unknown>).last_frame_url as string
    }
    return undefined
  }

  private async providerGet(resolved: ResolvedProvider, path: string) {
    let response: Response
    try { response = await this.providerFetch(resolved, `${resolved.baseUrl}${path}`, { headers: this.providers.buildRequestHeaders(resolved, 'openai', undefined), signal: AbortSignal.timeout(resolved.timeoutMs) }) }
    catch (error) { throw new ProviderRequestError(error instanceof Error ? error.message : 'Provider network request failed') }
    if (!response.ok) throw new ProviderRequestError(`Provider returned ${response.status}: ${(await response.text()).slice(0, 500)}`, response.status)
    return response.json() as Promise<ProviderPayload>
  }

  private async videoBytes(input: string, resolved: ResolvedProvider) {
    let url: URL
    try { url = new URL(input, `${resolved.baseUrl}/`) } catch { throw new ProviderRequestError('视频上游返回了无效的结果地址', 502) }
    const providerOrigin = new URL(resolved.baseUrl).origin
    if (url.origin !== providerOrigin) await this.endpointPolicy.assertPublicHttpUrl(url.toString())
    // Only explicitly allowlisted local workers may bypass the public DNS
    // dispatcher. Admin-managed public Providers must use the dispatcher even
    // for same-origin result URLs so DNS rebinding cannot reach a private IP.
    const native = videoCapabilities(resolved.videoCapabilities).referenceMode === 'CONTENT_JSON'
    const standardRequest = url.origin === providerOrigin && resolved.type === ProviderType.LOCAL_WORKER ? fetchNoRedirect : fetchPublicNoRedirect
    const request = native && resolved.type !== ProviderType.LOCAL_WORKER ? fetchPublicManualRedirect : standardRequest
    let response = await request(url, { headers: url.origin === providerOrigin && (!native || url.pathname.endsWith('/content')) ? this.providers.buildRequestHeaders(resolved, 'openai', undefined) : undefined, signal: AbortSignal.timeout(Math.max(resolved.timeoutMs, 300_000)) })
    for (let hop = 0; native && [301, 302, 303, 307, 308].includes(response.status) && hop < 3; hop += 1) {
      const location = response.headers.get('location')
      await response.body?.cancel()
      if (!location) throw new ProviderRequestError('视频下载跳转缺少地址', 502)
      url = new URL(location, url)
      await this.endpointPolicy.assertPublicHttpUrl(url.toString())
      response = await fetchPublicManualRedirect(url, { signal: AbortSignal.timeout(Math.max(resolved.timeoutMs, 300_000)) })
    }
    if (!response.ok) throw new ProviderRequestError(`视频下载返回 ${response.status}`, response.status)
    const contentType = (response.headers.get('content-type') || 'video/mp4').split(';')[0].toLowerCase()
    if (contentType.startsWith('text/') || contentType.includes('json')) throw new ProviderRequestError(`视频下载返回了非视频内容：${contentType}`, 502)
    let bytes: Uint8Array
    try { bytes = await readResponseBytes(response, MAX_GENERATED_VIDEO_BYTES, 'Provider 视频') }
    catch { throw new ProviderRequestError('视频下载超过 500 MB', 502) }
    if (!bytes.length) throw new ProviderRequestError('视频上游返回了空文件', 502)
    return { bytes, mimeType: contentType.startsWith('video/') ? contentType : 'video/mp4' }
  }

  private providerFetch(resolved: ResolvedProvider, input: string | URL, init: RequestInit) {
    return resolved.type === ProviderType.LOCAL_WORKER
      ? fetchNoRedirect(input, init)
      : fetchPublicNoRedirect(input, init)
  }

  private async assertNotCancelled(jobId: string) {
    const job = await this.prisma.generationJob.findUnique({ where: { id: jobId }, select: { status: true } })
    if (!job || job.status === 'CANCELLED') throw new JobCancelledError('Generation job was cancelled')
  }

  private async pluginInstruction(task: GenerationJob, capability: PluginCapability) {
    const options = task.options as Record<string, unknown>
    const pluginId = typeof options.pluginId === 'string' ? options.pluginId : ''
    if (!pluginId) return ''
    // Capability validation happens when the job is created. External
    // instruction-only skills may be reused across capabilities, so do not
    // apply the stored capability array a second time in the worker.
    const plugin = await this.prisma.plugin.findFirst({ where: { id: pluginId, status: 'PUBLISHED', OR: [{ ownerId: task.userId, visibility: 'PRIVATE' }, { visibility: 'OFFICIAL', installations: { some: { userId: task.userId, enabled: true } } }] }, select: { name: true, instruction: true, outputRequirements: true } })
    if (!plugin) throw new Error('插件已停用、未安装或不支持当前创作类型')
    return [`当前启用插件：${plugin.name}`, plugin.instruction.trim(), plugin.outputRequirements.trim() ? `输出要求：${plugin.outputRequirements.trim()}` : ''].filter(Boolean).join('\n')
  }

  private async pluginPrompt(task: GenerationJob, capability: PluginCapability) {
    const instruction = await this.pluginInstruction(task, capability)
    return instruction ? `${task.prompt}\n\n插件增强要求（在不改变用户核心意图的前提下执行）：\n${instruction}` : task.prompt
  }

}
