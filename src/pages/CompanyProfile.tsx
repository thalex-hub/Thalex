import React from 'react';
import { db } from '../lib/firebase';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { Layout, Building2, Upload, Save, Trash2, MapPin, Compass, Crosshair, Mail, Server, Send, Eye, EyeOff } from 'lucide-react';
import { handleFirestoreError, OperationType } from '../lib/firestoreUtils';
import { motion } from 'motion/react';
import { cn, getApiUrl, safeFetchJson } from '../lib/utils';

interface CompanySettings {
  name: string;
  logo: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  establishedDate?: string;
  latitude?: number;
  longitude?: number;
  geofenceRadius?: number;
  smtpHost?: string;
  smtpPort?: string;
  smtpUser?: string;
  smtpPass?: string;
  smtpFrom?: string;
  smtpEnabled?: boolean;
  welcomeTemplateSubject?: string;
  welcomeTemplateBody?: string;
  taskTemplateSubject?: string;
  taskTemplateBody?: string;
  proposalTemplateSubject?: string;
  proposalTemplateBody?: string;
}

const DEFAULT_PROPOSAL_SUBJECT = '[Thalex Work] Có đề xuất mới cần phê duyệt: {{proposalType}} từ {{requesterName}}';
const DEFAULT_PROPOSAL_BODY = `<p class="greeting" style="font-size: 16px; color: #334155; line-height: 1.6; margin-bottom: 24px; font-weight: 500;">
  Chào <strong>{{fullName}}</strong>,
</p>
<p class="greeting" style="font-size: 16px; color: #334155; line-height: 1.6; margin-bottom: 24px; font-weight: 500;">
  Hệ thống ghi nhận một đề xuất/yêu cầu mới đang chờ bạn xem xét và phê duyệt. Chi tiết như dưới đây:
</p>

<div class="credentials-card" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 24px; margin-bottom: 30px;">
  <h3 class="credentials-title" style="font-size: 12px; text-transform: uppercase; letter-spacing: 1.2px; color: #2563eb; font-weight: 800; margin-top: 0; margin-bottom: 16px; border-bottom: 1px solid #f1f5f9; padding-bottom: 8px;">
    Chi tiết đề xuất
  </h3>
  <div class="row" style="display: flex; margin-bottom: 14px; font-size: 14px; align-items: center;">
    <span class="label" style="width: 130px; color: #64748b; font-weight: 600;">Loại đề xuất:</span>
    <span class="value" style="color: #0f172a; font-weight: 700;">{{proposalType}}</span>
  </div>
  <div class="row" style="display: flex; margin-bottom: 14px; font-size: 14px; align-items: center;">
    <span class="label" style="width: 130px; color: #64748b; font-weight: 600;">Người đề xuất:</span>
    <span class="value" style="color: #0f172a; font-weight: 700;">{{requesterName}}</span>
  </div>
  <div class="row" style="display: flex; margin-bottom: 0; font-size: 14px; align-items: center;">
    <span class="label" style="width: 130px; color: #64748b; font-weight: 600;">Nội dung:</span>
    <span class="value" style="color: #0f172a; font-weight: 700;">{{proposalDetails}}</span>
  </div>
</div>

<div class="button-wrapper" style="text-align: center; margin-top: 32px; margin-bottom: 15px;">
  <a href="{{appUrl}}/proposals" class="btn" style="display: inline-block; background-color: #2563eb; color: #ffffff !important; font-weight: 700; font-size: 14px; padding: 14px 36px; text-decoration: none; border-radius: 12px; box-shadow: 0 4px 12px rgba(37, 99, 235, 0.2);" target="_blank">
    Xem & Phê duyệt Đề xuất
  </a>
</div>`;

const DEFAULT_WELCOME_SUBJECT = '[Thalex Work] Chào mừng {{fullName}} gia nhập ngôi nhà Thalex';
const DEFAULT_WELCOME_BODY = `<p class="greeting" style="font-size: 16px; color: #334155; line-height: 1.6; margin-bottom: 24px; font-weight: 500;">
  Chào <strong>{{fullName}}</strong>,
</p>
<p class="greeting" style="font-size: 16px; color: #334155; line-height: 1.6; margin-bottom: 24px; font-weight: 500;">
  Một tài khoản nhân sự mới của bạn đã được thiết lập thành công trên hệ thống quản trị chuyên nghiệp Thalex.
</p>

<div class="wishes" style="background-color: #f0fdf4; border-left: 4px solid #10b981; padding: 18px 22px; border-radius: 0 16px 16px 0; color: #065f46; font-size: 14px; line-height: 1.6; margin-bottom: 30px; font-style: italic; font-weight: 500;">
  "Cảm ơn bạn đã gia nhập ngôi nhà Thalex. Chúc bạn hoàn thành tốt công việc và cùng ngôi nhà Thalex viết tiếp các ước mơ, hoài bão của chúng ta."
</div>

<div class="credentials-card" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 24px; margin-bottom: 30px;">
  <h3 class="credentials-title" style="font-size: 12px; text-transform: uppercase; letter-spacing: 1.2px; color: #64748b; font-weight: 800; margin-top: 0; margin-bottom: 16px; border-bottom: 1px solid #f1f5f9; padding-bottom: 8px;">
    Thông tin tài khoản đăng nhập
  </h3>
  <div class="row" style="display: flex; margin-bottom: 14px; font-size: 14px; align-items: center;">
    <span class="label" style="width: 130px; color: #64748b; font-weight: 600;">Đường dẫn:</span>
    <a href="{{appUrl}}" style="color: #10b981; font-weight: bold; text-decoration: underline;" target="_blank">{{appUrl}}</a>
  </div>
  <div class="row" style="display: flex; margin-bottom: 14px; font-size: 14px; align-items: center;">
    <span class="label" style="width: 130px; color: #64748b; font-weight: 600;">Tên đăng nhập:</span>
    <span class="value" style="color: #0f172a; font-weight: 700;">{{email}}</span>
  </div>
  <div class="row" style="display: flex; margin-bottom: 0; font-size: 14px; align-items: center;">
    <span class="label" style="width: 130px; color: #64748b; font-weight: 600;">Mật khẩu:</span>
    <span class="code-value" style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; color: #ea580c; background-color: #ffedd5; padding: 4px 10px; border-radius: 6px; font-weight: 700; font-size: 13px;">{{password}}</span>
  </div>
</div>

<div class="button-wrapper" style="text-align: center; margin-top: 32px; margin-bottom: 15px;">
  <a href="{{appUrl}}" class="btn" style="display: inline-block; background-color: #10b981; color: #ffffff !important; font-weight: 700; font-size: 14px; padding: 14px 36px; text-decoration: none; border-radius: 12px; box-shadow: 0 4px 12px rgba(16, 185, 129, 0.2);" target="_blank">
    Đăng nhập vào Thalex Portal
  </a>
</div>`;

