import mongoose from 'mongoose';
import { DIFFICULTY_ENUM } from '@dwcode/shared';
import { modelFromSchema } from './model';

const TestCaseSchema = new mongoose.Schema({
  input: { type: String, required: true },
  expectedOutput: { type: String, required: true },
});

const ExampleSchema = new mongoose.Schema({
  input: { type: String, required: true },
  output: { type: String, required: true },
  explanation: String,
});

export const ProblemSchema = new mongoose.Schema({
  title: { type: String, required: true },
  slug: { type: String, required: true, unique: true },
  // Enum comes from the shared difficulty registry (REF-01) — adding a tier
  // there updates this automatically instead of needing a schema edit.
  difficulty: { type: String, enum: DIFFICULTY_ENUM, required: true },
  category: { type: String, required: true },
  tags: [{ type: String }],
  description: { type: String, required: true },
  examples: [ExampleSchema],
  constraints: [{ type: String }],
  starterCode: { type: String, default: '%dw 2.0\noutput application/json\n---\n' },
  testCases: [TestCaseSchema],
  hiddenTestCases: [TestCaseSchema],
  solution: String,
  hints: [{ type: String }],
  createdByAI: { type: Boolean, default: false },
  createdBy: { type: String, default: "" },       // Clerk userId of creator
  createdAt: { type: Date, default: Date.now },
});

// Indexes (PERF-02).
// Problem.find({ difficulty, category }) — either field alone uses the prefix.
ProblemSchema.index({ difficulty: 1, category: 1 });
// Problem.find(query).sort({ createdAt: -1 }) — the default problem listing.
ProblemSchema.index({ createdAt: -1 });

export const Problem = modelFromSchema('Problem', ProblemSchema);
