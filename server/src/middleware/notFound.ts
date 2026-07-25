import type { RequestHandler } from "express";
import { NotFoundError } from "../errors/AppError.ts";

/** Turns an unmatched route into a proper `AppError` for the central handler. */
export const notFound: RequestHandler = (req, _res, next) => {
  next(new NotFoundError(`Cannot ${req.method} ${req.path}`));
};
