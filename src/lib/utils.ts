import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
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
  // If we are developing locally or in standard run.app containers, relative paths are perfect
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.endsWith('.run.app') ||
    hostname.endsWith('.gitpod.io') ||
    hostname.includes('webcontainer')
  ) {
    return cleanPath;
  }
  
  // Custom domains (like thalex.com.vn)
  // OPTION 1 (Default - RECOMMENDED FOR QUICK SETUP): Route directly to Cloud Run backend using CORS.
  // This guarantees that any custom server Nginx configuration (which may incorrectly treat API paths as static folders 
  // and trigger 405 Method Not Allowed) will be bypassed smoothly.
  return `https://ais-pre-xhtpfphlu2ps32uy3bofcu-255141659024.asia-southeast1.run.app${cleanPath}`;

  /*
  // OPTION 2 (RECOMMENDED FOR PRODUCTION): Relative path proxy.
  // If your Nginx is configured to correctly proxy both static files and api routes, you can use relative paths:
  const pathname = window.location.pathname;
  const match = pathname.match(/^\/([^/]+)/);
  const baseSegment = match ? match[1] : '';
  if (baseSegment && baseSegment !== 'api') {
    return `/${baseSegment}${cleanPath}`;
  }
  return cleanPath;
  */
}

/**
 * Perform a fetch to JSON API safely, handles non-JSON HTML (404/502 etc.) gracefully, and catches DOMExceptions.
 */
export async function safeFetchJson<T = any>(
  url: string,
  options?: RequestInit
): Promise<{ success: boolean; data?: T; error?: string; status?: number }> {
  try {
    const res = await fetch(url, options);
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
