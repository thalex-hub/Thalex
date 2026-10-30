import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { triggerDownloadErrorModal } from '../components/DownloadErrorModal';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export async function withTimeout<T>(promise: Promise<T>, timeoutMs = 15000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => 
      setTimeout(() => reject(new Error('Lỗi truy cập dữ liệu quá lâu (Timeout). Vui lòng thử lại.')), timeoutMs)
    )
  ]);
}

export function formatCurrency(value: number | string | undefined | null) {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (num === undefined || num === null || isNaN(num)) return '0 đ';
  return new Intl.NumberFormat('vi-VN', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0
  }).format(num) + ' đ';
}

export function formatCurrencyInput(value: number | string | undefined | null) {
  if (value === undefined || value === null || value === '') return '';
  
  const sValue = value.toString().trim();
  if (sValue === '') return '';
  if (sValue === '-') return '-';

  // Normalize input: could be "1000.5" (machine) or "1.000,5" (user)
  let normalized = sValue;
  if (!sValue.includes(',') && sValue.includes('.')) {
    const dotCount = (sValue.match(/\./g) || []).length;
    if (dotCount > 1 || (dotCount === 1 && sValue.length - sValue.indexOf('.') > 3)) {
       // Likely thousands separator
    } else {
       normalized = sValue.replace('.', ',');
    }
  }
  
  // Check if negative (either starts with '-' or user typed '-' at the end)
  const isNegative = normalized.startsWith('-') || normalized.endsWith('-');
  // Remove all thousands separators (dots) and minus signs for processing
  const clean = normalized.replace(/\./g, '').replace(/-/g, '');
  const parts = clean.split(',');
  const integerPart = parts[0].replace(/[^0-9]/g, '');
  const decimalPart = parts.length > 1 ? parts[1].replace(/[^0-9]/g, '').slice(0, 2) : null;

  if (integerPart === '' && decimalPart === null) {
    return isNegative ? '-' : '';
  }

  let formatted = '';
  if (integerPart !== '') {
    const num = parseFloat(integerPart);
    formatted = (isNegative ? '-' : '') + new Intl.NumberFormat('vi-VN').format(num);
  } else if (isNegative) {
    formatted = '-';
  }

  if (decimalPart !== null) {
    return formatted + ',' + decimalPart;
  }
  
  if (normalized.endsWith(',')) {
    return formatted + ',';
  }

  return formatted;
}

export function parseCurrencyInput(value: string): string {
  if (!value) return '';
  const trimmed = value.trim();
  if (trimmed === '-') return '-';
  const isNegative = trimmed.startsWith('-') || trimmed.endsWith('-');
  const cleanWithoutMinus = trimmed.replace(/-/g, '').replace(/\./g, '').replace(',', '.');
  const sanitized = cleanWithoutMinus.replace(/[^0-9.]/g, '');
  return (isNegative ? '-' : '') + sanitized;
}

export function parseFinancialNumber(val: any): number {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  const s = String(val).trim();
  if (s === '-' || s === '' || s === '+') return 0;
  
  const isNegative = s.startsWith('-') || s.endsWith('-');
  let normalized = s.replace(/-/g, '').replace(/\+/g, '').trim();
  
  if (normalized.includes('.') && normalized.includes(',')) {
    const lastDot = normalized.lastIndexOf('.');
    const lastComma = normalized.lastIndexOf(',');
    if (lastComma > lastDot) {
      normalized = normalized.replace(/\./g, '').replace(',', '.');
    } else {
      normalized = normalized.replace(/,/g, '');
    }
  } else if (normalized.includes('.')) {
    const dotCount = (normalized.match(/\./g) || []).length;
    if (dotCount > 1 || (dotCount === 1 && normalized.length - normalized.indexOf('.') > 3)) {
      normalized = normalized.replace(/\./g, '');
    }
  } else if (normalized.includes(',')) {
    const commaCount = (normalized.match(/,/g) || []).length;
    if (commaCount > 1 || (commaCount === 1 && normalized.length - normalized.indexOf(',') > 3)) {
      normalized = normalized.replace(/,/g, '');
    } else {
      normalized = normalized.replace(',', '.');
    }
  }
  
  const clean = normalized.replace(/[^0-9.]/g, '');
  const num = parseFloat(clean);
  if (isNaN(num)) return 0;
  return isNegative ? -num : num;
}

export function formatPercent(value: number | string | undefined | null) {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (num === undefined || num === null || isNaN(num)) return '0%';
  return num.toFixed(1) + '%';
}

/**
 * Returns the relative or absolute path for the API endpoint, supporting reverse proxies on custom domains dynamically.
 */
