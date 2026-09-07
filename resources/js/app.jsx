import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';
import '../css/app.css';

const API_BASE_URL = window.location.origin;

const DAY_LABELS = {
  monday: 'Thứ 2',
  tuesday: 'Thứ 3',
  wednesday: 'Thứ 4',
  thursday: 'Thứ 5',
  friday: 'Thứ 6',
  saturday: 'Thứ 7',
  sunday: 'Chủ nhật'
};

function getDefaultWorkingHours() {
  return {
    monday: { open: '09:00', close: '18:00', closed: false },
    tuesday: { open: '09:00', close: '18:00', closed: false },
    wednesday: { open: '09:00', close: '18:00', closed: false },
    thursday: { open: '09:00', close: '18:00', closed: false },
    friday: { open: '09:00', close: '20:00', closed: false },
    saturday: { open: '10:00', close: '19:00', closed: false },
    sunday: { open: '10:00', close: '18:00', closed: true }
  };
}

function normalizeWorkingHours(rawHours) {
  const defaults = getDefaultWorkingHours();
  if (!rawHours || typeof rawHours !== 'object') return defaults;

  const normalized = { ...defaults };
  Object.keys(defaults).forEach((day) => {
    const item = rawHours?.[day] || {};
    normalized[day] = {
      open: item.open || defaults[day].open,
      close: item.close || defaults[day].close,
      closed: Boolean(item.closed)
    };
  });

  return normalized;
}

function formatWorkingHoursSummary(hours) {
  const normalized = normalizeWorkingHours(hours);
  return Object.keys(DAY_LABELS)
    .map((day) => {
      const value = normalized[day];
      if (value.closed) return `${DAY_LABELS[day]}: Nghỉ`;
      return `${DAY_LABELS[day]}: ${value.open} - ${value.close}`;
    })
    .join(' | ');
}

function formatDisplayDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

function calculateCalendarDays(calendarMonth) {
  const month = calendarMonth.getMonth();
  const year = calendarMonth.getFullYear();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startingDayOfWeek = firstDay.getDay();

  const days = [];
  for (let i = 0; i < startingDayOfWeek; i++) {
    days.push(null);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    days.push(new Date(year, month, d));
  }
  return days;
}

function getLocalDateTimeParts(dateTimeValue) {
  if (!dateTimeValue) {
    return { date: '', time: '09:00' };
  }

  const raw = String(dateTimeValue).trim();

  // Keep DB local datetime values unchanged to avoid timezone shifts.
  if (/^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}(:\d{2})?$/.test(raw)) {
    const [datePart, timePart] = raw.split(' ');
    return {
      date: datePart,
      time: (timePart || '09:00').slice(0, 5)
    };
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return { date: '', time: '09:00' };
  }

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  const hour = String(parsed.getHours()).padStart(2, '0');
  const minute = String(parsed.getMinutes()).padStart(2, '0');

  return {
    date: `${year}-${month}-${day}`,
    time: `${hour}:${minute}`
  };
}

function resolveImageUrl(path) {
  if (!path) return '';
  if (path.startsWith('data:image/')) return path;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  if (path.startsWith('/storage/')) return `${API_BASE_URL}${path}`;
  return `${API_BASE_URL}/storage/${path}`;
}

function resolveServiceImage(service) {
  const image = service?.image_url || service?.image;
  return resolveImageUrl(image);
}

function resolveHeroImage(url) {
  if (!url) return '';
  if (url.startsWith('data:image/')) return url;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url.startsWith('/')) return `${API_BASE_URL}${url}`;
  return `${API_BASE_URL}/${url}`;
}

// Global Cookie Helpers
const getCookie = (name) => {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(';').shift();
  return null;
};

