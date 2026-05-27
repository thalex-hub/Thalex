import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Suppress expected benign Vite/WebSocket errors when HMR is disabled in preview
if (typeof window !== 'undefined') {
  // Silence annoying Recharts width/height warnings that occur during initial mounting or layout calculation phases
  const originalWarn = console.warn;
  console.warn = (...args) => {
    if (args[0] && typeof args[0] === 'string' && args[0].includes('The width(-1) and height(-1) of chart should be greater than 0')) {
      return;
    }
    originalWarn(...args);
  };

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    if (reason && (
      (typeof reason === 'string' && (reason.toLowerCase().includes('websocket') || reason.toLowerCase().includes('vite'))) ||
      (reason.message && (reason.message.toLowerCase().includes('websocket') || reason.message.toLowerCase().includes('vite')))
    )) {
      event.preventDefault();
      event.stopPropagation();
    }
  });

  window.addEventListener('error', (event) => {
    const message = event.message;
    if (message && (message.toLowerCase().includes('websocket') || message.toLowerCase().includes('vite'))) {
      event.preventDefault();
      event.stopPropagation();
    }
  });
}

// Override standard window.alert with a premium custom animated Toast notification system
if (typeof window !== 'undefined') {
  window.alert = (message: string) => {
    let container = document.getElementById('custom-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'custom-toast-container';
      container.className = 'fixed top-6 right-6 z-[9999] flex flex-col gap-3 max-w-sm w-full pointer-events-none md:max-w-md';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = 'bg-white/95 backdrop-blur-md border border-gray-100 shadow-2xl rounded-2xl p-4 flex gap-3 pointer-events-auto transition-all duration-300 transform translate-y-2 opacity-0 select-none';
    
    const lowerMsg = message.toLowerCase();
    const isError = lowerMsg.includes('lỗi') || lowerMsg.includes('không') || lowerMsg.includes('thất bại') || lowerMsg.includes('từ chối') || lowerMsg.includes('error') || lowerMsg.includes('wrong');
    const isSuccess = lowerMsg.includes('thành công') || lowerMsg.includes('success') || lowerMsg.includes('ok') || lowerMsg.includes('xong');
    
    let iconColor = 'text-blue-500 bg-blue-50/55 border border-blue-100/30';
    let label = 'Thông báo';
    let iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;

    if (isError) {
      iconColor = 'text-rose-600 bg-rose-50 border border-rose-100/40';
      label = 'Thông báo lỗi';
      iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
    } else if (isSuccess) {
      iconColor = 'text-emerald-600 bg-emerald-50 border border-emerald-100/40';
      label = 'Hoàn tất';
      iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;
    }

    toast.innerHTML = `
      <div class="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center ${iconColor}">
        ${iconSvg}
      </div>
      <div class="flex-1 min-w-0">
        <p class="text-[9px] font-black uppercase tracking-wider text-gray-400">${label}</p>
        <p class="text-xs font-semibold text-gray-800 mt-0.5 leading-relaxed whitespace-pre-wrap">${message}</p>
      </div>
      <button class="flex-shrink-0 self-start p-1 text-gray-300 hover:text-gray-500 rounded-lg transition-colors cursor-pointer">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    `;

    const closeBtn = toast.querySelector('button');
    if (closeBtn) {
      closeBtn.onclick = (e) => {
        e.preventDefault();
        toast.classList.add('opacity-0', 'scale-95');
        setTimeout(() => toast.remove(), 300);
      };
    }

    container.appendChild(toast);

    // Fade and slide in nicely
    requestAnimationFrame(() => {
      setTimeout(() => {
        toast.classList.remove('opacity-0', 'translate-y-2');
        toast.classList.add('translate-y-0');
      }, 50);
    });

    // Auto dismiss after 4.5 seconds
    setTimeout(() => {
      if (toast.parentNode) {
        toast.classList.add('opacity-0', 'scale-95');
        setTimeout(() => toast.remove(), 300);
      }
    }, 4500);
  };
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
