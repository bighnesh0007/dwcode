/**
 * The Learning tab: the concepts a problem exercises, with links to the
 * official DataWeave docs. Keyed by category and by tag; a problem shows the
 * union, falling back to the core concepts when nothing matches.
 */
export interface Concept {
  title: string;
  summary: string;
  docs: string;
}

const DOCS = "https://docs.mulesoft.com/dataweave/latest";

const CONCEPTS: Record<string, Concept> = {
  map: { title: "map", summary: "Transforms each element of an array; `$` is the item and `$$` its index.", docs: `${DOCS}/dw-core-functions-map` },
  filter: { title: "filter", summary: "Keeps the elements for which the condition is true.", docs: `${DOCS}/dw-core-functions-filter` },
  reduce: { title: "reduce", summary: "Folds an array into one value. Give the accumulator a starting value (`acc = 0`) or the first element is used.", docs: `${DOCS}/dw-core-functions-reduce` },
  groupBy: { title: "groupBy", summary: "Groups elements into an object keyed by the criteria's result.", docs: `${DOCS}/dw-core-functions-groupby` },
  pluck: { title: "pluck", summary: "Turns an object into an array, given each value, key and index.", docs: `${DOCS}/dw-core-functions-pluck` },
  mapObject: { title: "mapObject", summary: "Transforms each key–value pair of an object.", docs: `${DOCS}/dw-core-functions-mapobject` },
  selectors: { title: "Selectors", summary: "`.key`, `.*key` (multi-value), `..key` (descendants) and `[index]` read into structures.", docs: `${DOCS}/dataweave-selectors` },
  strings: { title: "String functions", summary: "`upper`, `lower`, `splitBy`, `joinBy`, `replace`, `trim` and string interpolation with `$(...)`.", docs: `${DOCS}/dw-strings` },
  types: { title: "Types and coercion", summary: "`as` coerces between types; `is` checks a type. Coercion can fail at run time.", docs: `${DOCS}/dataweave-type-coercion` },
  nulls: { title: "Null safety", summary: "`default` supplies a value for null; selectors on null return null rather than failing.", docs: `${DOCS}/dataweave-types#dw_type_null` },
  operators: { title: "Operators and precedence", summary: "`==` binds tighter than `mod`; parenthesise arithmetic before comparing.", docs: `${DOCS}/dw-operators` },
  xml: { title: "XML", summary: "Attributes are read with `.@name`; namespaces and repeated elements need `.*`.", docs: `${DOCS}/dataweave-formats-xml` },
  conditionals: { title: "Conditionals", summary: "`if (...) a else b`, `match` with `case`, and conditional object fields `(key: value) if cond`.", docs: `${DOCS}/dataweave-flow-control` },
};

const BY_KEY: Record<string, (keyof typeof CONCEPTS)[]> = {
  arrays: ["map", "filter", "reduce", "groupBy"],
  objects: ["mapObject", "pluck", "selectors"],
  strings: ["strings", "types"],
  transformations: ["map", "mapObject", "selectors"],
  xml: ["xml", "selectors"],
  "core functions": ["map", "filter", "reduce", "pluck"],
  debugging: ["operators", "nulls", "types", "reduce"],
  precedence: ["operators"],
  "null-handling": ["nulls"],
  "type-coercion": ["types"],
  "type-mismatch": ["types", "strings"],
  "off-by-one": ["filter", "conditionals"],
  syntax: ["selectors"],
};

const CORE: (keyof typeof CONCEPTS)[] = ["map", "filter", "selectors"];

export function conceptsFor(category: string | undefined, tags: readonly string[] = []): Concept[] {
  const keys = new Set<keyof typeof CONCEPTS>();
  for (const k of [category ?? "", ...tags]) for (const c of BY_KEY[k.toLowerCase()] ?? []) keys.add(c);
  if (keys.size === 0) for (const c of CORE) keys.add(c);
  return [...keys].map((k) => CONCEPTS[k]).filter((c): c is Concept => Boolean(c));
}
