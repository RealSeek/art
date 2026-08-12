import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { localPromptLibraryEntries } from "./prompt-library.defaults";

export type PromptLibrarySource = {
  id: string;
  upstreamName: string;
  defaultDisplayName: string;
  url: string;
  fallbackUrl?: string;
  homepage: string;
  format: "normalized" | "upma";
  defaultSortOrder: number;
};

export type PromptLibraryItem = {
  id: string;
  sourceId: string;
  sourceName: string;
  title: string;
  prompt: string;
  description: string;
  tags: string[];
  author: string;
  imageModel: string;
  coverUrl: string;
  referenceImageUrls: string[];
  enabled: boolean;
  overridden: boolean;
};

type SourceCache = {
  items: PromptLibraryItem[];
  fetchedAt: number;
  lastSuccessAt: string;
  lastError: string;
};
type SourceRuntime = PromptLibrarySource & {
  displayName: string;
  enabled: boolean;
  sortOrder: number;
};

const SOURCE_BASE =
  "https://cdn.jsdelivr.net/gh/yukkcat/image-prompts@main/dist/sources";
const SOURCE_FALLBACK_BASE =
  "https://raw.githubusercontent.com/yukkcat/image-prompts/main/dist/sources";
const CACHE_TTL_MS = 60 * 60 * 1000;
const SOURCES: PromptLibrarySource[] = [
  {
    id: "upma-gpt-image-2",
    upstreamName: "UPMA · GPT Image 2 提示词",
    defaultDisplayName: "GPT Image 2 精选一",
    url: "https://cdn.jsdelivr.net/gh/freestylefly/awesome-gpt-image-2@main/data/cases.json",
    fallbackUrl:
      "https://raw.githubusercontent.com/freestylefly/awesome-gpt-image-2/main/data/cases.json",
    homepage: "https://www.upma.cn/image-prompts",
    format: "upma",
    defaultSortOrder: 10,
  },
  {
    id: "youmind-gpt-image-2",
    upstreamName: "YouMind 官网 · GPT Image 2",
    defaultDisplayName: "GPT Image 2 精选二",
    url: `${SOURCE_BASE}/youmind-gpt-image-2.json`,
    fallbackUrl: `${SOURCE_FALLBACK_BASE}/youmind-gpt-image-2.json`,
    homepage: "https://youmind.com/zh-CN/gpt-image-2-prompts/explore",
    format: "normalized",
    defaultSortOrder: 20,
  },
  {
    id: "youmind-nano-banana-pro",
    upstreamName: "YouMind OpenLab · Nano Banana Pro",
    defaultDisplayName: "Nano Banana Pro 精选",
    url: `${SOURCE_BASE}/youmind-nano-banana-pro.json`,
    fallbackUrl: `${SOURCE_FALLBACK_BASE}/youmind-nano-banana-pro.json`,
    homepage:
      "https://github.com/YouMind-OpenLab/awesome-nano-banana-pro-prompts",
    format: "normalized",
    defaultSortOrder: 30,
  },
  {
    id: "banana-prompt-quicker",
    upstreamName: "Banana Prompt Quicker",
    defaultDisplayName: "通用图片提示词",
    url: `${SOURCE_BASE}/banana-prompt-quicker.json`,
    fallbackUrl: `${SOURCE_FALLBACK_BASE}/banana-prompt-quicker.json`,
    homepage: "https://glidea.github.io/banana-prompt-quicker/",
    format: "normalized",
    defaultSortOrder: 40,
  },
  {
    id: "davidwu-gpt-image2-prompts",
    upstreamName: "DavidWu · GPT Image 2",
    defaultDisplayName: "GPT Image 2 创意库",
    url: `${SOURCE_BASE}/davidwu-gpt-image2-prompts.json`,
    fallbackUrl: `${SOURCE_FALLBACK_BASE}/davidwu-gpt-image2-prompts.json`,
    homepage: "https://github.com/davidwuw0811-boop/awesome-gpt-image2-prompts",
    format: "normalized",
    defaultSortOrder: 50,
  },
  {
    id: "awesome-gpt-image",
    upstreamName: "ZeroLu · Awesome GPT Image",
    defaultDisplayName: "GPT Image 精选",
    url: `${SOURCE_BASE}/awesome-gpt-image.json`,
    fallbackUrl: `${SOURCE_FALLBACK_BASE}/awesome-gpt-image.json`,
    homepage: "https://github.com/ZeroLu/awesome-gpt-image",
    format: "normalized",
    defaultSortOrder: 60,
  },
  {
    id: "awesome-gpt4o-image-prompts",
    upstreamName: "ImgEdify · Awesome GPT-4o",
    defaultDisplayName: "GPT-4o 图片提示词",
    url: `${SOURCE_BASE}/awesome-gpt4o-image-prompts.json`,
    fallbackUrl: `${SOURCE_FALLBACK_BASE}/awesome-gpt4o-image-prompts.json`,
    homepage: "https://github.com/ImgEdify/Awesome-GPT4o-Image-Prompts",
    format: "normalized",
    defaultSortOrder: 70,
  },
];

