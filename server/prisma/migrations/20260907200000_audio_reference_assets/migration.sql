-- 参考音频素材：新增 AUDIO 资产类型（视频参考音频使用）。
ALTER TYPE "AssetKind" ADD VALUE IF NOT EXISTS 'AUDIO';
