import mongoose from "mongoose";

export function modelFromSchema<TSchema extends mongoose.Schema>(
  name: string,
  schema: TSchema
): mongoose.Model<mongoose.InferSchemaType<TSchema>> {
  type ModelDocument = mongoose.InferSchemaType<TSchema>;

  return (
    (mongoose.models[name] as mongoose.Model<ModelDocument> | undefined) ??
    mongoose.model<ModelDocument>(name, schema)
  );
}