const TAG_TRANSLATIONS: Record<string, string> = {
  "3d": "3D 设计",
  brand: "品牌设计",
  "brand & logos": "品牌与标志",
  character: "角色设计",
  "characters & people": "人物与角色",
  "charts & infographics": "图表与信息图",
  cinematic: "电影感",
  commerce: "商业视觉",
  creative: "创意设计",
  education: "教育内容",
  fashion: "时尚",
  food: "美食",
  history: "历史",
  "history & classical themes": "历史与古典",
  illustration: "插画",
  "illustration & art": "插画与艺术",
  infographic: "信息图",
  "other use cases": "其他用途",
  photography: "摄影",
  "photography & realism": "摄影与写实",
  portrait: "人像",
  poster: "海报",
  "posters & typography": "海报与排版",
  product: "产品设计",
  "products & e-commerce": "产品与电商",
  realistic: "写实",
  "scenes & storytelling": "场景与叙事",
  social: "社交媒体",
  story: "故事叙事",
  tech: "科技",
  travel: "旅行",
  ui: "界面设计",
  ui与界面: "界面设计",
  unknown: "其他",
};

@Injectable()
export class PromptLibraryService {
  private readonly cache = new Map<string, SourceCache>();
  private readonly loading = new Map<string, Promise<SourceCache>>();

  constructor(private readonly prisma: PrismaService) {}

  async list(input: {
    query?: string;
    sourceId?: string;
    tag?: string;
    page?: number;
    pageSize?: number;
  }) {
    const sources = (await this.configuredSources()).filter(
      (source) => source.enabled,
    );
    const sourceId = input.sourceId?.trim() || "";
    const selectedSources = sourceId
      ? sources.filter((source) => source.id === sourceId)
      : sources;
    const allItems = await this.itemsForSources(selectedSources);
    const query = input.query?.trim().toLocaleLowerCase() || "";
    const tag = input.tag?.trim() || "";
    const queryMatches = allItems.filter(
      (item) =>
        item.enabled &&
        (!query ||
          [
            item.title,
            item.prompt,
            item.description,
            item.author,
            item.imageModel,
            ...item.tags,
          ]
            .join(" ")
            .toLocaleLowerCase()
            .includes(query)),
    );
    const filtered = queryMatches.filter(
      (item) => !tag || item.tags.includes(tag),
    );
    const pageSize = Math.max(1, Math.min(60, input.pageSize || 24));
    const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
    const page = Math.min(pages, Math.max(1, input.page || 1));
    return {
      items: filtered
        .slice((page - 1) * pageSize, page * pageSize)
        .map((item) => this.publicItem(item)),
      total: filtered.length,
      page,
      pageSize,
      sources: await this.publicSources(sources),
      tags: this.collectTags(queryMatches),
      partial: selectedSources.some((source) =>
        Boolean(this.cache.get(source.id)?.lastError),
      ),
    };
  }

  async adminSources() {
    const sources = await this.configuredSources();
    await Promise.all(sources.map((source) => this.loadSource(source)));
    const hiddenCounts = await this.prisma.promptLibraryItemOverride.groupBy({
      by: ["sourceId"],
      where: { enabled: false },
      _count: { itemId: true },
    });
    const hidden = new Map(
      hiddenCounts.map((row) => [row.sourceId, row._count.itemId]),
    );
    return sources.map((source) => {
      const cached = this.cache.get(source.id);
      return {
        id: source.id,
        displayName: source.displayName,
        upstreamName: source.upstreamName,
        homepage: source.homepage,
        enabled: source.enabled,
        sortOrder: source.sortOrder,
        count: Math.max(
          0,
          (cached?.items.length || 0) - (hidden.get(source.id) || 0),
        ),
        lastSuccessAt: cached?.lastSuccessAt || "",
        lastError: cached?.lastError || "",
      };
    });
  }