export function getApiUrl(path: string): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  if (typeof window === 'undefined') {
    return cleanPath;
  }

  const hostname = window.location.hostname;
  const isLocal = hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('192.168.');
  const isCloudRun = hostname.endsWith('run.app');

  // Check manual troubleshooting override from local storage
  try {
    const localOverride = localStorage.getItem('THALEX_API_URL');
    if (localOverride) {
      let base = localOverride.trim();
      if (base) {
        if (!/^(https?:)?\/\//i.test(base)) {
          base = `https://${base}`;
        }
        base = base.endsWith('/') ? base.slice(0, -1) : base;
        return `${base}${cleanPath}`;
      }
    }
  } catch (e) {}

  // If running on a custom domain (such as thalex.com.vn)
  // Check if an API URL is explicitly configured in VITE_API_URL
  let envApiUrl = (import.meta as any).env?.VITE_API_URL;
  if (envApiUrl) {
    envApiUrl = envApiUrl.trim();
    if (envApiUrl) {
      if (!/^(https?:)?\/\//i.test(envApiUrl)) {
        envApiUrl = `https://${envApiUrl}`;
      }
      const base = envApiUrl.endsWith('/') ? envApiUrl.slice(0, -1) : envApiUrl;
      return `${base}${cleanPath}`;
    }
  }

  // If local development or directly on the Cloud Run preview, use relative path dynamically
  if (isLocal || isCloudRun) {
    const pathname = window.location.pathname;
    const match = pathname.match(/^\/([^/]+)/);
    const baseSegment = match ? match[1] : '';
    if (baseSegment && baseSegment !== 'api') {
      return `/${baseSegment}${cleanPath}`;
    }
    return cleanPath;
  }

  return cleanPath;
}

export async function downloadFile(
  url: string | undefined, 
  fileName: string, 
  fileId?: string,
  extraOptions?: {
    orderId?: string;
    proposalId?: string;
    category?: string;
    docId?: string;
    fallbackData?: string;
  }
) {
  // If fallbackData is provided and valid, download directly
  if (extraOptions?.fallbackData && extraOptions.fallbackData.startsWith('data:')) {
    try {
      const link = document.createElement('a');
      link.href = extraOptions.fallbackData;
      link.download = fileName || 'download';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return;
    } catch (e) {
      console.error('Error downloading fallbackData:', e);
    }
  }

  if (!url) {
    alert('Không tìm thấy liên kết tải về cho tệp này. Tệp có thể chưa được tải lên máy chủ.');
    return;
  }

  // 0. Handle dummy local-file:// placeholder from legacy upload bugs
  if (url.startsWith('local-file://')) {
    alert(`Tệp "${fileName}" chưa được lưu trữ hoàn chỉnh trên máy chủ (do lỗi giới hạn tệp cũ). Vui lòng sử dụng tính năng "Tải mới / Cập nhật tài liệu" để tải tệp lên lại an toàn.`);
    return;
  }

  // 1. Data URI download (Base64)
  if (url.startsWith('data:')) {
    try {
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName || 'download';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return;
    } catch (e) {
      console.error('Error downloading data URI:', e);
    }
  }

  // Helper to trigger direct blob download
  const triggerBlobDownload = (blobUrl: string, name: string) => {
    const link = document.createElement('a');
    link.style.display = 'none';
    link.href = blobUrl;
    link.download = name || 'download';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => {
      window.URL.revokeObjectURL(blobUrl);
    }, 15000);
  };

  // Extract fid from url if present
  let extractedFileId = fileId;
  if (!extractedFileId && url.includes('fid=')) {
    try {
      const parsed = new URL(url, window.location.origin);
      extractedFileId = parsed.searchParams.get('fid') || undefined;
    } catch (e) {}
  } else if (!extractedFileId && url.startsWith('firestore://')) {
    extractedFileId = url.replace('firestore://', '').trim();
  }

  // 2. Direct Firestore file retrieval if URL is firestore protocol
  if (url.startsWith('firestore://') && extractedFileId) {
    try {
      const { getFileFromStorage } = await import('./storageService');
      const stored = await getFileFromStorage(extractedFileId);
      if (stored && stored.dataUrl) {
        const link = document.createElement('a');
        link.href = stored.dataUrl;
        link.download = fileName || stored.name || 'download';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return;
      }
    } catch (fsErr) {
      console.error('Firestore storage retrieval failed:', fsErr);
    }
  }

  // 3. Check if URL is already pointing to a known blocked Firebase Storage bucket
  const isFirebaseStorage = url.includes('firebasestorage.googleapis.com');

  try {
    // Attempt download using backend proxy
    const proxyUrl = getApiUrl(`/api/download?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(fileName || 'download')}`);
    
    const response = await fetch(proxyUrl);
    
    // Check if error response or JSON error
    const contentType = response.headers.get('content-type') || '';
    if (!response.ok || contentType.includes('application/json')) {
      // Check if we can fallback to persistent Firestore backup
      if (extractedFileId) {
        try {
          const { getFileFromStorage } = await import('./storageService');
          const stored = await getFileFromStorage(extractedFileId);
          if (stored && stored.dataUrl) {
            const link = document.createElement('a');
            link.href = stored.dataUrl;
            link.download = fileName || stored.name || 'download';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            return;
          }
        } catch (e) {}
      }

      const errJson = await response.json().catch(() => null);
      const isBillingError =
        response.status === 402 ||
        errJson?.error === 'GCS_BILLING_DISABLED' ||
        errJson?.code === 402 ||
        errJson?.message?.includes('billing account') ||
        (isFirebaseStorage && response.status === 403);

      if (isBillingError) {
        const isPermissionDenied = response.status === 403 || errJson?.code === 403;
        triggerDownloadErrorModal({
          fileName: fileName || 'Tệp đính kèm',
          title: 'Không thể tải xuống tệp tin',
          message: isPermissionDenied
            ? 'Tệp tin này được lưu trữ trên Firebase Storage nhưng dịch vụ từ chối yêu cầu đọc (Lỗi 403: Permission denied).'
            : (errJson?.message || 'Tệp tin này được lưu trữ trên Firebase Storage của Google Cloud nhưng dự án đã bị tạm khóa tài khoản thanh toán (Lỗi 402: Billing account is disabled/closed).'),
          recommendation: 'Bạn có thể tải lại tệp tin mới trực tiếp vào hệ thống ngay bên dưới để lưu trữ an toàn trên cơ sở dữ liệu nội bộ.',
          orderId: extraOptions?.orderId,
          proposalId: extraOptions?.proposalId,
          category: extraOptions?.category,
          docId: extraOptions?.docId,
          rawUrl: url
        });
        return;
      }

      throw new Error(errJson?.message || `Máy chủ phản hồi mã lỗi: ${response.status}`);
    }

    const blob = await response.blob();
    const objectUrl = window.URL.createObjectURL(blob);
    triggerBlobDownload(objectUrl, fileName);
    return;
  } catch (error: any) {
    console.error('Download proxy failed:', error);

    // Fallback to Firestore persistent store if available
    if (extractedFileId) {
      try {
        const { getFileFromStorage } = await import('./storageService');
        const stored = await getFileFromStorage(extractedFileId);
        if (stored && stored.dataUrl) {
          const link = document.createElement('a');
          link.href = stored.dataUrl;
          link.download = fileName || stored.name || 'download';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          return;
        }
      } catch (e) {}
    }

    // If it's a Firebase Storage URL, NEVER open it in a new tab
    if (isFirebaseStorage) {
      triggerDownloadErrorModal({
        fileName: fileName || 'Tệp đính kèm',
        title: 'Không thể tải xuống tệp tin',
        message: 'Tệp tin này được lưu trữ trên Firebase Storage nhưng dịch vụ từ chối yêu cầu đọc (Lỗi 403 Permission Denied hoặc Quota).',
        recommendation: 'Bạn có thể tải lại tệp tin mới trực tiếp vào hệ thống ngay bên dưới để lưu trữ an toàn trên cơ sở dữ liệu nội bộ.',
        orderId: extraOptions?.orderId,
        proposalId: extraOptions?.proposalId,
        category: extraOptions?.category,
        docId: extraOptions?.docId,
        rawUrl: url
      });
      return;
    }

    // For other normal external URLs, attempt direct link
    try {
      const link = document.createElement('a');
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.download = fileName || 'download';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }
}


