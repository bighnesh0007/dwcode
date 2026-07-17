import mongoose from "mongoose";

const PlaygroundFileSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    kind: {
      type: String,
      enum: ["payload", "vars", "attributes", "custom"],
      default: "custom",
    },
    language: {
      type: String,
      enum: ["json", "xml", "csv", "yaml", "text", "java", "ndjson", "multipart"],
      default: "json",
    },
    content: { type: String, default: "" },
  },
  { _id: false }
);

const PlaygroundTestCaseSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    files: [PlaygroundFileSchema],
    expectedOutput: { type: String, default: "" },
  },
  { _id: false }
);

const PlaygroundSnippetSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true, index: true },
    script: { type: String, required: true },
    files: [PlaygroundFileSchema],
    testCases: [PlaygroundTestCaseSchema],
    userId: { type: String, default: "" },
  },
  { timestamps: true }
);

export const PlaygroundSnippet =
  mongoose.models.PlaygroundSnippet ||
  mongoose.model("PlaygroundSnippet", PlaygroundSnippetSchema);
