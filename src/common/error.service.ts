// external modules
import { BadRequestException, Injectable } from '@nestjs/common';

@Injectable()
export class ErrorService {
  invalidRequest(message: string, details?: unknown): BadRequestException {
    return new BadRequestException({
      message,
      details,
    });
  }
}

