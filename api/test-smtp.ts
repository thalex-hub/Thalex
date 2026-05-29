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
\nexport default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS setup
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { smtpConfig, targetEmail } = req.body;
    if (!targetEmail) {
      return res.status(400).json({ error: "Yêu cầu cung cấp email người nhận thử" });
    }

    const host = smtpConfig?.host || process.env.SMTP_HOST || "smtp.gmail.com";
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

    await transporter.verify();

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

    res.json({ success: true, message: "Kiểm tra kết nối và gửi mail thử thành công!" });
  } catch (error: any) {
    console.error("Test SMTP Error:", error);
    res.status(500).json({ error: analyzeSmtpError(error, host) });
  }
}
