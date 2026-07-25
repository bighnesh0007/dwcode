import mongoose from 'mongoose';
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
  difficulty: { type: String, enum: ['Easy', 'Medium', 'Hard'], required: true },
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

export const Problem = modelFromSchema('Problem', ProblemSchema);