  async updateSource(
    id: string,
    input: { displayName?: string; enabled?: boolean; sortOrder?: number },
  ) {
    const source = SOURCES.find((item) => item.id === id);
    if (!source) throw new NotFoundException("提示词渠道不存在");
    const existing = await this.prisma.promptLibrarySourceConfig.findUnique({
      where: { id },
    });
    const row = await this.prisma.promptLibrarySourceConfig.upsert({
      where: { id },
      create: {
        id,
        displayName: input.displayName?.trim() || source.defaultDisplayName,
        enabled: input.enabled ?? true,
        sortOrder: input.sortOrder ?? source.defaultSortOrder,
      },
      update: {
        ...(input.displayName !== undefined
          ? {
              displayName:
                input.displayName.trim() || source.defaultDisplayName,
            }
          : {}),
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
        ...(input.sortOrder !== undefined
          ? { sortOrder: input.sortOrder }
          : {}),
      },
    });
    return {
      ...row,
      upstreamName: source.upstreamName,
      homepage: source.homepage,
      count: this.cache.get(id)?.items.length || 0,
      lastSuccessAt: this.cache.get(id)?.lastSuccessAt || "",
      lastError: this.cache.get(id)?.lastError || "",
      created: !existing,
    };
  }

  async adminItems(input: {
    query?: string;
    sourceId?: string;
    page?: number;
    pageSize?: number;
  }) {
    const sources = await this.configuredSources();
    const sourceId = input.sourceId?.trim() || "";
    const selectedSources = sourceId
      ? sources.filter((source) => source.id === sourceId)
      : sources;
    const items = await this.itemsForSources(selectedSources, true);
    const query = input.query?.trim().toLocaleLowerCase() || "";
    const filtered = items.filter(
      (item) =>
        !query ||
        [item.title, item.prompt, item.description, ...item.tags]
          .join(" ")
          .toLocaleLowerCase()
          .includes(query),
    );
    const pageSize = Math.max(1, Math.min(5000, input.pageSize || 20));
    const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
    const page = Math.min(pages, Math.max(1, input.page || 1));
    return {
      items: filtered.slice((page - 1) * pageSize, page * pageSize),
      total: filtered.length,
      page,
      pageSize,
    };
  }

  async updateItem(
    itemId: string,
    input: {
      title?: string;
      prompt?: string;
      description?: string;
      tags?: string[];
      coverUrl?: string;
      enabled?: boolean;
    },
  ) {
    const original = await this.getOriginalItem(itemId);
    return this.prisma.promptLibraryItemOverride.upsert({
      where: { itemId },
      create: {
        itemId,
        sourceId: original.sourceId,
        title: input.title?.trim() ?? original.title,
        prompt: input.prompt?.trim() ?? original.prompt,
        description: input.description?.trim() ?? original.description,
        tags: input.tags ?? original.tags,
        coverUrl: input.coverUrl?.trim() ?? null,
        enabled: input.enabled ?? true,
      },
      update: {
        ...(input.title !== undefined ? { title: input.title.trim() } : {}),
        ...(input.prompt !== undefined ? { prompt: input.prompt.trim() } : {}),
        ...(input.description !== undefined
          ? { description: input.description.trim() }
          : {}),
        ...(input.tags !== undefined ? { tags: input.tags } : {}),
        ...(input.coverUrl !== undefined
          ? { coverUrl: input.coverUrl.trim() }
          : {}),
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      },
    });
  }

  async resetItem(itemId: string) {
    await this.getOriginalItem(itemId);
    await this.prisma.promptLibraryItemOverride.deleteMany({
      where: { itemId },
    });
    return { reset: true };
  }

  async refreshAll() {
    this.cache.clear();
    const sources = await this.configuredSources();
    const results = await Promise.all(
      sources.map(async (source) => ({
        source,
        cache: await this.loadSource(source, true),
      })),
    );
    return {
      total: results.reduce(
        (sum, result) => sum + result.cache.items.length,
        0,
      ),
      sources: await this.adminSources(),
    };
  }

  private async configuredSources(): Promise<SourceRuntime[]> {
    const rows = await this.prisma.promptLibrarySourceConfig.findMany();
    const configs = new Map(rows.map((row) => [row.id, row]));
    return SOURCES.map((source) => {
      const config = configs.get(source.id);
      return {
        ...source,
        displayName: config?.displayName || source.defaultDisplayName,
        enabled: config?.enabled ?? true,
        sortOrder: config?.sortOrder ?? source.defaultSortOrder,
      };
    }).sort(
      (left, right) =>
        left.sortOrder - right.sortOrder ||
        left.defaultSortOrder - right.defaultSortOrder,
    );
  }