const setCookie = (name, value, days = 7) => {
  const expires = new Date();
  expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);
  document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/`;
};

function getAuthHeaders(extra = {}) {
  const token = localStorage.getItem('auth_token');
  return {
    Accept: 'application/json',
    'X-XSRF-TOKEN': decodeURIComponent(getCookie('XSRF-TOKEN') || ''),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra
  };
}

function clearClientAuthStorage() {
  localStorage.removeItem('auth_token');
  localStorage.removeItem('userAuth');
  ['XSRF-TOKEN', 'laravel-session', 'laravel_session'].forEach((name) => {
    document.cookie = `${name}=; Max-Age=0; path=/`;
    document.cookie = `${name}=; Max-Age=0; path=/; SameSite=Lax`;
  });
}

async function logoutCurrentUser(setAuth) {
  const headers = getAuthHeaders();
  clearClientAuthStorage();
  setAuth(null);

  try {
    await fetch(`${API_BASE_URL}/api/logout`, {
      method: 'POST',
      credentials: 'include',
      headers
    });
  } catch (error) {
    console.error('logout error:', error);
  }
}

function LoadingOverlay({ show, label = 'Đang xử lý...' }) {
  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 px-4 backdrop-blur-sm">
      <div className="flex items-center gap-3 rounded-2xl border border-[#d5a56a]/40 bg-[#140d1f] px-5 py-4 text-[#f8e7d9] shadow-2xl shadow-black/50">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-[#d5a56a] border-t-transparent" />
        <span className="text-sm font-black uppercase tracking-wide">{label}</span>
      </div>
    </div>
  );
}

function InlineLoader({ label = 'Đang tải...' }) {
  return (
    <div className="flex items-center gap-2 text-sm text-[#c8b4b6]">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#d5a56a] border-t-transparent" />
      <span>{label}</span>
    </div>
  );
}

function formatServicePrice(value) {
  const amount = Number(value || 0);
  if (!amount) return 'Liên hệ';
  return `${amount.toLocaleString('vi-VN')} đ`;
}

function PasswordVisibilityIcon({ visible }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {visible ? (
        <>
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
          <circle cx="12" cy="12" r="3" />
        </>
      ) : (
        <>
          <path d="M10.7 5.2A10.7 10.7 0 0 1 12 5c6.5 0 10 7 10 7a18.7 18.7 0 0 1-3.1 4.2" />
          <path d="M14.1 14.1A3 3 0 0 1 9.9 9.9" />
          <path d="M6.6 6.6C3.7 8.5 2 12 2 12s3.5 7 10 7a9.7 9.7 0 0 0 4.4-1.1" />
          <path d="M2 2l20 20" />
        </>
      )}
    </svg>
  );
}

function AlertBanner({ message, type = 'info', onClose }) {
  if (!message?.text) return null;

  const styles = {
    success: 'border-emerald-400/50 bg-emerald-500/10 text-emerald-100',
    error: 'border-rose-400/50 bg-rose-500/10 text-rose-100',
    info: 'border-[#d5a56a]/50 bg-[#d5a56a]/10 text-[#f8e7d9]'
  };
  const label = type === 'success' ? 'Thành công' : type === 'error' ? 'Có lỗi' : 'Thông báo';

  return (
    <div className={`mt-3 flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${styles[type] || styles.info}`}>
      <div>
        <p className="font-black uppercase tracking-wide">{label}</p>
        <p className="mt-1 leading-5">{message.text}</p>
      </div>
      {onClose && (
        <button type="button" onClick={onClose} className="rounded-md px-2 py-1 font-black hover:bg-white/10" aria-label="Đóng thông báo">
          x
        </button>
      )}
    </div>
  );
}

function ConfirmDialog({ dialog, onCancel, onConfirm }) {
  if (!dialog?.open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-[#d5a56a]/45 bg-[#140d1f] p-6 text-[#f8e7d9] shadow-2xl shadow-black/50">
        <p className="text-xs font-bold uppercase text-[#d5a56a]">Xác nhận thao tác</p>
        <h3 className="mt-1 text-2xl font-black text-[#f7d9b2]">{dialog.title || 'Bạn chắc chắn chứ?'}</h3>
        <p className="mt-3 text-sm leading-6 text-[#d8c5c8]">{dialog.message}</p>
        <div className="mt-6 flex gap-3">
          <button type="button" onClick={onConfirm} className="flex-1 rounded-xl bg-rose-400 py-3 text-sm font-black uppercase text-[#2a1724] hover:bg-rose-300">
            Xác nhận
          </button>
          <button type="button" onClick={onCancel} className="flex-1 rounded-xl border border-[#8d6a52] py-3 text-sm font-black uppercase text-[#f7d9b2] hover:bg-[#2a1d2f]">
            Hủy
          </button>
        </div>
      </div>
    </div>
  );
}

function BookingDialog({ dialog, onClose, onConfirm, isSubmitting }) {
  if (!dialog?.open) return null;

  const toneClass = dialog.type === 'error'
    ? 'border-rose-400/50 text-rose-100'
    : dialog.type === 'success'
      ? 'border-emerald-400/50 text-emerald-100'
      : 'border-[#d5a56a]/50 text-[#f8e7d9]';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6 backdrop-blur-sm">
      <div className={`w-full max-w-md rounded-2xl border bg-[#140d1f] p-6 shadow-2xl shadow-black/50 ${toneClass}`}>
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase text-[#d5a56a]">{dialog.eyebrow || 'Thông báo'}</p>
            <h3 className="mt-1 text-2xl font-black text-[#f7d9b2]">{dialog.title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-[#6f5262] px-3 py-1 text-sm font-bold text-[#f7d9b2] hover:bg-white/10"
            aria-label="Đóng"
          >
            x
          </button>
        </div>

        {dialog.message && <p className="mb-4 text-sm leading-6 text-[#d8c5c8]">{dialog.message}</p>}

        {dialog.items?.length > 0 && (
          <div className="mb-5 space-y-2 rounded-xl border border-[#6f5262]/70 bg-[#0f0a17] p-4">
            {dialog.items.map((item) => (
              <div key={item.label} className="flex justify-between gap-4 text-sm">
                <span className="text-[#cbb9bb]">{item.label}</span>
                <span className="text-right font-bold text-[#f8e7d9]">{item.value}</span>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-3">
          {dialog.type === 'confirm' && (
            <button
              type="button"
              onClick={onConfirm}
              disabled={isSubmitting}
              className="flex-1 rounded-xl bg-[#d5a56a] py-3 text-sm font-black uppercase text-[#2a1724] disabled:opacity-60"
            >
              {isSubmitting ? 'Đang gửi...' : 'Gửi lịch hẹn'}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-[#8d6a52] py-3 text-sm font-black uppercase text-[#f7d9b2] hover:bg-[#2a1d2f]"
          >
            {dialog.type === 'confirm' ? 'Xem lại' : 'Đóng'}
          </button>
        </div>
      </div>
    </div>
  );
}

function App() {
  const AUTH_STORAGE_KEY = 'userAuth';

  const [auth, setAuthState] = useState(() => {
    try {
      const raw = localStorage.getItem(AUTH_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed?.user) return parsed;
      return null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(true);
  const [showAuthForm, setShowAuthForm] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [showAdminPanel, setShowAdminPanel] = useState(false);

  const [adminPage, setAdminPageState] = useState(() => {
    return getCookie('adminPage') || 'dashboard';
  });

  const setAuth = (nextAuth) => {
    try {
      setAuthState(nextAuth);
      if (nextAuth?.user) {
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(nextAuth));
      } else {
        clearClientAuthStorage();
        setShowAdminPanel(false);
      }
    } catch (e) {
      console.error('setAuth error:', e);
    }
  };

  // Save adminPage to cookie whenever it changes
  const setAdminPage = (page) => {
    setAdminPageState(page);
    setCookie('adminPage', page);
  };

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const authToken = localStorage.getItem('auth_token');
        if (!authToken) {
          clearClientAuthStorage();
          setAuth(null);
          setLoading(false);
          return;
        }

        const res = await fetch(`${API_BASE_URL}/api/user`, {
          credentials: 'include',
          headers: {
            Accept: 'application/json',
            'X-XSRF-TOKEN': decodeURIComponent(getCookie('XSRF-TOKEN') || ''),
            ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
          }
        });

        if (!res.ok) {
          if (res.status === 401 || res.status === 403) {
            setAuth(null);
          }
          console.warn('User fetch failed with status:', res.status);
          setLoading(false);
          return;
        }

        const data = await res.json();
        const userData = data?.data || data;

        if (userData && userData.id) {
          setAuth({ user: userData });
        } else {
          setAuth(null);
        }
      } catch (error) {
        console.error('fetchUser error:', error);
      } finally {
        setLoading(false);
      }
    };

    // Check for OAuth callback
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    const error = params.get('error');

    if (error) {
      console.error('OAuth error:', error);
      window.history.replaceState({}, document.title, window.location.pathname);
      setLoading(false);
      return;
    }

    if (token) {
      localStorage.setItem('auth_token', token);
      window.history.replaceState({}, document.title, window.location.pathname);
      fetchUser();
      return;
    }

    fetchUser();
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <div className="flex items-center gap-3 text-lg font-semibold text-slate-700">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-600 border-t-transparent" />
          <span>Đang tải tài khoản...</span>
        </div>
      </div>
    );
  }

  if (!auth) {
    return showAuthForm ? (
      <LoginRegister
        setAuth={setAuth}
        initialMode={authMode}
        onBack={() => setShowAuthForm(false)}
      />
    ) : (
      <PublicHome
        onLoginClick={() => {
          setAuthMode('login');
          setShowAuthForm(true);
        }}
        onRegisterClick={() => {
          setAuthMode('register');
          setShowAuthForm(true);
        }}
      />
    );
  }

  const [viewPublicHome, setViewPublicHome] = useState(false);

  // Admin goes directly to AdminPanel unless they toggled to view PublicHome
  if (auth.user?.role === 'admin' && !viewPublicHome) {
    return (
      <AdminPanel
        auth={auth}
        setAuth={setAuth}
        onLogout={() => logoutCurrentUser(setAuth)}
        onGoHome={() => setViewPublicHome(true)}
        page={adminPage}
        setPage={setAdminPage}
      />
    );
  }

  // Both admin and customer see PublicHome with auth (customer can book, admin can access dashboard via button)
  return (
    <PublicHome
      auth={auth}
      setAuth={setAuth}
      onAdminClick={auth.user?.role === 'admin' ? () => setViewPublicHome(false) : null}
      onLogout={() => logoutCurrentUser(setAuth)}
      onLoginClick={() => { setAuthMode('login'); setShowAuthForm(true); }}
      onRegisterClick={() => { setAuthMode('register'); setShowAuthForm(true); }}
    />
  );
}

function PublicHome({ auth, setAuth, onAdminClick, onLogout, onLoginClick, onRegisterClick }) {
  const [services, setServices] = useState([]);
  const [loadingServices, setLoadingServices] = useState(false);
  const [staffs, setStaffs] = useState([]);
  const [myAppointments, setMyAppointments] = useState([]);
  const [loadingAppointments, setLoadingAppointments] = useState(false);
  const [showServices, setShowServices] = useState(false);
  const [showDateTime, setShowDateTime] = useState(false);
  const [bookingDialog, setBookingDialog] = useState({ open: false, type: '', title: '', message: '', items: [] });

  // Booking Form State
  const [bookingForm, setBookingForm] = useState({
    name: auth?.user?.name || auth?.user?.username || '',
    phone: auth?.user?.phone || '',
    staff_id: '',
    appointment_date: '',
    appointment_time: '',
    service_ids: [],
    notes: ''
  });
  const [bookingMsg, setBookingMsg] = useState({ type: '', text: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedServices = useMemo(() => {
    const list = Array.isArray(services) ? services : [];
    return list.filter((service) => bookingForm.service_ids.includes(service.id));
  }, [services, bookingForm.service_ids]);

  const selectedStaff = useMemo(() => {
    const list = Array.isArray(staffs) ? staffs : [];
    return list.find((staff) => String(staff.id) === String(bookingForm.staff_id));
  }, [staffs, bookingForm.staff_id]);

  const bookingTotal = selectedServices.reduce((sum, service) => sum + Number(service.price || 0), 0);
  const bookingDuration = selectedServices.reduce((sum, service) => sum + Number(service.duration || 0), 0);
  const hasBookingBasics = Boolean(bookingForm.appointment_date && bookingForm.appointment_time && bookingForm.service_ids.length > 0);
  const commonTimeSlots = ['09:00', '10:30', '13:00', '14:30', '16:00', '17:30'];

  const getBookingDialogItems = () => [
    { label: 'Khách hàng', value: bookingForm.name || auth?.user?.username || 'Chưa nhập' },
    { label: 'Số điện thoại', value: bookingForm.phone || 'Chưa nhập' },
    { label: 'Ngày hẹn', value: formatDisplayDate(bookingForm.appointment_date) || 'Chưa chọn' },
    { label: 'Giờ hẹn', value: bookingForm.appointment_time || 'Chưa chọn' },
    { label: 'Nhân viên', value: selectedStaff?.name || 'Nhân viên bất kỳ' },
    { label: 'Dịch vụ', value: selectedServices.map((service) => service.name).join(', ') || 'Chưa chọn' },
    { label: 'Thời lượng dự kiến', value: bookingDuration ? `${bookingDuration} phút` : 'Đang cập nhật' },
    { label: 'Tổng tạm tính', value: formatServicePrice(bookingTotal) }
  ];

  const showBookingError = (message) => {
    setBookingMsg({ type: 'error', text: message });
    setBookingDialog({
      open: true,
      type: 'error',
      eyebrow: 'Không thể đặt lịch',
      title: 'Cần bổ sung thông tin',
      message,
      items: []
    });
  };

  const fetchMyAppointments = async () => {
    setLoadingAppointments(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/my-appointments`, {
        credentials: 'include',
        headers: getAuthHeaders()
      });
      const data = await res.json();
      const list = Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : []);
      setMyAppointments(list);
    } catch (e) { console.error('fetchMyAppointments error:', e); }
    setLoadingAppointments(false);
  };

  useEffect(() => {
    if (auth?.user) {
      setBookingForm(prev => ({
        ...prev,
        name: auth.user.name || auth.user.username || '',
        phone: auth.user.phone || ''
      }));
      fetchMyAppointments();
    } else {
      setMyAppointments([]);
    }
  }, [auth]);

  const [salonSettings, setSalonSettings] = useState({
    salon_name: 'Luxury Nails Spa',
    salon_phone: '0900 123 456',
    salon_address: '',
    salon_email: '',
    hero_image: '',
    logo: '',
    gallery_images: [],
    working_hours: getDefaultWorkingHours()
  });

  useEffect(() => {
    const loadServices = async () => {
      setLoadingServices(true);
      try {
        const res = await fetch(`${API_BASE_URL}/api/services`, {
          headers: {
            'Accept': 'application/json',
            'X-XSRF-TOKEN': decodeURIComponent(getCookie('XSRF-TOKEN') || '')
          }
        });
        if (!res.ok) throw new Error('Failed to fetch services');
        const data = await res.json();
        const list = Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : []);
        setServices(list);
      } catch (error) {
        console.error('loadServices error:', error);
      } finally {
        setLoadingServices(false);
      }
    };
    loadServices();
  }, []);

  useEffect(() => {
    const loadStaffs = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/staffs`, {
          headers: {
            'Accept': 'application/json',
            'X-XSRF-TOKEN': decodeURIComponent(getCookie('XSRF-TOKEN') || '')
          }
        });
        const data = await res.json();
        const list = Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : []);
        setStaffs(list);
      } catch (e) { console.error(e); }
    };
    loadStaffs();
  }, []);

  useEffect(() => {
    const loadSalonSettings = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/salon-settings/public`, {
          headers: {
            'Accept': 'application/json',
            'X-XSRF-TOKEN': decodeURIComponent(getCookie('XSRF-TOKEN') || '')
          }
        });
        if (!res.ok) return;
        const data = await res.json();
        const settings = data?.data || {};
        setSalonSettings({
          salon_name: settings.salon_name || 'Luxury Nails Spa',
          salon_phone: settings.salon_phone || '0900 123 456',
          salon_address: settings.salon_address || '',
          salon_email: settings.salon_email || '',
          hero_image: settings.hero_image || '',
          logo: settings.logo || '',
          gallery_images: settings.gallery_images || [],
          working_hours: normalizeWorkingHours(settings.working_hours)
        });
      } catch (error) { console.error(error); }
    };
    loadSalonSettings();
  }, []);

  const handleBookingSubmit = async (e) => {
    e.preventDefault();
    if (!bookingForm.appointment_date || !bookingForm.appointment_time || bookingForm.service_ids.length === 0) {
      showBookingError('Vui lòng chọn ngày, giờ và ít nhất một dịch vụ trước khi gửi lịch hẹn.');
      return;
    }

    if (!auth?.user) {
      showBookingError('Vui lòng đăng nhập hoặc đăng ký tài khoản khách hàng trước khi đặt lịch.');
      return;
    }

    setBookingMsg({ type: '', text: '' });
    setBookingDialog({
      open: true,
      type: 'confirm',
      eyebrow: 'Xác nhận lịch hẹn',
      title: 'Kiểm tra thông tin trước khi gửi',
      message: 'Sau khi gửi, lịch hẹn sẽ ở trạng thái chờ xác nhận. Salon sẽ liên hệ nếu cần điều chỉnh.',
      items: getBookingDialogItems()
    });
  };

  const submitBooking = async () => {
    setIsSubmitting(true);
    setBookingMsg({ type: '', text: '' });

    try {
      const payload = {
        ...bookingForm,
        staff_id: bookingForm.staff_id || null,
        appointment_date: `${bookingForm.appointment_date} ${bookingForm.appointment_time}:00`,
        services: bookingForm.service_ids
      };

      const res = await fetch(`${API_BASE_URL}/api/appointments`, {
        method: 'POST',
        credentials: 'include',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) {
        const firstError = data?.errors ? Object.values(data.errors).flat()[0] : '';
        const message = firstError || data.message || 'Đặt lịch thất bại.';
        setBookingMsg({ type: 'error', text: message });
        setBookingDialog({
          open: true,
          type: 'error',
          eyebrow: 'Đặt lịch thất bại',
          title: 'Chưa gửi được lịch hẹn',
          message,
          items: getBookingDialogItems()
        });
      } else {
        const message = data.message || 'Đặt lịch thành công! Chúng tôi sẽ sớm liên hệ xác nhận.';
        setBookingMsg({ type: 'success', text: message });
        setBookingDialog({
          open: true,
          type: 'success',
          eyebrow: 'Đặt lịch thành công',
          title: 'Lịch hẹn đã được gửi',
          message,
          items: getBookingDialogItems()
        });
        setBookingForm({
          ...bookingForm,
          staff_id: '',
          appointment_date: '',
          appointment_time: '',
          service_ids: [],
          notes: ''
        });
        if (auth?.user) fetchMyAppointments();
      }
    } catch (e) {
      const message = 'Lỗi kết nối. Vui lòng thử lại.';
      setBookingMsg({ type: 'error', text: message });
      setBookingDialog({
        open: true,
        type: 'error',
        eyebrow: 'Lỗi kết nối',
        title: 'Chưa gửi được lịch hẹn',
        message,
        items: getBookingDialogItems()
      });
    }
    setIsSubmitting(false);
  };

  const toggleService = (id) => {
    setBookingForm(prev => {
      const ids = prev.service_ids.includes(id)
        ? prev.service_ids.filter(sid => sid !== id)
        : [...prev.service_ids, id];
      return { ...prev, service_ids: ids };
    });
  };

  return (
    <div className="min-h-screen bg-[#08050c] text-[#f8e7d9]">
      <BookingDialog
        dialog={bookingDialog}
        isSubmitting={isSubmitting}
        onClose={() => {
          if (!isSubmitting) setBookingDialog({ open: false, type: '', title: '', message: '', items: [] });
        }}
        onConfirm={submitBooking}
      />
      <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-6">
        <nav className="rounded-xl border border-[#7f5c44]/40 bg-[#140d1f]/90 px-4 py-3 backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 leading-tight">
              {salonSettings.logo && (
                <img src={resolveImageUrl(salonSettings.logo)} alt="Logo" className="h-10 w-10 object-contain" />
              )}
              <div>
                <p className="text-xs font-semibold tracking-[0.25em] text-[#d7b17a]">LUXURY</p>
                <p className="text-lg font-black tracking-wide text-[#f7d9b2]">{salonSettings.salon_name || 'NAILS SPA'}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs font-semibold uppercase tracking-wide text-[#e5d2c4] md:text-sm">

              {auth && <a href="#lich-hen-cua-toi" className="hover:text-white transition">Lịch hẹn của tôi</a>}
              <a href="#bo-suu-tap" className="hover:text-white transition">Bộ sưu tập</a>
              <a href="#gio-lam" className="hover:text-white transition">Giờ làm việc</a>
              <a href="#lien-he" className="hover:text-white transition">Liên hệ</a>
              {auth ? (
                <>
                  <span className="text-[#f4c0c4] font-semibold">Xin chào, {auth.user?.name || auth.user?.username}</span>
                  {onAdminClick && (
                    <button
                      onClick={onAdminClick}
                      className="rounded-md bg-[#d5a56a]/20 border border-[#d5a56a] px-3 py-2 text-[#d5a56a] hover:bg-[#d5a56a]/40 font-bold"
                    >
                      Quản trị
                    </button>
                  )}
                  <button
                    onClick={onLogout}
                    className="rounded-md border border-[#8d6a52] px-3 py-2 text-[#f7d9b2] hover:bg-[#2a1d2f]"
                  >
                    Đăng xuất
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={onLoginClick}
                    className="rounded-md border border-[#8d6a52] px-3 py-2 text-[#f7d9b2] hover:bg-[#2a1d2f]"
                  >
                    Đăng nhập
                  </button>
                  <button
                    onClick={onRegisterClick}
                    className="rounded-md border border-[#8d6a52] px-3 py-2 text-[#f7d9b2] hover:bg-[#2a1d2f]"
                  >
                    Đăng ký
                  </button>
                </>
              )}
            </div>
          </div>
        </nav>

        <div className="mt-4 grid items-stretch gap-4 lg:grid-cols-[minmax(0,1fr)_400px]">
          <section id="trang-chu" className="overflow-hidden rounded-2xl border border-[#7f5c44]/40 bg-[#0b0712]">
            <div className="relative h-full min-h-[327px]">
              {salonSettings.hero_image ? (
                <>
                  <img
                    src={resolveImageUrl(salonSettings.hero_image)}
                    alt="Hero"
                    className="absolute inset-0 h-full w-full object-cover object-center [image-rendering:auto]"
                  />
                  <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(11,7,18,0.82)_0%,rgba(11,7,18,0.52)_46%,rgba(11,7,18,0.12)_100%)]" />
                  <div className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-[#0b0712]/45 to-transparent" />
                </>
              ) : (
                <>
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_30%,#2b1b27_0%,#0b0712_55%)]" />
                  <div className="absolute -left-8 bottom-0 h-56 w-56 rounded-full bg-[#e9b7b8]/20 blur-3xl" />
                  <div className="absolute right-8 top-8 h-32 w-32 rounded-full bg-[#d5a56a]/25 blur-2xl" />
                </>
              )}

              <div className="relative z-10 flex h-full min-h-[320px] flex-col justify-center px-6 py-8 md:px-16 md:py-10">
                <p className="mb-4 text-base font-bold uppercase tracking-[0.4em] text-[#e5b776] drop-shadow-[0_2px_10px_rgba(0,0,0,0.75)]">{salonSettings.salon_name || 'Luxury Nails Spa'}</p>
                <h1 className="mb-6 text-4xl font-black leading-tight text-[#fff0e4] drop-shadow-[0_4px_18px_rgba(0,0,0,0.70)] md:text-6xl xl:text-7xl">
                  Nâng tầm vẻ đẹp
                  <span className="block text-[#ffcdd2]">đôi tay bạn</span>
                </h1>
                <p className="max-w-xl text-base font-semibold leading-7 text-[#f2dfd7] drop-shadow-[0_2px_10px_rgba(0,0,0,0.70)] md:text-lg">
                  Chọn dịch vụ, ngày giờ và gửi lịch hẹn trong vài thao tác. Tài khoản customer có thể theo dõi lịch đã đặt ngay bên dưới.
                </p>
              </div>
            </div>
          </section>

          <aside className="flex min-h-[520px] flex-col">
            <div id="dat-lich" className="flex h-full flex-col rounded-2xl border border-[#d5a56a]/40 bg-[#140d1f] p-6 shadow-xl shadow-black/20">
              <h3 className="text-xl font-black uppercase tracking-wide text-[#f7d9b2] mb-5 flex items-center gap-2">
                Đặt lịch hẹn
              </h3>
              {!auth ? (
                <div className="flex flex-1 flex-col justify-center gap-4 text-center">
                  <p className="text-[#cbb9bb] text-sm">Đăng nhập hoặc tạo tài khoản customer để đặt lịch và xem lại lịch hẹn của bạn.</p>
                  <button
                    onClick={onLoginClick}
                    className="w-full rounded-xl bg-[#d5a56a] py-3 text-sm font-black uppercase tracking-widest text-[#2a1724] hover:shadow-lg hover:shadow-[#d5a56a]/20 transition"
                  >
                    Đăng nhập
                  </button>
                  <button
                    onClick={onRegisterClick}
                    className="w-full rounded-xl border border-[#d5a56a]/70 py-3 text-sm font-black uppercase tracking-widest text-[#f7d9b2] transition hover:bg-[#2a1d2f]"
                  >
                    Đăng ký customer
                  </button>
                </div>
              ) : (
                <form onSubmit={handleBookingSubmit} className="flex flex-1 flex-col gap-4">
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      type="text"
                      placeholder="Tên khách"
                      value={bookingForm.name}
                      onChange={(e) => setBookingForm({ ...bookingForm, name: e.target.value })}
                      className="w-full rounded-xl border border-[#6f5262] bg-[#0f0a17] px-3 py-3 text-sm text-white outline-none focus:ring-1 focus:ring-[#d8a56c]"
                    />
                    <input
                      type="tel"
                      placeholder="Số điện thoại"
                      value={bookingForm.phone}
                      onChange={(e) => setBookingForm({ ...bookingForm, phone: e.target.value })}
                      className="w-full rounded-xl border border-[#6f5262] bg-[#0f0a17] px-3 py-3 text-sm text-white outline-none focus:ring-1 focus:ring-[#d8a56c]"
                    />
                  </div>

                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => setShowDateTime(!showDateTime)}
                      className="flex w-full items-center justify-between rounded-xl border border-[#6f5262] bg-[#0f0a17] px-4 py-3 text-sm text-white outline-none focus:ring-1 focus:ring-[#d8a56c]"
                    >
                      <span className={(bookingForm.appointment_date && bookingForm.appointment_time) ? "text-white" : "text-gray-400"}>
                        {(bookingForm.appointment_date && bookingForm.appointment_time)
                          ? `${bookingForm.appointment_date} lúc ${bookingForm.appointment_time}`
                          : "Chọn ngày và giờ..."}
                      </span>
                      <span className={`transition-transform ${showDateTime ? 'rotate-180' : ''}`}>▼</span>
                    </button>

                    {showDateTime && (
                      <div className="space-y-3 p-3 rounded-xl border border-[#6f5262]/50 bg-[#0c0814] animate-in fade-in slide-in-from-top-2 duration-200">
                        <div className="grid grid-cols-2 gap-3">
                          <input
                            required
                            type="date"
                            value={bookingForm.appointment_date}
                            min={new Date().toISOString().split('T')[0]}
                            onChange={(e) => setBookingForm({ ...bookingForm, appointment_date: e.target.value })}
                            className="w-full rounded-xl border border-[#6f5262] bg-[#0f0a17] px-3 py-3 text-sm text-white outline-none focus:ring-1 focus:ring-[#d8a56c]"
                          />
                          <input
                            required
                            type="time"
                            value={bookingForm.appointment_time}
                            onChange={(e) => setBookingForm({ ...bookingForm, appointment_time: e.target.value })}
                            className="w-full rounded-xl border border-[#6f5262] bg-[#0f0a17] px-3 py-3 text-sm text-white outline-none focus:ring-1 focus:ring-[#d8a56c]"
                          />
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                          {commonTimeSlots.map((slot) => (
                            <button
                              key={slot}
                              type="button"
                              onClick={() => setBookingForm({ ...bookingForm, appointment_time: slot })}
                              className={`rounded-lg border px-2 py-2 text-xs font-bold transition ${bookingForm.appointment_time === slot
                                ? 'border-[#d5a56a] bg-[#d5a56a] text-[#2a1724]'
                                : 'border-[#6f5262] bg-[#0f0a17] text-[#cbb9bb] hover:border-[#d5a56a]'
                                }`}
                            >
                              {slot}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => setShowServices(!showServices)}
                      className="flex w-full items-center justify-between rounded-xl border border-[#6f5262] bg-[#0f0a17] px-4 py-3 text-sm text-white outline-none focus:ring-1 focus:ring-[#d8a56c]"
                    >
                      <span className={bookingForm.service_ids.length > 0 ? "text-white" : "text-gray-400"}>
                        {bookingForm.service_ids.length > 0
                          ? `${bookingForm.service_ids.length} dịch vụ đã chọn`
                          : "Chọn dịch vụ..."}
                      </span>
                      <span className={`transition-transform ${showServices ? 'rotate-180' : ''}`}>▼</span>
                    </button>

                    {showServices && (
                      <div className="max-h-40 overflow-y-auto space-y-2 pr-1 custom-scrollbar animate-in fade-in slide-in-from-top-2 duration-200">
                        {(Array.isArray(services) ? services : []).map(s => (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => toggleService(s.id)}
                            className={`w-full flex justify-between items-center px-3 py-2 rounded-lg text-xs transition border ${bookingForm.service_ids.includes(s.id)
                              ? 'border-[#d5a56a] bg-[#d5a56a]/10 text-[#f7d9b2]'
                              : 'border-[#6f5262] bg-[#0f0a17] text-[#cbb9bb] hover:border-[#8d6a52]'
                              }`}
                          >
                            <span className="flex items-center gap-2 text-left">
                              <span className={`h-4 w-4 rounded border ${bookingForm.service_ids.includes(s.id) ? 'border-[#d5a56a] bg-[#d5a56a]' : 'border-[#6f5262]'
                                }`} />
                              <span>
                                <span className="block font-bold">{s.name}</span>
                                <span className="block text-[11px] opacity-80">{s.duration || 0} phút</span>
                              </span>
                            </span>
                            <span className="font-bold">{formatServicePrice(s.price)}</span>
                          </button>
                        ))}
                        {(!Array.isArray(services) || services.length === 0) && (
                          <p className="rounded-lg border border-[#6f5262] bg-[#0f0a17] px-3 py-2 text-xs text-[#cbb9bb]">
                            Chưa có dịch vụ khả dụng.
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  <textarea
                    placeholder="Ghi chú thêm..."
                    value={bookingForm.notes}
                    onChange={(e) => setBookingForm({ ...bookingForm, notes: e.target.value })}
                    className="w-full rounded-xl border border-[#6f5262] bg-[#0f0a17] px-4 py-3 text-sm text-white outline-none focus:ring-1 focus:ring-[#d8a56c] h-20"
                  />



                  <button
                    type="submit"
                    disabled={isSubmitting || !hasBookingBasics}
                    className="w-full rounded-xl bg-gradient-to-r from-[#d5a56a] to-[#e4b7bf] py-4 text-sm font-black uppercase tracking-widest text-[#2a1724] hover:shadow-lg hover:shadow-[#d5a56a]/20 transition disabled:opacity-50"
                  >
                    {isSubmitting ? 'Đang gửi...' : 'Xem lại và xác nhận'}
                  </button>

                  {bookingMsg.text && (
                    <p className={`text-center text-xs font-bold ${bookingMsg.type === 'success' ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {bookingMsg.text}
                    </p>
                  )}
                </form>
              )}
            </div>
          </aside>
        </div>

        <section id="dich-vu" className="mt-6 rounded-2xl border border-[#7f5c44]/40 bg-[#0b0712] p-5 md:p-7">
          <div className="mb-5 flex items-end justify-between">
            <h2 className="text-2xl font-black uppercase tracking-wide text-[#f7d9b2]">Dịch vụ nổi bật</h2>
          </div>

          {loadingServices ? (
            <InlineLoader label="Đang tải dịch vụ..." />
          ) : (
            <div className="grid gap-4 md:grid-cols-3">
              {(Array.isArray(services) ? services : []).slice(0, 3).map((service) => (
                <article key={service.id} className="rounded-xl border border-[#8d6a52]/40 bg-[#170f22] p-3">
                  {resolveServiceImage(service) ? (
                    <img
                      src={resolveServiceImage(service)}
                      alt={service.name}
                      className="h-28 w-full rounded-lg object-cover"
                    />
                  ) : (
                    <div className="h-28 rounded-lg bg-[linear-gradient(135deg,#e4b7bf_0%,#f0d8c8_45%,#2a1a28_100%)]" />
                  )}
                  <h3 className="mt-3 text-lg font-black text-[#f7dfc2]">{service.name}</h3>
                  <p className="mt-1 text-sm text-[#c7b4b6] line-clamp-2">{service.description || 'Dịch vụ chuyên nghiệp cho bộ móng đẹp bền.'}</p>
                  <div className="mt-3 flex items-center justify-between">
                    <p className="text-sm font-bold text-[#d8a56c]">{formatServicePrice(service.price)}</p>
                  </div>
                </article>
              ))}
              {(!Array.isArray(services) || services.length === 0) && <p className="text-sm text-[#c8b4b6]">Chưa có dịch vụ hiển thị.</p>}
            </div>
          )}
        </section>

        {salonSettings.gallery_images && salonSettings.gallery_images.length > 0 && (
          <section id="bo-suu-tap" className="mt-6 rounded-2xl border border-[#7f5c44]/40 bg-[#0b0712] p-5 md:p-7">
            <h2 className="mb-5 text-2xl font-black uppercase tracking-wide text-[#f7d9b2]">Bộ sưu tập</h2>
            <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {salonSettings.gallery_images.map((img, idx) => (
                <div key={idx} className="group relative aspect-square overflow-hidden rounded-xl border border-[#8d6a52]/30">
                  <img src={resolveImageUrl(img)} alt={`Gallery ${idx + 1}`} className="h-full w-full object-cover transition duration-500 group-hover:scale-110" />
                </div>
              ))}
            </div>
          </section>
        )}

        {auth && (
          <section id="lich-hen-cua-toi" className="mt-6 rounded-2xl border border-[#7f5c44]/40 bg-[#0b0712] p-5 md:p-7">
            <div className="mb-5 flex items-end justify-between">
              <h2 className="text-2xl font-black uppercase tracking-wide text-[#f7d9b2]">Lịch hẹn của tôi</h2>
              <button
                onClick={fetchMyAppointments}
                className="text-xs font-semibold uppercase tracking-wide text-[#d5a56a] hover:text-white"
              >
                Cập nhật
              </button>
            </div>

            {loadingAppointments ? (
              <InlineLoader label="Đang tải lịch hẹn..." />
            ) : myAppointments.length === 0 ? (
              <div className="rounded-xl border border-[#8d6a52]/20 bg-[#170f22] p-8 text-center">
                <p className="text-[#c7b4b6] italic">Bạn chưa có lịch hẹn nào.</p>
                <a href="#dat-lich" className="mt-3 inline-block text-sm font-bold text-[#f4c0c4]">Đặt ngay ✨</a>
              </div>
            ) : (
              <div className="grid gap-4">
                {myAppointments.map(apt => (
                  <div key={apt.id} className="rounded-xl border border-[#8d6a52]/30 bg-[#140d1f] p-4 flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="h-10 w-10 rounded-full bg-[#d5a56a]/20 flex items-center justify-center text-xl">💅</div>
                      <div>
                        <p className="font-bold text-[#f7dfc2]">{apt.services?.map(s => s.name).join(', ') || 'Dịch vụ'}</p>
                        <p className="text-xs text-[#c7b4b6]">
                          {new Date(apt.appointment_date).toLocaleDateString('vi-VN')} lúc {new Date(apt.appointment_date).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                        <p className="text-[10px] text-[#d5a56a] uppercase font-bold mt-1">Nhân viên: {apt.staff?.name || apt.staff_name || 'N/A'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider ${apt.status === 'confirmed' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' :
                        apt.status === 'pending' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' :
                          apt.status === 'cancelled' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' :
                            'bg-slate-500/20 text-slate-300 border border-slate-500/30'
                        }`}>
                        {apt.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        <footer id="gio-lam" className="mt-6 rounded-2xl border border-[#7f5c44]/40 bg-[#120b1c] p-5 text-sm text-[#bfaeb0]">
          <p className="mb-2"><span className="font-bold text-[#f6d6b1]">Giờ làm việc:</span> {formatWorkingHoursSummary(salonSettings.working_hours)}</p>
          <p id="lien-he" className="mb-2"><span className="font-bold text-[#f6d6b1]">📞 Liên hệ:</span> {salonSettings.salon_phone || '0900 123 456'}</p>
          {salonSettings.salon_address && (
            <p className="mb-2"><span className="font-bold text-[#f6d6b1]">📍 Địa chỉ:</span> {salonSettings.salon_address}</p>
          )}
          {salonSettings.salon_email && (
            <p><span className="font-bold text-[#f6d6b1]">✉️ Email:</span> {salonSettings.salon_email}</p>
          )}
        </footer>
      </div>
    </div>
  );
}

function AdminPanel({ auth, setAuth, onLogout, onGoHome, page, setPage }) {
  const [services, setServices] = useState([]);
  const [staffs, setStaffs] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [formData, setFormData] = useState({ name: '', description: '', price: '', duration: '' });
  const [imageFile, setImageFile] = useState(null);
  const [serviceImagePreview, setServiceImagePreview] = useState('');
  const [uploadInputKey, setUploadInputKey] = useState(0);
  const [serviceFormMessage, setServiceFormMessage] = useState({ type: '', text: '' });
  const [editingServiceId, setEditingServiceId] = useState(null);
  const [editServiceForm, setEditServiceForm] = useState({ name: '', description: '', price: '', duration: '' });
  const [editServiceImageFile, setEditServiceImageFile] = useState(null);
  const [editServiceImagePreview, setEditServiceImagePreview] = useState('');
  const [editServiceImageKey, setEditServiceImageKey] = useState(0);
  const [settingsForm, setSettingsForm] = useState({
    salon_name: '',
    salon_phone: '',
    salon_address: '',
    salon_email: '',
    hero_image: '',
    logo: '',
    gallery_images: [],
    working_hours: getDefaultWorkingHours()
  });

  const [imageUploading, setImageUploading] = useState({});
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState({ type: '', text: '' });
  const [heroImageUploading, setHeroImageUploading] = useState(false);
  const [heroImageMessage, setHeroImageMessage] = useState({ type: '', text: '' });
  const [heroSelectedFileName, setHeroSelectedFileName] = useState('Chưa chọn ảnh');
  const heroFileInputRef = useRef(null);
  const [appointmentMessage, setAppointmentMessage] = useState({ type: '', text: '' });
  const [isSubmittingAppointment, setIsSubmittingAppointment] = useState(false);
  const [editingAppointmentId, setEditingAppointmentId] = useState(null);
  const [newAppointmentForm, setNewAppointmentForm] = useState({
    name: '',
    phone: '',
    staff_id: '',
    appointment_date: '',
    appointment_time: '09:00',
    service_ids: [],
    notes: ''
  });

  const [editAppointmentForm, setEditAppointmentForm] = useState({
    name: '',
    phone: '',
    staff_id: '',
    appointment_date: '',
    appointment_time: '09:00',
    service_ids: [],
    status: 'pending',
    notes: ''
  });

  const [isNewAptServicePickerOpen, setIsNewAptServicePickerOpen] = useState(false);
  const [isEditAptServicePickerOpen, setIsEditAptServicePickerOpen] = useState(false);
  const newAptServicePickerRef = useRef(null);
  const editAptServicePickerRef = useRef(null);

  const [showNewAptCalendar, setShowNewAptCalendar] = useState(false);
  const [showEditAptCalendar, setShowEditAptCalendar] = useState(false);
  const [newAptCalendarMonth, setNewAptCalendarMonth] = useState(new Date());
  const [editAptCalendarMonth, setEditAptCalendarMonth] = useState(new Date());

  const [loadingSchedule, setLoadingSchedule] = useState(false);
  const [bookedSlots, setBookedSlots] = useState([]);
  const [dailySchedule, setDailySchedule] = useState([]);
  const [showNewAptTimeGrid, setShowNewAptTimeGrid] = useState(false);
  const [showEditAptTimeGrid, setShowEditAptTimeGrid] = useState(false);

  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userForm, setUserForm] = useState({ name: '', username: '', email: '', phone: '', password: '', role: 'customer' });
  const [userMessage, setUserMessage] = useState({ type: '', text: '' });
  const [editingUserId, setEditingUserId] = useState(null);
  const [editUserForm, setEditUserForm] = useState({ name: '', username: '', email: '', phone: '', password: '', role: 'customer' });
  const [showUserPassword, setShowUserPassword] = useState(false);
  const [showEditUserPassword, setShowEditUserPassword] = useState(false);
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [adminNotice, setAdminNotice] = useState({ type: '', text: '' });
  const [confirmDialog, setConfirmDialog] = useState({ open: false, title: '', message: '', onConfirm: null });
  const [adminActionLoading, setAdminActionLoading] = useState('');

  const EXPIRED_TOKEN_MESSAGE = 'Vui lòng thoát và đăng nhập lại';

  const notifyAdmin = (type, text) => {
    setAdminNotice({ type, text });
  };

  const requestConfirm = (title, message, onConfirm) => {
    setConfirmDialog({ open: true, title, message, onConfirm });
  };

  const adminBusyLabel = adminActionLoading
    || (settingsSaving ? 'Đang lưu cài đặt...'
      : heroImageUploading ? 'Đang tải ảnh...'
        : isSubmittingAppointment ? 'Đang xử lý lịch hẹn...'
          : usersLoading ? 'Đang tải người dùng...'
            : settingsLoading ? 'Đang tải cài đặt...'
              : loadingSchedule ? 'Đang tải lịch trống...'
                : '');

  const getAuthHeaders = (extraHeaders = {}) => {
    const authToken = localStorage.getItem('auth_token');

    return {
      Accept: 'application/json',
      'X-XSRF-TOKEN': decodeURIComponent(getCookie('XSRF-TOKEN') || ''),
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...extraHeaders
    };
  };

  const validateServiceImage = (file) => {
    if (!file) return true;
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setServiceFormMessage({ type: 'error', text: 'Chỉ chấp nhận ảnh JPG, PNG hoặc WEBP.' });
      return false;
    }
    if (file.size > 4 * 1024 * 1024) {
      setServiceFormMessage({ type: 'error', text: 'Ảnh dịch vụ tối đa 4MB.' });
      return false;
    }
    return true;
  };

  const getApiErrorText = (data, fallback) => {
    const errorLines = data?.errors && typeof data.errors === 'object'
      ? Object.values(data.errors).flat().filter(Boolean)
      : [];

    return errorLines.length > 0 ? errorLines.join(' ') : (data?.message || fallback);
  };

  const handleServiceImageChange = (file) => {
    if (!validateServiceImage(file)) {
      setImageFile(null);
      setUploadInputKey(prev => prev + 1);
      return;
    }
    setServiceFormMessage({ type: '', text: '' });
    setImageFile(file || null);
  };

  const handleEditServiceImageChange = (file) => {
    if (!validateServiceImage(file)) {
      setEditServiceImageFile(null);
      setEditServiceImageKey(prev => prev + 1);
      return;
    }
    setServiceFormMessage({ type: '', text: '' });
    setEditServiceImageFile(file || null);
  };

  useEffect(() => {
    if (!imageFile) {
      setServiceImagePreview('');
      return undefined;
    }

    const previewUrl = URL.createObjectURL(imageFile);
    setServiceImagePreview(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [imageFile]);

  useEffect(() => {
    if (!editServiceImageFile) {
      setEditServiceImagePreview('');
      return undefined;
    }

    const previewUrl = URL.createObjectURL(editServiceImageFile);
    setEditServiceImagePreview(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [editServiceImageFile]);

  useEffect(() => {
    if (page === 'dashboard') {
      fetchServices();
      fetchAppointments();
      fetchUsers();
    } else if (page === 'services') {
      fetchServices();
    } else if (page === 'appointments') {
      fetchServices();
      fetchStaffs();
      fetchAppointments();
    } else if (page === 'settings') {
      fetchSalonSettings();
    } else if (page === 'users') {
      fetchUsers();
      fetchRoles();
    }
  }, [page]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (newAptServicePickerRef.current && !newAptServicePickerRef.current.contains(event.target)) {
        setIsNewAptServicePickerOpen(false);
      }
      if (editAptServicePickerRef.current && !editAptServicePickerRef.current.contains(event.target)) {
        setIsEditAptServicePickerOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  useEffect(() => {
    const selectedDate = newAppointmentForm.appointment_date || editAppointmentForm.appointment_date;
    if (!selectedDate) return;

    const loadSchedule = async () => {
      setLoadingSchedule(true);
      try {
        const res = await fetch(`${API_BASE_URL}/api/appointments/schedule?date=${selectedDate}`, {
          headers: getAuthHeaders()
        });
        const data = await res.json();
        const payload = data?.data || {};
        setBookedSlots(payload?.booked_slots || []);
        setDailySchedule(payload?.appointments || []);
      } catch (error) {
        console.error('❌ Schedule loading error:', error);
      } finally {
        setLoadingSchedule(false);
      }
    };

    loadSchedule();
  }, [newAppointmentForm.appointment_date, editAppointmentForm.appointment_date]);

  const today = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);

  const getAllTimeSlots = useMemo(() => (
    Array.from({ length: 12 }, (_, index) => `${String(index + 9).padStart(2, '0')}:00`)
  ), []);

  const getAvailableTimeSlots = (selectedDate) => {
    if (selectedDate === today) {
      const now = new Date();
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();
      return getAllTimeSlots.filter((slot) => {
        const [slotHour, slotMinute] = slot.split(':').map(Number);
        return (slotHour > currentHour) || (slotHour === currentHour && slotMinute >= currentMinute + 30);
      });
    }
    return getAllTimeSlots;
  };

  const handleNewAptDateSelect = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    setNewAppointmentForm((prev) => ({ ...prev, appointment_date: dateStr }));
    setShowNewAptCalendar(false);
  };

  const handleEditAptDateSelect = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    setEditAppointmentForm((prev) => ({ ...prev, appointment_date: dateStr }));
    setShowEditAptCalendar(false);
  };

  const handleMonthChangeHelper = (setter, currentMonth, increment) => {
    const newMonth = new Date(currentMonth);
    newMonth.setMonth(newMonth.getMonth() + increment);
    setter(newMonth);
  };

  const toggleNewAppointmentService = (serviceId) => {
    setNewAppointmentForm((prev) => {
      const exists = prev.service_ids.includes(serviceId);
      if (exists) {
        return { ...prev, service_ids: prev.service_ids.filter((id) => id !== serviceId) };
      }
      return { ...prev, service_ids: [...prev.service_ids, serviceId] };
    });
  };

  const toggleEditAppointmentService = (serviceId) => {
    setEditAppointmentForm((prev) => {
      const exists = prev.service_ids.includes(serviceId);
      if (exists) {
        return { ...prev, service_ids: prev.service_ids.filter((id) => id !== serviceId) };
      }
      return { ...prev, service_ids: [...prev.service_ids, serviceId] };
    });
  };

  const fetchSalonSettings = async () => {
    setSettingsLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/salon-settings`, {
        credentials: 'include',
        headers: getAuthHeaders()
      });

      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          setSettingsMessage({ type: 'error', text: EXPIRED_TOKEN_MESSAGE });
          return;
        }

        setSettingsMessage({ type: 'error', text: data?.message || 'Không thể tải cài đặt salon.' });
        return;
      }

      const payload = data?.data || {};
      setSettingsForm({
        salon_name: payload.salon_name || '',
        salon_phone: payload.salon_phone || '',
        salon_address: payload.salon_address || '',
        salon_email: payload.salon_email || '',
        hero_image: payload.hero_image || '',
        logo: payload.logo || '',
        gallery_images: payload.gallery_images || [],
        working_hours: normalizeWorkingHours(payload.working_hours)
      });
      setSettingsMessage({ type: '', text: '' });
    } catch (error) {
      console.error(error);
      setSettingsMessage({ type: 'error', text: 'Lỗi kết nối khi tải cài đặt salon.' });
    } finally {
      setSettingsLoading(false);
    }
  };

  const fetchUsers = async () => {
    setUsersLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/users`, {
        headers: getAuthHeaders()
      });
      const data = await res.json();
      if (res.ok) setUsers(data.data || []);
    } catch (error) {
      console.error(error);
    } finally {
      setUsersLoading(false);
    }
  };

  const fetchRoles = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/roles`, {
        headers: getAuthHeaders()
      });
      const data = await res.json();
      if (res.ok) setRoles(data.data || data);
    } catch (error) {
      console.error(error);
    }
  };

  const addUser = async (e) => {
    e.preventDefault();
    setUserMessage({ type: '', text: '' });
    setAdminActionLoading('Đang thêm người dùng...');
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/users`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(userForm)
      });
      const data = await res.json();
      if (res.ok) {
        setUserMessage({ type: 'success', text: 'Thêm người dùng thành công' });
        notifyAdmin('success', 'Thêm người dùng thành công');
        setUserForm({ name: '', username: '', email: '', phone: '', password: '', role: 'customer' });
        fetchUsers();
      } else {
        const text = data.message || 'Lỗi khi thêm người dùng';
        setUserMessage({ type: 'error', text });
        notifyAdmin('error', text);
      }
    } catch (error) {
      setUserMessage({ type: 'error', text: 'Lỗi kết nối' });
      notifyAdmin('error', 'Lỗi kết nối khi thêm người dùng');
    } finally {
      setAdminActionLoading('');
    }
  };

  const updateUser = async (id) => {
    setUserMessage({ type: '', text: '' });
    setAdminActionLoading('Đang cập nhật người dùng...');
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/users/${id}`, {
        method: 'PUT',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(editUserForm)
      });
      const data = await res.json();
      if (res.ok) {
        setUserMessage({ type: 'success', text: 'Cập nhật thành công' });
        notifyAdmin('success', 'Cập nhật người dùng thành công');
        setEditingUserId(null);
        fetchUsers();
      } else {
        const text = data.message || 'Lỗi khi cập nhật';
        setUserMessage({ type: 'error', text });
        notifyAdmin('error', text);
      }
    } catch (error) {
      setUserMessage({ type: 'error', text: 'Lỗi kết nối' });
      notifyAdmin('error', 'Lỗi kết nối khi cập nhật người dùng');
    } finally {
      setAdminActionLoading('');
    }
  };

  const deleteUser = async (id) => {
    requestConfirm('Xóa người dùng', 'Bạn có chắc chắn muốn xóa người dùng này? Thao tác này không thể hoàn tác.', async () => {
      setConfirmDialog({ open: false, title: '', message: '', onConfirm: null });
      setAdminActionLoading('Đang xóa người dùng...');
      try {
        const res = await fetch(`${API_BASE_URL}/api/admin/users/${id}`, {
          method: 'DELETE',
          headers: getAuthHeaders()
        });
        const data = await res.json();
        if (res.ok) {
          setUserMessage({ type: 'success', text: 'Đã xóa người dùng thành công.' });
          notifyAdmin('success', 'Đã xóa người dùng thành công');
          fetchUsers();
        } else {
          const text = data.message || 'Lỗi khi xóa người dùng.';
          setUserMessage({ type: 'error', text });
          notifyAdmin('error', text);
        }
      } catch (error) {
        console.error(error);
        setUserMessage({ type: 'error', text: 'Lỗi kết nối khi xóa người dùng.' });
        notifyAdmin('error', 'Lỗi kết nối khi xóa người dùng');
      } finally {
        setAdminActionLoading('');
      }
    });
  };

  const startEditUser = (user) => {
    setEditingUserId(user.id);
    setEditUserForm({
      name: user.name || '',
      username: user.username || '',
      email: user.email || '',
      phone: user.phone || '',
      password: '',
      role: (user.roles && user.roles.length > 0) ? user.roles[0].name : 'customer'
    });
  };

  const fetchServices = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/services`);
      const data = await res.json();
      if (res.ok) {
        const payload = data.data || data;
        setServices(Array.isArray(payload) ? payload : []);
      }
    } catch (error) {
      console.error(error);
      setServices([]);
    }
  };

  const fetchStaffs = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/staffs`);
      const data = await res.json();
      if (res.ok) {
        const payload = data.data || data;
        const list = Array.isArray(payload) ? payload : [];
        setStaffs(list);
        setNewAppointmentForm((prev) => (
          prev.staff_id || list.length === 0
            ? prev
            : { ...prev, staff_id: String(list[0].id) }
        ));
      }
    } catch (error) { console.error(error); }
  };

  const fetchAppointments = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/appointments`, {
        headers: getAuthHeaders()
      });
      const data = await res.json();
      if (res.ok) {
        const payload = data.data || data;
        setAppointments(Array.isArray(payload) ? payload : []);
        return;
      }

      const text = data?.message || 'Không thể tải danh sách lịch hẹn';
      setAppointments([]);
      setAppointmentMessage({ type: 'error', text });
      notifyAdmin('error', text);
    } catch (error) {
      console.error(error);
      setAppointments([]);
      setAppointmentMessage({ type: 'error', text: 'Lỗi kết nối khi tải lịch hẹn' });
      notifyAdmin('error', 'Lỗi kết nối khi tải lịch hẹn');
    }
  };

  const addService = async (e) => {
    e.preventDefault();
    setServiceFormMessage({ type: '', text: '' });
    setAdminActionLoading('Đang thêm dịch vụ...');
    try {
      const formDataToSend = new FormData();
      Object.keys(formData).forEach(key => formDataToSend.append(key, formData[key]));
      if (imageFile) formDataToSend.append('image', imageFile);

      const res = await fetch(`${API_BASE_URL}/api/services`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: formDataToSend
      });
      const data = await res.json();
      if (res.ok) {
        setServiceFormMessage({ type: 'success', text: 'Thêm dịch vụ thành công' });
        notifyAdmin('success', 'Thêm dịch vụ thành công');
        setFormData({ name: '', description: '', price: '', duration: '' });
        setImageFile(null);
        setUploadInputKey(prev => prev + 1);
        fetchServices();
      } else {
        const text = data.message || 'Lỗi khi thêm dịch vụ';
        setServiceFormMessage({ type: 'error', text });
        notifyAdmin('error', text);
      }
    } catch (error) {
      setServiceFormMessage({ type: 'error', text: 'Lỗi kết nối' });
      notifyAdmin('error', 'Lỗi kết nối khi thêm dịch vụ');
    } finally {
      setAdminActionLoading('');
    }
  };

  const updateService = async (id) => {
    setServiceFormMessage({ type: '', text: '' });
    setAdminActionLoading('Đang cập nhật dịch vụ...');
    try {
      const formDataToSend = new FormData();
      formDataToSend.append('_method', 'PUT');
      Object.keys(editServiceForm).forEach(key => formDataToSend.append(key, editServiceForm[key]));
      if (editServiceImageFile) formDataToSend.append('image', editServiceImageFile);

      const res = await fetch(`${API_BASE_URL}/api/services/${id}`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: formDataToSend
      });
      const data = await res.json();
      if (res.ok) {
        setServiceFormMessage({ type: 'success', text: 'Cập nhật thành công' });
        notifyAdmin('success', 'Cập nhật dịch vụ thành công');
        setEditingServiceId(null);
        setEditServiceImageFile(null);
        setEditServiceImageKey(prev => prev + 1);
        fetchServices();
      } else {
        const text = data.message || 'Lỗi khi cập nhật';
        setServiceFormMessage({ type: 'error', text });
        notifyAdmin('error', text);
      }
    } catch (error) {
      setServiceFormMessage({ type: 'error', text: 'Lỗi kết nối' });
      notifyAdmin('error', 'Lỗi kết nối khi cập nhật dịch vụ');
    } finally {
      setAdminActionLoading('');
    }
  };

  const deleteService = async (id) => {
    requestConfirm('Xóa dịch vụ', 'Bạn có chắc chắn muốn xóa dịch vụ này? Dịch vụ sẽ không còn hiển thị để đặt lịch.', async () => {
      setConfirmDialog({ open: false, title: '', message: '', onConfirm: null });
      setAdminActionLoading('Đang xóa dịch vụ...');
      try {
        const res = await fetch(`${API_BASE_URL}/api/services/${id}`, {
          method: 'DELETE',
          headers: getAuthHeaders()
        });
        if (res.ok) {
          notifyAdmin('success', 'Đã xóa dịch vụ');
          fetchServices();
        } else {
          notifyAdmin('error', 'Lỗi khi xóa dịch vụ');
        }
      } catch (error) {
        console.error(error);
        notifyAdmin('error', 'Lỗi kết nối khi xóa dịch vụ');
      } finally {
        setAdminActionLoading('');
      }
    });
  };

  const startEditService = (service) => {
    setEditingServiceId(service.id);
    setEditServiceImageFile(null);
    setEditServiceImagePreview('');
    setEditServiceImageKey(prev => prev + 1);
    setEditServiceForm({
      name: service.name,
      description: service.description || '',
      price: service.price,
      duration: service.duration || ''
    });
  };

  const submitNewAppointment = async (e) => {
    e.preventDefault();
    setAppointmentMessage({ type: '', text: '' });

    if (!newAppointmentForm.appointment_date || !newAppointmentForm.appointment_time) {
      setAppointmentMessage({ type: 'error', text: 'Vui lòng chọn ngày và giờ hẹn.' });
      return;
    }

    if (newAppointmentForm.service_ids.length === 0) {
      setAppointmentMessage({ type: 'error', text: 'Vui lòng chọn ít nhất 1 dịch vụ.' });
      return;
    }

    if (!newAppointmentForm.staff_id) {
      setAppointmentMessage({ type: 'error', text: 'Vui lòng chọn nhân viên phụ trách.' });
      return;
    }

    setIsSubmittingAppointment(true);

    try {
      const payload = {
        ...newAppointmentForm,
        staff_id: newAppointmentForm.staff_id || null,
        appointment_date: `${newAppointmentForm.appointment_date} ${newAppointmentForm.appointment_time}:00`,
        services: newAppointmentForm.service_ids
      };

      const res = await fetch(`${API_BASE_URL}/api/appointments/create-manual`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok) {
        setAppointmentMessage({ type: 'success', text: 'Thêm lịch hẹn thành công' });
        notifyAdmin('success', 'Thêm lịch hẹn thành công');
        setNewAppointmentForm({ name: '', phone: '', staff_id: staffs[0]?.id ? String(staffs[0].id) : '', appointment_date: '', appointment_time: '09:00', service_ids: [], notes: '' });
        fetchAppointments();
      } else {
        const text = getApiErrorText(data, 'Lỗi khi thêm lịch hẹn');
        setAppointmentMessage({ type: 'error', text });
        notifyAdmin('error', text);
      }
    } catch (error) {
      setAppointmentMessage({ type: 'error', text: 'Lỗi kết nối' });
      notifyAdmin('error', 'Lỗi kết nối khi thêm lịch hẹn');
    } finally {
      setIsSubmittingAppointment(false);
    }
  };

  const startEditAppointment = (apt) => {
    const dateTimeParts = getLocalDateTimeParts(apt.appointment_date);
    setEditingAppointmentId(apt.id);
    setEditAppointmentForm({
      name: apt.user?.name || apt.customer_name || apt.name || '',
      phone: apt.user?.phone || apt.phone || '',
      staff_id: String(apt.staff_id || ''),
      appointment_date: dateTimeParts.date,
      appointment_time: dateTimeParts.time,
      service_ids: (apt.services || []).map(s => s.id),
      status: apt.status || 'pending',
      notes: apt.notes || ''
    });
  };

  const submitEditAppointmentByAdmin = async (id) => {
    setAdminActionLoading('Đang cập nhật lịch hẹn...');
    try {
      const res = await fetch(`${API_BASE_URL}/api/appointments/${id}/admin`, {
        method: 'PUT',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          ...editAppointmentForm,
          staff_id: editAppointmentForm.staff_id || null,
          appointment_date: `${editAppointmentForm.appointment_date} ${editAppointmentForm.appointment_time}:00`,
          services: editAppointmentForm.service_ids
        })
      });
      const data = await res.json();
      if (res.ok) {
        setEditingAppointmentId(null);
        notifyAdmin('success', 'Cập nhật lịch hẹn thành công');
        fetchAppointments();
      } else {
        notifyAdmin('error', getApiErrorText(data, 'Lỗi khi cập nhật lịch hẹn'));
      }
    } catch (error) {
      console.error(error);
      notifyAdmin('error', 'Lỗi kết nối khi cập nhật lịch hẹn');
    } finally {
      setAdminActionLoading('');
    }
  };

  const deleteAppointmentByAdmin = async (id) => {
    requestConfirm('Xóa lịch hẹn', 'Bạn có chắc chắn muốn xóa lịch hẹn này? Khách hàng sẽ không còn thấy lịch này.', async () => {
      setConfirmDialog({ open: false, title: '', message: '', onConfirm: null });
      setAdminActionLoading('Đang xóa lịch hẹn...');
      try {
        const res = await fetch(`${API_BASE_URL}/api/appointments/${id}/admin`, {
          method: 'DELETE',
          headers: getAuthHeaders()
        });
        if (res.ok) {
          notifyAdmin('success', 'Đã xóa lịch hẹn');
          fetchAppointments();
        } else {
          notifyAdmin('error', 'Lỗi khi xóa lịch hẹn');
        }
      } catch (error) {
        console.error(error);
        notifyAdmin('error', 'Lỗi kết nối khi xóa lịch hẹn');
      } finally {
        setAdminActionLoading('');
      }
    });
  };

  const updateSalonSettings = async (e) => {
    e.preventDefault();
    setSettingsSaving(true);
    setSettingsMessage({ type: '', text: '' });
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/salon-settings`, {
        method: 'PUT',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(settingsForm)
      });
      const data = await res.json();
      if (res.ok) {
        setSettingsMessage({ type: 'success', text: 'Cập nhật thành công' });
        notifyAdmin('success', 'Cập nhật cài đặt salon thành công');
        fetchSalonSettings();
      } else {
        const text = data.message || 'Lỗi khi cập nhật';
        setSettingsMessage({ type: 'error', text });
        notifyAdmin('error', text);
      }
    } catch (error) {
      setSettingsMessage({ type: 'error', text: 'Lỗi kết nối' });
      notifyAdmin('error', 'Lỗi kết nối khi cập nhật cài đặt');
    } finally {
      setSettingsSaving(false);
    }
  };

  const uploadHeroImage = async (e) => {
    await uploadSalonImage(e, 'hero_image');
  };

  const uploadSalonImage = async (e, type) => {
    const file = e.target.files[0];
    if (!file) return;

    if (type === 'hero_image') {
      setHeroSelectedFileName(file.name);
      setHeroImageUploading(true);
    }
    setImageUploading(prev => ({ ...prev, [type]: true }));
    setHeroImageMessage({ type: '', text: '' });

    const formData = new FormData();
    formData.append('image', file);
    formData.append('type', type);

    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/salon-settings/upload-image`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: formData
      });
      const data = await res.json();
      if (res.ok) {
        setHeroImageMessage({ type: 'success', text: 'Tải ảnh lên thành công!' });
        notifyAdmin('success', 'Tải ảnh lên thành công');
        fetchSalonSettings();
      } else {
        const text = data.message || 'Lỗi khi tải ảnh.';
        setHeroImageMessage({ type: 'error', text });
        notifyAdmin('error', text);
      }
    } catch (error) {
      setHeroImageMessage({ type: 'error', text: 'Lỗi kết nối khi tải ảnh.' });
      notifyAdmin('error', 'Lỗi kết nối khi tải ảnh');
    } finally {
      if (type === 'hero_image') setHeroImageUploading(false);
      setImageUploading(prev => ({ ...prev, [type]: false }));
    }
  };

  const deleteSalonImage = async (url, type) => {
    if (!url) return;
    requestConfirm('Xóa ảnh', 'Bạn có chắc chắn muốn xóa ảnh này khỏi trang chủ?', async () => {
      setConfirmDialog({ open: false, title: '', message: '', onConfirm: null });
      setAdminActionLoading('Đang xóa ảnh...');
      setHeroImageMessage({ type: '', text: '' });
      try {
        const res = await fetch(`${API_BASE_URL}/api/admin/salon-settings/delete-image`, {
          method: 'DELETE',
          headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ url, type })
        });
        const data = await res.json();
        if (res.ok) {
          setHeroImageMessage({ type: 'success', text: 'Đã xóa ảnh.' });
          notifyAdmin('success', 'Đã xóa ảnh');
          fetchSalonSettings();
        } else {
          const text = data.message || 'Lỗi khi xóa ảnh.';
          setHeroImageMessage({ type: 'error', text });
          notifyAdmin('error', text);
        }
      } catch (error) {
        setHeroImageMessage({ type: 'error', text: 'Lỗi kết nối khi xóa ảnh.' });
        notifyAdmin('error', 'Lỗi kết nối khi xóa ảnh');
      } finally {
        setAdminActionLoading('');
      }
    });
  };

  const updateWorkingHourValue = (day, field, value) => {
    setSettingsForm(prev => {
      const hours = { ...prev.working_hours };
      hours[day] = { ...hours[day], [field]: value };
      return { ...prev, working_hours: hours };
    });
  };

  return (
    <div className="flex min-h-screen bg-[#08050c] text-[#f8e7d9]">
      <LoadingOverlay show={Boolean(adminBusyLabel)} label={adminBusyLabel} />
      <ConfirmDialog
        dialog={confirmDialog}
        onCancel={() => setConfirmDialog({ open: false, title: '', message: '', onConfirm: null })}
        onConfirm={() => confirmDialog.onConfirm?.()}
      />
      {adminNotice.text && (
        <div className="fixed right-5 top-5 z-40 w-[min(420px,calc(100vw-40px))]">
          <AlertBanner message={adminNotice} type={adminNotice.type} onClose={() => setAdminNotice({ type: '', text: '' })} />
        </div>
      )}
      <aside className="w-64 border-r border-[#7f5c44]/30 bg-[#140d1f] p-6">
        <div className="mb-6">
          <p className="text-xs font-black uppercase tracking-[0.3em] text-[#d5a56a]">Admin Panel</p>
          <p className="text-xl font-black text-white">Dashboard</p>
        </div>

        <button
          onClick={onGoHome}
          className="mb-6 flex w-full items-center gap-3 rounded-xl border border-[#d5a56a]/40 bg-[#251735] px-4 py-3 text-sm font-bold text-[#f7d9b2] shadow-sm transition hover:bg-[#d5a56a] hover:text-[#2a1724]"
        >
          <span>🏠</span> Quay về trang chủ
        </button>

        <nav className="flex flex-col gap-2">
          {[
            { id: 'dashboard', label: 'Dashboard', icon: '📊' },
            { id: 'services', label: 'Dịch vụ', icon: '💅' },
            { id: 'appointments', label: 'Lịch hẹn', icon: '🗓️' },
            { id: 'users', label: 'Người dùng', icon: '👥' },
            { id: 'settings', label: 'Cài đặt', icon: '⚙️' }
          ].map(item => (
            <button
              key={item.id}
              onClick={() => setPage(item.id)}
              className={`flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-bold transition ${page === item.id ? 'bg-[#d5a56a] text-[#2a1724]' : 'text-[#cbb9bb] hover:bg-[#2a1d2f]'
                }`}
            >
              <span>{item.icon}</span>
              {item.label}
            </button>
          ))}
          <button
            onClick={onLogout}
            className="mt-10 flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-bold text-rose-300 hover:bg-rose-500/10"
          >
            <span>🚪</span> Đăng xuất
          </button>
        </nav>
      </aside>

      <main className="flex-1 overflow-y-auto p-10">
        {page === 'dashboard' && (
          <div>
            <h2 className="mb-6 text-3xl font-black text-[#f7dfc2]">Tổng quan</h2>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              <div className="rounded-2xl border border-[#8d6a52]/40 bg-[#170f22] p-6">
                <p className="text-sm font-bold uppercase tracking-widest text-[#d5a56a]">Dịch vụ</p>
                <p className="mt-2 text-4xl font-black text-white">{services.length}</p>
              </div>
              <div className="rounded-2xl border border-[#8d6a52]/40 bg-[#170f22] p-6">
                <p className="text-sm font-bold uppercase tracking-widest text-[#d5a56a]">Lịch hẹn</p>
                <p className="mt-2 text-4xl font-black text-white">{appointments.length}</p>
              </div>
              <div className="rounded-2xl border border-[#8d6a52]/40 bg-[#170f22] p-6">
                <p className="text-sm font-bold uppercase tracking-widest text-[#d5a56a]">Người dùng</p>
                <p className="mt-2 text-4xl font-black text-white">{users.length}</p>
              </div>
            </div>
          </div>
        )}

        {page === 'services' && (
          <div>
            <h2 className="mb-6 text-3xl font-black text-[#f7dfc2]">Quản lý dịch vụ</h2>

            <form onSubmit={addService} className="mb-8 rounded-xl border border-[#8d6a52]/35 bg-[#170f22] p-5">
              <div className="grid gap-5 lg:grid-cols-[1fr_220px]">
                <div>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <input
                      type="text"
                      placeholder="Tên dịch vụ"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="rounded-lg border border-[#6f5262] bg-[#0f0a17] px-4 py-3 text-white outline-none ring-[#d8a56c] focus:ring"
                    />
                    <input
                      type="number"
                      min="0"
                      placeholder="Giá (k)"
                      value={formData.price}
                      onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                      className="rounded-lg border border-[#6f5262] bg-[#0f0a17] px-4 py-3 text-white outline-none ring-[#d8a56c] focus:ring"
                    />
                    <input
                      type="number"
                      min="1"
                      placeholder="Thời lượng (phút)"
                      value={formData.duration}
                      onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                      className="rounded-lg border border-[#6f5262] bg-[#0f0a17] px-4 py-3 text-white outline-none ring-[#d8a56c] focus:ring"
                    />
                  </div>
                  <textarea
                    placeholder="Mô tả dịch vụ"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="mt-4 min-h-24 w-full rounded-lg border border-[#6f5262] bg-[#0f0a17] px-4 py-3 text-white outline-none ring-[#d8a56c] focus:ring"
                  />
                </div>

                <div>
                  <label htmlFor="service-image-input" className="mb-2 block text-xs font-black uppercase tracking-wide text-[#d8a56c]">
                    Ảnh dịch vụ
                  </label>
                  <div className="mb-3 aspect-[4/3] overflow-hidden rounded-lg border border-[#6f5262] bg-[#0f0a17]">
                    {serviceImagePreview ? (
                      <img src={serviceImagePreview} alt="Ảnh dịch vụ" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-sm font-bold text-[#8d7b82]">Chưa chọn ảnh</div>
                    )}
                  </div>
                  <input
                    id="service-image-input"
                    key={uploadInputKey}
                    type="file"
                    accept="image/jpeg,image/png,image/jpg,image/webp"
                    onChange={(e) => handleServiceImageChange(e.target.files[0] || null)}
                    className="w-full rounded-lg border border-[#6f5262] bg-[#0f0a17] px-3 py-2 text-xs text-[#cbb9bb] outline-none file:mr-3 file:rounded-md file:border-0 file:bg-[#d8a56c] file:px-3 file:py-2 file:font-bold file:text-[#2a1724]"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={adminActionLoading === 'Đang thêm dịch vụ...'}
                className="mt-4 rounded-md bg-[#f0c6bb] px-5 py-3 font-black uppercase tracking-wide text-[#2a1724] hover:bg-[#ffd9cf] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {adminActionLoading === 'Đang thêm dịch vụ...' ? 'Đang thêm...' : 'Thêm dịch vụ'}
              </button>
              {serviceFormMessage.text && (
                <AlertBanner message={serviceFormMessage} type={serviceFormMessage.type} onClose={() => setServiceFormMessage({ type: '', text: '' })} />
              )}
            </form>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {(Array.isArray(services) ? services : []).map((service) => (
                <div key={service.id} className="rounded-xl border border-[#8d6a52]/35 bg-[#170f22] p-5">
                  <div className="flex items-center justify-between">
                    <div className="flex gap-4">
                      {resolveServiceImage(service) && (
                        <img src={resolveServiceImage(service)} alt={service.name} className="h-16 w-16 rounded-lg object-cover" />
                      )}
                      <div>
                        <h3 className="text-xl font-black text-[#f7dfc2]">{service.name}</h3>
                        <p className="text-sm text-[#c7b4b6]">{service.price}k • {service.duration} phút</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => startEditService(service)} className="rounded-md bg-[#f0c6bb] px-4 py-2 text-xs font-bold uppercase tracking-wide text-[#2a1724] hover:bg-[#ffd9cf]">Sửa</button>
                      <button onClick={() => deleteService(service.id)} className="rounded-md border border-rose-400/60 px-4 py-2 text-xs font-bold uppercase tracking-wide text-rose-200 hover:bg-rose-500/20">Xóa</button>
                    </div>
                  </div>

                  {editingServiceId === service.id && (
                    <div className="mt-4 rounded-lg border border-[#6f5262] bg-[#0f0a17] p-4">
                      <div className="grid gap-4 md:grid-cols-[1fr_160px]">
                        <div>
                          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                            <input
                              type="text"
                              value={editServiceForm.name}
                              onChange={(e) => setEditServiceForm({ ...editServiceForm, name: e.target.value })}
                              className="rounded-lg border border-[#6f5262] bg-[#120b1c] px-3 py-2 text-white outline-none ring-[#d8a56c] focus:ring"
                            />
                            <input
                              type="number"
                              min="0"
                              value={editServiceForm.price}
                              onChange={(e) => setEditServiceForm({ ...editServiceForm, price: e.target.value })}
                              className="rounded-lg border border-[#6f5262] bg-[#120b1c] px-3 py-2 text-white outline-none ring-[#d8a56c] focus:ring"
                            />
                            <input
                              type="number"
                              min="1"
                              value={editServiceForm.duration}
                              onChange={(e) => setEditServiceForm({ ...editServiceForm, duration: e.target.value })}
                              className="rounded-lg border border-[#6f5262] bg-[#120b1c] px-3 py-2 text-white outline-none ring-[#d8a56c] focus:ring md:col-span-2"
                            />
                          </div>
                          <textarea
                            value={editServiceForm.description}
                            onChange={(e) => setEditServiceForm({ ...editServiceForm, description: e.target.value })}
                            className="mt-2 min-h-20 w-full rounded-lg border border-[#6f5262] bg-[#120b1c] px-3 py-2 text-white outline-none ring-[#d8a56c] focus:ring"
                          />
                        </div>
                        <div>
                          <div className="mb-2 aspect-[4/3] overflow-hidden rounded-lg border border-[#6f5262] bg-[#120b1c]">
                            {(editServiceImagePreview || resolveServiceImage(service)) ? (
                              <img src={editServiceImagePreview || resolveServiceImage(service)} alt={service.name} className="h-full w-full object-cover" />
                            ) : (
                              <div className="flex h-full items-center justify-center text-xs font-bold text-[#8d7b82]">Chưa có ảnh</div>
                            )}
                          </div>
                          <input
                            key={editServiceImageKey}
                            type="file"
                            accept="image/jpeg,image/png,image/jpg,image/webp"
                            onChange={(e) => handleEditServiceImageChange(e.target.files[0] || null)}
                            className="w-full text-xs text-[#99878e] file:mr-2 file:rounded-md file:border-0 file:bg-[#d8a56c] file:px-2 file:py-1 file:font-bold file:text-[#2a1724]"
                          />
                        </div>
                      </div>
                      <div className="mt-3 flex gap-2">
                        <button onClick={() => updateService(service.id)} disabled={adminActionLoading === 'Đang cập nhật dịch vụ...'} className="rounded-md bg-[#f0c6bb] px-4 py-2 text-xs font-bold uppercase text-[#2a1724] disabled:opacity-60">Lưu</button>
                        <button onClick={() => setEditingServiceId(null)} className="rounded-md border border-[#8d6a52] px-4 py-2 text-xs font-bold uppercase text-[#f3d5b8]">Hủy</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {page === 'appointments' && (
          <div>
            <h2 className="mb-6 text-3xl font-black text-[#f7dfc2]">Quản lý lịch hẹn</h2>

            <form onSubmit={submitNewAppointment} className="mb-8 rounded-xl border border-[#8d6a52]/35 bg-[#170f22] p-5">
              <h3 className="mb-4 text-lg font-black text-[#f7dfc2]">Thêm lịch hẹn mới</h3>
              <div className="grid grid-cols-2 gap-4">
                <input
                  type="text"
                  placeholder="Tên khách hàng"
                  required
                  value={newAppointmentForm.name}
                  onChange={(e) => setNewAppointmentForm({ ...newAppointmentForm, name: e.target.value })}
                  className="rounded-lg border border-[#6f5262] bg-[#0f0a17] px-4 py-2 text-white outline-none ring-[#d8a56c] focus:ring"
                />
                <input
                  type="text"
                  placeholder="Số điện thoại"
                  required
                  value={newAppointmentForm.phone}
                  onChange={(e) => setNewAppointmentForm({ ...newAppointmentForm, phone: e.target.value })}
                  className="rounded-lg border border-[#6f5262] bg-[#0f0a17] px-4 py-2 text-white outline-none ring-[#d8a56c] focus:ring"
                />

                <div className="grid grid-cols-2 gap-2">
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowNewAptCalendar(!showNewAptCalendar)}
                      className="w-full rounded-md border border-[#6f5262] bg-[#0f0a17] px-3 py-2 text-left text-sm text-white outline-none ring-[#d8a56c] hover:border-[#d8a56c] focus:ring"
                    >
                      📅 {formatDisplayDate(newAppointmentForm.appointment_date) || 'Chọn ngày'}
                    </button>

                    {showNewAptCalendar && (
                      <div className="absolute z-50 mt-1 w-64 rounded-lg border border-[#8d6a52] bg-[#1a0f27] p-3 shadow-xl left-0">
                        <div className="mb-3 flex items-center justify-between">
                          <button
                            type="button"
                            onClick={() => handleMonthChangeHelper(setNewAptCalendarMonth, newAptCalendarMonth, -1)}
                            className="rounded px-2 py-1 text-[#f7d9b2] hover:bg-[#2a1d2f]"
                          >
                            ‹
                          </button>
                          <div className="text-center text-xs font-bold text-[#f7d9b2]">
                            {newAptCalendarMonth.toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' })}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleMonthChangeHelper(setNewAptCalendarMonth, newAptCalendarMonth, 1)}
                            className="rounded px-2 py-1 text-[#f7d9b2] hover:bg-[#2a1d2f]"
                          >
                            ›
                          </button>
                        </div>

                        <div className="mb-2 grid grid-cols-7 gap-1 text-center text-[10px] font-semibold text-[#d8a56c]">
                          {['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'].map(day => (
                            <div key={day}>{day}</div>
                          ))}
                        </div>

                        <div className="grid grid-cols-7 gap-1">
                          {calculateCalendarDays(newAptCalendarMonth).map((date, i) => {
                            let dateStr = null;
                            if (date) {
                              const year = date.getFullYear();
                              const month = String(date.getMonth() + 1).padStart(2, '0');
                              const day = String(date.getDate()).padStart(2, '0');
                              dateStr = `${year}-${month}-${day}`;
                            }
                            const isSelected = dateStr === newAppointmentForm.appointment_date;

                            return (
                              <button
                                key={i}
                                type="button"
                                disabled={!date}
                                onClick={() => date && handleNewAptDateSelect(date)}
                                className={`rounded px-1 py-1 text-[10px] font-semibold ${!date
                                  ? 'text-[#6f5262]'
                                  : isSelected
                                    ? 'bg-[#f7d9b2] text-[#2a1724]'
                                    : 'bg-[#2a1d2f] text-[#f7d9b2] hover:bg-[#3a2d3f]'
                                  }`}
                              >
                                {date?.getDate()}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowNewAptTimeGrid(!showNewAptTimeGrid)}
                    className="w-full rounded-md border border-[#6f5262] bg-[#0f0a17] px-3 py-2 text-left text-sm text-white outline-none ring-[#d8a56c] hover:border-[#d8a56c] focus:ring flex justify-between items-center"
                  >
                    <span>🕒 {newAppointmentForm.appointment_time || 'Giờ'}</span>
                    <span className="text-[10px]">{showNewAptTimeGrid ? '▲' : '▼'}</span>
                  </button>
                </div>

                <div className="relative" ref={newAptServicePickerRef}>
                  <button
                    type="button"
                    onClick={() => setIsNewAptServicePickerOpen((prev) => !prev)}
                    className="w-full rounded-md border border-[#6f5262] bg-[#0f0a17] px-3 py-2 text-left text-sm text-white outline-none ring-[#d8a56c] hover:border-[#d8a56c] focus:ring"
                  >
                    <p className="text-xs font-semibold uppercase tracking-wide text-[#d8a56c]">Dịch vụ</p>
                    <p className="mt-1 text-xs text-[#cbb9bb]">
                      {newAppointmentForm.service_ids.length > 0
                        ? (Array.isArray(services) ? services : []).filter(s => newAppointmentForm.service_ids.includes(s.id)).map(s => s.name).join(', ')
                        : 'Chọn dịch vụ'}
                    </p>
                  </button>

                  {isNewAptServicePickerOpen && (
                    <div className="absolute left-0 right-0 z-50 mt-1 rounded-md border border-[#8d6a52] bg-[#1a0f27] p-3 shadow-xl">
                      <div className="max-h-48 space-y-2 overflow-auto pr-1">
                        {(Array.isArray(services) ? services : []).map((service) => {
                          const checked = newAppointmentForm.service_ids.includes(service.id);
                          return (
                            <label
                              key={service.id}
                              className={`flex cursor-pointer items-center justify-between rounded-md border px-3 py-2 text-sm transition ${checked
                                ? 'border-amber-400 bg-amber-500/20 text-amber-100'
                                : 'border-[#6f5262] bg-[#0f0a17] text-[#f8e7d9] hover:border-[#8d6a52]'
                                }`}
                            >
                              <span>{service.name}</span>
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleNewAppointmentService(service.id)}
                                className="h-4 w-4 accent-[#f0c6bb]"
                              />
                            </label>
                          );
                        })}
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsNewAptServicePickerOpen(false)}
                        className="mt-3 w-full rounded-md bg-[#f0c6bb] py-2 text-xs font-black uppercase text-[#2a1724]"
                      >
                        Xong
                      </button>
                    </div>
                  )}
                </div>
                <select
                  value={newAppointmentForm.staff_id}
                  onChange={(e) => setNewAppointmentForm({ ...newAppointmentForm, staff_id: e.target.value })}
                  required
                  className="rounded-lg border border-[#6f5262] bg-[#0f0a17] px-4 py-2 text-white outline-none ring-[#d8a56c] focus:ring"
                >
                  <option value="" disabled>Chọn nhân viên</option>
                  {(Array.isArray(staffs) ? staffs : []).map((staff) => (
                    <option key={staff.id} value={staff.id}>{staff.name}</option>
                  ))}
                </select>
              </div>

              {showNewAptTimeGrid && (
                <div className="mt-4 rounded-lg border border-[#8d6a52]/30 bg-[#120b1c] p-3">
                  <p className="mb-2 text-xs font-bold text-[#f7d9b2]">
                    Chọn khung giờ - {formatDisplayDate(newAppointmentForm.appointment_date) || 'Chưa chọn ngày'}
                  </p>
                  {loadingSchedule ? (
                    <p className="text-xs text-[#cbb9bb]">Đang tải...</p>
                  ) : (
                    <div className="grid grid-cols-3 gap-2">
                      {getAvailableTimeSlots(newAppointmentForm.appointment_date).map((slot) => {
                        const isBooked = bookedSlots.includes(slot);
                        const isSelected = newAppointmentForm.appointment_time === slot;
                        return (
                          <button
                            key={slot}
                            type="button"
                            disabled={isBooked}
                            onClick={() => {
                              setNewAppointmentForm(prev => ({ ...prev, appointment_time: slot }));
                              setShowNewAptTimeGrid(false);
                            }}
                            className={`rounded px-2 py-2 text-center text-xs font-bold transition ${isBooked
                              ? 'cursor-not-allowed bg-rose-500/20 text-rose-300 opacity-50'
                              : isSelected
                                ? 'bg-[#f0c6bb] text-[#2a1724]'
                                : 'bg-[#2a1d2f] text-[#f7d9b2] hover:bg-[#3a2d3f]'
                              }`}
                          >
                            {slot}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              <textarea
                value={newAppointmentForm.notes}
                onChange={(e) => setNewAppointmentForm((prev) => ({ ...prev, notes: e.target.value }))}
                placeholder="Ghi chú (không bắt buộc)"
                className="mt-3 w-full rounded-lg border border-[#6f5262] bg-[#0f0a17] px-3 py-2 text-white outline-none ring-[#d8a56c] focus:ring"
              />

              <button
                type="submit"
                disabled={isSubmittingAppointment}
                className="mt-3 rounded-md bg-[#f0c6bb] px-5 py-2 font-black uppercase tracking-wide text-[#2a1724] hover:bg-[#ffd9cf] disabled:opacity-60"
              >
                {isSubmittingAppointment ? 'Đang thêm...' : 'Thêm lịch hẹn'}
              </button>

              {appointmentMessage.text && (
                <AlertBanner message={appointmentMessage} type={appointmentMessage.type} onClose={() => setAppointmentMessage({ type: '', text: '' })} />
              )}
            </form>

            <div className="space-y-4">
              {appointments.length === 0 && (
                <div className="rounded-xl border border-[#8d6a52]/35 bg-[#170f22] p-5 text-sm text-[#c7b4b6]">
                  Chưa có lịch hẹn nào để hiển thị.
                </div>
              )}
              {(Array.isArray(appointments) ? appointments : []).map((apt) => (
                <div key={apt.id} className="rounded-xl border border-[#8d6a52]/35 bg-[#170f22] p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-lg font-bold text-[#f7dfc2]">{apt.user?.name || apt.customer_name || apt.name || apt.user?.username || `Khách #${apt.id}`}</p>
                      <p className="text-sm text-[#f3d5b8] mb-1">{apt.user?.phone || apt.phone || 'Chưa có số điện thoại'}</p>
                      <p className="text-sm text-[#c7b4b6] mb-1">
                        Dịch vụ: {(Array.isArray(apt.services) ? apt.services : []).map(s => s.name).join(', ') || 'N/A'}
                      </p>
                      <p className="text-xs text-[#c7b4b6] opacity-70">{new Date(apt.appointment_date).toLocaleString('vi-VN')}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-lg border border-[#8d6a52] bg-[#26192d] px-4 py-2 text-xs font-bold uppercase tracking-wide text-[#f3d5b8]">
                        {apt.status}
                      </span>

                      <button
                        onClick={() => startEditAppointment(apt)}
                        className="rounded-lg border border-[#8d6a52] px-4 py-2 text-xs font-bold uppercase tracking-wide text-[#f3d5b8] hover:bg-[#2a1d2f]"
                      >
                        Sửa
                      </button>
                      <button
                        onClick={() => deleteAppointmentByAdmin(apt.id)}
                        className="rounded-lg border border-rose-400/60 px-4 py-2 text-xs font-bold uppercase tracking-wide text-rose-200 hover:bg-rose-500/20"
                      >
                        Xóa
                      </button>
                    </div>
                  </div>

                  {editingAppointmentId === apt.id && (
                    <div className="mt-4 rounded-lg border border-[#6f5262] bg-[#0f0a17] p-4">
                      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#d8a56c]">Cập nhật thông tin lịch hẹn</p>

                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <input
                          type="text"
                          value={editAppointmentForm.name}
                          onChange={(e) => setEditAppointmentForm((prev) => ({ ...prev, name: e.target.value }))}
                          placeholder="Tên khách hàng"
                          className="rounded-lg border border-[#6f5262] bg-[#120b1c] px-3 py-2 text-white outline-none ring-[#d8a56c] focus:ring"
                        />

                        <input
                          type="text"
                          value={editAppointmentForm.phone}
                          onChange={(e) => setEditAppointmentForm((prev) => ({ ...prev, phone: e.target.value }))}
                          placeholder="Số điện thoại"
                          className="rounded-lg border border-[#6f5262] bg-[#120b1c] px-3 py-2 text-white outline-none ring-[#d8a56c] focus:ring"
                        />

                        <select
                          value={editAppointmentForm.status}
                          onChange={(e) => setEditAppointmentForm((prev) => ({ ...prev, status: e.target.value }))}
                          className="rounded-lg border border-[#6f5262] bg-[#120b1c] px-3 py-2 text-white outline-none ring-[#d8a56c] focus:ring"
                        >
                          {['pending', 'confirmed', 'rejected', 'in-process', 'completed', 'cancelled', 'no-show'].map((status) => (
                            <option key={status} value={status}>{status}</option>
                          ))}
                        </select>

                        <div className="relative" ref={editAptServicePickerRef}>
                          <button
                            type="button"
                            onClick={() => setIsEditAptServicePickerOpen((prev) => !prev)}
                            className="w-full rounded-md border border-[#6f5262] bg-[#120b1c] px-3 py-2 text-left text-sm text-white outline-none ring-[#d8a56c] hover:border-[#d8a56c] focus:ring"
                          >
                            <p className="text-xs font-semibold uppercase tracking-wide text-[#d8a56c]">Dịch vụ</p>
                            <p className="mt-1 text-xs text-[#cbb9bb]">
                              {editAppointmentForm.service_ids.length > 0
                                ? (Array.isArray(services) ? services : []).filter(s => editAppointmentForm.service_ids.includes(s.id)).map(s => s.name).join(', ')
                                : 'Chọn dịch vụ'}
                            </p>
                          </button>

                          {isEditAptServicePickerOpen && (
                            <div className="absolute left-0 right-0 z-50 mt-1 rounded-md border border-[#8d6a52] bg-[#1a0f27] p-3 shadow-xl">
                              <div className="max-h-48 space-y-2 overflow-auto pr-1">
                                {(Array.isArray(services) ? services : []).map((service) => {
                                  const checked = editAppointmentForm.service_ids.includes(service.id);
                                  return (
                                    <label
                                      key={service.id}
                                      className={`flex cursor-pointer items-center justify-between rounded-md border px-3 py-2 text-sm transition ${checked
                                        ? 'border-amber-400 bg-amber-500/20 text-amber-100'
                                        : 'border-[#6f5262] bg-[#120b1c] text-[#f8e7d9] hover:border-[#8d6a52]'
                                        }`}
                                    >
                                      <span>{service.name}</span>
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() => toggleEditAppointmentService(service.id)}
                                        className="h-4 w-4 accent-[#f0c6bb]"
                                      />
                                    </label>
                                  );
                                })}
                              </div>
                              <button
                                type="button"
                                onClick={() => setIsEditAptServicePickerOpen(false)}
                                className="mt-3 w-full rounded-md bg-[#f0c6bb] py-2 text-xs font-black uppercase text-[#2a1724]"
                              >
                                Xong
                              </button>
                            </div>
                          )}
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div className="relative">
                            <button
                              type="button"
                              onClick={() => setShowEditAptCalendar(!showEditAptCalendar)}
                              className="w-full rounded-md border border-[#6f5262] bg-[#120b1c] px-3 py-2 text-left text-sm text-white outline-none ring-[#d8a56c] hover:border-[#d8a56c] focus:ring"
                            >
                              📅 {formatDisplayDate(editAppointmentForm.appointment_date) || 'Chọn ngày'}
                            </button>

                            {showEditAptCalendar && (
                              <div className="absolute z-50 mt-1 w-64 rounded-lg border border-[#8d6a52] bg-[#1a0f27] p-3 shadow-xl left-0">
                                <div className="mb-3 flex items-center justify-between">
                                  <button
                                    type="button"
                                    onClick={() => handleMonthChangeHelper(setEditAptCalendarMonth, editAptCalendarMonth, -1)}
                                    className="rounded px-2 py-1 text-[#f7d9b2] hover:bg-[#2a1d2f]"
                                  >
                                    ‹
                                  </button>
                                  <div className="text-center text-xs font-bold text-[#f7d9b2]">
                                    {editAptCalendarMonth.toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' })}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => handleMonthChangeHelper(setEditAptCalendarMonth, editAptCalendarMonth, 1)}
                                    className="rounded px-2 py-1 text-[#f7d9b2] hover:bg-[#2a1d2f]"
                                  >
                                    ›
                                  </button>
                                </div>

                                <div className="mb-2 grid grid-cols-7 gap-1 text-center text-[10px] font-semibold text-[#d8a56c]">
                                  {['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'].map(day => (
                                    <div key={day}>{day}</div>
                                  ))}
                                </div>

                                <div className="grid grid-cols-7 gap-1">
                                  {calculateCalendarDays(editAptCalendarMonth).map((date, i) => {
                                    let dateStr = null;
                                    if (date) {
                                      const year = date.getFullYear();
                                      const month = String(date.getMonth() + 1).padStart(2, '0');
                                      const day = String(date.getDate()).padStart(2, '0');
                                      dateStr = `${year}-${month}-${day}`;
                                    }
                                    const isSelected = dateStr === editAppointmentForm.appointment_date;

                                    return (
                                      <button
                                        key={i}
                                        type="button"
                                        disabled={!date}
                                        onClick={() => date && handleEditAptDateSelect(date)}
                                        className={`rounded px-1 py-1 text-[10px] font-semibold ${!date
                                          ? 'text-[#6f5262]'
                                          : isSelected
                                            ? 'bg-[#f7d9b2] text-[#2a1724]'
                                            : 'bg-[#2a1d2f] text-[#f7d9b2] hover:bg-[#3a2d3f]'
                                          }`}
                                      >
                                        {date?.getDate()}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={() => setShowEditAptTimeGrid(!showEditAptTimeGrid)}
                            className="w-full rounded-md border border-[#6f5262] bg-[#120b1c] px-3 py-2 text-left text-sm text-white outline-none ring-[#d8a56c] hover:border-[#d8a56c] focus:ring flex justify-between items-center"
                          >
                            <span>🕒 {editAppointmentForm.appointment_time || 'Giờ'}</span>
                            <span className="text-[10px]">{showEditAptTimeGrid ? '▲' : '▼'}</span>
                          </button>
                        </div>
                      </div>

                      {showEditAptTimeGrid && (
                        <div className="mt-3 rounded-lg border border-[#8d6a52]/30 bg-[#120b1c] p-3">
                          <p className="mb-2 text-xs font-bold text-[#f7d9b2]">
                            Chọn khung giờ - {formatDisplayDate(editAppointmentForm.appointment_date) || 'Chưa chọn ngày'}
                          </p>
                          {loadingSchedule ? (
                            <p className="text-xs text-[#cbb9bb]">Đang tải...</p>
                          ) : (
                            <div className="grid grid-cols-3 gap-2">
                              {getAvailableTimeSlots(editAppointmentForm.appointment_date).map((slot) => {
                                const isBooked = bookedSlots.includes(slot);
                                const isSelected = editAppointmentForm.appointment_time === slot;
                                return (
                                  <button
                                    key={slot}
                                    type="button"
                                    disabled={isBooked}
                                    onClick={() => {
                                      setEditAppointmentForm(prev => ({ ...prev, appointment_time: slot }));
                                      setShowEditAptTimeGrid(false);
                                    }}
                                    className={`rounded px-2 py-2 text-center text-xs font-bold transition ${isBooked
                                      ? 'cursor-not-allowed bg-rose-500/20 text-rose-300 opacity-50'
                                      : isSelected
                                        ? 'bg-[#f0c6bb] text-[#2a1724]'
                                        : 'bg-[#2a1d2f] text-[#f7d9b2] hover:bg-[#3a2d3f]'
                                      }`}
                                  >
                                    {slot}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}

                      <div className="mt-3">
                        <textarea
                          value={editAppointmentForm.notes}
                          onChange={(e) => setEditAppointmentForm((prev) => ({ ...prev, notes: e.target.value }))}
                          placeholder="Ghi chú"
                          className="w-full rounded-lg border border-[#6f5262] bg-[#120b1c] px-3 py-2 text-white outline-none ring-[#d8a56c] focus:ring"
                        />
                      </div>

                      <div className="mt-3 flex gap-2">
                        <button
                          onClick={() => submitEditAppointmentByAdmin(apt.id)}
                          className="rounded-md bg-[#f0c6bb] px-4 py-2 text-xs font-black uppercase tracking-wide text-[#2a1724] hover:bg-[#ffd9cf]"
                        >
                          Cập nhật
                        </button>
                        <button
                          onClick={() => setEditingAppointmentId(null)}
                          className="rounded-md border border-[#8d6a52] px-4 py-2 text-xs font-bold uppercase tracking-wide text-[#f3d5b8] hover:bg-[#2a1d2f]"
                        >
                          Hủy
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {page === 'settings' && (
          <div>
            <h2 className="mb-6 text-3xl font-black text-[#f7dfc2]">Cài đặt salon</h2>

            {settingsLoading ? (
              <p className="text-[#cbb9bb]">Đang tải cài đặt...</p>
            ) : (
              <>
                <div className="mb-6 rounded-xl border border-[#8d6a52]/35 bg-[#170f22] p-5">
                  <h3 className="mb-4 text-lg font-black text-[#f7dfc2]">Tải lên ảnh Hero</h3>

                  {settingsForm.hero_image && (
                    <div className="mb-4">
                      <p className="mb-2 text-sm text-[#d7c4c6]">Ảnh hiện tại:</p>
                      <img
                        src={resolveHeroImage(settingsForm.hero_image)}
                        alt="Current Hero"
                        className="aspect-[16/9] w-full max-w-xl rounded-lg border border-[#8d6a52]/35 object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => deleteSalonImage(settingsForm.hero_image, 'hero_image')}
                        className="mt-2 rounded-md border border-rose-400/60 px-3 py-2 text-xs font-bold uppercase text-rose-200 hover:bg-rose-500/20"
                      >
                        Xóa ảnh hero
                      </button>
                    </div>
                  )}

                  <div className="w-full rounded-lg border border-dashed border-[#8d6a52]/40 bg-[#0f0a17] px-4 py-2 text-[#cbb9bb]">
                    <input
                      ref={heroFileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/jpg,image/gif,image/webp"
                      onChange={uploadHeroImage}
                      disabled={heroImageUploading}
                      className="hidden"
                      id="hero-image-input"
                    />
                    <label
                      htmlFor="hero-image-input"
                      className={`mr-4 inline-block rounded-md bg-[#d8a56c] px-3 py-2 font-semibold text-[#2a1724] ${heroImageUploading ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
                    >
                      Chọn tệp
                    </label>
                    <span className="text-[#cbb9bb]">{heroSelectedFileName}</span>
                  </div>

                  <p className="mt-2 text-xs text-[#99878e]">
                    Chấp nhận: JPEG, PNG, GIF, WEBP. Nên dùng ảnh ngang tối thiểu 1920x1080 để banner không bị vỡ hoặc mờ khi kéo rộng.
                  </p>

                  {heroImageMessage.text && (
                    <AlertBanner message={heroImageMessage} type={heroImageMessage.type} onClose={() => setHeroImageMessage({ type: '', text: '' })} />
                  )}

                  {heroImageUploading && (
                    <p className="mt-3 text-sm text-[#d8a56c]">Đang tải lên...</p>
                  )}
                </div>

                <div className="mb-6 rounded-xl border border-[#8d6a52]/35 bg-[#170f22] p-5">
                  <h3 className="mb-4 text-lg font-black text-[#f7dfc2]">Logo và bộ sưu tập trang chủ</h3>

                  <div className="grid gap-5 md:grid-cols-2">
                    <div>
                      <p className="mb-2 text-sm font-semibold text-[#f3d5b8]">Logo salon</p>
                      {settingsForm.logo && (
                        <div className="mb-3 flex items-center gap-3">
                          <img src={resolveImageUrl(settingsForm.logo)} alt="Logo salon" className="h-16 w-16 rounded-lg object-contain bg-[#0f0a17]" />
                          <button
                            type="button"
                            onClick={() => deleteSalonImage(settingsForm.logo, 'logo')}
                            className="rounded-md border border-rose-400/60 px-3 py-2 text-xs font-bold uppercase text-rose-200 hover:bg-rose-500/20"
                          >
                            Xóa logo
                          </button>
                        </div>
                      )}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/jpg,image/gif,image/webp"
                        onChange={(e) => uploadSalonImage(e, 'logo')}
                        disabled={Boolean(imageUploading.logo)}
                        className="w-full rounded-lg border border-dashed border-[#8d6a52]/40 bg-[#0f0a17] px-4 py-2 text-sm text-[#cbb9bb]"
                      />
                    </div>

                    <div>
                      <p className="mb-2 text-sm font-semibold text-[#f3d5b8]">Thêm ảnh bộ sưu tập</p>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/jpg,image/gif,image/webp"
                        onChange={(e) => uploadSalonImage(e, 'gallery')}
                        disabled={Boolean(imageUploading.gallery)}
                        className="w-full rounded-lg border border-dashed border-[#8d6a52]/40 bg-[#0f0a17] px-4 py-2 text-sm text-[#cbb9bb]"
                      />
                    </div>
                  </div>

                  {settingsForm.gallery_images?.length > 0 && (
                    <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
                      {settingsForm.gallery_images.map((image) => (
                        <div key={image} className="rounded-lg border border-[#8d6a52]/30 bg-[#0f0a17] p-2">
                          <img src={resolveImageUrl(image)} alt="Ảnh bộ sưu tập" className="h-24 w-full rounded-md object-cover" />
                          <button
                            type="button"
                            onClick={() => deleteSalonImage(image, 'gallery')}
                            className="mt-2 w-full rounded-md border border-rose-400/60 px-2 py-1 text-xs font-bold uppercase text-rose-200 hover:bg-rose-500/20"
                          >
                            Xóa
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <form onSubmit={updateSalonSettings} className="rounded-xl border border-[#8d6a52]/35 bg-[#170f22] p-5">
                  <div className="mb-6 grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-[#f3d5b8]">Tên salon</label>
                      <input
                        type="text"
                        value={settingsForm.salon_name}
                        onChange={(e) => setSettingsForm((prev) => ({ ...prev, salon_name: e.target.value }))}
                        placeholder="Tên hiển thị ngoài trang chủ"
                        className="w-full rounded-lg border border-[#6f5262] bg-[#0f0a17] px-4 py-2 text-white outline-none ring-[#d8a56c] placeholder:text-[#99878e] focus:ring"
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-[#f3d5b8]">Email salon</label>
                      <input
                        type="email"
                        value={settingsForm.salon_email}
                        onChange={(e) => setSettingsForm((prev) => ({ ...prev, salon_email: e.target.value }))}
                        placeholder="Email liên hệ"
                        className="w-full rounded-lg border border-[#6f5262] bg-[#0f0a17] px-4 py-2 text-white outline-none ring-[#d8a56c] placeholder:text-[#99878e] focus:ring"
                      />
                    </div>
                  </div>

                  <div className="mb-6">
                    <label className="mb-2 block text-sm font-semibold text-[#f3d5b8]">Số điện thoại liên hệ</label>
                    <input
                      type="text"
                      value={settingsForm.salon_phone}
                      onChange={(e) => setSettingsForm((prev) => ({ ...prev, salon_phone: e.target.value }))}
                      placeholder="Nhập số điện thoại liên hệ"
                      className="w-full rounded-lg border border-[#6f5262] bg-[#0f0a17] px-4 py-2 text-white outline-none ring-[#d8a56c] placeholder:text-[#99878e] focus:ring"
                    />
                  </div>

                  <div className="mb-6">
                    <label className="mb-2 block text-sm font-semibold text-[#f3d5b8]">Địa chỉ salon</label>
                    <textarea
                      value={settingsForm.salon_address}
                      onChange={(e) => setSettingsForm((prev) => ({ ...prev, salon_address: e.target.value }))}
                      placeholder="Địa chỉ hiển thị ngoài trang chủ"
                      className="w-full rounded-lg border border-[#6f5262] bg-[#0f0a17] px-4 py-2 text-white outline-none ring-[#d8a56c] placeholder:text-[#99878e] focus:ring"
                    />
                  </div>

                  <h3 className="mb-3 text-lg font-black text-[#f7dfc2]">Giờ làm việc theo ngày</h3>
                  <div className="space-y-3">
                    {Object.keys(DAY_LABELS).map((dayKey) => {
                      const value = settingsForm.working_hours?.[dayKey] || {};
                      return (
                        <div key={dayKey} className="rounded-lg border border-[#8d6a52]/30 bg-[#120b1c] p-3">
                          <div className="mb-2 flex items-center justify-between">
                            <p className="font-semibold text-[#f3d5b8]">{DAY_LABELS[dayKey]}</p>
                            <label className="flex items-center gap-2 text-xs text-[#d7c4c6]">
                              <input
                                type="checkbox"
                                checked={Boolean(value.closed)}
                                onChange={(e) => updateWorkingHourValue(dayKey, 'closed', e.target.checked)}
                              />
                              Nghỉ
                            </label>
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <input
                              type="time"
                              value={value.open || '09:00'}
                              disabled={Boolean(value.closed)}
                              onChange={(e) => updateWorkingHourValue(dayKey, 'open', e.target.value)}
                              className="rounded-lg border border-[#6f5262] bg-[#0f0a17] px-3 py-2 text-white outline-none ring-[#d8a56c] disabled:opacity-50"
                            />
                            <input
                              type="time"
                              value={value.close || '18:00'}
                              disabled={Boolean(value.closed)}
                              onChange={(e) => updateWorkingHourValue(dayKey, 'close', e.target.value)}
                              className="rounded-lg border border-[#6f5262] bg-[#0f0a17] px-3 py-2 text-white outline-none ring-[#d8a56c] disabled:opacity-50"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <button
                    type="submit"
                    disabled={settingsSaving}
                    className="mt-5 rounded-md bg-[#f0c6bb] px-5 py-2 font-black uppercase tracking-wide text-[#2a1724] hover:bg-[#ffd9cf] disabled:opacity-60"
                  >
                    {settingsSaving ? 'Đang lưu...' : 'Lưu cài đặt'}
                  </button>

                  {settingsMessage.text && (
                    <AlertBanner message={settingsMessage} type={settingsMessage.type} onClose={() => setSettingsMessage({ type: '', text: '' })} />
                  )}
                </form>
              </>
            )}
          </div>
        )}

        {page === 'users' && (
          <div>
            <h2 className="mb-6 text-3xl font-black text-[#f7dfc2]">Quản lý người dùng</h2>

            <form onSubmit={addUser} className="mb-8 rounded-xl border border-[#8d6a52]/35 bg-[#170f22] p-5">
              <div className="mb-4 grid grid-cols-2 gap-4">
                <input
                  type="text"
                  placeholder="Họ tên"
                  value={userForm.name}
                  onChange={(e) => setUserForm({ ...userForm, name: e.target.value })}
                  className="rounded-lg border border-[#6f5262] bg-[#0f0a17] px-4 py-2 text-white outline-none ring-[#d8a56c] placeholder:text-[#99878e] focus:ring"
                />
                <input
                  type="text"
                  placeholder="Tên đăng nhập"
                  value={userForm.username}
                  onChange={(e) => setUserForm({ ...userForm, username: e.target.value })}
                  className="rounded-lg border border-[#6f5262] bg-[#0f0a17] px-4 py-2 text-white outline-none ring-[#d8a56c] placeholder:text-[#99878e] focus:ring"
                />
                <input
                  type="email"
                  placeholder="Email"
                  value={userForm.email}
                  onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                  className="rounded-lg border border-[#6f5262] bg-[#0f0a17] px-4 py-2 text-white outline-none ring-[#d8a56c] placeholder:text-[#99878e] focus:ring"
                />
                <input
                  type="text"
                  placeholder="Số điện thoại"
                  value={userForm.phone}
                  onChange={(e) => setUserForm({ ...userForm, phone: e.target.value })}
                  className="rounded-lg border border-[#6f5262] bg-[#0f0a17] px-4 py-2 text-white outline-none ring-[#d8a56c] placeholder:text-[#99878e] focus:ring"
                />
                <div className="relative">
                  <input
                    type={showUserPassword ? 'text' : 'password'}
                    placeholder="Mật khẩu"
                    value={userForm.password}
                    onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                    className="w-full rounded-lg border border-[#6f5262] bg-[#0f0a17] px-4 py-2 text-white outline-none ring-[#d8a56c] placeholder:text-[#99878e] focus:ring pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowUserPassword(!showUserPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md text-[#99878e] hover:text-[#f0c6bb]"
                    title={showUserPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                    aria-label={showUserPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                  >
                    <PasswordVisibilityIcon visible={showUserPassword} />
                  </button>
                </div>
                <select
                  value={userForm.role}
                  onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}
                  className="rounded-lg border border-[#6f5262] bg-[#0f0a17] px-4 py-2 text-white outline-none ring-[#d8a56c] focus:ring"
                >
                  <option value="customer">Khách hàng</option>
                  <option value="admin">Quản trị viên</option>
                </select>
              </div>
              <button type="submit" className="rounded-md bg-[#f0c6bb] px-5 py-2 font-black uppercase tracking-wide text-[#2a1724] hover:bg-[#ffd9cf]">
                Thêm người dùng
              </button>
              {userMessage.text && (
                <AlertBanner message={userMessage} type={userMessage.type} onClose={() => setUserMessage({ type: '', text: '' })} />
              )}
            </form>

            <div className="grid grid-cols-1 gap-4">
              {users.map((user) => (
                <div key={user.id} className="rounded-xl border border-[#8d6a52]/35 bg-[#170f22] p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xl font-black text-[#f7dfc2]">{user.name}</h3>
                      <p className="text-sm text-[#c7b4b6]">@{user.username} | {user.email} | {user.phone || 'N/A'}</p>
                      <p className="mt-1 text-xs font-bold uppercase tracking-wider text-[#d8a56c]">Vai trò: {(user.roles && user.roles.length > 0) ? user.roles[0].name : (user.role || 'customer')}</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => startEditUser(user)}
                        className="rounded-md bg-[#f0c6bb] px-4 py-2 text-xs font-bold uppercase tracking-wide text-[#2a1724] hover:bg-[#ffd9cf]"
                      >
                        Sửa
                      </button>
                      <button
                        onClick={() => deleteUser(user.id)}
                        className="rounded-md border border-rose-400/60 px-4 py-2 text-xs font-bold uppercase tracking-wide text-rose-200 hover:bg-rose-500/20"
                      >
                        Xóa
                      </button>
                    </div>
                  </div>

                  {editingUserId === user.id && (
                    <div className="mt-4 rounded-lg border border-[#6f5262] bg-[#0f0a17] p-4">
                      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#d8a56c]">Cập nhật thông tin</p>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={editUserForm.name}
                          onChange={(e) => setEditUserForm({ ...editUserForm, name: e.target.value })}
                          className="rounded-lg border border-[#6f5262] bg-[#120b1c] px-3 py-2 text-white outline-none ring-[#d8a56c] focus:ring"
                          placeholder="Họ tên"
                        />
                        <input
                          type="text"
                          value={editUserForm.username}
                          onChange={(e) => setEditUserForm({ ...editUserForm, username: e.target.value })}
                          className="rounded-lg border border-[#6f5262] bg-[#120b1c] px-3 py-2 text-white outline-none ring-[#d8a56c] focus:ring"
                          placeholder="Tên đăng nhập"
                        />
                        <input
                          type="email"
                          value={editUserForm.email}
                          onChange={(e) => setEditUserForm({ ...editUserForm, email: e.target.value })}
                          className="rounded-lg border border-[#6f5262] bg-[#120b1c] px-3 py-2 text-white outline-none ring-[#d8a56c] focus:ring"
                          placeholder="Email"
                        />
                        <input
                          type="text"
                          value={editUserForm.phone}
                          onChange={(e) => setEditUserForm({ ...editUserForm, phone: e.target.value })}
                          className="rounded-lg border border-[#6f5262] bg-[#120b1c] px-3 py-2 text-white outline-none ring-[#d8a56c] focus:ring"
                          placeholder="Số điện thoại"
                        />
                        <div className="relative">
                          <input
                            type={showEditUserPassword ? 'text' : 'password'}
                            value={editUserForm.password}
                            onChange={(e) => setEditUserForm({ ...editUserForm, password: e.target.value })}
                            className="w-full rounded-lg border border-[#6f5262] bg-[#120b1c] px-3 py-2 text-white outline-none ring-[#d8a56c] focus:ring pr-10"
                            placeholder="Mật khẩu mới (bỏ trống nếu không đổi)"
                          />
                          <button
                            type="button"
                            onClick={() => setShowEditUserPassword(!showEditUserPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md text-[#99878e] hover:text-[#f0c6bb]"
                            title={showEditUserPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                            aria-label={showEditUserPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                          >
                            <PasswordVisibilityIcon visible={showEditUserPassword} />
                          </button>
                        </div>
                        <select
                          value={editUserForm.role}
                          onChange={(e) => setEditUserForm({ ...editUserForm, role: e.target.value })}
                          className="rounded-lg border border-[#6f5262] bg-[#120b1c] px-3 py-2 text-white outline-none ring-[#d8a56c] focus:ring"
                        >
                          <option value="customer">Khách hàng</option>
                          <option value="admin">Quản trị viên</option>
                        </select>
                      </div>
                      <div className="mt-3 flex gap-2">
                        <button
                          onClick={() => updateUser(user.id)}
                          className="rounded-md bg-[#f0c6bb] px-4 py-2 text-xs font-bold uppercase tracking-wide text-[#2a1724] hover:bg-[#ffd9cf]"
                        >
                          Cập nhật
                        </button>
                        <button
                          onClick={() => setEditingUserId(null)}
                          className="rounded-md border border-[#8d6a52] px-4 py-2 text-xs font-bold uppercase tracking-wide text-[#f3d5b8] hover:bg-[#2a1d2f]"
                        >
                          Hủy
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function LoginRegister({ setAuth, initialMode, onBack }) {
  const [mode, setMode] = useState(initialMode || 'login');
  const [formData, setFormData] = useState({
    name: '',
    username: '',
    email: '',
    phone: '',
    password: '',
    password_confirmation: '',
    role: 'customer'
  });
  const [message, setMessage] = useState({ type: '', text: '' });
  const [loading, setLoading] = useState(false);
  const [showAuthPassword, setShowAuthPassword] = useState(false);
  const [showAuthPasswordConfirm, setShowAuthPasswordConfirm] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage({ type: '', text: '' });

    const endpoint = mode === 'login' ? '/api/login' : '/api/register';

    try {
      // Get CSRF cookie first for stateful sanctum
      await fetch(`${API_BASE_URL}/sanctum/csrf-cookie`, { credentials: 'include' });

      const res = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-XSRF-TOKEN': decodeURIComponent(getCookie('XSRF-TOKEN') || '')
        },
        body: JSON.stringify(formData)
      });

      const data = await res.json();
      if (res.ok) {
        const token = data?.data?.token || data?.token;
        const userData = data?.data?.user || data?.user || data?.data;
        if (token) localStorage.setItem('auth_token', token);
        setAuth({ user: userData, token });
      } else {
        const firstError = data?.errors ? Object.values(data.errors).flat()[0] : '';
        setMessage({ type: 'error', text: firstError || data.message || (mode === 'login' ? 'Đăng nhập thất bại.' : 'Đăng ký thất bại.') });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Lỗi kết nối. Vui lòng thử lại.' });
    }
    setLoading(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#08050c] p-4 text-[#f8e7d9]">
      <LoadingOverlay show={loading} label={mode === 'login' ? 'Đang đăng nhập...' : 'Đang tạo tài khoản...'} />
      <div className="w-full max-w-md rounded-2xl border border-[#d5a56a]/30 bg-[#140d1f] p-8 shadow-2xl shadow-black/40">
        <button onClick={onBack} className="mb-6 text-sm font-bold text-[#d5a56a] hover:text-white">← Quay lại</button>
        <h2 className="mb-6 text-3xl font-black uppercase tracking-wide text-[#f7d9b2]">
          {mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'register' && (
            <input
              type="text"
              placeholder="Họ và tên"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full rounded-xl border border-[#6f5262] bg-[#0f0a17] px-4 py-3 text-white outline-none focus:ring-1 focus:ring-[#d8a56c]"
            />
          )}
          <input
            type="text"
            placeholder="Tên đăng nhập"
            required
            value={formData.username}
            onChange={(e) => setFormData({ ...formData, username: e.target.value })}
            className="w-full rounded-xl border border-[#6f5262] bg-[#0f0a17] px-4 py-3 text-white outline-none focus:ring-1 focus:ring-[#d8a56c]"
          />
          {mode === 'register' && (
            <>
              <select
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                className="w-full rounded-xl border border-[#6f5262] bg-[#0f0a17] px-4 py-3 text-white outline-none focus:ring-1 focus:ring-[#d8a56c]"
              >
                <option value="customer">Tài khoản khách hàng</option>
                <option value="admin">Tài khoản quản trị viên</option>
              </select>
              <input
                type="email"
                placeholder="Email"
                required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full rounded-xl border border-[#6f5262] bg-[#0f0a17] px-4 py-3 text-white outline-none focus:ring-1 focus:ring-[#d8a56c]"
              />
              <input
                type="text"
                placeholder="Số điện thoại"
                required
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full rounded-xl border border-[#6f5262] bg-[#0f0a17] px-4 py-3 text-white outline-none focus:ring-1 focus:ring-[#d8a56c]"
              />
            </>
          )}
          <div className="relative">
            <input
              type={showAuthPassword ? 'text' : 'password'}
              placeholder="Mật khẩu"
              required
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              className="w-full rounded-xl border border-[#6f5262] bg-[#0f0a17] px-4 py-3 pr-12 text-white outline-none focus:ring-1 focus:ring-[#d8a56c]"
            />
            <button
              type="button"
              onClick={() => setShowAuthPassword(!showAuthPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2 rounded-md text-[#99878e] hover:text-[#f0c6bb]"
              title={showAuthPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
              aria-label={showAuthPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
            >
              <PasswordVisibilityIcon visible={showAuthPassword} />
            </button>
          </div>
          {mode === 'register' && (
            <div className="relative">
              <input
                type={showAuthPasswordConfirm ? 'text' : 'password'}
                placeholder="Xác nhận mật khẩu"
                required
                value={formData.password_confirmation}
                onChange={(e) => setFormData({ ...formData, password_confirmation: e.target.value })}
                className="w-full rounded-xl border border-[#6f5262] bg-[#0f0a17] px-4 py-3 pr-12 text-white outline-none focus:ring-1 focus:ring-[#d8a56c]"
              />
              <button
                type="button"
                onClick={() => setShowAuthPasswordConfirm(!showAuthPasswordConfirm)}
                className="absolute right-4 top-1/2 -translate-y-1/2 rounded-md text-[#99878e] hover:text-[#f0c6bb]"
                title={showAuthPasswordConfirm ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                aria-label={showAuthPasswordConfirm ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
              >
                <PasswordVisibilityIcon visible={showAuthPasswordConfirm} />
              </button>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-gradient-to-r from-[#d5a56a] to-[#e4b7bf] py-4 text-sm font-black uppercase tracking-widest text-[#2a1724] hover:shadow-lg hover:shadow-[#d5a56a]/20 transition"
          >
            {loading ? 'Đang xử lý...' : (mode === 'login' ? 'Đăng nhập' : 'Đăng ký ngay')}
          </button>

          {message.text && (
            <AlertBanner message={message} type={message.type} onClose={() => setMessage({ type: '', text: '' })} />
          )}
        </form>

        <div className="mt-8 text-center text-sm">
          <p className="text-[#cbb9bb]">
            {mode === 'login' ? 'Chưa có tài khoản?' : 'Đã có tài khoản?'}
            <button
              onClick={() => {
                setMessage({ type: '', text: '' });
                setMode(mode === 'login' ? 'register' : 'login');
              }}
              className="ml-2 font-black text-[#d5a56a] hover:underline"
            >
              {mode === 'login' ? 'Đăng ký ngay' : 'Đăng nhập'}
            </button>
          </p>

          <div className="mt-6 flex items-center justify-center gap-4 border-t border-[#6f5262]/30 pt-6">
            <a
              href={`${API_BASE_URL}/auth/google`}
              className="flex items-center gap-2 rounded-lg border border-[#6f5262] px-4 py-2 text-xs font-bold text-[#f8e7d9] hover:bg-white/5 transition"
            >
              Google
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('app')).render(<App />);
