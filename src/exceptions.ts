/**
 * Typed exceptions for `@quelvio/vercel-ai-sdk`.
 *
 * Every error inherits from {@link QuelvioError}. Catch that for a broad
 * net; catch a subclass to handle a specific failure mode (auth, rate
 * limit, transient server error, etc.).
 */

export class QuelvioError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QuelvioError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Authentication failed (HTTP 401 or 403). */
export class QuelvioAuthError extends QuelvioError {
  constructor(message: string) {
    super(message);
    this.name = 'QuelvioAuthError';
  }
}

/** The request was rejected as malformed (HTTP 400). */
export class QuelvioBadRequestError extends QuelvioError {
  constructor(message: string) {
    super(message);
    this.name = 'QuelvioBadRequestError';
  }
}

/** The requested resource was not found (HTTP 404). */
export class QuelvioNotFoundError extends QuelvioError {
  constructor(message: string) {
    super(message);
    this.name = 'QuelvioNotFoundError';
  }
}

/** Rate limited by the Quelvio API (HTTP 429). */
export class QuelvioRateLimitError extends QuelvioError {
  /** Value of the `Retry-After` header if present; otherwise `null`. */
  retryAfterSeconds: number | null;

  constructor(message: string, retryAfterSeconds: number | null = null) {
    super(message);
    this.name = 'QuelvioRateLimitError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** Quelvio returned a 5xx server error after retries were exhausted. */
export class QuelvioServerError extends QuelvioError {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'QuelvioServerError';
    this.statusCode = statusCode;
  }
}

/** The HTTP request timed out before a response was received. */
export class QuelvioTimeoutError extends QuelvioError {
  constructor(message: string) {
    super(message);
    this.name = 'QuelvioTimeoutError';
  }
}

/** A non-timeout transport-level error (DNS, TLS, connection refused, etc.). */
export class QuelvioNetworkError extends QuelvioError {
  constructor(message: string) {
    super(message);
    this.name = 'QuelvioNetworkError';
  }
}
