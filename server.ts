import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import nodemailer from "nodemailer";
import fs from "fs";

const app = express();

const PORT = 3000;

// Enable CORS for all origins (especially custom domains like thalex.com.vn)
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
  } else {
    res.setHeader("Access-Control-Allow-Origin", "*");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  
  // Dynamically allow requested headers to avoid preflight (OPTIONS) network failures
  const requestedHeaders = req.headers["access-control-request-headers"];
  if (requestedHeaders) {
    res.setHeader("Access-Control-Allow-Headers", requestedHeaders);
  } else {
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, Accept, Origin");
  }

  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

// Middleware to rewrite reverse-proxied paths (e.g. /business/api/send-account-email -> /api/send-account-email)
app.use((req, res, next) => {
  if (req.url.includes("/api/")) {
    const apiIndex = req.url.indexOf("/api/");
    const cleanUrl = req.url.substring(apiIndex);
    if (req.url !== cleanUrl) {
      console.log(`[API REWRITE] Rewriting ${req.url} -> ${cleanUrl}`);
      req.url = cleanUrl;
    }
  }
  next();
});

// Middleware for parsing JSON bodies
app.use(express.json({ limit: "50mb", type: ["application/json", "text/plain"] }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

// Initialize GoogleGenAI client (lazy initialization would be better to avoid crashing, but we must protect against missing key)
const getGeminiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is not defined");
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });
};

// API routes
app.post("/api/upload", async (req, res) => {
  try {
    const { filename, base64Data } = req.body;
    if (!filename || !base64Data) {
      return res.status(400).json({ error: "Filename and base64Data are required" });
    }

    // Ensure uploads directory exists
    const uploadsDir = path.join(process.cwd(), "uploads");
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    // Handle base64 prefix if modern File Reader data URI is passed
    const cleanBase64 = base64Data.replace(/^data:.*?;base64,/, "");

    // Prepare unique filename
    const ext = path.extname(filename);
    const baseName = path.basename(filename, ext);
    // Remove complex characters to make it clean
    const cleanBaseName = baseName.replace(/[^a-zA-Z0-9_-]/g, "_");
    const uniqueFilename = `${cleanBaseName}_${Date.now()}${ext}`;
    const filePath = path.join(uploadsDir, uniqueFilename);

    // Save the file binary buffer back to disk
    fs.writeFileSync(filePath, Buffer.from(cleanBase64, "base64"));
    
    const fileUrl = `/uploads/${uniqueFilename}`;
    const stats = fs.statSync(filePath);

    res.json({
      success: true,
      url: fileUrl,
      size: stats.size,
      filename: uniqueFilename,
      originalName: filename,
    });
  } catch (error: any) {
    console.error("Upload handler error:", error);
    res.status(500).json({ error: error.message || "Failed to persist uploaded file" });
  }
});

app.post("/api/gemini", async (req, res) => {
  try {
    const { prompt, history } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required" });
    }

    const ai = getGeminiClient();
    
    // Map history and append the current prompt
    let contents: any[] = [];
    if (history && Array.isArray(history)) {
      contents = history.map(item => {
        // Normalize role to 'user' or 'model'
        const role = item.role === 'model' || item.role === 'assistant' ? 'model' : 'user';
        
        // Normalize parts to parts array
        let parts: any[] = [];
        if (typeof item.parts === 'string') {
          parts = [{ text: item.parts }];
        } else if (Array.isArray(item.parts)) {
          parts = item.parts.map(p => typeof p === 'string' ? { text: p } : p);
        } else if (item.text) {
          parts = [{ text: item.text }];
        } else {
          parts = [{ text: String(item.content || '') }];
        }
        
        return { role, parts };
      });
    }
    
    contents.push({
      role: 'user',
      parts: [{ text: prompt }]
    });

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents
    });

    res.json({ response: response.text });
  } catch (error: any) {
    console.error("Gemini GenAI Error:", error);
    res.status(500).json({ error: error.message || "Failed to generate content with Gemini" });
  }
});

