export type PlaygroundFileLanguage = "json" | "xml" | "csv" | "text";

export type PlaygroundFileKind = "payload" | "vars" | "attributes" | "custom";

export type PlaygroundFile = {
  id: string;
  name: string;
  kind: PlaygroundFileKind;
  language: PlaygroundFileLanguage;
  content: string;
};

export type PlaygroundTestResult = {
  status: "success" | "error";
  output: string;
  time: string | null;
};

export type PlaygroundTestCase = {
  id: string;
  name: string;
  files: PlaygroundFile[];
  expectedOutput?: string;
  result?: PlaygroundTestResult;
};
