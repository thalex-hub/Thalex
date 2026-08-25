import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, db } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, onSnapshot, getDoc, setDoc, deleteDoc, collection, query, limit, getDocs } from 'firebase/firestore';
import { AppUser, UserRole } from '../types';
import { handleFirestoreError, OperationType } from './firestoreUtils';

export const PERMISSIONS = [
  // 1. Đơn hàng & Dự án
  { id: 'view_orders', name: 'Xem danh sách đơn hàng', category: 'Đơn hàng & Dự án', description: 'Xem danh sách và chi tiết các đơn hàng, dự án đang thực hiện', type: 'view' as const },
  { id: 'create_orders', name: 'Tạo mới đơn hàng', category: 'Đơn hàng & Dự án', description: 'Tạo mới đơn đề xuất bán hàng/dự án phê duyệt hành chính', type: 'edit' as const },
  { id: 'edit_orders', name: 'Chỉnh sửa đơn hàng', category: 'Đơn hàng & Dự án', description: 'Chỉnh sửa định mức chi phí, dự toán đơn hàng của cá nhân', type: 'edit' as const },
  { id: 'approve_orders', name: 'Duyệt đơn hàng', category: 'Đơn hàng & Dự án', description: 'Toàn quyền duyệt/từ chối đề xuất đơn hàng/dự án của công ty', type: 'edit' as const },
  { id: 'delete_orders', name: 'Xóa đơn hàng', category: 'Đơn hàng & Dự án', description: 'Xóa đơn hàng đề xuất hoặc đơn hàng nháp ra khỏi hệ thống', type: 'edit' as const },

  // 2. Tạm ứng
  { id: 'view_advances', name: 'Xem yêu cầu tạm ứng', category: 'Tạm ứng', description: 'Xem danh sách và lịch sử thực tế các yêu cầu tạm ứng chi phí', type: 'view' as const },
  { id: 'create_advances', name: 'Yêu cầu tạm ứng mới', category: 'Tạm ứng', description: 'Lập phiếu yêu cầu tạm ứng cho các công việc nghiệp vụ phát sinh', type: 'edit' as const },
  { id: 'approve_advances', name: 'Duyệt yêu cầu tạm ứng', category: 'Tạm ứng', description: 'Phê duyệt định mức tiền ứng và điều khoản thanh toán tạm ứng', type: 'edit' as const },
  { id: 'disburse_advances', name: 'Giải ngân chi tạm ứng', category: 'Tạm ứng', description: 'Xác nhận kế toán thực tế chi tiền tạm ứng cho nhân viên', type: 'edit' as const },

  // 3. Hoàn ứng & Quyết toán
  { id: 'view_reimbursements', name: 'Xem danh sách hoàn ứng', category: 'Hoàn ứng & Quyết toán', description: 'Xem danh sách các yêu cầu hoàn trả & quyết toán chi phí tạm ứng', type: 'view' as const },
  { id: 'create_reimbursements', name: 'Lập quyết toán hoàn ứng', category: 'Hoàn ứng & Quyết toán', description: 'Khai báo hóa đơn, hồ sơ chi tiết để quyết toán số tiền đã ứng', type: 'edit' as const },
  { id: 'approve_reimbursements', name: 'Duyệt hồ sơ hoàn ứng', category: 'Hoàn ứng & Quyết toán', description: 'Xác nhận tính hợp chuẩn của hóa đơn và duyệt số tiền hoàn ứng chênh lệch', type: 'edit' as const },
  { id: 'disburse_reimbursements', name: 'Xử lý dư chi hoàn ứng', category: 'Hoàn ứng & Quyết toán', description: 'Chi trả tiền chênh lệch thiếu hoặc thu hồi tiền dư tạm ứng về quỹ', type: 'edit' as const },

  // 4. Yêu cầu thanh toán
  { id: 'view_payment_requests', name: 'Xem yêu cầu thanh toán', category: 'Yêu cầu thanh toán', description: 'Xem các đề xuất thanh toán trực tiếp/nhà cung cấp/hóa đơn ngoại cảnh', type: 'view' as const },
  { id: 'create_payment_requests', name: 'Lập đề nghị thanh toán', category: 'Yêu cầu thanh toán', description: 'Tạo phiếu yêu cầu chi tiền trả trực tiếp cho đối tác/bên thứ ba', type: 'edit' as const },
  { id: 'approve_payment_requests', name: 'Duyệt đề nghị thanh toán', category: 'Yêu cầu thanh toán', description: 'Xem xét phê duyệt chuyển khoản/thanh toán hóa đơn dịch vụ', type: 'edit' as const },
  { id: 'disburse_payment_requests', name: 'Thanh toán & Chi tiền lẻ', category: 'Yêu cầu thanh toán', description: 'Thực xuất tiền quỹ thanh toán cho các hóa đơn đối tác', type: 'edit' as const },

  // 5. Dòng tiền & Chi phí
  { id: 'view_cashflow', name: 'Xem phân tích dòng tiền', category: 'Dòng tiền & Chi phí', description: 'Truy cập tab Dòng tiền, theo dõi thặng dư và kế hoạch thu chi tích lũy', type: 'view' as const },
  { id: 'manage_cashflow', name: 'Lập phiếu thu/phiếu chi', category: 'Dòng tiền & Chi phí', description: 'Thêm, sửa, xóa các hóa đơn, phiếu thu, phiếu chi thực quỹ tài khoản doanh nghiệp', type: 'edit' as const },
  { id: 'view_financial_reports', name: 'Xem báo cáo thặng dư & P&L', category: 'Dòng tiền & Chi phí', description: 'Truy cập báo cáo phân tích tài chính sâu, KQKD, tổng hợp chi phí vận hành', type: 'view' as const },
  { id: 'approve_disbursements', name: 'Duyệt lệnh chi tiền mặt/NH', category: 'Dòng tiền & Chi phí', description: 'Phê duyệt tối cao các phiếu chi tổng, lệnh chi quỹ lớn của ngân hàng', type: 'edit' as const },

  // 6. Nhân sự & Chấm công
  { id: 'view_users', name: 'Xem thông tin nhân sự', category: 'Nhân sự & Chấm công', description: 'Xem danh sách và thông tin hồ sơ lý lịch nhân viên trong công ty', type: 'view' as const },
  { id: 'manage_users', name: 'Quản lý tài khoản & Tuyển dụng', category: 'Nhân sự & Chấm công', description: 'Khởi tạo tài khoản, ngưng kích hoạt, sửa đổi thông tin chức vụ, phòng ban', type: 'edit' as const },
  { id: 'manage_labor_contracts', name: 'Quản lý hợp đồng lao động', category: 'Nhân sự & Chấm công', description: 'Cho phép xem, tải lên và tải xuống hợp đồng lao động của tất cả nhân viên', type: 'edit' as const },
  { id: 'view_attendance', name: 'Xem bảng chấm công', category: 'Nhân sự & Chấm công', description: 'Theo dõi bảng chấm công, giờ check-in/check-out của toàn nhân viên', type: 'view' as const },
  { id: 'manage_attendance', name: 'Hiệu chỉnh & Chốt công', category: 'Nhân sự & Chấm công', description: 'Sửa lỗi chấm công, chốt ngày công tính lương hàng tháng', type: 'edit' as const },
  { id: 'approve_leave_requests', name: 'Duyệt đơn nghỉ phép', category: 'Nhân sự & Chấm công', description: 'Duyệt đề xuất nghỉ phép năm, phép ốm, đi muộn về sớm từ nhân sự', type: 'edit' as const },
  { id: 'view_salaries', name: 'Xem thông tin bảng lương', category: 'Nhân sự & Chấm công', description: 'Theo dõi chi tiết bảng lương phòng ban, định mức tiền lương cơ bản', type: 'view' as const },
  { id: 'manage_salaries', name: 'Tính lương & Cấu hình định mức', category: 'Nhân sự & Chấm công', description: 'Cài đặt định mức lương, phụ cấp, tính lương thực nhận hàng tháng', type: 'edit' as const },

  // 7. Khách hàng & CRM
  { id: 'view_customers', name: 'Xem danh sách khách hàng', category: 'Khách hàng & CRM', description: 'Xem thông tin liên hệ, lịch sử đơn hàng của khách hàng/đối tác doanh nghiệp', type: 'view' as const },
  { id: 'manage_customers', name: 'Quản lý thông tin khách hàng', category: 'Khách hàng & CRM', description: 'Thêm mới, chỉnh sửa thông tin giao dịch, phân loại nhóm khách hàng', type: 'edit' as const },

  // 8. Công việc & Phân công
  { id: 'view_tasks', name: 'Xem danh sách công việc', category: 'Công việc & Phân công', description: 'Xem các tác vụ, đầu việc, tiến độ dự án chung toàn bộ phận', type: 'view' as const },
  { id: 'manage_tasks', name: 'Tạo & Giao việc chi tiết', category: 'Công việc & Phân công', description: 'Khởi tạo công việc mới, phân công nhân sự chịu trách nhiệm và đặt hạn định', type: 'edit' as const },

  // 9. Kho & Sản phẩm
  { id: 'view_warehouse', name: 'Xem kho và giá sản phẩm', category: 'Kho & Sản phẩm', description: 'Theo dõi số lượng tồn kho, giá bán sản phẩm, vị trí định dạng sản phẩm', type: 'view' as const },
  { id: 'manage_warehouse', name: 'Nhập xuất kho & Quy chuẩn', category: 'Kho & Sản phẩm', description: 'Khởi tạo giao dịch nhập kho, xuất kho, kiểm kho định kỳ và cấu hình sản phẩm', type: 'edit' as const },

  // 10. Lưu trữ tài liệu
  { id: 'view_storage', name: 'Xem thư mục lưu trữ', category: 'Lưu trữ tài liệu', description: 'Truy cập kho lưu trữ hình ảnh, hồ sơ chứng từ, file PDF chung của công ty', type: 'view' as const },
  { id: 'manage_storage', name: 'Tải và Xóa tài liệu', category: 'Lưu trữ tài liệu', description: 'Quyền tải tệp tin lên uploader chung, tạo thư mục mới hoặc dọn dẹp tài liệu cũ', type: 'edit' as const },

  // 11. Cấu hình hệ thống
  { id: 'view_settings', name: 'Xem cấu hình chung', category: 'Cấu hình hệ thống', description: 'Cho phép truy cập xem các cài đặt hệ thống', type: 'view' as const },
  { id: 'manage_settings', name: 'Cấu hình tham số doanh nghiệp', category: 'Cấu hình hệ thống', description: 'Toàn quyền chỉnh sửa thông tin công ty, logo, các quy định định mức chiết khấu chung', type: 'edit' as const },

  // 12. Phân quyền Module Menu
  { id: 'menu_dashboard_view', name: 'Truy cập & Xem Dashboard', category: 'Phân quyền Module Menu', description: 'Cho phép truy cập xem trang Dashboard tổng quan', type: 'view' as const },
  { id: 'menu_dashboard_edit', name: 'Quản trị/Hiệu chỉnh Dashboard', category: 'Phân quyền Module Menu', description: 'Cho phép cập nhật các cấu hình thông tin hiển thị trên Dashboard chính', type: 'edit' as const },

  { id: 'menu_storage_view', name: 'Truy cập & Xem Lưu trữ', category: 'Phân quyền Module Menu', description: 'Cho phép xem dữ liệu và tải tài liệu trong thư mục lưu trữ', type: 'view' as const },
  { id: 'menu_storage_edit', name: 'Quản trị/Nhập xuất trong Lưu trữ', category: 'Phân quyền Module Menu', description: 'Cho phép tải lên tệp mới, tạo thư mục và dọn dẹp tài liệu cũ', type: 'edit' as const },

  { id: 'menu_business_view', name: 'Truy cập & Xem Cài đặt tài khoản & quyền', category: 'Phân quyền Module Menu', description: 'Cho phép xem danh sách tài khoản, phòng ban, phân quyền và lịch sử hoạt động', type: 'view' as const },
  { id: 'menu_business_edit', name: 'Quản trị Cài đặt tài khoản & quyền', category: 'Phân quyền Module Menu', description: 'Cho phép thêm mới, chỉnh sửa, xóa phòng ban, chức vụ, tài khoản nhân viên và thiết lập phân quyền', type: 'edit' as const },

  { id: 'menu_salary_settings_view', name: 'Truy cập & Xem Quản lý Lương', category: 'Phân quyền Module Menu', description: 'Cho phép xem các định mức khấu trừ lương và bảng tính lương tháng', type: 'view' as const },
  { id: 'menu_salary_settings_edit', name: 'Tính Lương/Hiệu chỉnh định mức lương', category: 'Phân quyền Module Menu', description: 'Cho phép tính lương thực nhận, phê duyệt đóng băng và khóa bảng lương', type: 'edit' as const },

  { id: 'menu_business_expenses_view', name: 'Truy cập & Xem Chi phí vận hành', category: 'Phân quyền Module Menu', description: 'Cho phép xem danh sách hóa đơn chi phí và báo cáo thặng dư', type: 'view' as const },
  { id: 'menu_business_expenses_edit', name: 'Quản trị Chi phí vận hành', category: 'Phân quyền Module Menu', description: 'Cho phép thêm mới, sửa đổi, duyệt hoặc loại bỏ chứng từ hóa đơn', type: 'edit' as const },

  { id: 'menu_cash_flow_view', name: 'Truy cập & Xem Quản trị dòng tiền', category: 'Phân quyền Module Menu', description: 'Cho phép xem báo cáo dòng tiền tích lũy và kiểm kê nhật ký', type: 'view' as const },
  { id: 'menu_cash_flow_edit', name: 'Quản trị dòng tiền & Giao dịch', category: 'Phân quyền Module Menu', description: 'Cho phép lập các phiếu thu, phiếu chi thực tế quỹ dòng tiền tài chính', type: 'edit' as const },

  { id: 'menu_sales_management_view', name: 'Truy cập & Xem Quản lý bán hàng', category: 'Phân quyền Module Menu', description: 'Cho phép xem kết quả phân tích chỉ số doanh thu thương mại', type: 'view' as const },
  { id: 'menu_sales_management_edit', name: 'Quản trị bán hàng & Chiết khấu', category: 'Phân quyền Module Menu', description: 'Cho phép thiết lập chỉ tiêu bán hàng, cấu hình định định mức chiết khấu áp dụng', type: 'edit' as const },

  { id: 'menu_disbursements_view', name: 'Truy cập & Xem Duyệt chi tiền', category: 'Phân quyền Module Menu', description: 'Cho phép xem tiến độ giải ngân của các lệnh chi và đề xuất tiền mặt', type: 'view' as const },
  { id: 'menu_disbursements_edit', name: 'Quản trị Duyệt chi & Lập lệnh', category: 'Phân quyền Module Menu', description: 'Cho phép thực trực tiếp giải ngân phi quỹ hoặc lập quyết toán chuyển khoản lớn', type: 'edit' as const },

  { id: 'menu_hr_view', name: 'Truy cập & Xem Quản lý nhân sự', category: 'Phân quyền Module Menu', description: 'Cho phép xem lý lịch trích ngang, hợp đồng chính thức và cơ cấu tổ chức', type: 'view' as const },
  { id: 'menu_hr_edit', name: 'Quản trị Nhân sự & Tuyển dụng', category: 'Phân quyền Module Menu', description: 'Cho phép tuyển dụng khởi tạo tài khoản nhân viên mới, sửa đổi thông tin chức vụ hoặc đình chỉ hoạt động', type: 'edit' as const },

  { id: 'menu_attendance_view', name: 'Truy cập & Xem Chấm công', category: 'Phân quyền Module Menu', description: 'Cho phép theo dõi nhật lý chấm công, lịch sử check-in/out thực tế toàn cơ quan', type: 'view' as const },
  { id: 'menu_attendance_edit', name: 'Hiệu chỉnh & Chốt Chấm công', category: 'Phân quyền Module Menu', description: 'Cho phép bổ sung ngày công, gỡ lỗi điểm danh và đóng băng chốt ngày công tính toán', type: 'edit' as const },

  { id: 'menu_payroll_view', name: 'Truy cập & Xem Lương cá nhân', category: 'Phân quyền Module Menu', description: 'Cho phép nhân sự tự tra cứu trực tuyến phiếu thu nhập của mình theo chu kỳ tháng', type: 'view' as const },
  { id: 'menu_payroll_edit', name: 'Kiến nghị & Sửa thông tin Lương cá nhân', category: 'Phân quyền Module Menu', description: 'Cho phép thực hiện gửi báo phản hồi thắc mắc về phiếu lương của bản thân', type: 'edit' as const },

  { id: 'menu_tasks_view', name: 'Truy cập & Xem Công việc', category: 'Phân quyền Module Menu', description: 'Cho phép xem danh sách đầu công việc cá nhân và tiến độ chung', type: 'view' as const },
  { id: 'menu_tasks_edit', name: 'Khởi tạo & Quản lý Phân công việc', category: 'Phân quyền Module Menu', description: 'Cho phép kiến lập các công việc mới, chỉ định người chịu trách nhiệm và thay đổi thời hạn', type: 'edit' as const },

  { id: 'menu_proposals_view', name: 'Truy cập & Xem Đề xuất', category: 'Phân quyền Module Menu', description: 'Cho phép theo dõi trạng thái các loại đơn đề trình duyệt hành chính cá nhân', type: 'view' as const },
  { id: 'menu_proposals_edit', name: 'Kiến tạo & Phê duyệt Đề xuất', category: 'Phân quyền Module Menu', description: 'Phê duyệt các yêu cầu nghỉ phép, xin tạm ứng chi hoặc hồ sơ hoàn trả chênh quỹ', type: 'edit' as const },

  { id: 'menu_orders_view', name: 'Truy cập & Xem Đơn hàng', category: 'Phân quyền Module Menu', description: 'Cho phép quản lý danh mục và tài liệu chi tiết của từng hợp đồng đơn hàng', type: 'view' as const },
  { id: 'menu_orders_edit', name: 'Khởi tạo & Điều phối Đơn hàng', category: 'Phân quyền Module Menu', description: 'Sửa dự toán gói ngân sách hợp đồng đơn hàng, đổi trạng thái điều phối thầu phụ', type: 'edit' as const },

  { id: 'menu_warehouse_view', name: 'Truy cập & Xem Kho hàng', category: 'Phân quyền Module Menu', description: 'Xem thông tin lượng tồn thực, bảng giá bán niêm yết thương phẩm', type: 'view' as const },
  { id: 'menu_warehouse_edit', name: 'Quản trị Kho, Nhập xuất & Sản phẩm', category: 'Phân quyền Module Menu', description: 'Khởi tạo danh bạ sản phẩm, chỉ đạo làm phiếu nhập xuât kho thương mại thực tiễn', type: 'edit' as const },

  { id: 'menu_customers_view', name: 'Truy cập & Xem Khách hàng', category: 'Phân quyền Module Menu', description: 'Tra cứu thông tin liên hệ và lịch sử giao tế đối tác khách hàng toàn cơ quan', type: 'view' as const },
  { id: 'menu_customers_edit', name: 'Cấu hình & Cập nhật Khách hàng', category: 'Phân quyền Module Menu', description: 'Thêm hồ sơ cơ sở, thay đổi hạng phân loại đại lý, lịch trình chăm sóc dự án', type: 'edit' as const },

  { id: 'menu_settings_view', name: 'Truy cập & Xem Cài đặt chung', category: 'Phân quyền Module Menu', description: 'Xem cấu hình các tham số và chính sách doanh nghiệp áp dụng', type: 'view' as const },
  { id: 'menu_settings_edit', name: 'Thiết lập & Thay đổi Cài đặt chung', category: 'Phân quyền Module Menu', description: 'Thay đổi đầy đủ các loại tham số cơ bản, định mức công ty, tải lên logo đại diện', type: 'edit' as const }
];