  private async publicSources(sources: SourceRuntime[]) {
    const counts = await Promise.all(
      sources.map(
        async (source) =>
          (await this.itemsForSources([source])).filter((item) => item.enabled)
            .length,
      ),
    );
    return sources.map((source, index) => ({
      id: source.id,
      name: source.displayName,
      count: counts[index],
    }));
  }

  private async itemsForSources(
    sources: SourceRuntime[],
    includeDisabled = false,
  ) {
    const caches = await Promise.all(
      sources.map((source) => this.loadSource(source)),
    );
    const originals = caches.flatMap((cache) => cache.items);
    if (!originals.length) return [];
    const overrides = await this.prisma.promptLibraryItemOverride.findMany({
      where: { itemId: { in: originals.map((item) => item.id) } },
    });
    const overrideMap = new Map(overrides.map((row) => [row.itemId, row]));
    const sourceMap = new Map(sources.map((source) => [source.id, source]));
    return originals
      .map((item) => {
        const override = overrideMap.get(item.id);
        const source = sourceMap.get(item.sourceId);
        return {
          ...item,
          sourceName: source?.displayName || item.sourceName,
          title: override?.title ?? item.title,
          prompt: override?.prompt ?? item.prompt,
          description: override?.description ?? item.description,
          tags: this.localizeTags(override ? override.tags : item.tags),
          coverUrl: override?.coverUrl ?? item.coverUrl,
          enabled: override?.enabled ?? true,
          overridden: Boolean(override),
        };
      })
      .filter((item) => includeDisabled || item.enabled);
  }

  private publicItem(item: PromptLibraryItem) {
    return {
      id: item.id,
      sourceId: item.sourceId,
      sourceName: item.sourceName,
      title: item.title,
      prompt: item.prompt,
      description: item.description,
      tags: item.tags,
      author: item.author,
      imageModel: item.imageModel,
      coverUrl: item.coverUrl,
    };
  }

  private loadSource(
    source: SourceRuntime,
    force = false,
  ): Promise<SourceCache> {
    const cached = this.cache.get(source.id);
    if (!force && cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS)
      return Promise.resolve(cached);
    const pending = this.loading.get(source.id);
    if (pending) return pending;
    const loading = this.fetchSource(source, cached).finally(() =>
      this.loading.delete(source.id),
    );
    this.loading.set(source.id, loading);
    return loading;
  }

  private async fetchSource(
    source: SourceRuntime,
    stale?: SourceCache,
  ): Promise<SourceCache> {
    try {
      const payload = await this.fetchSourcePayload(source);
      const values =
        source.format === "upma" &&
        payload &&
        typeof payload === "object" &&
        !Array.isArray(payload)
          ? (payload as Record<string, unknown>).cases
          : payload;
      if (!Array.isArray(values)) throw new Error("提示词源返回格式无效");
      const items = values
        .slice(0, 5000)
        .map((value) =>
          source.format === "upma"
            ? this.normalizeUpmaItem(source, value)
            : this.normalizeItem(source, value),
        )
        .filter((item): item is PromptLibraryItem => Boolean(item));
      const next = {
        items,
        fetchedAt: Date.now(),
        lastSuccessAt: new Date().toISOString(),
        lastError: "",
      };
      this.cache.set(source.id, next);
      return next;
    } catch (reason) {
      const fallbackItems = stale?.items.length
        ? stale.items
        : localPromptLibraryEntries
            .filter((item) => item.sourceId === source.id)
            .map((item, index): PromptLibraryItem => ({
              id: `${source.id}:local:${index + 1}`,
              sourceId: source.id,
              sourceName: source.displayName,
              title: item.title,
              prompt: item.prompt,
              description: item.description,
              tags: item.tags,
              author: "Xinyue AI",
              imageModel: "通用图片模型",
              coverUrl: item.coverUrl,
              referenceImageUrls: [item.coverUrl],
              enabled: true,
              overridden: false,
            }));
      const next = {
        items: fallbackItems,
        fetchedAt: Date.now(),
        lastSuccessAt: stale?.lastSuccessAt || "",
        lastError:
          reason instanceof Error ? reason.message : "提示词源加载失败",
      };
      this.cache.set(source.id, next);
      return next;
    }
  }