const analyzeSmtpError = (error: any, host: string): string => {
  const errMsg = error.message || String(error);
  console.error("Original SMTP Error Details:", error);

  if (errMsg.includes("535") || errMsg.includes("authentication failed") || errMsg.includes("Invalid login") || errMsg.includes("system busy")) {
    let tip = `LỖI XÁC THỰC SMTP (Mã lỗi 535) - Đăng nhập không thành công.\n\nHướng dẫn xử lý lỗi này:\n`;
    
    if (host.includes("gmail.com")) {
      tip += `👉 Bạn đang dùng GMAIL: Hãy chắc chắn sử dụng "Mật khẩu ứng dụng" (App Password) gồm 16 ký tự. KHÔNG DÙNG mật khẩu đăng nhập Gmail thông thường. Để lấy mật khẩu này: Bật "Xác minh 2 bước" trong Tài khoản Google của bạn -> Vào mục Tìm kiếm tìm "Mật khẩu ứng dụng" -> Tạo ứng dụng "Khác" và sao chép mã 16 ký tự.\n`;
    } else if (host.includes("qq.com") || host.includes("163.com") || host.includes("126.com") || host.includes("vinasglobal")) {
      tip += `👉 Bạn đang dùng QQ Mail / NetEase 163 Mail / hòm thư phụ thuộc: Bạn bắt buộc phải kích hoạt chức năng POP3/SMTP hoặc IMAP/SMTP trong phần Cài đặt hòm thư, sau đó khởi tạo "Mã ủy quyền" (Authorization Code) 16 ký tự để điền vào ô Mật khẩu, KHÔNG dùng mật khẩu chính.\n👉 Nguyên nhân "System busy" cũng chỉ ra rằng máy chủ thư đang tạm thời chặn kết nối do bạn đăng nhập sai nhiều lần trước đó. Vui lòng đợi 5-10 phút rồi thử lại bằng Mã ủy quyền mới.\n`;
    } else {
      tip += `👉 Máy chủ hòm thư của bạn yêu cầu dùng "Mật khẩu ứng dụng" (App Specific Password) hoặc mã ủy quyền thay vì mật khẩu hòm thư chính. Vui lòng kiểm tra mục cài đặt bảo mật / SMTP của hòm thư.\n👉 Đảm bảo tính năng SMTP/gửi thư bên thứ ba đã được BẬT trong cài đặt tài khoản email.\n`;
    }
    
    tip += `👉 Vui lòng bảo đảm Địa chỉ Email Người gửi (From Header) và Tên đăng nhập SMTP trùng khớp.\n`;
    tip += `\n[Chi tiết phản hồi gốc từ Mail Server]:\n${errMsg}`;
    return tip;
  }
  
  if (errMsg.includes("ETIMEDOUT") || errMsg.includes("ENOTFOUND") || errMsg.includes("ECONNREFUSED")) {
    return `LỖI KẾT NỐI MẠNG (Cổng kết nối bị từ chối / Hết thời gian chờ / Không tìm thấy máy chủ):\nKhông thể kết nối tới máy chủ SMTP '${host}' ở cổng đã chọn. Vui lòng kiểm tra lại địa chỉ Host và Cổng (Port) xem đã chính xác chưa (Gợi ý: Host thông thường dùng smtp.gmail.com | Port: 587 hoặc 465). Ngoài ra, hãy thử đổi giữa Port 587 (bảo mật STARTTLS) và Port 465 (bảo mật SSL/TLS). Trình duyệt hoặc hệ thống tường lửa đang từ chối kết nối.`;
  }

  return `Lỗi SMTP: ${errMsg}`;
};