const ALL_MENUS = [
  'menu_dashboard_view', 'menu_dashboard_edit', 'menu_storage_view', 'menu_storage_edit', 'menu_business_view', 'menu_business_edit',
  'menu_salary_settings_view', 'menu_salary_settings_edit', 'menu_business_expenses_view', 'menu_business_expenses_edit',
  'menu_cash_flow_view', 'menu_cash_flow_edit', 'menu_sales_management_view', 'menu_sales_management_edit',
  'menu_disbursements_view', 'menu_disbursements_edit', 'menu_hr_view', 'menu_hr_edit', 'menu_attendance_view', 'menu_attendance_edit',
  'menu_payroll_view', 'menu_payroll_edit', 'menu_tasks_view', 'menu_tasks_edit', 'menu_proposals_view', 'menu_proposals_edit',
  'menu_orders_view', 'menu_orders_edit', 'menu_warehouse_view', 'menu_warehouse_edit', 'menu_customers_view', 'menu_customers_edit',
  'menu_settings_view', 'menu_settings_edit'
];

const HR_MENUS = [
  'menu_dashboard_view', 'menu_dashboard_edit',
  'menu_storage_view', 'menu_storage_edit',
  'menu_business_view', 'menu_business_edit',
  'menu_salary_settings_view', 'menu_salary_settings_edit',
  'menu_hr_view', 'menu_hr_edit',
  'menu_attendance_view', 'menu_attendance_edit',
  'menu_payroll_view',
  'menu_tasks_view', 'menu_tasks_edit',
  'menu_proposals_view', 'menu_proposals_edit',
  'menu_orders_view', 'menu_orders_edit',
  'menu_settings_view'
];

