import type { VercelRequest, VercelResponse } from '@vercel/node';
import nodemailer from "nodemailer";


const analyzeSmtpError = (error: any, host: string): string => {
  const errMsg = error.message || String(error);
  if (errMsg.includes("535") || errMsg.includes("authentication failed") || errMsg.includes("Invalid login") || errMsg.includes("system busy")) {
    let tip = `LỖI XÁC THỰC SMTP (Mã lỗi 535) - Đăng nhập không thành công.\n\n`;
    if (host.includes("gmail.com")) {
      tip += `👉 Bạn đang dùng GMAIL: Hãy chắc chắn sử dụng "Mật khẩu ứng dụng" (App Password) gồm 16 ký tự. KHÔNG DÙNG mật khẩu đăng nhập Gmail thông thường.\n`;
    } else {
      tip += `👉 Bạn bắt buộc phải kích hoạt chức năng POP3/SMTP hoặc IMAP/SMTP trong phần Cài đặt hòm thư, sau đó khởi tạo "Mã ủy quyền" (Authorization Code) 16 ký tự để điền vào ô Mật khẩu.\n`;
    }
    return tip;
  }
  return errMsg;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).end();

  let host = "smtp.gmail.com";
  try {
    const { email, fullName, taskName, assignerName, dueDate, customAppUrl, smtpConfig } = req.body;
    if (!email || !fullName || !taskName) {
      return res.status(400).json({ error: "Email, Full Name, and Task Name are required" });
    }

    host = smtpConfig?.host || process.env.SMTP_HOST || "smtp.gmail.com";
    const port = Number(smtpConfig?.port || process.env.SMTP_PORT) || 587;
    const user = smtpConfig?.user || process.env.SMTP_USER;
    const pass = smtpConfig?.pass || process.env.SMTP_PASS;
    const from = smtpConfig?.from || process.env.SMTP_FROM || user || "noreply@thalex.vn";
    let appUrl = customAppUrl || process.env.APP_URL || "https://ais-pre-xhtpfphlu2ps32uy3bofcu-255141659024.asia-southeast1.run.app";
    if (appUrl.includes("ais-dev-")) {
      appUrl = appUrl.replace("ais-dev-", "ais-pre-");
    }

    // Proactively sanitize the passed templates to replace any "ais-dev-" with "ais-pre-"
    if (smtpConfig) {
      if (smtpConfig.templateSubject) {
        smtpConfig.templateSubject = smtpConfig.templateSubject.replace(/ais-dev-/g, "ais-pre-");
      }
      if (smtpConfig.templateBody) {
        smtpConfig.templateBody = smtpConfig.templateBody.replace(/ais-dev-/g, "ais-pre-");
      }
    }

    if (!user || !pass) {
      console.warn("SMTP credentials are not configured. Task email sending is simulated.");
      return res.json({ 
        success: true, 
        simulated: true, 
        message: "No SMTP credentials set. Simulated task email printed to server log." 
      });
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: {
        user,
        pass,
      },
      tls: {
        rejectUnauthorized: false
      }
    });

    const emailHtmlFallback = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Nhiệm vụ mới được phân công</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
              background-color: #f6f9fc;
              margin: 0;
              padding: 0;
              -webkit-font-smoothing: antialiased;
            }
            .wrapper {
              width: 100%;
              background-color: #f6f9fc;
              padding: 40px 20px;
              box-sizing: border-box;
            }
            .container {
              max-width: 580px;
              margin: 0 auto;
              background-color: #ffffff;
              border-radius: 20px;
              overflow: hidden;
              box-shadow: 0 4px 20px rgba(0, 0, 0, 0.04);
              border: 1px solid #eef2f6;
            }
            .header {
              background-color: #1e293b;
              padding: 36px 32px;
              text-align: center;
              border-bottom: 3px solid #2563eb;
            }
            .brand {
              color: #ffffff;
              font-size: 26px;
              font-weight: 800;
              letter-spacing: -0.5px;
              margin: 0;
              text-transform: uppercase;
            }
            .brand span {
              color: #2563eb;
            }
            .content {
              padding: 40px 32px;
            }
            .greeting {
              font-size: 16px;
              color: #334155;
              line-height: 1.6;
              margin-bottom: 24px;
              font-weight: 500;
            }
            .credentials-card {
              background-color: #f8fafc;
              border: 1px solid #e2e8f0;
              border-radius: 16px;
              padding: 24px;
              margin-bottom: 30px;
            }
            .credentials-title {
              font-size: 12px;
              text-transform: uppercase;
              letter-spacing: 1.2px;
              color: #2563eb;
              font-weight: 800;
              margin-top: 0;
              margin-bottom: 16px;
              border-bottom: 1px solid #f1f5f9;
              padding-bottom: 8px;
            }
            .row {
              display: flex;
              margin-bottom: 14px;
              font-size: 14px;
              align-items: center;
            }
            .label {
              width: 130px;
              color: #64748b;
              font-weight: 600;
            }
            .value {
              color: #0f172a;
              font-weight: 700;
            }
            .button-wrapper {
              text-align: center;
              margin-top: 32px;
              margin-bottom: 15px;
            }
            .btn {
              display: inline-block;
              background-color: #2563eb;
              color: #ffffff !important;
              font-weight: 700;
              font-size: 14px;
              padding: 14px 36px;
              text-decoration: none;
              border-radius: 12px;
              box-shadow: 0 4px 12px rgba(37, 99, 235, 0.2);
              transition: all 0.2s ease;
            }
            .footer {
              padding: 24px 32px;
              background-color: #f8fafc;
              border-top: 1px solid #f1f5f9;
              text-align: center;
              font-size: 11px;
              color: #94a3b8;
            }
          </style>
        </head>
        <body>
          <div class="wrapper">
            <div class="container">
              <div class="header">
                <h1 class="brand">THALEX<span>_WORK</span></h1>
              </div>
              <div class="content">
                <p class="greeting">Chào <strong>${fullName}</strong>,</p>
                <p class="greeting">Hệ thống ghi nhận bạn vừa được phân bổ một đầu việc mới. Chi tiết nhiệm vụ như dưới đây:</p>

                <div class="credentials-card">
                  <h3 class="credentials-title">Chi tiết Nhiệm vụ</h3>
                  <div class="row">
                    <span class="label">Nhiệm vụ:</span>
                    <span class="value">${taskName}</span>
                  </div>
                  <div class="row">
                    <span class="label">Người giao:</span>
                    <span class="value">${assignerName || "Người quản lý"}</span>
                  </div>
                  <div class="row">
                    <span class="label">Hạn chót:</span>
                    <span class="value" style="color: #dc2626;">${dueDate || "Không có"}</span>
                  </div>
                </div>

                <div class="button-wrapper">
                  <a href="${appUrl}/tasks" class="btn" target="_blank">Truy cập Trung tâm Nhiệm vụ</a>
                </div>
              </div>
              <div class="footer">
                Đây là email thông báo tự động từ Thalex Workspace.<br>
                &copy; 2026 Thalex Group. All rights reserved.
              </div>
            </div>
          </div>
        </body>
      </html>
    `;

    const replaceAllPlaceholders = (text: string, vars: Record<string, string>) => {
      let resText = text;
      Object.entries(vars).forEach(([k, v]) => {
        const re = new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, 'g');
        resText = resText.replace(re, v || "");
      });
      return resText;
    };

    let subjectToSend = `[Thalex Work] Bạn nhận được một nhiệm vụ mới: ${taskName}`;
    let bodyToSend = emailHtmlFallback;

    const varsMap = {
      fullName: fullName || "",
      taskName: taskName || "",
      assignerName: assignerName || "",
      dueDate: dueDate || "",
      appUrl: appUrl || "",
      email: email || "",
    };

    if (smtpConfig?.templateSubject && smtpConfig?.templateBody) {
      subjectToSend = replaceAllPlaceholders(smtpConfig.templateSubject, varsMap);
      const userRenderedBody = replaceAllPlaceholders(smtpConfig.templateBody, varsMap);
      bodyToSend = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${subjectToSend}</title>
            <style>
              body {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                background-color: #f6f9fc;
                margin: 0;
                padding: 0;
                -webkit-font-smoothing: antialiased;
              }
              .wrapper {
                width: 100%;
                background-color: #f6f9fc;
                padding: 40px 20px;
                box-sizing: border-box;
                margin: 0;
              }
              .container {
                max-width: 580px;
                margin: 0 auto;
                background-color: #ffffff;
                border-radius: 20px;
                overflow: hidden;
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.04);
                border: 1px solid #eef2f6;
              }
              .header {
                background-color: #1e293b;
                padding: 36px 32px;
                text-align: center;
                border-bottom: 3px solid #2563eb;
              }
              .brand {
                color: #ffffff;
                font-size: 26px;
                font-weight: 800;
                letter-spacing: -0.5px;
                margin: 0;
                text-transform: uppercase;
              }
              .brand span {
                color: #2563eb;
              }
              .content {
                padding: 40px 32px;
                font-size: 15px;
                color: #334155;
                line-height: 1.6;
              }
              .footer {
                padding: 24px 32px;
                background-color: #f8fafc;
                border-top: 1px solid #f1f5f9;
                text-align: center;
                font-size: 11px;
                color: #94a3b8;
              }
            </style>
          </head>
          <body>
            <div class="wrapper">
              <div class="container">
                <div class="header">
                  <h1 class="brand">THALEX<span>_WORK</span></h1>
                </div>
                <div class="content">
                  ${userRenderedBody}
                </div>
                <div class="footer">
                  Đây là email thông báo tự động từ Thalex Workspace.<br>
                  &copy; 2026 Thalex Group. All rights reserved.
                </div>
              </div>
            </div>
          </body>
        </html>
      `;
    }

    await transporter.sendMail({
      from: `"Thalex Portal" <${from}>`,
      to: email,
      subject: subjectToSend,
      html: bodyToSend,
    });

    console.log(`[SMTP] Task assignment email sent successfully to ${email}`);
    return res.json({ success: true, message: "Task email sent successfully." });
  } catch (error: any) {
    console.error("Failed to send task email:", error);
    return res.status(500).json({ error: analyzeSmtpError(error, host) });
  }
}
