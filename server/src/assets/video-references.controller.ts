import { Controller, Get, Header, Param, StreamableFile } from '@nestjs/common'
import { AssetsService } from './assets.service'

@Controller('assets/video-references')
export class VideoReferencesController {
  constructor(private readonly assets: AssetsService) {}

  // The random ID is a task-scoped bearer link for the upstream media fetcher.
  @Get(':id')
  @Header('Cache-Control', 'no-store')
  @Header('X-Robots-Tag', 'noindex, nofollow')
  async content(@Param('id') id: string) {
    const result = await this.assets.readVideoReference(id)
    return new StreamableFile(result.file, { type: result.mimeType, disposition: 'inline' })
  }
}