  private async fetchSourcePayload(
    source: PromptLibrarySource,
  ): Promise<unknown> {
    let failure: unknown = new Error("提示词源加载失败");
    for (const url of [source.url, source.fallbackUrl].filter(
      (value): value is string => Boolean(value),
    )) {
      try {
        const response = await fetch(url, {
          headers: {
            accept: "application/json",
            "user-agent": "Xinyue-AI/1.0",
          },
          signal: AbortSignal.timeout(8_000),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
      } catch (reason) {
        failure = reason;
      }
    }
    throw failure;
  }

  private normalizeItem(
    source: SourceRuntime,
    value: unknown,
  ): PromptLibraryItem | null {
    if (!value || typeof value !== "object" || Array.isArray(value))
      return null;
    const row = value as Record<string, unknown>;
    const id = this.text(row.id, 200);
    const title = this.text(row.title, 300);
    const prompt = this.text(row.prompt, 30_000);
    if (!id || !title || !prompt) return null;
    const referenceImageUrls = this.stringArray(row.referenceImageUrls, 12)
      .map((url) => this.httpUrl(url))
      .filter(Boolean);
    const coverUrl = this.httpUrl(row.coverUrl) || referenceImageUrls[0] || "";
    return {
      id,
      sourceId: source.id,
      sourceName: source.displayName,
      title,
      prompt,
      description: this.text(row.description, 2000),
      tags: this.stringArray(row.tags, 30).map((tag) => tag.slice(0, 80)),
      author: this.text(row.author, 200),
      imageModel: this.text(row.imageModel, 100),
      coverUrl,
      referenceImageUrls,
      enabled: true,
      overridden: false,
    };
  }

  private normalizeUpmaItem(
    source: SourceRuntime,
    value: unknown,
  ): PromptLibraryItem | null {
    if (!value || typeof value !== "object" || Array.isArray(value))
      return null;
    const row = value as Record<string, unknown>;
    const rawId =
      typeof row.id === "number" ? String(row.id) : this.text(row.id, 100);
    const title = this.text(row.title, 300);
    const prompt = this.text(row.prompt, 30_000);
    if (!rawId || !title || !prompt) return null;
    const tags = [
      this.text(row.category, 80),
      ...this.stringArray(row.styles, 12),
      ...this.stringArray(row.scenes, 12),
    ].filter(Boolean);
    const imagePath = this.text(row.image, 1000);
    const coverUrl = /^\/images\/[a-zA-Z0-9._-]+$/.test(imagePath)
      ? `https://cdn.jsdelivr.net/gh/freestylefly/awesome-gpt-image-2@main/data${imagePath}`
      : this.httpUrl(imagePath);
    return {
      id: `${source.id}:${rawId}`,
      sourceId: source.id,
      sourceName: source.displayName,
      title,
      prompt,
      description: this.text(row.promptPreview, 2000),
      tags: [...new Set(tags)],
      author: this.text(row.sourceLabel, 200),
      imageModel: "GPT Image 2",
      coverUrl,
      referenceImageUrls: coverUrl ? [coverUrl] : [],
      enabled: true,
      overridden: false,
    };
  }

  private async getOriginalItem(itemId: string) {
    const sources = await this.configuredSources();
    const caches = await Promise.all(
      sources.map((source) => this.loadSource(source)),
    );
    const item = caches
      .flatMap((cache) => cache.items)
      .find((candidate) => candidate.id === itemId);
    if (!item) throw new NotFoundException("提示词不存在或来源暂时不可用");
    return item;
  }

  private collectTags(items: PromptLibraryItem[]) {
    const counts = new Map<string, number>();
    for (const tag of items.flatMap((item) => item.tags))
      counts.set(tag, (counts.get(tag) || 0) + 1);
    return [...counts.entries()]
      .sort(
        (left, right) =>
          right[1] - left[1] || left[0].localeCompare(right[0], "zh-CN"),
      )
      .slice(0, 80)
      .map(([name, count]) => ({ name, count }));
  }

  private text(value: unknown, maxLength: number) {
    return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
  }
  private localizeTags(tags: string[]) {
    const localized = tags
      .map((value) => {
        const tag = value.trim().slice(0, 80);
        const translated = TAG_TRANSLATIONS[tag.toLocaleLowerCase()];
        if (translated) return translated;
        if (/[\u3400-\u9fff]/.test(tag)) return tag;
        return "";
      })
      .filter(Boolean);
    return [...new Set(localized)].slice(0, 20);
  }
  private httpUrl(value: unknown) {
    const text = this.text(value, 2000);
    return /^https?:\/\//i.test(text) ? text : "";
  }
  private stringArray(value: unknown, maxItems: number) {
    return Array.isArray(value)
      ? value
          .filter(
            (item): item is string =>
              typeof item === "string" && Boolean(item.trim()),
          )
          .slice(0, maxItems)
      : [];
  }
}
