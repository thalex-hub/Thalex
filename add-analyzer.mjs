import fs from 'fs';

const analyzeFn = `
const analyzeSmtpError = (error: any, host: string): string => {
  const errMsg = error.message || String(error);
  if (errMsg.includes("535") || errMsg.includes("authentication failed") || errMsg.includes("Invalid login") || errMsg.includes("system busy")) {
    let tip = \`LỖI XÁC THỰC SMTP (Mã lỗi 535) - Đăng nhập không thành công.\\n\\n\`;
    if (host.includes("gmail.com")) {
      tip += \`👉 Bạn đang dùng GMAIL: Hãy chắc chắn sử dụng "Mật khẩu ứng dụng" (App Password) gồm 16 ký tự. KHÔNG DÙNG mật khẩu đăng nhập Gmail thông thường.\\n\`;
    } else {
      tip += \`👉 Bạn bắt buộc phải kích hoạt chức năng POP3/SMTP hoặc IMAP/SMTP trong phần Cài đặt hòm thư, sau đó khởi tạo "Mã ủy quyền" (Authorization Code) 16 ký tự để điền vào ô Mật khẩu.\\n\`;
    }
    return tip;
  }
  return errMsg;
};
`;

const files = ["api/send-task-email.ts", "api/send-proposal-email.ts", "api/test-smtp.ts"];

for(const f of files) {
  let content = fs.readFileSync(f, 'utf8');
  if (!content.includes("const analyzeSmtpError =")) {
    content = content.replace('export default async', analyzeFn + '\\nexport default async');
    fs.writeFileSync(f, content);
    console.log("Updated", f);
  }
}
