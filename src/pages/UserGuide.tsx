import React, { useState } from 'react';
import { 
  BookOpen, 
  Users, 
  CheckCircle2, 
  DollarSign, 
  Clock, 
  ArrowRight, 
  FileText, 
  Layers, 
  Search, 
  Building, 
  Check, 
  Settings, 
  Mail, 
  FileSignature, 
  Package, 
  Boxes, 
  BarChart3, 
  Database,
  ArrowRightLeft,
  ChevronRight,
  Info,
  ExternalLink,
  ShieldAlert,
  UserCheck,
  AlertCircle,
  Sparkles,
  UserPlus,
  Calendar,
  MapPin,
  TrendingUp,
  Plus,
  FileSpreadsheet,
  AlertTriangle,
  XCircle,
  Briefcase,
  Sliders,
  Play
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// Types representing Module details for layout
interface GuideDetail {
  title: string;
  steps: {
    number: string;
    action: string;
    actor: string;
    details: string;
    tip?: string;
  }[];
  warning?: string;
  interactiveTitle: string;
}

export default function UserGuide() {
  const [activeModule, setActiveModule] = useState<'hr' | 'attendance' | 'proposals' | 'finance' | 'sales' | 'warehouse'>('hr');
  const [searchQuery, setSearchQuery] = useState('');
  
  // States for Interactive Playground Units
  // 1. HR simulation state
  const [simName, setSimName] = useState('Đỗ Hùng Dũng');
  const [simRole, setSimRole] = useState('Nhân viên kinh doanh');
  const [simEmail, setSimEmail] = useState('dung.dh@thalex.vn');
  const [hrSuccess, setHrSuccess] = useState(false);
  const [hrStaffs, setHrStaffs] = useState([
    { name: 'Phạm Minh Đức', role: 'Kế toán trưởng', email: 'duc.pm@thalex.vn', status: 'Active' },
    { name: 'Nguyễn Thị Thu Hà', role: 'Nhân sự HR', email: 'ha.ntt@thalex.vn', status: 'Active' }
  ]);

  // 2. Attendance tracking model simulator
  const [distKm, setDistKm] = useState(0.04); // 40 meters from office
  const [checkedInTime, setCheckedInTime] = useState<string | null>(null);
  const [checkedOutTime, setCheckedOutTime] = useState<string | null>(null);

  // 3. Proposal flow interactive state
  const [propTitle, setPropTitle] = useState('Mua màn hình Dell cho lập trình viên thiết kế');
  const [propAmount, setPropAmount] = useState('4,800,000');
  const [propType, setPropType] = useState('Thanh toán chi');
  const [propStatus, setPropStatus] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [propComments, setPropComments] = useState('');

  // 4. Finance Ledger state
  const [ledgerBalance, setLedgerBalance] = useState(150000000);
  const [ledgerLogs, setLedgerLogs] = useState([
    { id: '1', desc: 'Thu tiền đơn hàng bán tôn #SO-201', type: 'in', val: 12000000, date: '08:50' },
    { id: '2', desc: 'Thanh toán hoá đơn tiền điện tháng 5', type: 'out', val: 3200000, date: '09:12' },
  ]);

  // 5. Sales CRM Board Simulation
  const [pipeline, setPipeline] = useState([
    { id: '1', name: 'Công ty thép Miền Nam', step: 'lead', value: '45,000,000đ' },
    { id: '2', name: 'Đại lý vật tư Trường Chinh', step: 'quote', value: '18,500,000đ' },
    { id: '3', name: 'Xây dựng Hoà Bình - Chi nhánh 2', step: 'done', value: '125,000,000đ' },
  ]);

  // 6. Inventory safety controls
  const [itemsStock, setItemsStock] = useState([
    { code: 'X-STEEL', name: 'Tôn cuộn dẻo mạ kẽm', qty: 15, safetyMin: 10 },
    { code: 'I-BEAM', name: 'Thép hình chữ I đúc', qty: 3, safetyMin: 5 },
    { code: 'C-WIRE', name: 'Cáp thép phi 12 cường lực', qty: 85, safetyMin: 20 },
  ]);

  // Comprehensive documentation dictionary for Vietnamese business procedures
  const modulesData: Record<'hr' | 'attendance' | 'proposals' | 'finance' | 'sales' | 'warehouse', GuideDetail> = {
    hr: {
      title: 'Hướng dẫn Quản trị Nhân sự & Cơ cấu bộ máy',
      interactiveTitle: 'Giả lập Thao tác tạo nhân viên của Giám đốc/HR',
      warning: 'Cần cấu hình tài khoản máy chủ SMTP gửi mail trong "Cài đặt" để nhân sự mới nhận được Thư chào mừng tự động chứa mật khẩu.',
      steps: [
        {
          number: '01',
          action: 'Khởi tạo Phòng ban',
          actor: 'Giám đốc / HR Admin',
          details: 'Truy cập mục "Quản lý doanh nghiệp" -> click "Phòng ban" để tạo mới cơ cấu hành chính chính thức (ví dụ: Ban giám đốc, Phòng kế toán, Phòng kinh doanh, Tổ kỹ thuật).',
          tip: 'Việc đặt mã phòng ban chuẩn hóa dạng viết tắt (ví dụ: MKT, ACC, SALE) giúp tối ưu bộ lập chỉ mục dữ liệu.'
        },
        {
          number: '02',
          action: 'Thiết lập Chức vụ & Hệ số lương',
          actor: 'HR Admin / Giám đốc',
          details: 'Xác lập các vị trí công tác tương ứng với từng phòng ban, quy chuẩn hóa mức lương thỏa thuận cơ bản và thang năng lực cho chức danh này.',
          tip: 'Nếu chưa đóng hợp đồng chính thức, hệ số lương tạm định có thể để trống để tính theo mức thỏa thuận miệng.'
        },
        {
          number: '03',
          action: 'Tạo hồ sơ nhân viên',
          actor: 'HR Admin',
          details: 'Tại thẻ "Danh sách nhân viên", biểu đơn cho phép Admin nhập Họ tên tài khoản, hòm thư email làm việc và số điện thoại di động chính thực.',
          tip: 'Hệ thống tự động thiết lập bảo mật và khởi sinh sẵn một mật khẩu truy cập tạm thời siêu mạnh.'
        },
        {
          number: '04',
          action: 'Gửi Mail Chào mừng',
          actor: 'Hệ thống (SMTP Service)',
          details: 'Tài khoản nhân sự mới sẽ nhận được hòm thư điện tử chào mừng tự động có thông tin đường link portal, tài khoản tên đăng nhập chính là Email, kèm mật khẩu riêng của họ.',
          tip: 'Mẫu nội dung thư chào mừng này có thể tự do biến hóa theo mã HTML trong phần Company Profile của Admin.'
        }
      ]
    },
    attendance: {
      title: 'Hướng dẫn Chấm công, Giám sát Định vị & Nghỉ phép',
      interactiveTitle: 'Trình Giả lập Giao diện Chấm công Toạ độ Di động',
      warning: 'Hệ thống yêu cầu cài đặt cho phép truy cập quyền định vị địa lý (Camera/Geolocation) trên trình duyệt để kiểm soát vùng kích hoạt chấm công an toàn.',
      steps: [
        {
          number: '01',
          action: 'Kiểm tra tệp tin toạ độ',
          actor: 'Nhân viên',
          details: 'Hệ thống tự động quét toạ độ vĩ độ thực tế của điện thoại/máy tính để so sánh xem nhân viên có đang đứng trong bán kính cho phép (thường là 100m) của Toà nhà công ty.',
          tip: 'Trong trường hợp đi công tác bên ngoài, nhân viên cần gửi Đề xuất đi công vụ để HR duyệt công tác đặc thù.'
        },
        {
          number: '02',
          action: 'Ghi nhận Check In',
          actor: 'Nhân viên',
          details: 'Bấm nút "CHECK IN" trên trang chủ để gửi dữ liệu giờ vào. Hệ thống kiểm định mốc thời gian: Nếu muộn hơn 08h30 sẽ tự động gắn thẻ "Đi muộn" (Late).',
          tip: 'Thời gian đi muộn sẽ trừ tỉ lệ công dựa trên công thức cấu hình lương phạt trong mục cài đặt lương.'
        },
        {
          number: '03',
          action: 'Tạo đơn Nghỉ phép phép năm',
          actor: 'Nhân viên vắng mặt',
          details: 'Trong trường hợp nghỉ phép ốm, thai sản hay phép năm, nhân sự tạo "Đơn xin nghỉ phép".',
          tip: 'Đơn được duyệt từ phía Trưởng phòng sẽ tự động điền trạng thái (Phép - P) giúp bảng lương cuối tháng không bị trừ tiền oan.'
        },
        {
          number: '04',
          action: 'Ghi nhận Check Out',
          actor: 'Nhân viên cuối ngày',
          details: 'Nhân sự nhấn nút "CHECK OUT" sau khi hoàn tất công việc (tiêu chuẩn sau 17h00). Hệ thống lưu lại tổng thời lượng chấm công thực tế trong ca làm.',
          tip: 'Bấm check out sớm hơn quy định sẽ hỏi lý do về sớm hoặc giảm trừ công theo phần lẻ lẻ tương ứng.'
        }
      ]
    },
    proposals: {
      title: 'Quy trình Khởi tạo Đề xuất & Thẩm duyệt Đơn từ kỹ thuật số',
      interactiveTitle: 'Giả lập Trình Duyệt Đơn số hoá trực quan của Cấp quản lý',
      warning: 'Mỗi đề xuất tài chính lớn cần chụp hình hóa đơn VAT hoặc phiếu thu hợp lệ đính kèm trực tiếp tại nút tải file để kế toán duyệt nhanh chóng.',
      steps: [
        {
          number: '01',
          action: 'Khởi tạo Đề xuất và Ghi Số tiền',
          actor: 'Nhân viên có nhu cầu',
          details: 'Lựa chọn loại biểu đơn phù hợp nhu cầu công tác: Tạm ứng (mua sắm vật tư), thanh toán trực tiếp (cho nhà cung cấp), hoàn ứng công tác phí.',
          tip: 'Nhập tiêu đề và nội dung súc tích nhất để mô tả lý do cấp thiết cần chi ngân quỹ.'
        },
        {
          number: '02',
          action: 'Đính kèm tệp tin hóa đơn chứng từ',
          actor: 'Nhân viên',
          details: 'Chọn tệp ảnh hoặc file PDF làm căn cứ thanh toán hợp lệ. Hệ thống số lưu trữ đám mây đảm bảo tài liệu được mã hoá an toàn tránh rò rỉ.',
          tip: 'Ảnh chụp hoá đơn cần rõ nét bốn góc và thấy rõ số tiền thanh toán thực tế, mã số thuế đơn vị bán hàng.'
        },
        {
          number: '03',
          action: 'Chuyển thông tin cho Trưởng Bộ Phận duyệt',
          actor: 'Hệ thống tự động',
          details: 'Firestore tự động đẩy thông tin thời gian thực (no-reload) tới trang phê duyệt của Trưởng phòng ban chủ quản.',
          tip: 'Quản lý sẽ nhận được thông báo đỏ nhắc việc trên menu chính "Đề xuất phòng ban" ngay khi đơn khởi tạo.'
        },
        {
          number: '04',
          action: 'Ký điện tử & Đóng trạng thái',
          actor: 'Giám đốc / Kế toán trưởng',
          details: 'Cấp tổng duyệt kiểm chứng nội dung, xem ảnh hoá đơn trực quan và nhấn "Phê duyệt" hoặc "Từ chối" kèm lý do phản hồi.',
          tip: 'Hồ sơ đã duyệt không thể chỉnh sửa để bảo toàn tính toàn vẹn thông tin kế toán.'
        }
      ]
    },
    finance: {
      title: 'Quy trình Xuất Két lập phiếu Chi (Disbursements) & Sổ quỹ vận hành',
      interactiveTitle: 'Giả lập Thao tác Chi tiền & Ghi nhận Sổ quỹ Doanh nghiệp',
      warning: 'Disbursements (Phiếu chi) là phần ghi nhận dòng tiền ra thực tế. Chỉ lập phiếu chi khi đơn đề xuất tài chính đã chuyển sang trạng thái "ĐÃ DUYỆT".',
      steps: [
        {
          number: '01',
          action: 'Kiểm toán Phiếu phê duyệt tài chính',
          actor: 'Sổ sách Kế toán viên',
          details: 'Kế toán truy cập thẻ "Phiếu chi" để liệt kê các yêu cầu thanh toán/tạm ứng đã nhận đủ sự phê duyệt đồng ý của Giám đốc.',
          tip: 'Hệ thống tự động lọc sẵn danh sách "Chờ chi" giúp kế toán không bao giờ chi nhầm hoặc chi thừa ngân sách.'
        },
        {
          number: '02',
          action: 'Thiết lập lệnh Lập Phiếu Chi tài chính',
          actor: 'Kế toán viên',
          details: 'Bấm nút "Lập phiếu chi", lựa chọn hình thức xuất quỹ tương thích (Tiền mặt trong két công ty hoặc Chuyển khoản ngân hàng doanh nghiệp).',
          tip: 'Điền mã giao dịch ngân hàng vào mô tả để thuận tiện cho việc đối chiếu bảng sao kê thẻ ngân hàng vào cuối tháng.'
        },
        {
          number: '03',
          action: 'Khấu trừ ngân quỹ dòng tiền doanh nghiệp',
          actor: 'Hệ thống tự động',
          details: 'Ngay khi phiếu chi được ấn quyết định xác nhận hoàn tất giải ngân, số dư khả dụng thực của quỹ tổng sẽ bị hạ đi tương ứng.',
          tip: 'Hệ thống ghi nhận bút toán rành mạch lên Sổ quỹ điện tử kèm theo mã phân phối đề xuất gốc.'
        },
        {
          number: '04',
          action: 'Vẽ dữ liệu Biểu đồ Dòng tiền (Cash Flow Chart)',
          actor: 'Sơ đồ KPI hệ thống',
          details: 'Dòng tiền ra thực tế này được nạp trực tiếp vào đồ thị Tài chính của Giám đốc (mục Dòng tiền thu chi), thiết lập số liệu so sánh chênh lệch lỗ/lãi thực tế.',
          tip: 'Giám đốc có thể sử dụng bộ lọc thời gian để truy xuất báo cáo chi vận hành từ ngày này sang ngày khác cực nhanh.'
        }
      ]
    },
    sales: {
      title: 'Quy trình Chăm sóc Khách hàng (CRM) & Quản lý Đơn hàng bán',
      interactiveTitle: 'Giả lập Đường ống Bán hàng (Sales Pipelines Mode)',
      warning: 'Hãy cập nhật số điện thoại chuẩn của khách hàng để nhân viên giao hàng dễ dàng liên hệ giao vận thực hành.',
      steps: [
        {
          number: '01',
          action: 'Dữ liệu hóa tệp tin Khách hàng',
          actor: 'Chuyên viên Sale / Trực quầy',
          details: 'Lưu thông tin danh tính đối tác: số điện thoại giao dịch, tên doanh nghiệp, mã số thuế, phân cấp nhóm người mua (VIP, Thường, Đại lý chiết khấu).',
          tip: 'Để tăng tính cá nhân hoá, hệ thống bổ sung ghi chú thói quen đặt hàng của doanh nghiệp.'
        },
        {
          number: '02',
          action: 'Lên Đơn hàng Bán lẻ/Đại lý (Sales Order)',
          actor: 'Nhân viên bán lẻ',
          details: 'Tạo đơn mới trên màn hình bán hàng, chọn các mặt hàng mạ kẽm, sắt thép mác cao hoặc vật tư xây dựng đã có sẵn danh mục từ Kho.',
          tip: 'Giá bán đề xuất tự động nhảy sang mốc giá đại lý tương quan nếu hồ sơ khách hàng được gắn mác Đại lý cấp 1.'
        },
        {
          number: '03',
          action: 'Phê chuẩn giá trị đơn hàng bán ra',
          actor: 'Quản lý chi nhánh / Kế toán bán hàng',
          details: 'Kiểm toán mức chiết khấu giảm giá, cước vận chuyển trung chuyển và phê duyệt cho phép đóng hộp xuất xưởng.',
          tip: 'Đơn hàng thành công lập tức thông báo tới phòng kho vận chuẩn bị vật tư bốc dỡ.'
        },
        {
          number: '04',
          action: 'Thu tiền bán hàng & Đồng bộ Doanh thu',
          actor: 'Kế toán Thu quỹ',
          details: 'Khi tiền đổ về ví hoặc tài khoản, kế toán xác nhận "Thu tiền". Bút toán dòng tiền thu (+ tiền) tự ghi có vào ngân quỹ bán hàng.',
          tip: 'Dữ liệu được tích hợp sang biểu đồ doanh số kinh doanh phân tích tỷ trọng nhóm hàng chạy nhất.'
        }
      ]
    },
    warehouse: {
      title: 'Quy trình Quản lý Danh mục Vật tư, Xuất nhập Kho & Định mức an toàn',
      interactiveTitle: 'Mô phỏng Kiểm toán Hết hàng & Cảnh báo an toàn Tồn kho',
      warning: 'Luôn định mức cụ thể số tồn kho an toàn tối thiểu (Safety Minimum) cho từng sản phẩm thép tấm, tôn cuộn để kiểm soát chuỗi cung ứng.',
      steps: [
        {
          number: '01',
          action: 'Danh mục hóa Sản phẩm chính thức',
          actor: 'Bộ phận quản lý danh mục',
          details: 'Tạo mới hồ sơ vật phẩm: Tên hàng hóa, quy cách độ dày vật tư, mã sản phẩm nội bộ duy nhất, chọn danh mục hạt hạt nguyên liệu.',
          tip: 'Mã vạch sản phẩm có thể tự sinh mặc định để nhân viên dùng súng bắn mã vạch quét nhận khi xuất kho.'
        },
        {
          number: '02',
          action: 'Tạo phiếu Nhập kho vật tư bổ sung',
          actor: 'Thủ kho / Nhân viên thu mua',
          details: 'Nhập hàng từ nhà máy thép nguồn, nâng dữ liệu số đếm tồn kho, ghi nhận đơn giá nhập vốn trung bình.',
          tip: 'Chi phí mua này có thể kết dính trực tiếp sang Đề xuất chi tiền nhà cung cấp để đồng bộ hóa hóa đơn.'
        },
        {
          number: '03',
          action: 'Xuất kho phục vụ đơn hàng/Sản xuất',
          actor: 'Thủ kho thực tế',
          details: 'Dựa trên lệnh đơn hàng bán của phòng sales đã được duyệt gộp, kế toán phát lệnh cho phép thủ kho đóng xe xuất kho rời cảng.',
          tip: 'Phải rà soát tình trạng bề mặt kim loại mạ điện trước khi tích chuyển giao hàng.'
        },
        {
          number: '04',
          action: 'Tự động tính tồn cảnh báo đỏ an toàn',
          actor: 'Hệ thống lõi tự động',
          details: 'Số tồn mới được cập nhật. Nếu sụt giảm nghiêm trọng vượt hẳn vạch cho phép tối thiểu, hệ thống hiển thị màu đỏ rực khẩn cấp báo mua.',
          tip: 'Có thể thiết lập nút hành động nhanh tự sinh đơn đề nghị mua hàng gửi thẳng Giám đốc duyệt mua hàng mới.'
        }
      ]
    }
  };

  // Search logic to jump or highlight content matching queries
  const handleSearch = (q: string) => {
    setSearchQuery(q);
    const lowercaseQ = q.toLowerCase();
    
    // Auto shift active module if matched
    if (lowercaseQ.includes('nhân sự') || lowercaseQ.includes('hr') || lowercaseQ.includes('smtp') || lowercaseQ.includes('bộ máy')) {
      setActiveModule('hr');
    } else if (lowercaseQ.includes('chấm công') || lowercaseQ.includes('định vị') || lowercaseQ.includes('check') || lowercaseQ.includes('nghỉ phép')) {
      setActiveModule('attendance');
    } else if (lowercaseQ.includes('đề xuất') || lowercaseQ.includes('phê duyệt') || lowercaseQ.includes('chứng từ') || lowercaseQ.includes('hoá đơn')) {
      setActiveModule('proposals');
    } else if (lowercaseQ.includes('tài chính') || lowercaseQ.includes('phiếu chi') || lowercaseQ.includes('sổ quỹ') || lowercaseQ.includes('tiền')) {
      setActiveModule('finance');
    } else if (lowercaseQ.includes('bán hàng') || lowercaseQ.includes('khách hàng') || lowercaseQ.includes('crm') || lowercaseQ.includes('đơn hàng')) {
      setActiveModule('sales');
    } else if (lowercaseQ.includes('kho') || lowercaseQ.includes('sản phẩm') || lowercaseQ.includes('vật tư') || lowercaseQ.includes('tồn')) {
      setActiveModule('warehouse');
    }
  };

  return (
    <div className="space-y-8 pb-12">
      {/* Visual Header Banner - Modern Tech Theme */}
      <div className="relative bg-gradient-to-r from-slate-900 via-[#1e293b] to-indigo-950 text-white rounded-3xl p-8 sm:p-12 shadow-sm border border-slate-800 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-emerald-500/10 via-transparent to-transparent"></div>
        <div className="relative z-10 max-w-4xl space-y-4">
          <span className="px-3.5 py-1 bg-indigo-500/20 text-indigo-300 rounded-full text-[10px] font-black uppercase tracking-widest border border-indigo-500/30">
            Học tập & Vận hành ERP Thalex
          </span>
          <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-white leading-tight">
            Cẩm Nang Vận Hành & Bản Đồ Quy Trình Nghiệp Vụ Chuẩn
          </h1>
          <p className="text-slate-350 text-xs sm:text-sm font-semibold leading-relaxed max-w-2xl text-slate-300">
            Hãy khám phá quy trình phối hợp tự động giữa <strong>Nhân viên - Kế toán - Thủ kho - Nhân sự - Giám đốc</strong> thông qua các bước rõ ràng và các mô-đun giả lập tương tác độc quyền bên dưới.
          </p>

          {/* Search to jump directly to sections */}
          <div className="relative max-w-md pt-2">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-indigo-400">
              <Search size={16} className="stroke-[2.5]" />
            </div>
            <input
              type="text"
              placeholder="Nhập nhiệm vụ muốn tìm hiểu (ví dụ: chấm công, duyệt chi, kho...)"
              className="w-full bg-slate-800/90 hover:bg-slate-800 border border-slate-700/60 rounded-2xl pl-11 pr-6 py-3.5 text-slate-100 placeholder:text-slate-500 text-xs outline-none focus:ring-2 focus:ring-emerald-500/40 transition-all font-semibold shadow-inner"
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Module quick selectors bento grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        {[
          { id: 'hr', title: 'Hồ sơ & Cơ cấu', sub: 'Thành viên & SMTP', icon: Users, color: 'text-indigo-600', bg: 'bg-indigo-50 border-indigo-100' },
          { id: 'attendance', title: 'Chấm công & Phép', sub: 'GPS & Ngày công', icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50 border-amber-100' },
          { id: 'proposals', title: 'Đề xuất & Duyệt', sub: 'Số hoá đơn từ', icon: FileSignature, color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-100' },
          { id: 'finance', title: 'Tài chính & Quỹ', sub: 'Phiếu giải ngân', icon: DollarSign, color: 'text-red-6050', bg: 'bg-red-50 border-red-100' },
          { id: 'sales', title: 'Bán hàng & CRM', sub: 'Đơn hàng & Thu tiền', icon: Boxes, color: 'text-blue-600', bg: 'bg-blue-50 border-blue-100' },
          { id: 'warehouse', title: 'Kho & Vật tư', sub: 'Tồn kho cảnh báo', icon: Package, color: 'text-violet-600', bg: 'bg-violet-50 border-violet-100' },
        ].map((mod) => (
          <button
            key={mod.id}
            type="button"
            onClick={() => setActiveModule(mod.id as any)}
            className={`cursor-pointer p-4 rounded-3xl border text-left transition-all flex flex-col justify-between h-32 ${
              activeModule === mod.id
                ? 'bg-slate-900 border-slate-900 shadow-md text-white'
                : 'bg-white hover:bg-gray-50 border-gray-150 text-gray-800'
            }`}
          >
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
              activeModule === mod.id ? 'bg-indigo-500/20 text-indigo-300' : mod.bg
            }`}>
              <mod.icon size={18} className={activeModule === mod.id ? '' : mod.color} />
            </div>
            <div>
              <h3 className="text-xs font-black uppercase tracking-tight leading-snug line-clamp-1">{mod.title}</h3>
              <p className={`text-[10px] font-semibold mt-0.5 line-clamp-1 ${
                activeModule === mod.id ? 'text-slate-400' : 'text-gray-400'
              }`}>
                {mod.sub}
              </p>
            </div>
          </button>
        ))}
      </div>

      {/* Main Container dividing Detailed step-by-step and Interactive live sandbox simulation */}
      <div className="bg-white rounded-3xl border border-gray-150 overflow-hidden shadow-xs">
        {/* Module Title Banner */}
        <div className="bg-slate-50 border-b border-gray-150 px-6 sm:px-8 py-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="space-y-1">
            <h2 className="text-sm font-extrabold text-gray-800 uppercase tracking-widest flex items-center gap-1.5">
              <BookOpen size={16} className="text-indigo-600" />
              Quy trình chuẩn: {modulesData[activeModule].title}
            </h2>
            <p className="text-[11px] text-gray-400 font-semibold">
              Hãy hoàn thiện nghiệp vụ doanh nghiệp của bạn đúng bước và đúng người trách nhiệm
            </p>
          </div>
          <span className="text-[10px] bg-slate-900 text-slate-100 px-3 py-1 rounded-full font-bold uppercase tracking-widest leading-none">
            Module {activeModule.toUpperCase()}
          </span>
        </div>

        {/* Content Section Grid */}
        <div className="p-6 sm:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          {/* LEFT: Complete Step-by-Step Flow Instructions */}
          <div className="lg:col-span-7 space-y-6">
            <h3 className="text-xs font-black text-gray-400 uppercase tracking-wider">
              Từng bước thực thi trực quan (Workflow Timeline)
            </h3>

            <div className="relative border-l-2 border-dashed border-gray-200 pl-6 ml-3 space-y-6">
              {modulesData[activeModule].steps.map((st, index) => (
                <div key={index} className="relative group">
                  {/* Step node indicator circle */}
                  <div className="absolute -left-[35px] top-0.5 w-6 h-6 rounded-full bg-white border-2 border-indigo-600 flex items-center justify-center font-black text-[10px] text-indigo-650 shadow-xs group-hover:bg-indigo-6050 group-hover:text-indigo-600 transition-colors">
                    {st.number}
                  </div>

                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-xs font-black text-gray-900 uppercase">
                        {st.action}
                      </h4>
                      <span className="px-2 py-0.5 bg-indigo-550/10 text-indigo-700/90 font-bold text-[9px] rounded-md border border-indigo-100">
                        Vai trò: {st.actor}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 font-semibold leading-relaxed">
                      {st.details}
                    </p>
                    {st.tip && (
                      <div className="text-[10px] text-indigo-650 font-semibold bg-indigo-50/40 px-3 py-2 rounded-xl border border-indigo-100/20 max-w-lg leading-relaxed">
                        ⚡ <strong>Mẹo vận hành:</strong> {st.tip}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Error or caution prompt */}
            {modulesData[activeModule].warning && (
              <div className="p-4 bg-amber-50/50 border border-amber-100 rounded-2xl flex items-start gap-3">
                <ShieldAlert className="shrink-0 mt-0.5 text-amber-600" size={16} />
                <div className="space-y-1">
                  <h5 className="text-[11px] font-black uppercase text-amber-900">Lưu ý rủi ro quy trình</h5>
                  <p className="text-[10px] text-amber-800 font-semibold leading-relaxed">
                    {modulesData[activeModule].warning}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT: INTERACTIVE PLAYGROUND (Visual Simulator mimicking reality) */}
          <div className="lg:col-span-12 xl:col-span-5 bg-gray-50/50 rounded-3xl p-6 border border-gray-150 flex flex-col justify-between space-y-6">
            <div className="space-y-4">
              <span className="text-[9px] bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full font-black py-1 px-3 uppercase tracking-widest block w-fit">
                MÔ PHỎNG AN TOÀN (Interactive sandbox)
              </span>
              <h3 className="text-xs font-black text-gray-800 uppercase leading-snug">
                {modulesData[activeModule].interactiveTitle}
              </h3>
              <p className="text-[10px] text-gray-400 font-semibold leading-relaxed">
                Sau đây là trình trải nghiệm mẫu giao diện ảo giúp bạn nhanh chóng hình dung cách hệ thống cấu trúc cơ sở dữ liệu và xử lý các trạng thái logic.
              </p>
            </div>

            {/* Render specialized widget dashboard according to current tab */}
            <div className="bg-white rounded-2xl p-4 shadow-xs border border-gray-150/60 min-h-[260px] flex flex-col justify-between">
              
              {/* SPECIAL PLAYGROUND AREA */}
              {activeModule === 'hr' && (
                <div className="space-y-4 text-xs font-bold leading-relaxed text-gray-700">
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase text-gray-400 block font-extrabold">Họ tên Nhân viên</label>
                    <input 
                      type="text" 
                      value={simName} 
                      onChange={e => setSimName(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-semibold outline-none focus:ring-1 focus:ring-indigo-600"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] uppercase text-gray-400 block font-extrabold mb-1">Chức vụ</label>
                      <select 
                        value={simRole} 
                        onChange={e => setSimRole(e.target.value)}
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-semibold"
                      >
                        <option value="Nhân viên kinh doanh">Nhân viên kinh doanh</option>
                        <option value="Chuyên viên kỹ thuật">Chuyên viên kỹ thuật</option>
                        <option value="Kế toán viên">Kế toán viên</option>
                        <option value="Trưởng phòng HR">Trưởng phòng HR</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] uppercase text-gray-400 block font-extrabold mb-1">Email tên login</label>
                      <input 
                        type="text" 
                        value={simEmail} 
                        onChange={e => setSimEmail(e.target.value)}
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-semibold"
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setHrSuccess(true);
                      setHrStaffs(prev => [...prev, { name: simName, role: simRole, email: simEmail, status: 'Active' }]);
                      setTimeout(() => setHrSuccess(false), 3000);
                    }}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <UserPlus size={14} className="stroke-[2.5]" />
                    Tạo & Gửi mail chào mừng ảo
                  </button>

                  <div className="mt-2 border-t border-gray-100 pt-3">
                    <span className="text-[10px] text-gray-450 block uppercase mb-1.5 font-extrabold">Danh nhân sự thời gian thực (Giả lập)</span>
                    <div className="space-y-1">
                      {hrStaffs.map((st, i) => (
                        <div key={i} className="flex justify-between items-center bg-gray-50/50 p-2 rounded-lg border border-gray-100 text-[10px]">
                          <span>👤 {st.name} <span className="text-gray-400">({st.role})</span></span>
                          <span className="text-emerald-650 bg-emerald-50 px-1.5 py-0.5 border border-emerald-100 rounded text-[9px] font-black">Active</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {hrSuccess && (
                    <div className="text-[10px] text-emerald-600 bg-emerald-50 border border-emerald-200 p-2.5 rounded-xl text-center">
                      ✓ Đã lưu trữ tài khoản mượt mà và bắn email chào mừng giả lập thành công tới {simEmail}!
                    </div>
                  )}
                </div>
              )}

              {activeModule === 'attendance' && (
                <div className="space-y-4 text-xs font-bold leading-relaxed text-gray-750">
                  <div className="bg-slate-900 text-white rounded-2xl p-4 text-center space-y-2">
                    <div className="text-[10px] text-slate-400 uppercase tracking-widest">Thiết bị toạ độ của bạn và văn phòng</div>
                    <div className="text-base text-emerald-400 font-mono">Bán kính: {(distKm * 1000).toFixed(0)}m</div>
                    <div className="relative pt-1">
                      <input 
                        type="range" 
                        min="0.01" 
                        max="0.4" 
                        step="0.01"
                        value={distKm} 
                        onChange={e => setDistKm(parseFloat(e.target.value))}
                        className="w-full h-1 bg-slate-750 rounded-lg appearance-none cursor-pointer accent-emerald-400" 
                      />
                      <div className="flex justify-between text-[8px] text-slate-500 font-mono mt-1">
                        <span>Ở Công ty (gần)</span>
                        <span>Ở ngoài công ty (xa)</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={distKm > 0.1}
                        onClick={() => setCheckedInTime(new Date().toLocaleTimeString())}
                        className={`flex-1 py-3 px-2 rounded-xl text-[10px] font-black uppercase text-center cursor-pointer transition-all ${
                          distKm > 0.1 
                            ? 'bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed'
                            : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-md'
                        }`}
                      >
                        🌞 Check In (Sáng)
                      </button>

                      <button
                        type="button"
                        disabled={distKm > 0.1}
                        onClick={() => setCheckedOutTime(new Date().toLocaleTimeString())}
                        className={`flex-1 py-3 px-2 rounded-xl text-[10px] font-black uppercase text-center cursor-pointer transition-all ${
                          distKm > 0.1 
                            ? 'bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed'
                            : 'bg-amber-600 hover:bg-amber-700 text-white shadow-md'
                        }`}
                      >
                        🌜 Check Out (Chiều)
                      </button>
                    </div>

                    {distKm > 0.1 && (
                      <p className="text-[9px] text-red-500 flex items-center gap-1.5 font-bold justify-center bg-red-50/70 p-2 rounded-lg border border-red-100">
                        <AlertTriangle size={12} />
                        Cảnh báo: Bạn ở quá xa văn phòng ({ (distKm * 1000).toFixed(0) }m &gt; 100m). Hãy kéo thanh trượt lại gần dưới 100m để có quyền chấm công!
                      </p>
                    )}
                  </div>

                  <div className="bg-gray-50 border border-gray-150 p-3.5 rounded-xl space-y-1.5 text-[10px]">
                    <div className="flex justify-between border-b border-gray-100 pb-1.5 text-gray-450 uppercase tracking-wide">
                      <span>Bản ghi log</span>
                      <span>Thời điểm đối soát</span>
                    </div>
                    <div className="flex justify-between text-gray-700">
                      <span>Giờ Check-in thực:</span>
                      <span className="font-mono text-emerald-650">{checkedInTime || 'Chưa bấm'}</span>
                    </div>
                    <div className="flex justify-between text-gray-700">
                      <span>Giờ Check-out thực:</span>
                      <span className="font-mono text-amber-600">{checkedOutTime || 'Chưa bấm'}</span>
                    </div>
                    <div className="flex justify-between text-gray-750">
                      <span>Đánh giá ngày công:</span>
                      {checkedInTime ? (
                        <span className="text-emerald-600 font-extrabold text-[9px] uppercase">✓ 1.0 Đạt chuẩn công</span>
                      ) : (
                        <span className="text-gray-400 text-[9px] uppercase">Chờ check-in</span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {activeModule === 'proposals' && (
                <div className="space-y-4 text-xs font-bold leading-relaxed text-gray-700">
                  <div className="bg-gray-50 p-3 rounded-2xl border border-gray-150 space-y-2.5">
                    <div className="flex justify-between items-center pb-2 border-b border-gray-200/60">
                      <span className="text-[10px] text-gray-400 uppercase font-black">Biểu mẫu đề xuất trực tuyến</span>
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase border ${
                        propStatus === 'pending' ? 'bg-yellow-50 text-yellow-600 border-yellow-200' :
                        propStatus === 'approved' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' :
                        'bg-red-50 text-red-600 border-red-200'
                      }`}>
                        {propStatus === 'pending' ? 'Đang Chờ duyệt' : propStatus === 'approved' ? 'Đã duyệt' : 'Bị Từ Chối'}
                      </span>
                    </div>

                    <div className="space-y-1">
                      <div className="text-[10px] text-gray-400 uppercase">Tiêu chuẩn mua sắm</div>
                      <div className="text-xs text-slate-800 font-extrabold">{propTitle}</div>
                    </div>

                    <div className="flex justify-between">
                      <div>
                        <div className="text-[10px] text-gray-400 uppercase">Số tiền thanh toán</div>
                        <div className="text-xs text-emerald-600 font-black">{propAmount}đ</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-gray-400 uppercase">Hạng mục đơn</div>
                        <div className="text-xs text-indigo-750">{propType}</div>
                      </div>
                    </div>

                    <div className="flex gap-2 items-center bg-white p-2.5 rounded-xl border border-gray-100">
                      <div className="w-8 h-8 rounded bg-gray-100 flex items-center justify-center text-gray-4050 shrink-0">📄</div>
                      <div className="overflow-hidden">
                        <div className="text-[9px] text-gray-500 truncate font-semibold">hoadon-vat-dell-4k.jpg</div>
                        <div className="text-[8px] text-slate-400 font-mono">1.2 MB | Ảnh đính kèm phê duyệt</div>
                      </div>
                    </div>
                  </div>

                  {propStatus === 'pending' ? (
                    <div className="space-y-2">
                      <label className="text-[9px] text-gray-400 uppercase block font-black">Bình luận của cấp quản lý (nếu có)</label>
                      <input 
                        type="text" 
                        placeholder="Nhập ghi chú duyệt đơn..."
                        value={propComments}
                        onChange={e => setPropComments(e.target.value)}
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-semibold outline-none"
                      />
                      <div className="flex gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setPropStatus('rejected')}
                          className="flex-1 py-2.5 bg-red-50 hover:bg-red-100 text-red-650 font-black uppercase text-xs rounded-xl border border-red-200 cursor-pointer text-center"
                        >
                          ✕ Từ chối
                        </button>
                        <button
                          type="button"
                          onClick={() => setPropStatus('approved')}
                          className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase text-xs rounded-xl border border-emerald-700 cursor-pointer text-center shadow-md shadow-emerald-100"
                        >
                          ✓ Duyệt đơn
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setPropStatus('pending');
                        setPropComments('');
                      }}
                      className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer text-center"
                    >
                      🔄 Thử lại với Đề đề xuất mới
                    </button>
                  )}
                </div>
              )}

              {activeModule === 'finance' && (
                <div className="space-y-4 text-xs font-bold leading-relaxed text-gray-700">
                  <div className="bg-slate-900 text-white p-4 rounded-2xl relative overflow-hidden">
                    <div className="absolute right-2 bottom-0 text-slate-800 font-mono text-7xl font-bold select-none opacity-30">VND</div>
                    <span className="text-[9px] text-slate-400 uppercase block font-black">Số dư Quỹ Doanh nghiệp ảo</span>
                    <span className="text-xl text-emerald-450 font-mono font-bold block mt-1">
                      {ledgerBalance.toLocaleString('vi-VN')} đ
                    </span>
                  </div>

                  <div className="space-y-1.5 border-t border-gray-100 pt-3">
                    <span className="text-[9px] text-gray-400 uppercase block font-black mb-2">Nhật ký Biến động thu chi sổ quỹ</span>
                    <div className="space-y-1 max-h-[140px] overflow-auto">
                      {ledgerLogs.map((log) => (
                        <div key={log.id} className="flex justify-between items-center bg-gray-50 p-2 rounded-lg border border-gray-100 text-[10px]">
                          <span>[{log.date}] {log.desc}</span>
                          <span className={log.type === 'in' ? 'text-emerald-600 font-extrabold font-mono' : 'text-red-500 font-extrabold font-mono'}>
                            {log.type === 'in' ? '+' : '-'}{log.val.toLocaleString('vi-VN')}đ
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setLedgerBalance(prev => prev - 2500000);
                        setLedgerLogs(prev => [
                          { id: String(prev.length + 1), desc: 'Giải chi tạm ứng công vụ #092', type: 'out', val: 2500000, date: 'Vừa xong' },
                          ...prev
                        ]);
                      }}
                      className="flex-1 py-2 bg-red-50 hover:bg-red-100 text-red-650 border border-red-250 font-black uppercase text-[10px] rounded-xl text-center cursor-pointer"
                    >
                      💸 Trừ chi tiêu -2,500K
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setLedgerBalance(prev => prev + 15000000);
                        setLedgerLogs(prev => [
                          { id: String(prev.length + 1), desc: 'Thu khách hàng chuyển khoản tôn tấm #SO-202', type: 'in', val: 15000000, date: 'Vừa xong' },
                          ...prev
                        ]);
                      }}
                      className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase text-[10px] rounded-xl text-center cursor-pointer shadow-md shadow-emerald-100"
                    >
                      💰 Cộng doanh bán lẻ +15M
                    </button>
                  </div>
                </div>
              )}

              {activeModule === 'sales' && (
                <div className="space-y-4 text-xs font-bold leading-relaxed text-gray-700">
                  <div className="grid grid-cols-3 gap-1.5 text-center text-[9px] font-black uppercase tracking-wider mb-2">
                    <div className="bg-indigo-50 text-indigo-700 py-1.5 rounded-lg border border-indigo-100">1. Tiềm năng</div>
                    <div className="bg-amber-50 text-amber-700 py-1.5 rounded-lg border border-amber-100">2. Báo giá</div>
                    <div className="bg-emerald-50 text-emerald-700 py-1.5 rounded-lg border border-emerald-100">3. Đã xuất</div>
                  </div>

                  <div className="space-y-2">
                    {pipeline.map((item) => (
                      <div key={item.id} className="bg-gray-50 p-2.5 rounded-xl border border-gray-150 flex items-center justify-between text-[10px]">
                        <div>
                          <div className="font-extrabold text-gray-800">{item.name}</div>
                          <div className="text-[8px] text-gray-400 font-semibold mt-0.5">Trị giá: {item.value}</div>
                        </div>

                        <div className="flex gap-1.5 items-center">
                          <select 
                            value={item.step} 
                            onChange={e => {
                              const updated = pipeline.map(x => x.id === item.id ? { ...x, step: e.target.value } : x);
                              setPipeline(updated);
                            }}
                            className="bg-white border border-gray-250 py-1 px-1.5 rounded text-[8px] font-extrabold cursor-pointer text-gray-700"
                          >
                            <option value="lead">Tiềm năng</option>
                            <option value="quote">Báo giá</option>
                            <option value="done">Hoàn thành</option>
                          </select>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="p-3 bg-blue-50/50 rounded-xl border border-blue-100/60 text-[10px] text-blue-800 flex items-start gap-1.5 leading-relaxed">
                    <Info size={14} className="shrink-0 mt-0.5" />
                    <span>Dựa trên trạng thái chọn lọc, bộ đồng bộ sẽ tạo một Đơn hàng bán chờ duyệt trong bảng "Kinh doanh" mà không cần qua app phụ.</span>
                  </div>
                </div>
              )}

              {activeModule === 'warehouse' && (
                <div className="space-y-4 text-xs font-bold leading-relaxed text-gray-750">
                  <div className="space-y-2 max-h-[160px] overflow-auto">
                    {itemsStock.map((item) => {
                      const isDanger = item.qty < item.safetyMin;
                      return (
                        <div key={item.code} className="bg-gray-50/70 p-2.5 rounded-xl border border-gray-150 flex items-center justify-between text-[10px]">
                          <div>
                            <div className="font-extrabold text-gray-800">{item.name}</div>
                            <div className="text-[8px] text-gray-450 font-semibold">Mã: {item.code} | Định định mức tối thiểu: {item.safetyMin}</div>
                          </div>
                          
                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded px-1.5 py-0.5">
                              <button 
                                onClick={() => {
                                  const updated = itemsStock.map(x => x.code === item.code ? { ...x, qty: Math.max(0, x.qty - 1) } : x);
                                  setItemsStock(updated);
                                }}
                                className="px-1 text-red-500 font-black cursor-pointer text-xs"
                              >
                                -
                              </button>
                              <span className="font-mono font-bold text-gray-800 text-[10px] w-6 text-center">{item.qty}</span>
                              <button 
                                onClick={() => {
                                  const updated = itemsStock.map(x => x.code === item.code ? { ...x, qty: x.qty + 1 } : x);
                                  setItemsStock(updated);
                                }}
                                className="px-1 text-emerald-600 font-black cursor-pointer text-xs"
                              >
                                +
                              </button>
                            </div>

                            {isDanger ? (
                              <span className="text-[8px] font-black uppercase text-red-650 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded shrink-0">
                                ⚠ Thấp!
                              </span>
                            ) : (
                              <span className="text-[8px] font-black uppercase text-emerald-650 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded shrink-0">
                                An toàn
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <p className="text-[10px] text-gray-400 italic text-center font-semibold">
                    💡 Thử bấm nút (-) để giảm sút tồn kho của "Tôn cuộn" dẻo xuống dưới 10 mốc để xem cảnh báo tự động bám đuôi.
                  </p>
                </div>
              )}
              {/* END OF SPECIAL PLAYGROUND AREA */}

              {/* Status footer for playground matching colors */}
              <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-[9px] text-gray-400 font-mono">
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  Ready to test with standard flow
                </span>
                <span>Thalex ERP Sandbox v1.0</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Structured Modules Detailed Instruction Sections - Sequential Guide */}
      <h2 className="text-sm font-black text-gray-400 uppercase tracking-widest pt-4">
        Chi tiết nghiệp vụ kết hợp tối ưu giữa các phòng ban
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Department 1: HR & Attendance Sync */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-150 space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <Users size={24} />
          </div>
          <h3 className="text-sm font-black text-gray-900 uppercase tracking-tight">
            I. Đồng bộ hóa giữa Nhân sự (HR) & ToTimesheet chấm công
          </h3>
          <p className="text-xs text-gray-500 font-semibold leading-relaxed">
            Sự rành mạch về việc làm công là gốc rễ của sự minh bạch công cán. Quy trình phối hợp chuẩn hóa diễn ra như sau:
          </p>
          <ul className="space-y-2.5 text-xs text-gray-600 font-bold">
            <li className="flex gap-2 items-start">
              <span className="w-1.5 h-1.5 bg-indigo-600 rounded-full shrink-0 mt-1.5"></span>
              <span><strong>Tạo tài khoản:</strong> Nhân sự thiết lập tài khoản nhân viên mới dựa trên mẫu thư chào mừng.</span>
            </li>
            <li className="flex gap-2 items-start">
              <span className="w-1.5 h-1.5 bg-indigo-600 rounded-full shrink-0 mt-1.5"></span>
              <span><strong>Đối sánh GPS:</strong> HR chủ động cài đặt Vĩ độ - Kinh độ của các trụ sở làm việc tại cài đặt hệ thống để kích hoạt bộ lọc định vị an toàn.</span>
            </li>
            <li className="flex gap-2 items-start">
              <span className="w-1.5 h-1.5 bg-indigo-600 rounded-full shrink-0 mt-1.5"></span>
              <span><strong>Tính công tự động:</strong> Mỗi lượt check-in thông qua toạ độ GPS được đối soát ghi nhận tức thì vào Thẻ chấm công của nhân sự đó cả tháng.</span>
            </li>
          </ul>
        </div>

        {/* Department 2: Finance & Purchase Flow */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-150 space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <DollarSign size={24} />
          </div>
          <h3 className="text-sm font-black text-gray-900 uppercase tracking-tight">
            II. Đề xuất Chi - Lập phiếu chi giải ngân rành mạch hóa
          </h3>
          <p className="text-xs text-gray-500 font-semibold leading-relaxed">
            Nơi xảy ra thất thoát nhiều nhất là khâu mua hàng vận hành. Thalex ERP chặn đứng thất thoát bằng chuỗi khép kín:
          </p>
          <ul className="space-y-2.5 text-xs text-gray-600 font-bold">
            <li className="flex gap-2 items-start">
              <span className="w-1.5 h-1.5 bg-emerald-600 rounded-full shrink-0 mt-1.5"></span>
              <span><strong>Không chi lạm:</strong> Không thể tự ý lập phiếu chi (Disbursement) nếu không phát sinh từ một đề xuất mua hàng được phê duyệt bởi Giám đốc.</span>
            </li>
            <li className="flex gap-2 items-start">
              <span className="w-1.5 h-1.5 bg-emerald-600 rounded-full shrink-0 mt-1.5"></span>
              <span><strong>Đối chiếu Sổ quỹ:</strong> Mọi lượt chi ngân két lập tức được biểu diễn tự động lên Sổ quỹ điện tử của phòng tài chính, hạ trực tiếp số tiền quỹ ròng thời gian thực.</span>
            </li>
            <li className="flex gap-2 items-start">
              <span className="w-1.5 h-1.5 bg-emerald-600 rounded-full shrink-0 mt-1.5"></span>
              <span><strong>Báo cáo tức thì:</strong> Biểu đồ so sánh dòng tiền giúp chủ doanh nghiệp kiểm soát xem chi phí vận hành có vượt mốc trần kế hoạch đặt ra hay không.</span>
            </li>
          </ul>
        </div>
      </div>

      {/* FAQs Section */}
      <div className="bg-white rounded-3xl p-8 border border-gray-150 shadow-xs space-y-6">
        <div>
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Info className="text-indigo-600" size={20} />
            Các câu hỏi thường gặp (FAQs)
          </h2>
          <p className="text-xs text-gray-400 mt-2 font-semibold">
            Tổng hợp giải đáp các khúc mắc phổ thông của người dùng khi vận hành hệ thống Thalex Work Workspace.
          </p>
        </div>

        <div className="space-y-4 divide-y divide-gray-100">
          {[
            {
              q: 'Hệ thống hoạt động trên thiết bị nào? Có cần cài đặt ứng dụng từ cửa hàng CH Play không?',
              a: 'Thalex Work hoạt động mượt mà dưới dạng Web-App (Responsive linh hoạt). Người dùng có thể truy cập bằng điện thoại, máy tính bảng hay laptop thông dụng qua mọi loại trình duyệt mà không cần tốn dụng lượng hoặc tải thêm bất cứ phần mềm phức tạp nào.'
            },
            {
              q: 'Làm thế nào để kích hoạt cổng email gửi mật khẩu tự đông khi thêm mới nhân sự?',
              a: 'Tại mục "Cài đặt tài khoản" -> "Cài đặt hệ thống", Giám đốc cần cung cấp tài khoản SMTP (nhân sự có thể sử dụng mật khẩu ứng dụng Gmail của Google). Kế tiếp hãy bật công tắc "Kích hoạt gửi Email tự động" để kích hoạt dòng nghiệp vụ chào hỏi.'
            },
            {
              q: 'Cơ chế tính công dựa trên các dữ liệu nào của hệ thống?',
              a: 'Bảng tính lương (Payroll) cuối kỳ tự động đồng bộ từ 3 lớp dữ liệu: (1) Lương cơ bản trong cấu hình nhân viên; (2) Số ngày công đi làm chấm qua GPS; (3) Các khoản thưởng, phạt, phụ cấp đã được duyệt rành mạch trong bảng Đề xuất cả tháng.'
            },
            {
              q: 'Cách xử lý nếu viết định dạng mã HTML mẫu email bị lỗi?',
              a: 'Tại thẻ cấu hình email trong "Hồ sơ công ty", bạn chỉ cần click nút "Khôi phục mặc định" màu đỏ góc bên tay phải của trình biên tập và ấn "Lưu thay đổi", hệ thống sẽ tự nạp lại mã HTML nguyên bản định hình tốt nhất.'
            }
          ].map((faq, idx) => {
            return (
              <div key={idx} className="pt-4 first:pt-0">
                <div className="text-xs font-black text-gray-800 leading-snug">❓ {faq.q}</div>
                <p className="text-xs text-gray-500 font-semibold leading-relaxed py-2 pr-8 whitespace-pre-wrap pl-5 mt-1">
                  {faq.a}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer support block */}
      <div className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white p-8 rounded-3xl border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-6">
        <div className="space-y-2">
          <h3 className="text-sm font-extrabold text-slate-100 uppercase tracking-widest flex items-center gap-2">
            <Sparkles size={16} className="text-amber-450" />
            Bạn muốn thiết kế quy trình nghiệp vụ theo mẫu riêng?
          </h3>
          <p className="text-[11px] text-slate-350 font-semibold max-w-2xl leading-relaxed">
            Hệ thống Thalex Work sẵn sàng tuỳ biến, may đo và tích hợp các module theo từng đòi hỏi riêng biệt của quý công ty. Vui lòng gửi email phản hồi trực tiếp cho trưởng ban điều hành.
          </p>
        </div>
        <div className="flex gap-3">
          <a
            href="mailto:info.vinasglobal@gmail.com"
            className="px-5 py-3 bg-white text-indigo-900 hover:bg-slate-50 font-black rounded-xl text-xs uppercase tracking-wider transition-all shadow-md self-stretch flex items-center justify-center cursor-pointer"
          >
            Liên hệ hỗ trợ kỹ thuật
          </a>
        </div>
      </div>
    </div>
  );
}