const DEFAULT_TASK_SUBJECT = '[Thalex Work] Bạn nhận được một nhiệm vụ mới: {{taskName}}';
const DEFAULT_TASK_BODY = `<p class="greeting" style="font-size: 16px; color: #334155; line-height: 1.6; margin-bottom: 24px; font-weight: 500;">
  Chào <strong>{{fullName}}</strong>,
</p>
<p class="greeting" style="font-size: 16px; color: #334155; line-height: 1.6; margin-bottom: 24px; font-weight: 500;">
  Hệ thống ghi nhận bạn vừa được phân bổ một đầu việc mới. Chi tiết nhiệm vụ như dưới đây:
</p>

<div class="credentials-card" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 24px; margin-bottom: 30px;">
  <h3 class="credentials-title" style="font-size: 12px; text-transform: uppercase; letter-spacing: 1.2px; color: #2563eb; font-weight: 800; margin-top: 0; margin-bottom: 16px; border-bottom: 1px solid #f1f5f9; padding-bottom: 8px;">
    Chi tiết Nhiệm vụ
  </h3>
  <div class="row" style="display: flex; margin-bottom: 14px; font-size: 14px; align-items: center;">
    <span class="label" style="width: 130px; color: #64748b; font-weight: 600;">Tên công việc:</span>
    <span class="value" style="color: #0f172a; font-weight: 700;">{{taskName}}</span>
  </div>
  <div class="row" style="display: flex; margin-bottom: 14px; font-size: 14px; align-items: center;">
    <span class="label" style="width: 130px; color: #64748b; font-weight: 600;">Người giao:</span>
    <span class="value" style="color: #0f172a; font-weight: 700;">{{assignerName}}</span>
  </div>
  <div class="row" style="display: flex; margin-bottom: 0; font-size: 14px; align-items: center;">
    <span class="label" style="width: 130px; color: #64748b; font-weight: 600;">Hạn chót:</span>
    <span style="color: #dc2626; font-weight: 700;">{{dueDate}}</span>
  </div>
</div>

<div class="button-wrapper" style="text-align: center; margin-top: 32px; margin-bottom: 15px;">
  <a href="{{appUrl}}/tasks" class="btn" style="display: inline-block; background-color: #2563eb; color: #ffffff !important; font-weight: 700; font-size: 14px; padding: 14px 36px; text-decoration: none; border-radius: 12px; box-shadow: 0 4px 12px rgba(37, 99, 235, 0.2);" target="_blank">
    Truy cập Trung tâm Nhiệm vụ
  </a>
</div>`;

