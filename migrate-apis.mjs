import fs from 'fs';

const serverCode = fs.readFileSync('server.ts', 'utf8');

function extractEndpointBlock(pathStr) {
  const startStr = `app.post("${pathStr}", async (req, res) => {`;
  const startIdx = serverCode.indexOf(startStr);
  if (startIdx === -1) return null;
  let blocks = 1;
  let idx = startIdx + startStr.length;
  while(blocks > 0 && idx < serverCode.length) {
    if (serverCode[idx] === '{') blocks++;
    if (serverCode[idx] === '}') blocks--;
    idx++;
  }
  const body = serverCode.substring(startIdx + startStr.length, idx - 2); 
  return body;
}

const templates = [
  { path: "/api/send-task-email", file: "api/send-task-email.ts" },
  { path: "/api/send-proposal-email", file: "api/send-proposal-email.ts" }
];

for(const t of templates) {
  const body = extractEndpointBlock(t.path);
  if (body) {
    let replacedBody = body
      .replace(/res\.status\(/g, 'return res.status(')
      .replace(/res\.json\(/g, 'return res.json(')
      .replace(/return return /g, 'return ');
    const code = `import type { VercelRequest, VercelResponse } from '@vercel/node';\nimport nodemailer from "nodemailer";\n\nexport default async function handler(req: VercelRequest, res: VercelResponse) {\n  res.setHeader("Access-Control-Allow-Origin", "*");\n  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");\n  res.setHeader("Access-Control-Allow-Headers", "Content-Type");\n  if (req.method === "OPTIONS") return res.status(200).end();\n  if (req.method !== "POST") return res.status(405).end();\n${replacedBody}\n}\n`;
    fs.writeFileSync(t.file, code);
    console.log("Created", t.file);
  }
}
