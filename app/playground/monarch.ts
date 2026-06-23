const DATAWEAVE_KEYWORDS = [
  "and",
  "as",
  "case",
  "default",
  "do",
  "else",
  "false",
  "fun",
  "if",
  "import",
  "is",
  "match",
  "not",
  "null",
  "or",
  "output",
  "true",
  "type",
  "unless",
  "using",
  "var",
];

const DATAWEAVE_FUNCTIONS = [
  "avg",
  "ceil",
  "contains",
  "distinctBy",
  "filter",
  "flatten",
  "floor",
  "groupBy",
  "isEmpty",
  "joinBy",
  "keysOf",
  "lower",
  "map",
  "mapObject",
  "max",
  "min",
  "orderBy",
  "pluck",
  "read",
  "reduce",
  "replace",
  "sizeOf",
  "splitBy",
  "sum",
  "trim",
  "upper",
  "valuesOf",
  "write",
];

type MonacoLike = typeof import("monaco-editor");

export function registerDataWeaveLanguage(monaco: MonacoLike) {
  const hasLanguage = monaco.languages
    .getLanguages()
    .some((language) => language.id === "dataweave");

  if (hasLanguage) return;

  monaco.languages.register({ id: "dataweave" });

  monaco.languages.setMonarchTokensProvider("dataweave", {
    defaultToken: "",
    tokenPostfix: ".dwl",
    keywords: DATAWEAVE_KEYWORDS,
    functions: DATAWEAVE_FUNCTIONS,
    operators: [
      "=",
      ">",
      "<",
      "!",
      "~",
      "?",
      ":",
      "==",
      "<=",
      ">=",
      "!=",
      "++",
      "-",
      "+",
      "*",
      "/",
      "%",
      "->",
      "---",
    ],
    symbols: /[=><!~?:&|+\-*\/\^%]+/,
    tokenizer: {
      root: [
        [/%dw\s+\d+(\.\d+)?/, "metatag"],
        [/---/, "delimiter"],
        [/[a-zA-Z_$][\w$]*/, {
          cases: {
            "@keywords": "keyword",
            "@functions": "predefined",
            "@default": "identifier",
          },
        }],
        [/[{}()\[\]]/, "@brackets"],
        [/@symbols/, {
          cases: {
            "@operators": "operator",
            "@default": "",
          },
        }],
        [/\d*\.\d+([eE][\-+]?\d+)?/, "number.float"],
        [/\d+/, "number"],
        [/\/\/.*$/, "comment"],
        [/\/\*/, "comment", "@comment"],
        [/"([^"\\]|\\.)*$/, "string.invalid"],
        [/"/, "string", "@string_double"],
        [/'([^'\\]|\\.)*$/, "string.invalid"],
        [/'/, "string", "@string_single"],
      ],
      comment: [
        [/[^\/*]+/, "comment"],
        [/\*\//, "comment", "@pop"],
        [/[\/*]/, "comment"],
      ],
      string_double: [
        [/[^\\"]+/, "string"],
        [/\\./, "string.escape"],
        [/"/, "string", "@pop"],
      ],
      string_single: [
        [/[^\\']+/, "string"],
        [/\\./, "string.escape"],
        [/'/, "string", "@pop"],
      ],
    },
  });

  monaco.languages.setLanguageConfiguration("dataweave", {
    comments: {
      lineComment: "//",
      blockComment: ["/*", "*/"],
    },
    brackets: [
      ["{", "}"],
      ["[", "]"],
      ["(", ")"],
    ],
    autoClosingPairs: [
      { open: "{", close: "}" },
      { open: "[", close: "]" },
      { open: "(", close: ")" },
      { open: "\"", close: "\"" },
      { open: "'", close: "'" },
    ],
  });
}