const TECH_MENUS = [
  'menu_dashboard_view',
  'menu_storage_view',
  'menu_attendance_view',
  'menu_payroll_view',
  'menu_tasks_view', 'menu_tasks_edit',
  'menu_proposals_view', 'menu_proposals_edit',
  'menu_orders_view', 'menu_orders_edit',
  'menu_warehouse_view', 'menu_warehouse_edit',
  'menu_settings_view'
];

const SALES_MENUS = [
  'menu_dashboard_view',
  'menu_storage_view',
  'menu_attendance_view',
  'menu_payroll_view',
  'menu_tasks_view', 'menu_tasks_edit',
  'menu_proposals_view', 'menu_proposals_edit',
  'menu_orders_view', 'menu_orders_edit',
  'menu_warehouse_view',
  'menu_customers_view', 'menu_customers_edit',
  'menu_settings_view'
];

const LEADING_ACCOUNTANT_MENUS = [
  'menu_dashboard_view', 'menu_dashboard_edit',
  'menu_storage_view', 'menu_storage_edit',
  'menu_salary_settings_view', 'menu_salary_settings_edit',
  'menu_business_expenses_view', 'menu_business_expenses_edit',
  'menu_cash_flow_view', 'menu_cash_flow_edit',
  'menu_disbursements_view', 'menu_disbursements_edit',
  'menu_hr_view',
  'menu_attendance_view',
  'menu_payroll_view', 'menu_payroll_edit',
  'menu_tasks_view',
  'menu_proposals_view', 'menu_proposals_edit',
  'menu_orders_view',
  'menu_warehouse_view',
  'menu_customers_view',
  'menu_settings_view'
];

