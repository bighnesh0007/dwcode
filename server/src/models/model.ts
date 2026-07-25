import mongoose from "mongoose";

/**
 * Returns an existing compiled model or compiles a new one.
 *
 * Copied verbatim from the frontend's models/model.ts so the schemas port across
 * unchanged. Still useful here: test suites import models repeatedly across files,
 * and Mongoose throws on re-compiling the same model name.
 */
export function modelFromSchema<TSchema extends mongoose.Schema>(
  name: string,
  schema: TSchema,
): mongoose.Model<mongoose.InferSchemaType<TSchema>> {
  type ModelDocument = mongoose.InferSchemaType<TSchema>;

  return (
    (mongoose.models[name] as mongoose.Model<ModelDocument> | undefined) ??
    mongoose.model<ModelDocument>(name, schema)
  );
}
