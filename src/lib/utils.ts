import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

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
  
  const sValue = value.toString();
  
  // Normalize input: could be "1000.5" (machine) or "1.000,5" (user)
  // If it's a number, it will be "1000.5"
  let normalized = sValue;
  if (!sValue.includes(',') && sValue.includes('.')) {
    // Check if it's already a formatted string with dots as thousands
    const dotCount = (sValue.match(/\./g) || []).length;
    if (dotCount > 1 || (dotCount === 1 && sValue.length - sValue.indexOf('.') > 3)) {
       // Likely thousands separator
    } else {
       normalized = sValue.replace('.', ',');
    }
  }
  
  // Remove all thousands separators (dots) for processing
  const clean = normalized.replace(/\./g, '');
  const parts = clean.split(',');
  const integerPart = parts[0].replace(/[^0-9-]/g, '');
  const decimalPart = parts.length > 1 ? parts[1].replace(/[^0-9]/g, '').slice(0, 2) : null;

  if (integerPart === '' && decimalPart === null) {
    return clean.startsWith('-') ? '-' : '';
  }

  let formatted = '';
  if (integerPart !== '') {
    const num = parseFloat(integerPart);
    formatted = new Intl.NumberFormat('vi-VN').format(num);
  } else if (clean.startsWith('-')) {
    formatted = '-';
  }

  if (decimalPart !== null) {
    return formatted + ',' + decimalPart;
  }
  
  if (clean.endsWith(',')) {
    return formatted + ',';
  }

  return formatted;
}

export function parseCurrencyInput(value: string): string {
  if (!value) return '';
  // Convert vi-VN input (1.000.000,5) to machine-readable numeric string (1000000.5)
  // This preserves the decimal point for typing.
  const clean = value.replace(/\./g, '').replace(',', '.');
  return clean;
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

export async function downloadFile(url: string | undefined, fileName: string) {
  if (!url) {
    alert('Không tìm thấy liên kết tải về cho tệp này. Tệp có thể chưa được tải lên máy chủ.');
    return;
  }
  try {
    // Handle inline data URLs
    if (url.startsWith('data:')) {
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return;
    }

    // Handle normal URLs (including Firebase Storage)
    const response = await fetch(url);
    if (!response.ok) throw new Error('Network response was not ok');
    const blob = await response.blob();
    const blobUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(blobUrl);
  } catch (error) {
    console.warn('Silent download failed, falling back to new tab:', error);
    // Fallback if CORS prevents blob reading
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