const GENERAL_STAFF_MENUS = [
  'menu_dashboard_view',
  'menu_storage_view',
  'menu_attendance_view',
  'menu_payroll_view',
  'menu_tasks_view',
  'menu_proposals_view', 'menu_proposals_edit',
  'menu_orders_view', 'menu_orders_edit',
  'menu_warehouse_view',
  'menu_customers_view',
  'menu_settings_view'
];

export const DEFAULT_ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  SuperAdmin: PERMISSIONS.map(p => p.id),
  Director: PERMISSIONS.map(p => p.id),
  ViceDirector: PERMISSIONS.map(p => p.id),
  HRManager: [
    'view_users', 'manage_users', 'manage_labor_contracts', 'view_attendance', 'manage_attendance', 'approve_leave_requests', 'view_salaries', 'manage_salaries',
    'view_tasks', 'manage_tasks',
    'view_storage', 'manage_storage',
    'view_orders',
    ...HR_MENUS
  ],
  HRStaff: [
    'view_users', 'manage_labor_contracts', 'view_attendance', 'manage_attendance',
    'view_tasks',
    'view_storage',
    'view_orders',
    ...HR_MENUS
  ],
  ChiefAccountant: [
    'view_orders',
    'view_advances', 'approve_advances', 'disburse_advances',
    'view_reimbursements', 'approve_reimbursements', 'disburse_reimbursements',
    'view_payment_requests', 'approve_payment_requests', 'disburse_payment_requests',
    'view_cashflow', 'manage_cashflow', 'view_financial_reports', 'approve_disbursements',
    'view_users', 'view_attendance', 'view_salaries', 'manage_salaries',
    'view_customers',
    'view_warehouse', 'manage_warehouse',
    'view_storage', 'manage_storage',
    ...LEADING_ACCOUNTANT_MENUS
  ],
  AccountantStaff: [
    'view_orders',
    'view_advances', 'disburse_advances',
    'view_reimbursements', 'disburse_reimbursements',
    'view_payment_requests', 'disburse_payment_requests',
    'view_cashflow',
    'view_users', 'view_attendance', 'view_salaries',
    'view_customers',
    'view_warehouse',
    'view_storage',
    ...LEADING_ACCOUNTANT_MENUS
  ],
  GeneralManager: [
    'view_orders', 'create_orders', 'edit_orders', 'approve_orders',
    'view_advances', 'create_advances', 'approve_advances',
    'view_reimbursements', 'create_reimbursements', 'approve_reimbursements',
    'view_payment_requests', 'create_payment_requests', 'approve_payment_requests',
    'view_cashflow', 'view_financial_reports',
    'view_users', 'view_attendance', 'approve_leave_requests', 'view_salaries',
    'view_customers', 'manage_customers',
    'view_tasks', 'manage_tasks',
    'view_warehouse',
    'view_storage', 'manage_storage',
    ...ALL_MENUS
  ],
  GeneralStaff: [
    'view_orders', 'create_orders', 'edit_orders',
    'view_advances', 'create_advances',
    'view_reimbursements', 'create_reimbursements',
    'view_payment_requests', 'create_payment_requests',
    'view_customers',
    'view_tasks',
    'view_warehouse',
    'view_storage',
    ...GENERAL_STAFF_MENUS
  ],
  SalesManager: [
    'view_orders', 'create_orders', 'edit_orders', 'approve_orders',
    'view_advances', 'create_advances', 'approve_advances',
    'view_reimbursements', 'create_reimbursements', 'approve_reimbursements',
    'view_payment_requests', 'create_payment_requests', 'approve_payment_requests',
    'view_customers', 'manage_customers',
    'view_tasks', 'manage_tasks',
    'view_warehouse',
    'view_storage',
    ...SALES_MENUS
  ],
  SalesStaff: [
    'view_orders', 'create_orders', 'edit_orders',
    'view_advances', 'create_advances',
    'view_reimbursements', 'create_reimbursements',
    'view_payment_requests', 'create_payment_requests',
    'view_customers',
    'view_tasks',
    'view_warehouse',
    'view_storage',
    ...SALES_MENUS
  ],
  TechnicalManager: [
    'view_orders',
    'view_advances', 'create_advances',
    'view_reimbursements', 'create_reimbursements',
    'view_payment_requests', 'create_payment_requests',
    'view_customers',
    'view_tasks', 'manage_tasks',
    'view_warehouse', 'manage_warehouse',
    'view_storage', 'manage_storage',
    ...TECH_MENUS
  ],
  TechnicalStaff: [
    'view_orders',
    'view_tasks',
    'view_warehouse',
    'view_storage',
    ...TECH_MENUS
  ],
  Manager: [
    'view_orders', 'create_orders', 'edit_orders', 'approve_orders',
    'view_advances', 'create_advances', 'approve_advances',
    'view_reimbursements', 'create_reimbursements', 'approve_reimbursements',
    'view_payment_requests', 'create_payment_requests', 'approve_payment_requests',
    'view_cashflow', 'view_financial_reports',
    'view_users', 'view_attendance', 'approve_leave_requests', 'view_salaries',
    'view_customers', 'manage_customers',
    'view_tasks', 'manage_tasks',
    'view_warehouse',
    'view_storage', 'manage_storage',
    ...ALL_MENUS
  ],
  Accountant: [
    'view_orders',
    'view_advances', 'approve_advances', 'disburse_advances',
    'view_reimbursements', 'approve_reimbursements', 'disburse_reimbursements',
    'view_payment_requests', 'approve_payment_requests', 'disburse_payment_requests',
    'view_cashflow', 'manage_cashflow', 'view_financial_reports', 'approve_disbursements',
    'view_users', 'view_attendance', 'view_salaries', 'manage_salaries',
    'view_customers',
    'view_warehouse', 'manage_warehouse',
    'view_storage', 'manage_storage',
    ...LEADING_ACCOUNTANT_MENUS
  ],
  ketoan: [
    'view_orders', 'approve_orders',
    'view_advances', 'approve_advances', 'disburse_advances',
    'view_reimbursements', 'approve_reimbursements', 'disburse_reimbursements',
    'view_payment_requests', 'approve_payment_requests', 'disburse_payment_requests',
    'view_cashflow', 'manage_cashflow', 'view_financial_reports', 'approve_disbursements',
    'view_users', 'view_attendance', 'view_salaries', 'manage_salaries',
    'view_customers',
    'view_warehouse', 'manage_warehouse',
    'view_storage', 'manage_storage',
    ...LEADING_ACCOUNTANT_MENUS
  ],
  'kế toán': [
    'view_orders', 'approve_orders',
    'view_advances', 'approve_advances', 'disburse_advances',
    'view_reimbursements', 'approve_reimbursements', 'disburse_reimbursements',
    'view_payment_requests', 'approve_payment_requests', 'disburse_payment_requests',
    'view_cashflow', 'manage_cashflow', 'view_financial_reports', 'approve_disbursements',
    'view_users', 'view_attendance', 'view_salaries', 'manage_salaries',
    'view_customers',
    'view_warehouse', 'manage_warehouse',
    'view_storage', 'manage_storage',
    ...LEADING_ACCOUNTANT_MENUS
  ],
  ketoantruong: [
    'view_orders', 'approve_orders',
    'view_advances', 'approve_advances', 'disburse_advances',
    'view_reimbursements', 'approve_reimbursements', 'disburse_reimbursements',
    'view_payment_requests', 'approve_payment_requests', 'disburse_payment_requests',
    'view_cashflow', 'manage_cashflow', 'view_financial_reports', 'approve_disbursements',
    'view_users', 'view_attendance', 'view_salaries', 'manage_salaries',
    'view_customers',
    'view_warehouse', 'manage_warehouse',
    'view_storage', 'manage_storage',
    ...LEADING_ACCOUNTANT_MENUS
  ],
  'kế toán trưởng': [
    'view_orders', 'approve_orders',
    'view_advances', 'approve_advances', 'disburse_advances',
    'view_reimbursements', 'approve_reimbursements', 'disburse_reimbursements',
    'view_payment_requests', 'approve_payment_requests', 'disburse_payment_requests',
    'view_cashflow', 'manage_cashflow', 'view_financial_reports', 'approve_disbursements',
    'view_users', 'view_attendance', 'view_salaries', 'manage_salaries',
    'view_customers',
    'view_warehouse', 'manage_warehouse',
    'view_storage', 'manage_storage',
    ...LEADING_ACCOUNTANT_MENUS
  ],
  HR: [
    'view_users', 'manage_users', 'view_attendance', 'manage_attendance', 'approve_leave_requests', 'view_salaries', 'manage_salaries',
    'view_tasks', 'manage_tasks',
    'view_storage', 'manage_storage',
    'view_orders',
    ...HR_MENUS
  ],
  nhansu: [
    'view_users', 'manage_users', 'view_attendance', 'manage_attendance', 'approve_leave_requests', 'view_salaries', 'manage_salaries',
    'view_tasks', 'manage_tasks',
    'view_storage', 'manage_storage',
    'view_orders',
    ...HR_MENUS
  ],
  'nhân sự': [
    'view_users', 'manage_users', 'view_attendance', 'manage_attendance', 'approve_leave_requests', 'view_salaries', 'manage_salaries',
    'view_tasks', 'manage_tasks',
    'view_storage', 'manage_storage',
    'view_orders',
    ...HR_MENUS
  ],
  NhanSu: [
    'view_users', 'manage_users', 'view_attendance', 'manage_attendance', 'approve_leave_requests', 'view_salaries', 'manage_salaries',
    'view_tasks', 'manage_tasks',
    'view_storage', 'manage_storage',
    'view_orders',
    ...HR_MENUS
  ],
  'Nhân sự': [
    'view_users', 'manage_users', 'view_attendance', 'manage_attendance', 'approve_leave_requests', 'view_salaries', 'manage_salaries',
    'view_tasks', 'manage_tasks',
    'view_storage', 'manage_storage',
    'view_orders',
    ...HR_MENUS
  ],
  Staff: [
    'view_orders', 'create_orders', 'edit_orders',
    'view_advances', 'create_advances',
    'view_reimbursements', 'create_reimbursements',
    'view_payment_requests', 'create_payment_requests',
    'view_customers',
    'view_tasks',
    'view_warehouse',
    'view_storage',
    ...GENERAL_STAFF_MENUS
  ]
};

