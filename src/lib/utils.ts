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

  // ALWAYS use absolute URL proxy on custom domains (like thalex.com.vn) if VITE_API_URL is missing.
  // We cannot use relative paths because standard static hosting servers (Vercel, cPanel, Netlify)
  // will throw 405 Method Not Allowed for POST requests to static files.
  if (!isLocal && !isCloudRun) {
    const defaultBackend = "https://ais-pre-xhtpfphlu2ps32uy3bofcu-255141659024.asia-southeast1.run.app";
    return `${defaultBackend}${cleanPath}`;
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

  // For custom domains (like thalex.com.vn) hosted on Cloudflare Pages,
  // we use Cloudflare Functions (/functions/api/[[path]].ts) to proxy the requests securely
  // to the Cloud Run backend. This avoids CORS issues entirely since the browser
  // makes a same-origin request.
  return cleanPath;
}

/**
 * Perform a fetch to JSON API safely, handles non-JSON HTML (404/502 etc.) gracefully, and catches DOMExceptions.
 */
export async function safeFetchJson<T = any>(
  url: string,
  options?: RequestInit
): Promise<{ success: boolean; data?: T; error?: string; status?: number }> {
  try {
    // If the request has body and headers explicitly set to application/json, 
    // we rewrite it to text/plain to bypass CORS preflight OPTIONS requests,
    // which are often aggressively blocked by strict reverse proxies on custom domains.
    if (options?.headers) {
      const headers = new Headers(options.headers);
      if (headers.get('Content-Type') === 'application/json') {
        headers.set('Content-Type', 'text/plain');
        options.headers = headers;
      }
    }

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