export default function CompanyProfile() {
  const [settings, setSettings] = React.useState<CompanySettings>({
    name: 'Thalex',
    logo: '',
    establishedDate: '03/10/2023',
    geofenceRadius: 200,
    smtpHost: '',
    smtpPort: '587',
    smtpUser: '',
    smtpPass: '',
    smtpFrom: '',
    smtpEnabled: false,
    welcomeTemplateSubject: DEFAULT_WELCOME_SUBJECT,
    welcomeTemplateBody: DEFAULT_WELCOME_BODY,
    taskTemplateSubject: DEFAULT_TASK_SUBJECT,
    taskTemplateBody: DEFAULT_TASK_BODY,
    proposalTemplateSubject: DEFAULT_PROPOSAL_SUBJECT,
    proposalTemplateBody: DEFAULT_PROPOSAL_BODY,
  });
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [gettingLocation, setGettingLocation] = React.useState(false);
  const [templateTab, setTemplateTab] = React.useState<'welcome' | 'task' | 'proposal'>('welcome');

  React.useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'company_profile'), (snap) => {
      if (snap.exists()) {
        const data = snap.data() as CompanySettings;
        setSettings({
          establishedDate: '03/10/2023',
          ...data,
          geofenceRadius: data.geofenceRadius || 200,
          smtpHost: data.smtpHost || '',
          smtpPort: data.smtpPort || '587',
          smtpUser: data.smtpUser || '',
          smtpPass: data.smtpPass || '',
          smtpFrom: data.smtpFrom || '',
          smtpEnabled: !!data.smtpEnabled,
          welcomeTemplateSubject: data.welcomeTemplateSubject || DEFAULT_WELCOME_SUBJECT,
          welcomeTemplateBody: data.welcomeTemplateBody || DEFAULT_WELCOME_BODY,
          taskTemplateSubject: data.taskTemplateSubject || DEFAULT_TASK_SUBJECT,
          taskTemplateBody: data.taskTemplateBody || DEFAULT_TASK_BODY,
          proposalTemplateSubject: data.proposalTemplateSubject || DEFAULT_PROPOSAL_SUBJECT,
          proposalTemplateBody: data.proposalTemplateBody || DEFAULT_PROPOSAL_BODY,
        });
      }
      setLoading(false);
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, 'settings/company_profile');
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const getCurrentLocation = () => {
    setGettingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setSettings(prev => ({
          ...prev,
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude
        }));
        setGettingLocation(false);
      },
      (err) => {
        console.error(err);
        alert('Không thể lấy vị trí hiện tại. Vui lòng cấp quyền truy cập GPS.');
        setGettingLocation(false);
      },
      { enableHighAccuracy: true }
    );
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 1024 * 500) {
      alert('Kích thước ảnh quá lớn (tối đa 500KB)');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      setSettings(prev => ({ ...prev, logo: base64String }));
    };
    reader.readAsDataURL(file);
  };

  const [testEmail, setTestEmail] = React.useState('');
  const [testingSmtp, setTestingSmtp] = React.useState(false);
  const [testStatus, setTestStatus] = React.useState<'idle' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = React.useState('');
  const [showSmtpPass, setShowSmtpPass] = React.useState(false);

  const handleTestSmtp = async () => {
    if (!testEmail) {
      alert('Vui lòng nhập Email người nhận thử để kiểm tra.');
      return;
    }
    setTestingSmtp(true);
    setTestStatus('idle');
    setTestMessage('');
    try {
      const { success, data, error: fetchErr } = await safeFetchJson(getApiUrl('/api/test-smtp'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          smtpConfig: {
            host: settings.smtpHost,
            port: settings.smtpPort,
            user: settings.smtpUser,
            pass: settings.smtpPass,
            from: settings.smtpFrom,
          },
          targetEmail: testEmail,
        }),
      });
      if (success && data?.success) {
        setTestStatus('success');
        setTestMessage(data.message);
      } else {
        setTestStatus('error');
        setTestMessage(fetchErr || data?.error || 'Kiểm tra thất bại. Vui lòng xem lại thông tin.');
      }
    } catch (err: any) {
      setTestStatus('error');
      setTestMessage(err.message || 'Lỗi kết nối đến máy chủ.');
    } finally {
      setTestingSmtp(false);
    }
  };

  const [loadingEnv, setLoadingEnv] = React.useState(false);

  const handleLoadEnvConfig = async () => {
    setLoadingEnv(true);
    try {
      const { success, data, error: fetchErr } = await safeFetchJson(getApiUrl('/api/smtp-env-config'));
      if (success && data) {
        setSettings(prev => ({
          ...prev,
          smtpHost: data.smtpHost || prev.smtpHost,
          smtpPort: data.smtpPort || prev.smtpPort,
          smtpUser: data.smtpUser || prev.smtpUser,
          smtpPass: data.smtpPass || prev.smtpPass,
          smtpFrom: data.smtpFrom || prev.smtpFrom,
          smtpEnabled: true,
        }));
        alert('Đã tải hoàn hảo cấu hình SMTP từ Biến môi trường hệ thống!');
      } else {
        alert(fetchErr || 'Không thể tải cấu hình SMTP từ môi trường hệ thống.');
      }
    } catch (err) {
      console.error(err);
      alert('Gặp lỗi khi truy xuất cấu hình SMTP hệ thống.');
    } finally {
      setLoadingEnv(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const sanitizedSettings = {
        ...settings,
        welcomeTemplateSubject: settings.welcomeTemplateSubject?.replace(/ais-dev-/g, "ais-pre-"),
        welcomeTemplateBody: settings.welcomeTemplateBody?.replace(/ais-dev-/g, "ais-pre-"),
        taskTemplateSubject: settings.taskTemplateSubject?.replace(/ais-dev-/g, "ais-pre-"),
        taskTemplateBody: settings.taskTemplateBody?.replace(/ais-dev-/g, "ais-pre-"),
        proposalTemplateSubject: settings.proposalTemplateSubject?.replace(/ais-dev-/g, "ais-pre-"),
        proposalTemplateBody: settings.proposalTemplateBody?.replace(/ais-dev-/g, "ais-pre-"),
      };

      await setDoc(doc(db, 'settings', 'company_profile'), {
        ...sanitizedSettings,
        updatedAt: new Date().toISOString(),
      });
      alert('Cập nhật thông tin công ty thành công!');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'settings/company_profile');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-40">
        <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-gray-500 font-bold">Đang tải cấu hình...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-3">
            <div className="p-2 bg-indigo-100 text-indigo-600 rounded-xl">
              <Building2 size={24} />
            </div>
            Cấu hình Ứng dụng
          </h1>
          <p className="text-gray-500 mt-1">Cài đặt tên và logo hiển thị trên toàn hệ thống (Bao gồm lúc load trang và đăng nhập)</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className={cn(
            "flex items-center justify-center gap-2 bg-indigo-600 text-white px-6 py-3 rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200",
            saving && "opacity-50 cursor-not-allowed"
          )}
        >
          {saving ? (
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <Save size={20} />
          )}
          Lưu thay đổi
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1 space-y-6">
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100">
            <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4">Logo Ứng dụng</h2>
            <div className="flex flex-col items-center gap-4">
              <div className="relative group">
                <div className="w-32 h-32 rounded-2xl border-2 border-dashed border-gray-200 flex items-center justify-center bg-gray-50 overflow-hidden">
                  {settings.logo ? (
                    <img src={settings.logo} alt="Logo" className="w-full h-full object-contain p-2" />
                  ) : (
                    <Building2 size={40} className="text-gray-300" />
                  )}
                </div>
                <label className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer rounded-2xl">
                  <Upload size={24} className="text-white" />
                  <input type="file" className="hidden" accept="image/*" onChange={handleLogoUpload} />
                </label>
              </div>
              <div className="text-center">
                <p className="text-xs text-gray-400 mt-2">Định dạng: PNG, JPG, SVG (Tối đa 500KB)</p>
                {settings.logo && (
                  <button 
                    onClick={() => setSettings(prev => ({ ...prev, logo: '' }))}
                    className="text-red-500 text-xs font-bold mt-2 hover:underline flex items-center gap-1 mx-auto"
                  >
                    <Trash2 size={12} /> Xóa ảnh
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="bg-indigo-600 rounded-3xl p-6 text-white shadow-xl shadow-indigo-100 relative overflow-hidden group">
            <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/10 rounded-full blur-3xl group-hover:bg-white/20 transition-all"></div>
            <div className="relative z-10">
              <Layout className="mb-4 opacity-50" size={32} />
              <h3 className="font-bold text-xl mb-1">Xem trước</h3>
              <p className="text-white/70 text-sm mb-6">Logo và tên sẽ hiển thị trên thanh điều hướng và màn hình đăng nhập</p>
              
              <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/20">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center">
                    {settings.logo ? (
                      <img src={settings.logo} alt="Preview" className="w-6 h-6 object-contain" />
                    ) : (
                      <div className="w-6 h-6 bg-indigo-200 rounded" />
                    )}
                  </div>
                  <span className="font-black text-sm uppercase tracking-tighter truncate">
                    {settings.name || 'Company Name'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="md:col-span-2 space-y-6">
          <div className="bg-white rounded-3xl p-8 shadow-sm border border-gray-100">
            <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-6">Thông tin Cơ bản</h2>
            
            <div className="space-y-6">
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Tên Ứng dụng / Công ty</label>
                <input 
                  type="text" 
                  className="w-full bg-gray-50 border-none rounded-2xl px-6 py-4 outline-none focus:ring-2 focus:ring-indigo-600 transition-all font-bold text-gray-900"
                  placeholder="Nhập tên ứng dụng hoặc tên công ty..."
                  value={settings.name}
                  onChange={e => setSettings({ ...settings, name: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Địa chỉ</label>
                <input 
                  type="text" 
                  className="w-full bg-gray-50 border-none rounded-2xl px-6 py-4 outline-none focus:ring-2 focus:ring-indigo-600 transition-all font-medium text-gray-900"
                  placeholder="Nhập địa chỉ trụ sở..."
                  value={settings.address || ''}
                  onChange={e => setSettings({ ...settings, address: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Số điện thoại</label>
                  <input 
                    type="text" 
                    className="w-full bg-gray-50 border-none rounded-2xl px-6 py-4 outline-none focus:ring-2 focus:ring-indigo-600 transition-all font-medium text-gray-900"
                    placeholder="0123 456 789"
                    value={settings.phone || ''}
                    onChange={e => setSettings({ ...settings, phone: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Email hỗ trợ</label>
                  <input 
                    type="email" 
                    className="w-full bg-gray-50 border-none rounded-2xl px-6 py-4 outline-none focus:ring-2 focus:ring-indigo-600 transition-all font-medium text-gray-900"
                    placeholder="contact@company.com"
                    value={settings.email || ''}
                    onChange={e => setSettings({ ...settings, email: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Website</label>
                  <input 
                    type="url" 
                    className="w-full bg-gray-50 border-none rounded-2xl px-6 py-4 outline-none focus:ring-2 focus:ring-indigo-600 transition-all font-medium text-gray-900"
                    placeholder="https://www.company.com"
                    value={settings.website || ''}
                    onChange={e => setSettings({ ...settings, website: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Ngày thành lập doanh nghiệp</label>
                  <input 
                    type="text" 
                    className="w-full bg-gray-50 border-none rounded-2xl px-6 py-4 outline-none focus:ring-2 focus:ring-indigo-600 transition-all font-medium text-gray-900"
                    placeholder="Ví dụ: 03/10/2023"
                    value={settings.establishedDate || ''}
                    onChange={e => setSettings({ ...settings, establishedDate: e.target.value })}
                  />
                  <p className="text-[10px] text-gray-400 mt-1 italic font-medium">Hiển thị ngay phía dưới Logo thương hiệu tại thanh Menu bên.</p>
                </div>
              </div>

              <div className="pt-6 border-t border-gray-100">
                <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2 mb-4">
                  <MapPin size={18} className="text-indigo-600" />
                  Cài đặt Địa điểm Chấm công (GPS)
                </h3>
                <p className="text-xs text-gray-500 mb-6 italic">
                  Thiết lập vị trí và khoảng cách tối đa nhân viên được phép chấm công. 
                  Nếu ngoài khoảng cách này, hệ thống sẽ từ chối ghi nhận chấm công.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Vĩ độ (Latitude)</label>
                    <input 
                      type="number" 
                      step="any"
                      className="w-full bg-gray-50 border-none rounded-2xl px-6 py-4 outline-none focus:ring-2 focus:ring-indigo-600 transition-all font-mono text-indigo-600 font-bold"
                      placeholder="VD: 21.0285"
                      value={settings.latitude || ''}
                      onChange={e => setSettings({ ...settings, latitude: parseFloat(e.target.value) })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Kinh độ (Longitude)</label>
                    <input 
                      type="number" 
                      step="any"
                      className="w-full bg-gray-50 border-none rounded-2xl px-6 py-4 outline-none focus:ring-2 focus:ring-indigo-600 transition-all font-mono text-indigo-600 font-bold"
                      placeholder="VD: 105.8542"
                      value={settings.longitude || ''}
                      onChange={e => setSettings({ ...settings, longitude: parseFloat(e.target.value) })}
                    />
                  </div>
                </div>

                <div className="space-y-6">
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase mb-2 flex justify-between">
                      <span>Bán kính cho phép (Geofence Radius)</span>
                      <span className="text-indigo-600">{settings.geofenceRadius}m</span>
                    </label>
                    <input 
                      type="range"
                      min="50"
                      max="1000"
                      step="50"
                      className="w-full h-2 bg-gray-100 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                      value={settings.geofenceRadius || 200}
                      onChange={e => setSettings({ ...settings, geofenceRadius: parseInt(e.target.value) })}
                    />
                    <div className="flex justify-between text-[10px] text-gray-400 font-bold mt-2">
                       <span>50m</span>
                       <span>200m (Gợi ý)</span>
                       <span>500m</span>
                       <span>1000m</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={getCurrentLocation}
                    disabled={gettingLocation}
                    className="w-full flex items-center justify-center gap-2 py-4 bg-indigo-50 text-indigo-600 rounded-2xl font-black uppercase tracking-widest hover:bg-indigo-100 transition-all border-2 border-dashed border-indigo-200"
                  >
                    {gettingLocation ? (
                      <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Crosshair size={20} />
                    )}
                    Lấy vị trí hiện tại của tôi làm tọa độ công ty
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* SMTP Email Configuration Card */}
          <div className="bg-white rounded-3xl p-8 shadow-sm border border-gray-100">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
              <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                <Mail size={16} className="text-indigo-600" />
                Cấu hình Email gửi đi tự động (SMTP)
              </h2>
              <button
                type="button"
                onClick={handleLoadEnvConfig}
                disabled={loadingEnv}
                className="px-4 py-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 text-[11px] font-bold uppercase tracking-wider rounded-xl transition-all flex items-center gap-1.5 border border-indigo-200/40 cursor-pointer self-start sm:self-auto disabled:opacity-50"
              >
                {loadingEnv ? (
                  <div className="w-3.5 h-3.5 border-2 border-indigo-700 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Server size={12} />
                )}
                Dùng cấu hình Biến Môi trường
              </button>
            </div>
            <p className="text-xs text-gray-400 mb-6 leading-relaxed font-semibold">
              Thiết lập máy chủ gửi mail để hệ thống tự động gửi thông tin tài khoản đăng nhập (link ứng dụng, mật khẩu đăng nhập tạm thời) cùng thư chào mừng tới nhân sự mới. Bạn có thể bấm nút <strong>"Dùng cấu hình Biến Môi trường"</strong> để tự động điền nhanh các giá trị SMTP đã cài đặt trên hệ thống Cloud.
            </p>

            <div className="space-y-6">
              {/* Enable toggle */}
              <div className="flex items-center justify-between p-4 bg-indigo-50/40 rounded-2xl border border-indigo-100/30">
                <div>
                  <label className="text-xs font-bold text-gray-800 uppercase block">Kích hoạt gửi Email tự động</label>
                  <span className="text-[10px] text-gray-500 font-medium">Bật để hệ thống tự động gửi thông tin đăng nhập khi admin tạo tài khoản mới.</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer select-none">
                  <input 
                    type="checkbox" 
                    className="sr-only peer" 
                    checked={!!settings.smtpEnabled}
                    onChange={(e) => setSettings({ ...settings, smtpEnabled: e.target.checked })}
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
              </div>

              {settings.smtpEnabled && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Máy chủ SMTP (Host)</label>
                      <input 
                        type="text" 
                        className="w-full bg-gray-50 border-none rounded-2xl px-6 py-4 outline-none focus:ring-2 focus:ring-indigo-600 transition-all font-semibold text-gray-900"
                        placeholder="VD: smtp.gmail.com"
                        value={settings.smtpHost || ''}
                        onChange={e => setSettings({ ...settings, smtpHost: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Cổng (Port)</label>
                      <input 
                        type="text" 
                        className="w-full bg-gray-50 border-none rounded-2xl px-6 py-4 outline-none focus:ring-2 focus:ring-indigo-600 transition-all font-semibold text-gray-900"
                        placeholder="VD: 587 hoặc 465"
                        value={settings.smtpPort || ''}
                        onChange={e => setSettings({ ...settings, smtpPort: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Tên đăng nhập / Email</label>
                      <input 
                        type="email" 
                        className="w-full bg-gray-50 border-none rounded-2xl px-6 py-4 outline-none focus:ring-2 focus:ring-indigo-600 transition-all font-semibold text-gray-900"
                        placeholder="VD: user@gmail.com"
                        value={settings.smtpUser || ''}
                        onChange={e => setSettings({ ...settings, smtpUser: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Mật khẩu ứng dụng (App Password)</label>
                      <div className="relative">
                        <input 
                          type={showSmtpPass ? 'text' : 'password'} 
                          className="w-full bg-gray-50 border-none rounded-2xl px-6 py-4 pr-12 outline-none focus:ring-2 focus:ring-indigo-600 transition-all font-semibold text-gray-900"
                          placeholder="Nhập mật khẩu ứng dụng của Gmail..."
                          value={settings.smtpPass || ''}
                          onChange={e => setSettings({ ...settings, smtpPass: e.target.value })}
                        />
                        <button
                          type="button"
                          onClick={() => setShowSmtpPass(!showSmtpPass)}
                          className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
                        >
                          {showSmtpPass ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Email Người gửi (From Header)</label>
                    <input 
                      type="text" 
                      className="w-full bg-gray-50 border-none rounded-2xl px-6 py-4 outline-none focus:ring-2 focus:ring-indigo-600 transition-all font-semibold text-gray-900"
                      placeholder='VD: Thalex Portal <no-reply@thalex.vn>'
                      value={settings.smtpFrom || ''}
                      onChange={e => setSettings({ ...settings, smtpFrom: e.target.value })}
                    />
                  </div>

                  {/* Mail Connection Test Section */}
                  <div className="pt-6 border-t border-gray-100">
                    <h3 className="text-xs font-bold text-gray-800 uppercase flex items-center gap-1.5 mb-2">
                      <Server size={14} className="text-emerald-600" />
                      Kiểm nghiệm cấu hình SMTP
                    </h3>
                    <p className="text-[11px] text-gray-400 font-medium mb-4 leading-relaxed font-semibold">
                      Nhập địa chỉ Email thực tế nhận test và ấn nút để gửi thử một bản tin. Cấu hình phải được lưu trước hoặc sẽ gửi theo giá trị bạn vừa nhập bên trên.
                    </p>

                    <div className="flex gap-3">
                      <input 
                        type="email" 
                        className="flex-1 bg-gray-50 border-none rounded-2xl px-6 py-4 outline-none focus:ring-2 focus:ring-indigo-600 transition-all font-semibold text-sm text-gray-900"
                        placeholder="Nhập email nhận gửi thử..."
                        value={testEmail}
                        onChange={e => setTestEmail(e.target.value)}
                      />
                      <button
                        type="button"
                        onClick={handleTestSmtp}
                        disabled={testingSmtp}
                        className="px-6 py-4 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-700 transition-all shadow-md shadow-emerald-100 flex items-center gap-2 text-xs uppercase tracking-wider"
                      >
                        {testingSmtp ? (
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <Send size={14} />
                        )}
                        Gửi kiểm tra
                      </button>
                    </div>

                    {testStatus === 'success' && (
                      <div className="mt-4 p-4 bg-emerald-50 text-emerald-700 rounded-2xl border border-emerald-100 text-xs font-semibold leading-relaxed">
                        ✅ {testMessage}
                      </div>
                    )}
                    {testStatus === 'error' && (
                      <div className={cn(
                        "mt-4 p-5 rounded-2xl border text-xs leading-relaxed",
                        testMessage.includes("535") || testMessage.includes("XÁC THỰC")
                          ? "bg-amber-50/70 border-amber-200 text-amber-900 animate-fadeIn" 
                          : "bg-red-50 border-red-100 text-red-700 animate-fadeIn"
                      )}>
                        <h4 className="font-extrabold flex items-center gap-2 mb-2 text-sm">
                          🔮 Kết quả chẩn đoán SMTP Server:
                        </h4>
                        <div className="font-medium whitespace-pre-wrap font-sans bg-white/80 border border-black/5 rounded-xl p-4 shadow-sm text-gray-800">
                          {testMessage}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Email Templates Card */}
          <div className="bg-white rounded-3xl p-8 shadow-sm border border-gray-100">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
              <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                <Mail size={16} className="text-indigo-600" />
                Cấu hình Mẫu nội dung Email (Email Templates)
              </h2>
            </div>
            <p className="text-xs text-gray-400 mb-6 leading-relaxed font-semibold">
              Tùy chỉnh mẫu tiêu đề và nội dung HTML của các email hệ thống tự động gửi tới nhân sự. Hãy sử dụng các thẻ biến có sẵn để điền động thông tin cá nhân hóa. Sau khi chỉnh sửa, vui lòng bấm nút "Lưu thay đổi" ở đầu trang để lưu cấu hình.
            </p>

            {/* Template select tabs */}
            <div className="flex flex-col sm:flex-row gap-2 mb-6 p-1.5 bg-gray-50 rounded-2xl border border-gray-100">
              <button
                type="button"
                onClick={() => setTemplateTab('welcome')}
                className={cn(
                  "flex-1 py-3 text-xs font-bold rounded-xl transition-all uppercase tracking-wide cursor-pointer",
                  templateTab === 'welcome'
                    ? "bg-white text-indigo-600 shadow-sm border border-gray-200"
                    : "text-gray-400 hover:text-gray-600"
                )}
              >
                📧 Chào mừng & Tài khoản mới
              </button>
              <button
                type="button"
                onClick={() => setTemplateTab('task')}
                className={cn(
                  "flex-1 py-3 text-xs font-bold rounded-xl transition-all uppercase tracking-wide cursor-pointer",
                  templateTab === 'task'
                    ? "bg-white text-indigo-600 shadow-sm border border-gray-200"
                    : "text-gray-400 hover:text-gray-600"
                )}
              >
                📋 Thông báo Giao việc mới
              </button>
              <button
                type="button"
                onClick={() => setTemplateTab('proposal')}
                className={cn(
                  "flex-1 py-3 text-xs font-bold rounded-xl transition-all uppercase tracking-wide cursor-pointer",
                  templateTab === 'proposal'
                    ? "bg-white text-indigo-600 shadow-sm border border-gray-200"
                    : "text-gray-400 hover:text-gray-600"
                )}
              >
                📝 Đề xuất chờ Phê duyệt
              </button>
            </div>

            {templateTab === 'welcome' ? (
              <div className="space-y-6">
                <div className="bg-indigo-50/40 rounded-2xl p-4 border border-indigo-100/30">
                  <span className="text-[10px] font-bold text-indigo-700 uppercase block mb-1">Các biến khả dụng:</span>
                  <div className="flex flex-wrap gap-2">
                    {['fullName', 'password', 'appUrl', 'email'].map((variable) => (
                      <button
                        key={variable}
                        type="button"
                        onClick={() => {
                          setSettings(prev => ({
                            ...prev,
                            welcomeTemplateBody: (prev.welcomeTemplateBody || '') + ` {{${variable}}}`
                          }));
                        }}
                        className="px-2 py-1 bg-white hover:bg-indigo-50 border border-indigo-100 text-indigo-650 rounded-lg text-[10px] font-mono font-bold transition-all cursor-pointer"
                        title="Click để chèn vào cuối nội dung"
                      >
                        {"{{"}{variable}{"}}"}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-gray-500 mt-2 font-medium">Bấm vào biến bất kỳ để tự động chèn nhanh vào cuối nội dung thư.</p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Tiêu đề Email Chào mừng</label>
                  <input
                    type="text"
                    className="w-full bg-gray-50 border-none rounded-2xl px-6 py-4 outline-none focus:ring-2 focus:ring-indigo-600 transition-all font-semibold text-gray-900 text-sm"
                    placeholder="VD: [Thalex] Thư chào mừng nhân sự {{fullName}}..."
                    value={settings.welcomeTemplateSubject || ''}
                    onChange={e => setSettings({ ...settings, welcomeTemplateSubject: e.target.value })}
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="block text-xs font-bold text-gray-400 uppercase">Nội dung thư chào mừng (Mã HTML)</label>
                    <button
                      type="button"
                      onClick={() => setSettings({ ...settings, welcomeTemplateSubject: DEFAULT_WELCOME_SUBJECT, welcomeTemplateBody: DEFAULT_WELCOME_BODY })}
                      className="text-[10px] text-red-500 hover:underline font-bold cursor-pointer"
                    >
                      Khôi phục mặc định
                    </button>
                  </div>
                  <textarea
                    rows={12}
                    className="w-full bg-gray-50 border-none rounded-2xl p-6 outline-none focus:ring-2 focus:ring-indigo-600 transition-all font-mono text-xs leading-relaxed text-gray-800"
                    placeholder="Vui lòng viết mã HTML cho email..."
                    value={settings.welcomeTemplateBody || ''}
                    onChange={e => setSettings({ ...settings, welcomeTemplateBody: e.target.value })}
                  />
                </div>
              </div>
            ) : templateTab === 'task' ? (
              <div className="space-y-6">
                <div className="bg-indigo-50/40 rounded-2xl p-4 border border-indigo-100/30">
                  <span className="text-[10px] font-bold text-indigo-700 uppercase block mb-1">Các biến khả dụng:</span>
                  <div className="flex flex-wrap gap-2">
                    {['fullName', 'taskName', 'assignerName', 'dueDate', 'appUrl'].map((variable) => (
                      <button
                        key={variable}
                        type="button"
                        onClick={() => {
                          setSettings(prev => ({
                            ...prev,
                            taskTemplateBody: (prev.taskTemplateBody || '') + ` {{${variable}}}`
                          }));
                        }}
                        className="px-2 py-1 bg-white hover:bg-indigo-50 border border-indigo-100 text-indigo-650 rounded-lg text-[10px] font-mono font-bold transition-all cursor-pointer"
                        title="Click để chèn vào cuối nội dung"
                      >
                        {"{{"}{variable}{"}}"}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-gray-500 mt-2 font-medium">Bấm vào biến bất kỳ để tự động chèn nhanh vào cuối nội dung thư.</p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Tiêu đề Email thông báo giao việc</label>
                  <input
                    type="text"
                    className="w-full bg-gray-50 border-none rounded-2xl px-6 py-4 outline-none focus:ring-2 focus:ring-indigo-600 transition-all font-semibold text-gray-900 text-sm"
                    placeholder="VD: [Nhiệm vụ mới] Bạn được giao công việc {{taskName}}..."
                    value={settings.taskTemplateSubject || ''}
                    onChange={e => setSettings({ ...settings, taskTemplateSubject: e.target.value })}
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="block text-xs font-bold text-gray-400 uppercase">Nội dung thư thông báo (Mã HTML)</label>
                    <button
                      type="button"
                      onClick={() => setSettings({ ...settings, taskTemplateSubject: DEFAULT_TASK_SUBJECT, taskTemplateBody: DEFAULT_TASK_BODY })}
                      className="text-[10px] text-red-500 hover:underline font-bold cursor-pointer"
                    >
                      Khôi phục mặc định
                    </button>
                  </div>
                  <textarea
                    rows={12}
                    className="w-full bg-gray-50 border-none rounded-2xl p-6 outline-none focus:ring-2 focus:ring-indigo-600 transition-all font-mono text-xs leading-relaxed text-gray-800"
                    placeholder="Vui lòng viết mã HTML cho email..."
                    value={settings.taskTemplateBody || ''}
                    onChange={e => setSettings({ ...settings, taskTemplateBody: e.target.value })}
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="bg-indigo-50/40 rounded-2xl p-4 border border-indigo-100/30">
                  <span className="text-[10px] font-bold text-indigo-700 uppercase block mb-1">Các biến khả dụng:</span>
                  <div className="flex flex-wrap gap-2">
                    {['fullName', 'proposalType', 'requesterName', 'proposalDetails', 'appUrl'].map((variable) => (
                      <button
                        key={variable}
                        type="button"
                        onClick={() => {
                          setSettings(prev => ({
                            ...prev,
                            proposalTemplateBody: (prev.proposalTemplateBody || '') + ` {{${variable}}}`
                          }));
                        }}
                        className="px-2 py-1 bg-white hover:bg-indigo-50 border border-indigo-100 text-indigo-650 rounded-lg text-[10px] font-mono font-bold transition-all cursor-pointer"
                        title="Click để chèn vào cuối nội dung"
                      >
                        {"{{"}{variable}{"}}"}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-gray-500 mt-2 font-medium">Bấm vào biến bất kỳ để tự động chèn nhanh vào cuối nội dung thư.</p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Tiêu đề Email thông báo đề xuất</label>
                  <input
                    type="text"
                    className="w-full bg-gray-50 border-none rounded-2xl px-6 py-4 outline-none focus:ring-2 focus:ring-indigo-600 transition-all font-semibold text-gray-900 text-sm"
                    placeholder="VD: [Đề xuất cần duyệt] Bạn có yêu cầu phê duyệt mới..."
                    value={settings.proposalTemplateSubject || ''}
                    onChange={e => setSettings({ ...settings, proposalTemplateSubject: e.target.value })}
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="block text-xs font-bold text-gray-400 uppercase">Nội dung thư thông báo đề xuất (Mã HTML)</label>
                    <button
                      type="button"
                      onClick={() => setSettings({ ...settings, proposalTemplateSubject: DEFAULT_PROPOSAL_SUBJECT, proposalTemplateBody: DEFAULT_PROPOSAL_BODY })}
                      className="text-[10px] text-red-500 hover:underline font-bold cursor-pointer"
                    >
                      Khôi phục mặc định
                    </button>
                  </div>
                  <textarea
                    rows={12}
                    className="w-full bg-gray-50 border-none rounded-2xl p-6 outline-none focus:ring-2 focus:ring-indigo-600 transition-all font-mono text-xs leading-relaxed text-gray-800"
                    placeholder="Vui lòng viết mã HTML cho email..."
                    value={settings.proposalTemplateBody || ''}
                    onChange={e => setSettings({ ...settings, proposalTemplateBody: e.target.value })}
                  />
                </div>
              </div>
            )}

            {/* Live Rendered Visual Preview Section */}
            <div className="mt-8 pt-6 border-t border-gray-100">
              <h3 className="text-xs font-bold text-gray-800 uppercase flex items-center gap-1.5 mb-4">
                🔍 Xem trước giao diện hiển thị thực tế (Live Render)
              </h3>
              
              <div className="border border-gray-150 bg-gray-50 rounded-2xl p-4 sm:p-6 overflow-hidden">
                <div className="bg-white rounded-xl shadow-xs border border-gray-100 overflow-hidden">
                  {/* Mail header bar simulation */}
                  {(() => {
                    const displayAppUrl = window.location.origin.includes('ais-dev-') 
                      ? window.location.origin.replace('ais-dev-', 'ais-pre-') 
                      : window.location.origin;
                    return (
                      <>
                        <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 text-xs text-gray-500 space-y-1">
                          <div className="flex">
                            <span className="w-16 font-bold text-gray-400 uppercase">Từ:</span>
                            <span className="font-semibold text-gray-700">{settings.smtpFrom || 'Thalex Portal <no-reply@thalex.vn>'}</span>
                          </div>
                          <div className="flex">
                            <span className="w-16 font-bold text-gray-400 uppercase">Tiêu đề:</span>
                            <span className="font-bold text-gray-900">
                              {templateTab === 'welcome' 
                                ? (settings.welcomeTemplateSubject || '').replace(/\{\{\s*fullName\s*\}\}/g, 'Phạm Minh Đức').replace(/\{\{\s*appUrl\s*\}\}/g, displayAppUrl)
                                : templateTab === 'task'
                                ? (settings.taskTemplateSubject || '').replace(/\{\{\s*fullName\s*\}\}/g, 'Phạm Minh Đức').replace(/\{\{\s*taskName\s*\}\}/g, 'Đánh giá & nghiệm thu dự án CRM').replace(/\{\{\s*appUrl\s*\}\}/g, displayAppUrl)
                                : (settings.proposalTemplateSubject || '').replace(/\{\{\s*fullName\s*\}\}/g, 'Phạm Minh Đức').replace(/\{\{\s*proposalType\s*\}\}/g, 'Yêu cầu Nghỉ phép năm').replace(/\{\{\s*requesterName\s*\}\}/g, 'Lê Thị Thảo (Nhân viên Kinh doanh)').replace(/\{\{\s*appUrl\s*\}\}/g, displayAppUrl)
                              }
                            </span>
                          </div>
                        </div>

                        {/* Mail body render */}
                        <div className="p-4 sm:p-6 bg-[#f6f9fc] overflow-auto max-h-[440px]">
                          <div 
                            className="bg-white rounded-2xl shadow-sm border border-gray-100 mx-auto max-w-[580px] p-6 text-sm text-gray-850 leading-relaxed overflow-hidden"
                            dangerouslySetInnerHTML={{
                              __html: templateTab === 'welcome'
                                ? (settings.welcomeTemplateBody || '')
                                    .replace(/\{\{\s*fullName\s*\}\}/g, 'Phạm Minh Đức')
                                    .replace(/\{\{\s*email\s*\}\}/g, 'duc.pm@thalex.vn')
                                    .replace(/\{\{\s*password\s*\}\}/g, 'PmdX@9981')
                                    .replace(/\{\{\s*appUrl\s*\}\}/g, displayAppUrl)
                                : templateTab === 'task'
                                ? (settings.taskTemplateBody || '')
                                    .replace(/\{\{\s*fullName\s*\}\}/g, 'Phạm Minh Đức')
                                    .replace(/\{\{\s*taskName\s*\}\}/g, 'Đánh giá & nghiệm thu dự án CRM')
                                    .replace(/\{\{\s*assignerName\s*\}\}/g, 'Trần Quốc Bảo (GĐ Công Nghệ)')
                                    .replace(/\{\{\s*dueDate\s*\}\}/g, '18:00 - 28/05/2026')
                                    .replace(/\{\{\s*appUrl\s*\}\}/g, displayAppUrl)
                                : (settings.proposalTemplateBody || '')
                                    .replace(/\{\{\s*fullName\s*\}\}/g, 'Phạm Minh Đức')
                                    .replace(/\{\{\s*proposalType\s*\}\}/g, 'Yêu cầu Nghỉ phép năm')
                                    .replace(/\{\{\s*requesterName\s*\}\}/g, 'Lê Thị Thảo (Nhân viên Kinh doanh)')
                                    .replace(/\{\{\s*proposalDetails\s*\}\}/g, 'Xin nghỉ phép 2 ngày (29/05 & 30/05/2026) để giải quyết công việc gia đình.')
                                    .replace(/\{\{\s*appUrl\s*\}\}/g, displayAppUrl)
                            }}
                          />
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