app.post("/api/send-account-email", async (req, res) => {
  let host = "smtp.gmail.com";
  try {
    const { email, fullName, password, customAppUrl, smtpConfig } = req.body;
    if (!email || !fullName) {
      return res.status(400).json({ error: "Email and Full Name are required" });
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
      console.warn("SMTP credentials are not configured in environment variables or request. Email sending is simulated.");
      return res.json({ 
        success: true, 
        simulated: true, 
        message: "No SMTP credentials set. Simulated welcome email printed to server log." 
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
          <title>Chào mừng bạn gia nhập ngôi nhà Thalex</title>
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
              border-bottom: 3px solid #10b981;
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
              color: #10b981;
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
            .wishes {
              background-color: #f0fdf4;
              border-left: 4px solid #10b981;
              padding: 18px 22px;
              border-radius: 0 16px 16px 0;
              color: #065f46;
              font-size: 14px;
              line-height: 1.6;
              margin-bottom: 30px;
              font-style: italic;
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
              color: #64748b;
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
            .code-value {
              font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
              color: #ea580c;
              background-color: #ffedd5;
              padding: 4px 10px;
              border-radius: 6px;
              font-weight: 700;
              font-size: 13px;
            }
            .button-wrapper {
              text-align: center;
              margin-top: 32px;
              margin-bottom: 15px;
            }
            .btn {
              display: inline-block;
              background-color: #10b981;
              color: #ffffff !important;
              font-weight: 700;
              font-size: 14px;
              padding: 14px 36px;
              text-decoration: none;
              border-radius: 12px;
              box-shadow: 0 4px 12px rgba(16, 185, 129, 0.2);
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
                <p class="greeting">Một tài khoản nhân sự mới của bạn đã được thiết lập thành công trên hệ thống quản trị chuyên nghiệp Thalex.</p>
                
                <div class="wishes">
                  "Cảm ơn bạn đã gia nhập ngôi nhà Thalex. Chúc bạn hoàn thành tốt công việc và cùng ngôi nhà Thalex viết tiếp các ước mơ, hoài bão của chúng ta."
                </div>

                <div class="credentials-card">
                  <h3 class="credentials-title">Thông tin tài khoản đăng nhập</h3>
                  <div class="row">
                    <span class="label">Đường dẫn:</span>
                    <a href="${appUrl}" style="color: #10b981; font-weight: bold; text-decoration: underline;" target="_blank">${appUrl}</a>
                  </div>
                  <div class="row">
                    <span class="label">Tên đăng nhập:</span>
                    <span class="value" style="color: #0f172a;">${email}</span>
                  </div>
                  ${password ? `
                  <div class="row" style="margin-bottom: 0;">
                    <span class="label">Mật khẩu đăng nhập:</span>
                    <span class="code-value">${password}</span>
                  </div>
                  ` : ''}
                </div>

                <div class="button-wrapper">
                  <a href="${appUrl}" class="btn" target="_blank">Đăng nhập vào Thalex Portal</a>
                </div>
              </div>
              <div class="footer">
                Đây là email thông báo tự động từ Thalex Workspace.<br>
                Vui lòng bảo mật mật khẩu của bạn và đổi mật khẩu trong lần đầu tiên truy cập.<br>
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

    let subjectToSend = `[Thalex Work] Chào mừng ${fullName} gia nhập ngôi nhà Thalex`;
    let bodyToSend = emailHtmlFallback;

    const varsMap = {
      fullName: fullName || "",
      password: password || "",
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
                border-bottom: 3px solid #10b981;
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
                color: #10b981;
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
                  Vui lòng bảo mật mật khẩu của bạn và đổi mật khẩu trong lần đầu tiên truy cập.<br>
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

    console.log(`[SMTP] Dynamic welcome email sent successfully to ${email}`);
    res.json({ success: true, message: "Welcome email sent successfully." });
  } catch (error: any) {
    console.error("Failed to send welcome email:", error);
    res.status(500).json({ error: analyzeSmtpError(error, host) });
  }
});

app.get("/api/download", async (req, res) => {
  try {
    const fileUrl = req.query.url as string;
    const filename = req.query.filename as string || "download";
    
    if (!fileUrl) {
      return res.status(400).json({ error: "Missing url parameter" });
    }

    const response = await fetch(fileUrl);
    if (!response.ok) {
        throw new Error(`Failed to fetch file: ${response.statusText}`);
    }
    
    const contentType = response.headers.get("content-type") || "application/octet-stream";
    
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(filename)}"`);
    res.setHeader("Content-Type", contentType);
    
    // Convert ReadableStream to Node.js stream and pipe to response
    if (response.body) {
        // @ts-ignore
        const reader = response.body.getReader();
        const pump = async () => {
            const { done, value } = await reader.read();
            if (done) {
                res.end();
                return;
            }
            res.write(value);
            await pump();
        };
        await pump();
    } else {
        res.end();
    }
  } catch (error: any) {
    console.error("Proxy download error:", error);
    res.status(500).json({ error: "Failed to download file" });
  }
});

app.post("/api/send-task-email", async (req, res) => {
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
    res.json({ success: true, message: "Task email sent successfully." });
  } catch (error: any) {
    console.error("Failed to send task email:", error);
    res.status(500).json({ error: analyzeSmtpError(error, host) });
  }
});

app.post("/api/send-proposal-email", async (req, res) => {
  let host = "smtp.gmail.com";
  try {
    const { email, fullName, proposalType, requesterName, proposalDetails, customAppUrl, smtpConfig } = req.body;
    if (!email || !fullName || !proposalType) {
      return res.status(400).json({ error: "Email, Full Name, and Proposal Type are required" });
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

    if (smtpConfig) {
      if (smtpConfig.proposalTemplateSubject) {
        smtpConfig.proposalTemplateSubject = smtpConfig.proposalTemplateSubject.replace(/ais-dev-/g, "ais-pre-");
      }
      if (smtpConfig.proposalTemplateBody) {
        smtpConfig.proposalTemplateBody = smtpConfig.proposalTemplateBody.replace(/ais-dev-/g, "ais-pre-");
      }
    }

    if (!user || !pass) {
      console.warn("SMTP credentials are not configured. Proposal email sending is simulated.");
      return res.json({ 
        success: true, 
        simulated: true, 
        message: "No SMTP credentials set. Simulated proposal email printed to server log." 
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
          <title>Đề xuất mới cần phê duyệt</title>
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
                <p class="greeting">Hệ thống ghi nhận một đề xuất mới đang chờ bạn xem xét và phê duyệt. Chi tiết đề xuất như dưới đây:</p>
                
                <div class="credentials-card">
                  <h3 class="credentials-title">Chi tiết đề xuất</h3>
                  <div class="row">
                    <span class="label">Loại đề xuất:</span>
                    <span class="value">${proposalType}</span>
                  </div>
                  <div class="row">
                    <span class="label">Người đề xuất:</span>
                    <span class="value">${requesterName || ""}</span>
                  </div>
                  <div class="row">
                    <span class="label">Nội dung chi tiết:</span>
                    <span class="value">${proposalDetails || ""}</span>
                  </div>
                </div>

                <div class="button-wrapper">
                  <a href="${appUrl}/proposals" class="btn" target="_blank">Xem & Phê duyệt Đề xuất</a>
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

    let subjectToSend = `[Thalex Work] Có đề xuất mới cần phê duyệt: ${proposalType} từ ${requesterName}`;
    let bodyToSend = emailHtmlFallback;

    const varsMap = {
      fullName: fullName || "",
      proposalType: proposalType || "",
      requesterName: requesterName || "",
      proposalDetails: proposalDetails || "",
      appUrl: appUrl || "",
      email: email || "",
    };

    if (smtpConfig?.proposalTemplateSubject && smtpConfig?.proposalTemplateBody) {
      subjectToSend = replaceAllPlaceholders(smtpConfig.proposalTemplateSubject, varsMap);
      const userRenderedBody = replaceAllPlaceholders(smtpConfig.proposalTemplateBody, varsMap);
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

    console.log(`[SMTP] Proposal pending email sent successfully to ${email}`);
    res.json({ success: true, message: "Proposal email sent successfully." });
  } catch (error: any) {
    console.error("Failed to send proposal email:", error);
    res.status(500).json({ error: analyzeSmtpError(error, host) });
  }
});

app.post("/api/test-smtp", async (req, res) => {
  let host = "smtp.gmail.com";
  try {
    const { smtpConfig, targetEmail } = req.body;
    if (!targetEmail) {
      return res.status(400).json({ error: "Yêu cầu cung cấp email người nhận thử" });
    }

    host = smtpConfig?.host || process.env.SMTP_HOST || "smtp.gmail.com";
    const port = Number(smtpConfig?.port || process.env.SMTP_PORT) || 587;
    const user = smtpConfig?.user || process.env.SMTP_USER;
    const pass = smtpConfig?.pass || process.env.SMTP_PASS;
    const from = smtpConfig?.from || process.env.SMTP_FROM || user || "noreply@thalex.vn";

    if (!user || !pass) {
      return res.status(400).json({ error: "Thông tin cấu hình tài khoản/mật khẩu SMTP chưa đầy đủ để gửi thử." });
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

    // Try to verify Connection Configuration
    await transporter.verify();

    // Send simple test email
    await transporter.sendMail({
      from: `"Thalex Test SMTP" <${from}>`,
      to: targetEmail,
      subject: `[Thalex Work] Kiểm tra kết nối SMTP thành công`,
      html: `
        <div style="font-family: sans-serif; padding: 24px; background-color: #f8fafc; border-radius: 16px; border: 1px solid #e2e8f0; max-width: 500px; margin: 0 auto;">
          <h2 style="color: #10b981; margin-top: 0;">Kết nối SMTP thành công!</h2>
          <p style="color: #334155; font-size: 14px; line-height: 1.6;">Xin chào,</p>
          <p style="color: #334155; font-size: 14px; line-height: 1.6;">Đây là email tự động gửi từ hệ thống quản trị <strong>Thalex Portal</strong> nhằm kiểm tra tính năng cấu hình SMTP server gửi mail tự động.</p>
          <div style="background-color: #f1f5f9; padding: 12px 16px; border-radius: 8px; font-family: monospace; font-size: 12px; color: #475569; margin: 16px 0;">
            Host: ${host}<br>
            Port: ${port}<br>
            User: ${user}<br>
            Sender: ${from}
          </div>
          <p style="color: #059669; font-size: 14px; font-weight: bold;">Cấu hình SMTP của bạn hoàn toàn chính xác và đã sẵn sàng hoạt động!</p>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;">
          <p style="color: #94a3b8; font-size: 11px; margin-bottom: 0;">&copy; 2026 Thalex Group. All rights reserved.</p>
        </div>
      `,
    });

    console.log(`[SMTP] Test email sent successfully to ${targetEmail}`);
    res.json({ success: true, message: "Kiểm tra kết nối và gửi mail thử thành công!" });
  } catch (error: any) {
    console.error("Test SMTP Error:", error);
    res.status(500).json({ error: analyzeSmtpError(error, host) });
  }
});

app.get("/api/smtp-env-config", (req, res) => {
  res.json({
    smtpHost: process.env.SMTP_HOST || "",
    smtpPort: process.env.SMTP_PORT || "587",
    smtpUser: process.env.SMTP_USER || "",
    smtpPass: process.env.SMTP_PASS || "",
    smtpFrom: process.env.SMTP_FROM || "",
  });
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// Vite middleware setup for development, or static file serving for production
async function setupVite() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

setupVite().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
