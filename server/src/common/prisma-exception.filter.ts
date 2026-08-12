import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common'
import { Prisma } from '@prisma/client'

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse()
    if (exception.code === 'P2025') {
      return response.status(HttpStatus.NOT_FOUND).send({ statusCode: HttpStatus.NOT_FOUND, message: '记录不存在', error: 'Not Found' })
    }
    if (exception.code === 'P2002') {
      return response.status(HttpStatus.CONFLICT).send({ statusCode: HttpStatus.CONFLICT, message: '记录已存在', error: 'Conflict' })
    }
    if (exception.code === 'P2003' || exception.code === 'P2014') {
      return response.status(HttpStatus.CONFLICT).send({ statusCode: HttpStatus.CONFLICT, message: '关联记录不存在或仍在使用', error: 'Conflict' })
    }
    return response.status(HttpStatus.INTERNAL_SERVER_ERROR).send({ statusCode: HttpStatus.INTERNAL_SERVER_ERROR, message: '数据库操作失败', error: 'Internal Server Error' })
  }
}
