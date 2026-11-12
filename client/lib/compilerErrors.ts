/**
 * Make compiler errors about missing functions understandable (issue #8).
 * The implementation moved to @dwcode/shared so server/'s grading uses the same
 * text; this re-export keeps "@/lib/compilerErrors" imports working.
 */
export { explainCompilerError } from "@dwcode/shared";