interface AuthContextType {
  user: User | null;
  appUser: AppUser | null;
  loading: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  isDirector: boolean;
  isManager: boolean;
  isAccountant: boolean;
  isHR: boolean;
  isGeneral: boolean;
  isLeader: boolean;
  isFinanceStaff: boolean;
  canViewSalaries: boolean;
  canEditSalaries: boolean;
  hasPermission: (permissionId: string) => boolean;
  rolePermissions: Record<string, string[]>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  appUser: null,
  loading: true,
  isAdmin: false,
  isSuperAdmin: false,
  isDirector: false,
  isManager: false,
  isAccountant: false,
  isHR: false,
  isGeneral: false,
  isLeader: false,
  isFinanceStaff: false,
  canViewSalaries: false,
  canEditSalaries: false,
  hasPermission: () => false,
  rolePermissions: {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribeDoc: (() => void) | null = null;

    const handleAuthStateChanged = async (u: User | null) => {
      setLoading(true);
      setUser(u);
      
      if (unsubscribeDoc) {
        unsubscribeDoc();
        unsubscribeDoc = null;
      }

      if (u) {
        try {
          const userRef = doc(db, 'users', u.uid);
          
          // Try to load from cache immediately to prevent flashing/logout
          const cached = localStorage.getItem(`app_user_${u.uid}`);
          if (cached) {
            try {
              setAppUser(JSON.parse(cached));
            } catch (e) {
              console.error("Failed to parse cached app user", e);
            }
          }

          // Use onSnapshot for real-time updates
          unsubscribeDoc = onSnapshot(userRef, (snapshot) => {
            if (snapshot.exists()) {
              const data = snapshot.data() as any;
              const email = u.email || data.email || '';
              const expectedLegacyId = email ? email.trim().toLowerCase().replace(/[^a-z0-9]/g, '_') : '';
              
              const isSystemAdminEmail = u.email === 'info.vinasglobal@gmail.com' || u.email === 'vietnhan@thalex.com.vn' || u.email === 'vietnhan@thalex.vn' || u.email === 'thangcd11@gmail.com' || u.email === 'vanquy@thalex.com.vn';
              const isNgocVan = u.email === 'ngocvan@thalex.com.vn' || u.email === 'ngocvan@thalex.vn';
              
              if (isSystemAdminEmail && (data.accountStatus !== 'active' || (u.email === 'info.vinasglobal@gmail.com' && data.roleId !== 'SuperAdmin') || !data.legacyId)) {
                const refreshed = {
                  ...data,
                  accountStatus: 'active' as const,
                  roleId: (u.email === 'info.vinasglobal@gmail.com' ? 'SuperAdmin' : (data.roleId || 'Director')) as any,
                  legacyId: expectedLegacyId,
                };
                setDoc(userRef, refreshed, { merge: true }).catch(err => console.error("Self-heal write failed", err));
                setAppUser(refreshed);
                localStorage.setItem(`app_user_${u.uid}`, JSON.stringify(refreshed));
              } else if (isNgocVan) {
                const required = [
                  'manage_warehouse', 'menu_warehouse_edit', 'view_warehouse', 'menu_warehouse_view', 
                  'edit_orders', 'view_orders', 'menu_orders_view', 'menu_orders_edit', 'approve_orders',
                  'create_orders', 'manage_tasks', 'menu_tasks_edit', 'view_tasks'
                ];
                const currentPerms = data.permissions || [];
                const missing = required.filter(p => !currentPerms.includes(p));
                if (missing.length > 0 || data.roleId !== 'Director') {
                  const refreshed = {
                    ...data,
                    roleId: 'Director',
                    permissions: [...new Set([...currentPerms, ...required])]
                  };
                  setDoc(userRef, refreshed, { merge: true }).catch(err => console.error("NgocVan self-heal failed", err));
                  setAppUser(refreshed);
                  localStorage.setItem(`app_user_${u.uid}`, JSON.stringify(refreshed));
                } else {
                  setAppUser(data);
                  localStorage.setItem(`app_user_${u.uid}`, JSON.stringify(data));
                }
              } else if (data.accountStatus === 'pending' || !data.legacyId) {
                const refreshed = {
                  ...data,
                  accountStatus: 'active' as const,
                  legacyId: expectedLegacyId,
                };
                setDoc(userRef, refreshed, { merge: true }).catch(err => console.error("Self-heal write failed", err));
                setAppUser(refreshed);
                localStorage.setItem(`app_user_${u.uid}`, JSON.stringify(refreshed));
              } else {
                setAppUser(data);
                localStorage.setItem(`app_user_${u.uid}`, JSON.stringify(data));
              }
              setLoading(false);
            } else {
              // User document not found. If system admin, self-heal immediately!
              const isSystemAdminEmail = u.email === 'info.vinasglobal@gmail.com' || u.email === 'vietnhan@thalex.com.vn' || u.email === 'vietnhan@thalex.vn' || u.email === 'thangcd11@gmail.com' || u.email === 'vanquy@thalex.com.vn';
              if (isSystemAdminEmail) {
                const expectedLegacyId = u.email ? u.email.trim().toLowerCase().replace(/[^a-z0-9]/g, '_') : '';
                const newUser = {
                  uid: u.uid,
                  fullName: u.email === 'info.vinasglobal@gmail.com' ? 'Super Admin' : (u.email === 'vanquy@thalex.com.vn' ? 'Văn Quý' : 'Nguyễn Việt Nhân'),
                  email: u.email,
                  avatar: `https://ui-avatars.com/api/?name=${u.email === 'info.vinasglobal@gmail.com' ? 'Super+Admin' : (u.email === 'vanquy@thalex.com.vn' ? 'Van+Quy' : 'Viet+Nhan')}&background=random`,
                  roleId: u.email === 'info.vinasglobal@gmail.com' ? 'SuperAdmin' : 'Director',
                  workStatus: 'official',
                  accountStatus: 'active',
                  legacyId: expectedLegacyId,
                  createdAt: new Date().toISOString(),
                };
                setDoc(userRef, newUser).catch(err => console.error("Self-heal create failed", err));
                setAppUser(newUser as any);
              } else {
                if (u.email) {
                  const tempId = u.email.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
                  if (tempId !== u.uid) {
                    getDoc(doc(db, 'users', tempId)).then(tempSnap => {
                      if (tempSnap.exists()) {
                        const pendingData = tempSnap.data() as any;
                        if (pendingData.accountStatus !== 'locked') {
                          const { tempPassword: _, ...data } = pendingData;
                          const linkedData = {
                            ...data,
                            uid: u.uid,
                            legacyId: tempId,
                            needsPasswordChange: data.needsPasswordChange ?? false,
                            accountStatus: 'active'
                          };
                          setDoc(userRef, linkedData).then(() => {
                            deleteDoc(doc(db, 'users', tempId)).catch(() => {});
                            setAppUser(linkedData as AppUser);
                            setLoading(false);
                          }).catch(() => {
                            setLoading(false);
                          });
                          return;
                        }
                      }
                      
                      // Fallback: search by email to heal disconnected accounts
                      import('firebase/firestore').then(({ query, collection, where, getDocs }) => {
                        const q = query(collection(db, 'users'), where('email', '==', u.email));
                        getDocs(q).then(qSnap => {
                          if (!qSnap.empty) {
                            const oldDoc = qSnap.docs[0];
                            const data = oldDoc.data() as AppUser;
                            if (oldDoc.id === u.uid) return;
                            if (data.accountStatus !== 'locked') {
                              const linkedData = { ...data, uid: u.uid };
                              setDoc(userRef, linkedData).then(() => {
                                deleteDoc(oldDoc.ref).catch(() => {});
                                setAppUser(linkedData as AppUser);
                                setLoading(false);
                              }).catch(() => {
                                setLoading(false);
                              });
                              return;
                            }
                          }
                          setLoading(false);
                        }).catch(() => {
                          setLoading(false);
                        });
                      });
                    }).catch(() => {
                      setLoading(false);
                    });
                    return;
                  }
                }
              }
              setLoading(false);
            }
          }, (error) => {
            console.error("User snapshot error:", error);
            handleFirestoreError(error, OperationType.GET, `users/${u.uid}`, false);
            // On snapshot error, we ALREADY tried to load from cache at the start
            setLoading(false);
          });

        } catch (error) {
          console.error("User initial fetch error:", error);
          handleFirestoreError(error, OperationType.GET, `users/${u.uid}`, false);
          setLoading(false);
        }
      } else {
        setAppUser(null);
        setLoading(false);
      }
    };

    // Safety check to clear stuck verification flag
    if (typeof window !== 'undefined' && sessionStorage.getItem('is_verifying_login') === 'true') {
      const timeoutId = setTimeout(() => {
        if (loading) {
          console.warn("Auth verification stuck, clearing flag...");
          sessionStorage.removeItem('is_verifying_login');
          // If we have a user but are stuck, trigger handleAuthStateChanged manually
          if (auth.currentUser) {
            handleAuthStateChanged(auth.currentUser);
          } else {
            setLoading(false);
          }
        }
      }, 10000); // 10 seconds safety
      
      const unsubscribeAuth = onAuthStateChanged(auth, async (u) => {
        // Prevent flashing during JIT authentication by ignoring updates 
        if (typeof window !== 'undefined' && sessionStorage.getItem('is_verifying_login') === 'true') {
          return;
        }
        handleAuthStateChanged(u);
      });

      return () => {
        clearTimeout(timeoutId);
        unsubscribeAuth();
      };
    }

    const unsubscribeAuth = onAuthStateChanged(auth, async (u) => {
      // Prevent flashing during JIT authentication by ignoring updates 
      if (typeof window !== 'undefined' && sessionStorage.getItem('is_verifying_login') === 'true') {
        return;
      }
      handleAuthStateChanged(u);
    });

    const handleVerifyDone = () => {
      handleAuthStateChanged(auth.currentUser);
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('auth_verify_done', handleVerifyDone);
    }

    return () => {
      unsubscribeAuth();
      if (unsubscribeDoc) unsubscribeDoc();
      if (typeof window !== 'undefined') {
        window.removeEventListener('auth_verify_done', handleVerifyDone);
      }
    };
  }, []);

  const [rolePermissions, setRolePermissions] = useState<Record<string, string[]>>({});

  useEffect(() => {
    if (!user) {
      setRolePermissions({});
      return;
    }

    const fetchAllData = async () => {
      try {
        // Try to load from cache first to show something immediately and save quota
        const cachedPerms = sessionStorage.getItem('app_role_permissions');
        const lastFetch = sessionStorage.getItem('app_auth_last_fetch');
        
        if (cachedPerms && lastFetch) {
          const age = Date.now() - Number(lastFetch);
          if (age < 300000) { // 5 minutes fresh
            setRolePermissions(JSON.parse(cachedPerms));
            return;
          }
        }

        const permsSnap = await getDocs(query(collection(db, 'role_permissions'), limit(100)));
        const perms: Record<string, string[]> = {};
        permsSnap.docs.forEach(doc => {
          perms[doc.id] = doc.data().permissions || [];
        });
        setRolePermissions(perms);
        sessionStorage.setItem('app_role_permissions', JSON.stringify(perms));
        sessionStorage.setItem('app_auth_last_fetch', Date.now().toString());
      } catch (error) {
        console.error("Error loading auth data:", error);
      }
    };

    fetchAllData();
  }, [user]);

  const role = (appUser?.roleId || 'Staff');
  const roleLower = role.toLowerCase();

  const hasPermission = React.useCallback((permissionId: string): boolean => {
    const isSuperUser = user?.email === 'info.vinasglobal@gmail.com' || user?.email === 'thangcd11@gmail.com' || user?.email === 'vietnhan@thalex.com.vn' || user?.email === 'vietnhan@thalex.vn' || user?.email === 'ngocvan@thalex.com.vn' || user?.email === 'ngocvan@thalex.vn' || user?.email === 'vanquy@thalex.com.vn' || roleLower === 'superadmin' || roleLower === 'admin';
    if (isSuperUser) return true;
    
    // Check direct user permissions first
    if (appUser?.permissions && appUser.permissions.includes(permissionId)) {
      return true;
    }

    const checkUserPermission = (permId: string): boolean => {
      // Direct user permissions check as part of nested check
      if (appUser?.permissions && appUser.permissions.includes(permId)) {
        return true;
      }
      if (rolePermissions[role]) {
        return rolePermissions[role].includes(permId);
      }
      if (rolePermissions[roleLower]) {
        return rolePermissions[roleLower].includes(permId);
      }
      
      const defaults = DEFAULT_ROLE_PERMISSIONS[role as UserRole] || DEFAULT_ROLE_PERMISSIONS[roleLower as UserRole];
      if (defaults) {
        return defaults.includes(permId);
      }

      // Dynamic template fallbacks for custom department roles
      if (role.endsWith('_Manager') || roleLower.includes('manager') || roleLower.includes('trưởng phòng') || roleLower.includes('quản lý')) {
        return ['view_orders', 'create_orders', 'view_tasks', 'manage_tasks', 'view_storage', 'menu_orders_view', 'menu_tasks_view', 'menu_storage_view'].includes(permId);
      }
      if (role.endsWith('_Staff') || roleLower.includes('staff') || roleLower.includes('nhân viên') || roleLower.includes('kinh doanh') || roleLower.includes('kỹ thuật') || roleLower.includes('kế toán')) {
        return ['view_orders', 'view_tasks', 'view_storage', 'menu_orders_view', 'menu_tasks_view', 'menu_storage_view'].includes(permId);
      }
      
      return false;
    };

    if (checkUserPermission(permissionId)) {
      return true;
    }

    // Dynamic backward compatibility fallback:
    // If querying 'menu_storage', check 'menu_storage_view' or 'menu_storage_edit'
    if (permissionId.startsWith('menu_') && !permissionId.endsWith('_view') && !permissionId.endsWith('_edit')) {
      const viewPermId = `${permissionId}_view`;
      const editPermId = `${permissionId}_edit`;
      return checkUserPermission(viewPermId) || checkUserPermission(editPermId);
    }
    
    return false;
  }, [user?.email, roleLower, appUser?.permissions, rolePermissions, role]);

  const isSuperAdmin = user?.email === 'info.vinasglobal@gmail.com' || user?.email === 'thangcd11@gmail.com' || user?.email === 'vietnhan@thalex.com.vn' || user?.email === 'vietnhan@thalex.vn' || user?.email === 'ngocvan@thalex.com.vn' || user?.email === 'ngocvan@thalex.vn' || roleLower === 'superadmin' || roleLower === 'admin' || roleLower === 'tổng giám đốc';
  // Admin is SuperAdmin, Director, or anyone with manage_users
  const isAdmin = React.useMemo(() => isSuperAdmin || roleLower === 'director' || roleLower === 'vicedirector' || roleLower === 'giám đốc' || roleLower === 'phó giám đốc' || roleLower === 'tổng giám đốc' || hasPermission('manage_users') || user?.email === 'ngocvan@thalex.vn' || user?.email === 'ngocvan@thalex.com.vn', [isSuperAdmin, roleLower, hasPermission, user?.email]);
  // Director has top administrative authority or isDirector role directly
  const isDirector = React.useMemo(() => isSuperAdmin || roleLower === 'director' || roleLower === 'vicedirector' || roleLower === 'giám đốc' || roleLower === 'phó giám đốc' || roleLower === 'tổng giám đốc' || user?.email === 'vietnhan@thalex.com.vn' || user?.email === 'vietnhan@thalex.vn' || user?.email === 'ngocvan@thalex.com.vn' || user?.email === 'ngocvan@thalex.vn' || user?.email === 'tuyetmai@thalex.vn' || user?.email === 'tuyetmai@thalex.com.vn', [isSuperAdmin, roleLower, user?.email]);
  
  const isManager = React.useMemo(() => roleLower === 'manager' || roleLower === 'generalmanager' || roleLower === 'hrmanager' || roleLower === 'chiefaccountant' || roleLower === 'salesmanager' || roleLower === 'technicalmanager' || roleLower.endsWith('_manager') || roleLower === 'ketoantruong' || roleLower === 'trưởng phòng' || roleLower === 'quản lý' || roleLower.includes('trưởng phòng') || roleLower.includes('quản lý') || hasPermission('approve_leave_requests') || user?.email === 'tuyetmai@thalex.vn' || user?.email === 'tuyetmai@thalex.com.vn' || user?.email === 'vietnhan@thalex.com.vn' || user?.email === 'vietnhan@thalex.vn' || user?.email === 'ngocvan@thalex.vn' || user?.email === 'ngocvan@thalex.com.vn', [roleLower, hasPermission, user?.email]);
  const isAccountant = React.useMemo(() => roleLower === 'accountant' || roleLower === 'chiefaccountant' || roleLower === 'accountantstaff' || roleLower.endsWith('_accountant') || roleLower === 'ketoantruong' || roleLower === 'ketoan' || roleLower === 'kế toán' || roleLower === 'kế toán trưởng' || roleLower.includes('kế toán') || roleLower.includes('thủ quỹ') || hasPermission('manage_cashflow') || user?.email === 'tuyetmai@thalex.vn' || user?.email === 'tuyetmai@thalex.com.vn' || user?.email === 'vietnhan@thalex.com.vn' || user?.email === 'vietnhan@thalex.vn' || user?.email === 'ngocvan@thalex.vn' || user?.email === 'ngocvan@thalex.com.vn', [roleLower, hasPermission, user?.email]);
  const isHR = React.useMemo(() => roleLower === 'hr' || roleLower === 'hrmanager' || roleLower === 'hrstaff' || roleLower === 'nhansu' || roleLower === 'nhân sự' || roleLower.includes('nhân sự') || roleLower.includes('hành chính') || roleLower.endsWith('_hr') || roleLower.endsWith('_nhansu') || hasPermission('manage_users') || user?.email === 'ngocvan@thalex.vn' || user?.email === 'ngocvan@thalex.com.vn', [roleLower, hasPermission, user?.email]);
  const isGeneral = React.useMemo(() => roleLower === 'generalmanager' || roleLower === 'generalstaff' || appUser?.departmentId === 'phong-tong-hop' || roleLower.includes('general') || (appUser?.departmentName || '').toLowerCase().includes('tổng hợp'), [roleLower, appUser?.departmentId, appUser?.departmentName]);
  
  const canViewSalaries = React.useMemo(() => isSuperAdmin || isDirector || hasPermission('view_salaries') || hasPermission('manage_users') || hasPermission('view_financial_reports') || user?.email === 'tuyetmai@thalex.vn' || user?.email === 'tuyetmai@thalex.com.vn', [isSuperAdmin, isDirector, hasPermission, user?.email]);
  const canEditSalaries = React.useMemo(() => isSuperAdmin || isDirector || hasPermission('manage_salaries') || hasPermission('manage_users'), [isSuperAdmin, isDirector, hasPermission]);
  const isFinanceStaff = React.useMemo(() => isSuperAdmin || isDirector || isAccountant || hasPermission('manage_cashflow') || hasPermission('view_cashflow'), [isSuperAdmin, isDirector, isAccountant, hasPermission]);
  const isLeader = React.useMemo(() => isAdmin || isManager || isHR || hasPermission('approve_leave_requests'), [isAdmin, isManager, isHR, hasPermission]);

  const value = React.useMemo(() => ({
    user, 
    appUser, 
    loading, 
    isAdmin, 
    isSuperAdmin,
    isDirector,
    isManager, 
    isAccountant,
    isHR,
    isGeneral,
    isLeader,
    isFinanceStaff,
    canViewSalaries,
    canEditSalaries,
    hasPermission,
    rolePermissions,
  }), [
    user, appUser, loading, isAdmin, isSuperAdmin, isDirector, isManager, isAccountant, isHR, isGeneral, isLeader, isFinanceStaff, canViewSalaries, canEditSalaries, hasPermission, rolePermissions
  ]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
