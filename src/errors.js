export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const forbidden = (msg = 'Not permitted for your role') => new AppError(403, 'FORBIDDEN', msg);
export const notFound = (what) => new AppError(404, 'NOT_FOUND', `${what} not found`);
export const badRequest = (msg, details) => new AppError(400, 'BAD_REQUEST', msg, details);
export const conflict = (msg, details) => new AppError(409, 'CONFLICT', msg, details);
export const unprocessable = (code, msg, details) => new AppError(422, code, msg, details);