/**
 * Perform a fetch to JSON API safely, handles non-JSON HTML (404/502 etc.) gracefully, and catches DOMExceptions.
 */
export async function safeFetchJson<T = any>(
  url: string,
  options?: RequestInit
): Promise<{ success: boolean; data?: T; error?: string; status?: number }> {
  try {
    // Normalize headers to a clean, plain JavaScript object
    // to prevent any serialization or class mismatch issues in Safari/WebKit
    const finalHeaders: Record<string, string> = {};
    if (options?.headers) {
      if (options.headers instanceof Headers) {
        options.headers.forEach((value, key) => {
          finalHeaders[key] = value;
        });
      } else if (Array.isArray(options.headers)) {
        options.headers.forEach(([key, value]) => {
          finalHeaders[key] = value;
        });
      } else {
        Object.assign(finalHeaders, options.headers);
      }
    }

    // Default JSON headers if body exists
    if (options?.body && !finalHeaders["Content-Type"]) {
      finalHeaders["Content-Type"] = "application/json";
    }

    const fetchOptions: RequestInit = {
      ...options,
      headers: finalHeaders,
    };

    const res = await fetch(url, fetchOptions);
    const contentType = res.headers.get("content-type") || "";
    
    if (!contentType.includes("application/json")) {
      const text = await res.text();
      console.error(`Received non-JSON response from ${url}:`, text);
      return { 
        success: false, 
        status: res.status,
        error: `Máy chủ phản hồi định dạng không hợp lệ (Mã lỗi ${res.status}).\nVui lòng liên hệ kỹ thuật hoặc thử lại sau.` 
      };
    }
    
    const data = await res.json();
    if (!res.ok) {
      return { 
        success: false, 
        status: res.status,
        data, 
        error: data.error || data.message || `Lỗi từ máy chủ (Mã ${res.status})` 
      };
    }
    return { success: true, status: res.status, data };
  } catch (err: any) {
    console.error(`Fetch API Error (${url}):`, err);
    return { 
      success: false, 
      error: `Lỗi kết nối mạng: ${err.message || String(err)}` 
    };
  }
}
