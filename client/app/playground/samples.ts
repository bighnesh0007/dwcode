import type { SampleEntry } from "./types";

export const SAMPLES: SampleEntry[] = [
    // ── JSON ────────────────────────────────────────────────────────────────────
    {
        id: "json-users",
        label: "Users array",
        language: "json",
        description: "A list of user objects with id, name, email, and role.",
        content: JSON.stringify([
            { id: 1, name: "Alice", email: "alice@example.com", role: "admin", active: true },
            { id: 2, name: "Bob", email: "bob@example.com", role: "user", active: false },
            { id: 3, name: "Carol", email: "carol@example.com", role: "user", active: true },
        ], null, 2),
    },
    {
        id: "json-orders",
        label: "E-commerce orders",
        language: "json",
        description: "Order records with line-items and totals.",
        content: JSON.stringify([
            {
                orderId: "ORD-001",
                customer: { id: "C1", name: "Alice" },
                items: [
                    { sku: "WIDGET-A", qty: 2, unitPrice: 9.99 },
                    { sku: "GADGET-B", qty: 1, unitPrice: 24.99 },
                ],
                status: "shipped",
                createdAt: "2024-01-15T10:30:00Z",
            },
            {
                orderId: "ORD-002",
                customer: { id: "C2", name: "Bob" },
                items: [{ sku: "WIDGET-A", qty: 5, unitPrice: 9.99 }],
                status: "pending",
                createdAt: "2024-01-16T08:00:00Z",
            },
        ], null, 2),
    },
    {
        id: "json-employees",
        label: "Employees",
        language: "json",
        description: "HR-style employee records with department and salary.",
        content: JSON.stringify([
            { empId: "E001", name: "Diana", dept: "Engineering", salary: 95000, hiredOn: "2021-03-01" },
            { empId: "E002", name: "Eduardo", dept: "Marketing", salary: 72000, hiredOn: "2020-07-15" },
            { empId: "E003", name: "Fatima", dept: "Engineering", salary: 105000, hiredOn: "2019-11-22" },
        ], null, 2),
    },
    {
        id: "json-nested",
        label: "Nested config",
        language: "json",
        description: "Deeply nested configuration object — useful for flatten/unflatten exercises.",
        content: JSON.stringify({
            app: {
                name: "MyApp",
                version: "2.1.0",
                features: { darkMode: true, notifications: false, beta: false },
                database: { host: "db.example.com", port: 5432, name: "mydb" },
            },
        }, null, 2),
    },

    // ── XML ─────────────────────────────────────────────────────────────────────
    {
        id: "xml-invoice",
        label: "Invoice XML",
        language: "xml",
        description: "A simple invoice in XML — common in MuleSoft integrations.",
        content: `<?xml version="1.0" encoding="UTF-8"?>
<Invoice id="INV-2024-001" date="2024-01-20">
  <Vendor>
    <Name>Acme Corp</Name>
    <Tax>US-123456789</Tax>
  </Vendor>
  <BillTo>
    <Name>Bob Builder</Name>
    <Address>123 Main St, Springfield, USA</Address>
  </BillTo>
  <LineItems>
    <Item sku="A100" qty="3" unitPrice="19.99">Widget Alpha</Item>
    <Item sku="B200" qty="1" unitPrice="99.00">Gadget Beta</Item>
  </LineItems>
  <Total currency="USD">159.97</Total>
</Invoice>`,
    },
    {
        id: "xml-soap",
        label: "SOAP Envelope",
        language: "xml",
        description: "Minimal SOAP 1.1 envelope — useful for web service transformation scenarios.",
        content: `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
               xmlns:ex="http://example.com/service">
  <soap:Header>
    <ex:Auth>
      <ex:Token>Bearer abc123</ex:Token>
    </ex:Auth>
  </soap:Header>
  <soap:Body>
    <ex:GetUserRequest>
      <ex:UserId>U-42</ex:UserId>
    </ex:GetUserRequest>
  </soap:Body>
</soap:Envelope>`,
    },

    // ── CSV ─────────────────────────────────────────────────────────────────────
    {
        id: "csv-products",
        label: "Products CSV",
        language: "csv",
        description: "Product catalogue with name, category, price, and stock.",
        content: `sku,name,category,price,stock
WDGT-001,Red Widget,Widgets,9.99,150
WDGT-002,Blue Widget,Widgets,12.49,80
GDGT-001,Smart Gadget,Gadgets,49.99,30
GDGT-002,Mega Gadget,Gadgets,199.00,12
SVC-001,Support Plan,Services,299.00,999`,
    },
    {
        id: "csv-transactions",
        label: "Bank transactions CSV",
        language: "csv",
        description: "Bank statement rows with date, description, and amount.",
        content: `date,description,debit,credit,balance
2024-01-01,Opening Balance,,,5000.00
2024-01-03,AMAZON.COM,-123.45,,4876.55
2024-01-05,SALARY,,3200.00,8076.55
2024-01-07,GROCERY STORE,-67.80,,8008.75
2024-01-10,NETFLIX,-15.99,,7992.76`,
    },

    // ── YAML ────────────────────────────────────────────────────────────────────
    {
        id: "yaml-config",
        label: "App config YAML",
        language: "yaml",
        description: "YAML configuration file — typical CI/CD or microservice scenario.",
        content: `server:
  port: 8080
  host: 0.0.0.0

database:
  url: jdbc:postgresql://localhost:5432/mydb
  pool:
    min: 2
    max: 10

logging:
  level: INFO
  format: json

features:
  rateLimit: true
  cache: true
  metrics: false`,
    },

    // ── Plain text ───────────────────────────────────────────────────────────────
    {
        id: "text-log",
        label: "Log lines",
        language: "text",
        description: "Apache-style access log — good for parsing / splitting exercises.",
        content: `127.0.0.1 - - [20/Jan/2024:10:00:01 +0000] "GET /api/users HTTP/1.1" 200 1234
192.168.1.5 - alice [20/Jan/2024:10:00:05 +0000] "POST /api/orders HTTP/1.1" 201 512
10.0.0.2 - - [20/Jan/2024:10:01:33 +0000] "GET /healthz HTTP/1.1" 200 2
203.0.113.7 - bob [20/Jan/2024:10:02:10 +0000] "DELETE /api/sessions/42 HTTP/1.1" 204 0`,
    },
];
