import type { VercelRequest, VercelResponse } from '@vercel/node';
import nodemailer from "nodemailer";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).end();

  let host = "smtp.gmail.com";
  try {
    const { email, fullName, password, customAppUrl, smtpConfig } = req.body;
    if (!email || !fullName) return res.status(400).json({ error: "Email and Full Name are required" });

    host = smtpConfig?.host || process.env.SMTP_HOST || "smtp.gmail.com";
    const port = Number(smtpConfig?.port || process.env.SMTP_PORT) || 587;
    const user = smtpConfig?.user || process.env.SMTP_USER;
    const pass = smtpConfig?.pass || process.env.SMTP_PASS;
    const from = smtpConfig?.from || process.env.SMTP_FROM || user || "noreply@thalex.vn";
    let appUrl = customAppUrl || process.env.APP_URL || "https://ais-pre-xhtpfphlu2ps32uy3bofcu-255141659024.asia-southeast1.run.app";
    if (appUrl.includes("ais-dev-")) appUrl = appUrl.replace("ais-dev-", "ais-pre-");

    if (smtpConfig) {
      if (smtpConfig.templateSubject) smtpConfig.templateSubject = smtpConfig.templateSubject.replace(/ais-dev-/g, "ais-pre-");
      if (smtpConfig.templateBody) smtpConfig.templateBody = smtpConfig.templateBody.replace(/ais-dev-/g, "ais-pre-");
    }

    if (!user || !pass) {
      console.warn("SMTP credentials not configured.");
      return res.json({ success: true, simulated: true, message: "Simulated welcome email" });
    }

    const transporter = nodemailer.createTransport({
      host, port, secure: port === 465,
      auth: { user, pass },
      tls: { rejectUnauthorized: false }
    });

    const varsMap = { fullName: fullName || "", password: password || "", appUrl: appUrl || "", email: email || "" };
    const replaceAllPlaceholders = (text: string, vars: Record<string, string>) => {
      let resText = text;
      Object.entries(vars).forEach(([k, v]) => {
        const re = new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, 'g');
        resText = resText.replace(re, v || "");
      });
      return resText;
    };

    let subjectToSend = `[Thalex Work] Chào mừng ${fullName} gia nhập ngôi nhà Thalex`;
    
    // Default Body
    let bodyToSend = `
      <!DOCTYPE html><html><head><meta charset="utf-8">
      <style>body{font-family:sans-serif;background:#f6f9fc;margin:0;padding:20px}
      .c{max-width:580px;margin:0 auto;background:#fff;border-radius:20px;padding:32px;box-shadow:0 4px 20px rgba(0,0,0,.04)}
      .h{background:#1e293b;padding:20px;text-align:center;border-radius:12px 12px 0 0;color:#fff}
      .g{font-size:16px;color:#334155;margin-top:20px}
      </style></head><body>
      <div class="c">
        <div class="h"><h2>THALEX_WORK</h2></div>
        <div class="g">
          <p>Chào <strong>${fullName}</strong>,</p>
          <p>Tài khoản từ Thalex Portal:</p>
          <p>Đường dẫn: <a href="${appUrl}">${appUrl}</a></p>
          <p>User: ${email}</p>
          <p>Pass: ${password}</p>
        </div>
      </div></body></html>
    `;

    if (smtpConfig?.templateSubject && smtpConfig?.templateBody) {
      subjectToSend = replaceAllPlaceholders(smtpConfig.templateSubject, varsMap);
      bodyToSend = replaceAllPlaceholders(smtpConfig.templateBody, varsMap);
    }

    await transporter.sendMail({ from: `"Thalex Portal" <${from}>`, to: email, subject: subjectToSend, html: bodyToSend });
    res.json({ success: true, message: "Welcome email sent successfully." });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}
