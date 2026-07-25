/**
 * The single response shape for `/api/v1`.
 *
 * The three frozen legacy endpoints (`POST /api/transform`, `GET /health`,
 * `GET /healthcheck`) deliberately do NOT use this envelope — see
 * src/routes/legacy/.
 */

export interface PaginationMeta {
  /** Opaque cursor for the next page, absent when the page is the last one. */
  nextCursor?: string;
  /** Number of items in this page. */
  count: number;
  /** Requested page size. */
  limit: number;
  /** Total matching documents, when cheap enough to compute. */
  total?: number;
  /** Offset-paginated endpoints only. */
  page?: number;
}

export interface ResponseMeta {
  pagination?: PaginationMeta;
  /** Set when a cached value was served, in seconds of remaining freshness. */
  cachedForSeconds?: number;
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: ResponseMeta;
}

export interface ApiFailure {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId: string;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

/** A page of results as returned by repositories and services. */
export interface Page<T> {
  items: T[];
  nextCursor?: string;
  total?: number;
}
