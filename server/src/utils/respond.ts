/**
 * Envelope helpers for `/api/v1`. The legacy router must NOT use these.
 */
import type { Response } from "express";
import type { ApiSuccess, ResponseMeta } from "../types/envelope.ts";

function envelope<T>(data: T, meta?: ResponseMeta): ApiSuccess<T> {
  return meta === undefined ? { success: true, data } : { success: true, data, meta };
}

export function ok<T>(res: Response, data: T, meta?: ResponseMeta): void {
  res.status(200).json(envelope(data, meta));
}

export function created<T>(res: Response, data: T, location?: string): void {
  if (location) res.location(location);
  res.status(201).json(envelope(data));
}

export function accepted<T>(res: Response, data: T): void {
  res.status(202).json(envelope(data));
}

export function noContent(res: Response): void {
  res.status(204).end();
}
