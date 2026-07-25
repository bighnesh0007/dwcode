/**
 * Zod validation middleware factory.
 *
 * Parsed output goes to `req.validated.*` — handlers read from there rather than from
 * `req.body`/`req.query`. This matters in Express 5, where `req.query` is a lazy
 * getter that must not be reassigned (the reason `express-mongo-sanitize` breaks).
 */
import type { RequestHandler } from "express";
import type { ZodType } from "zod";
import { ValidationError } from "../errors/AppError.ts";
import { zodIssues } from "../errors/toAppError.ts";

export interface ValidationSchemas {
  body?: ZodType;
  params?: ZodType;
  query?: ZodType;
}

export function validate(schemas: ValidationSchemas): RequestHandler {
  return (req, _res, next) => {
    const issues: { path: string; message: string; code: string }[] = [];

    if (schemas.body) {
      const result = schemas.body.safeParse(req.body);
      if (result.success) req.validated.body = result.data;
      else issues.push(...zodIssues(result.error).map((i) => ({ ...i, path: `body.${i.path}` })));
    }

    if (schemas.params) {
      const result = schemas.params.safeParse(req.params);
      if (result.success) req.validated.params = result.data;
      else issues.push(...zodIssues(result.error).map((i) => ({ ...i, path: `params.${i.path}` })));
    }

    if (schemas.query) {
      // Read-only access to the lazy getter; never assign back to req.query.
      const result = schemas.query.safeParse(req.query);
      if (result.success) req.validated.query = result.data;
      else issues.push(...zodIssues(result.error).map((i) => ({ ...i, path: `query.${i.path}` })));
    }

    if (issues.length > 0) {
      next(new ValidationError("Request validation failed.", issues));
      return;
    }

    next();
  };
}

/** Typed accessors so controllers don't cast on every read. */
export function validatedBody<T>(req: { validated: { body?: unknown } }): T {
  return req.validated.body as T;
}

export function validatedParams<T>(req: { validated: { params?: unknown } }): T {
  return req.validated.params as T;
}

export function validatedQuery<T>(req: { validated: { query?: unknown } }): T {
  return req.validated.query as T;
}
