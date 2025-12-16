/* eslint-disable @typescript-eslint/no-explicit-any */

const API_BASE = (import.meta as any).env?.VITE_API_URL || 'http://localhost:4000/api';

function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem('auth_token');
  return token
    ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' };
}

async function requestJSON(path: string, options: RequestInit & { auth?: boolean } = {}) {
  const { auth = false, headers, ...rest } = options as any;
  const baseHeaders = auth ? getAuthHeaders() : { 'Content-Type': 'application/json' };
  const mergedHeaders = { ...baseHeaders, ...(headers || {}) } as HeadersInit;

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, { ...rest, headers: mergedHeaders });
  } catch {
    throw new Error('Netzwerkfehler – bitte Verbindung prüfen.');
  }

  const tryParse = async () => {
    const text = await response.text();
    try {
      return text ? JSON.parse(text) : null;
    } catch {
      return { message: text || null } as any;
    }
  };

  if (!response.ok) {
    const data = await tryParse();
    const status = response.status;
    const message = (data && ((data as any).message || (data as any).error)) || `Fehler ${status}`;
    if (status === 401) {
      localStorage.removeItem('auth_token');
      try {
        window.dispatchEvent(new Event('auth:logout'));
      } catch {
        // ignore
      }
      throw new Error('Nicht angemeldet (401) – bitte neu einloggen.');
    }
    throw new Error(typeof message === 'string' ? message : 'Unbekannter Fehler');
  }

  return await tryParse();
}

const api = {
  // Public endpoints
  events: {
    async getActive() {
      return requestJSON('/events/active');
    },
  },
  bookings: {
    async verifyEmail(token: string) {
      const safe = encodeURIComponent(String(token || ''));
      return requestJSON(`/bookings/verify/${safe}`);
    },
  },
  async getTeachers() {
    const res = await requestJSON('/teachers');
    return (res && (res as any).teachers) || [];
  },
  async getSlots(teacherId: number, eventId?: number | null) {
    const ev = eventId ? `&eventId=${encodeURIComponent(String(eventId))}` : '';
    const res = await requestJSON(`/slots?teacherId=${encodeURIComponent(String(teacherId))}${ev}`);
    return (res && (res as any).slots) || [];
  },
  async createBooking(slotId: number, formData: any) {
    return requestJSON('/bookings', {
      method: 'POST',
      body: JSON.stringify({ slotId, ...formData }),
    });
  },
  async health() {
    return requestJSON('/health');
  },

  // Auth endpoints
  auth: {
    async login(username: string, password: string) {
      return requestJSON('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
    },
    async verify() {
      try {
        const data = await requestJSON('/auth/verify', { auth: true });
        return data || { authenticated: false } as any;
      } catch {
        return { authenticated: false } as any;
      }
    },
    async logout() {
      return requestJSON('/auth/logout', { method: 'DELETE', auth: true });
    },
  },

  // Admin endpoints
  admin: {
    async getBookings() {
      const res = await requestJSON('/admin/bookings', { auth: true });
      return (res && (res as any).bookings) || [];
    },
    async cancelBooking(bookingId: number) {
      // Backend erwartet DELETE /api/admin/bookings/:slotId
      return requestJSON(`/admin/bookings/${bookingId}`, { method: 'DELETE', auth: true });
    },
    async getTeachers() {
      const res = await requestJSON('/admin/teachers', { auth: true });
      return (res && (res as any).teachers) || [];
    },
    async createTeacher(payload: any) {
      return requestJSON('/admin/teachers', {
        method: 'POST',
        auth: true,
        body: JSON.stringify(payload),
      });
    },
    async updateTeacher(id: number, payload: any) {
      return requestJSON(`/admin/teachers/${id}`, {
        method: 'PUT',
        auth: true,
        body: JSON.stringify(payload),
      });
    },
    async deleteTeacher(id: number) {
      return requestJSON(`/admin/teachers/${id}`, { method: 'DELETE', auth: true });
    },
    async getSlots() {
      return requestJSON('/admin/slots', { auth: true });
    },
    async createSlot(payload: any) {
      return requestJSON('/admin/slots', {
        method: 'POST',
        auth: true,
        body: JSON.stringify(payload),
      });
    },
    async updateSlot(id: number, payload: any) {
      return requestJSON(`/admin/slots/${id}`, {
        method: 'PUT',
        auth: true,
        body: JSON.stringify(payload),
      });
    },
    async deleteSlot(id: number) {
      return requestJSON(`/admin/slots/${id}`, { method: 'DELETE', auth: true });
    },
    async generateTeacherSlots(id: number) {
      return requestJSON(`/admin/teachers/${id}/generate-slots`, { method: 'POST', auth: true });
    },
    async resetTeacherLogin(id: number) {
      return requestJSON(`/admin/teachers/${id}/reset-login`, { method: 'PUT', auth: true });
    },

    // Events
    async getEvents() {
      const res = await requestJSON('/admin/events', { auth: true });
      return (res && (res as any).events) || [];
    },
    async createEvent(payload: any) {
      return requestJSON('/admin/events', {
        method: 'POST',
        auth: true,
        body: JSON.stringify(payload),
      });
    },
    async updateEvent(id: number, patch: any) {
      return requestJSON(`/admin/events/${id}`, {
        method: 'PUT',
        auth: true,
        body: JSON.stringify(patch),
      });
    },
    async deleteEvent(id: number) {
      return requestJSON(`/admin/events/${id}`, { method: 'DELETE', auth: true });
    },
    async getEventStats(eventId: number) {
      return requestJSON(`/admin/events/${eventId}/stats`, { auth: true });
    },
    async generateEventSlots(eventId: number, payload: any) {
      return requestJSON(`/admin/events/${eventId}/generate-slots`, {
        method: 'POST',
        auth: true,
        body: JSON.stringify(payload),
      });
    },

    // Feedback (anonymous)
    async listFeedback() {
      const res = await requestJSON('/admin/feedback', { auth: true });
      return (res && (res as any).feedback) || [];
    },
  },

  // Teacher endpoints
  teacher: {
    async getBookings() {
      const res = await requestJSON('/teacher/bookings', { auth: true });
      return (res && (res as any).bookings) || [];
    },
    async getSlots() {
      const res = await requestJSON('/teacher/slots', { auth: true });
      return (res && (res as any).slots) || [];
    },
    async getInfo() {
      const res = await requestJSON('/teacher/info', { auth: true });
      return (res && (res as any).teacher) || null;
    },
    async updateRoom(room: string | null) {
      const payload = { room };
      const res = await requestJSON('/teacher/room', {
        method: 'PUT',
        auth: true,
        body: JSON.stringify(payload),
      });
      return (res && (res as any).teacher) || null;
    },
    async cancelBooking(bookingId: number) {
      return requestJSON(`/teacher/bookings/${bookingId}`, { method: 'DELETE', auth: true });
    },
    async acceptBooking(bookingId: number) {
      return requestJSON(`/teacher/bookings/${bookingId}/accept`, { method: 'PUT', auth: true });
    },
    async changePassword(currentPassword: string, newPassword: string) {
      return requestJSON('/teacher/password', {
        method: 'PUT',
        auth: true,
        body: JSON.stringify({ currentPassword, newPassword }),
      });
    },

    async submitFeedback(message: string) {
      return requestJSON('/teacher/feedback', {
        method: 'POST',
        auth: true,
        body: JSON.stringify({ message }),
      });
    },
  },
};

export { API_BASE };
export default api;
