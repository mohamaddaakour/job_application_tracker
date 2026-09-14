export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string | undefined;
  public readonly details: unknown;

  constructor(statusCode: number, message: string, code?: string, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;

    // Guarentee the relationship between Error and AppError
    Object.setPrototypeOf(this, AppError.prototype);

    // Capture the stack trace (error message) for the specific AppError
    // and not showing extra data
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message: string, code?: string, details?: unknown) {
    return new AppError(400, message, code, details);
  }

  static unauthorized(message = 'Unauthorized', code?: string) {
    return new AppError(401, message, code);
  }

  static forbidden(message = 'Forbidden', code?: string) {
    return new AppError(403, message, code);
  }

  static notFound(message = 'Not found', code?: string) {
    return new AppError(404, message, code);
  }

  static conflict(message: string, code?: string) {
    return new AppError(409, message, code);
  }

  static internal(message = 'Internal server error', code?: string) {
    return new AppError(500, message, code);
  }
}