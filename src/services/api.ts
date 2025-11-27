const API_BASE = import.meta.env.VITE_API_URL || 'https://elternsprechtagneu.onrender.com/api';

export interface ApiTeacher {
  id: number;
  name: string;
  subject: string;
  system: 'dual' | 'vollzeit';
  room?: string;
}

export interface ApiSlot {
  id: number;
  teacherId: number;
  time: string;
  date: string;
  booked: boolean;
  visitorType?: 'parent' | 'company';
  parentName?: string;
  companyName?: string;
  studentName?: string;
  traineeName?: string;
  className?: string;
  email?: string;
  message?: string;
}

export interface ApiBookingRequest {
  visitorType: 'parent' | 'company';
  parentName?: string;
  companyName?: string;
  studentName?: string;
  traineeName?: string;
  className: string;
  email: string;
  message?: string;
}

export interface ApiBookingResponse {
  success: boolean;
  message?: string;
  updatedSlot?: ApiSlot;
}

export interface ApiBooking extends ApiSlot {
  teacherName: string;
  teacherSubject: string;
}

export interface ApiSettings {
  id: number;
  event_name: string;
  event_date: string;
  created_at?: string;
  updated_at?: string;
}

export interface AuthResponse {
  authenticated: boolean;
  user?: {
    username: string;
    role: 'admin' | 'teacher';
    teacherId?: number;
  };
}

export interface LoginResponse {
  success: boolean;
  message?: string;
  token?: string;
  user?: {
    username: string;
    role: 'admin' | 'teacher';
    teacherId?: number;
  };
}

// Helper function to get auth headers
function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem('auth_token');
  if (token) {
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
  }
  return {
    'Content-Type': 'application/json'
  };
}

export const api = {
  async getTeachers(): Promise<ApiTeacher[]> {
    const response = await fetch(`${API_BASE}/teachers`);
    if (!response.ok) {
      throw new Error('Fehler beim Laden der Lehrkräfte');
    }
    const data = await response.json();
    return data.teachers;
  },

  async getSlots(teacherId: number): Promise<ApiSlot[]> {
    const response = await fetch(`${API_BASE}/slots?teacherId=${teacherId}`);
    if (!response.ok) {
      throw new Error('Fehler beim Laden der Termine');
    }
    const data = await response.json();
    return data.slots;
  },

  async createBooking(
    slotId: number,
    bookingData: ApiBookingRequest
  ): Promise<ApiBookingResponse> {
    const response = await fetch(`${API_BASE}/bookings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        slotId,
        ...bookingData,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Fehler beim Buchen');
    }

    return response.json();
  },

  async getHealth(): Promise<{ status: string; teacherCount: number; slotCount: number; bookedCount: number }> {
    const response = await fetch(`${API_BASE}/health`);
    if (!response.ok) {
      throw new Error('Backend nicht erreichbar');
    }
    return response.json();
  },

  auth: {
    async login(username: string, password: string): Promise<LoginResponse> {
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Login fehlgeschlagen');
      }

      return response.json();
    },

    async logout(): Promise<{ success: boolean }> {
      const response = await fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Logout fehlgeschlagen');
      }

      return response.json();
    },

    async verify(): Promise<AuthResponse> {
      const response = await fetch(`${API_BASE}/auth/verify`, {
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error('Authentifizierung fehlgeschlagen');
      }

      return response.json();
    },
  },

  admin: {
    async getBookings(): Promise<ApiBooking[]> {
      const response = await fetch(`${API_BASE}/admin/bookings`, {
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Fehler beim Laden der Buchungen');
      }

      const data = await response.json();
      return data.bookings;
    },

    async cancelBooking(slotId: number): Promise<{ success: boolean }> {
      const response = await fetch(`${API_BASE}/admin/bookings/${slotId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Fehler beim Stornieren');
      }

      return response.json();
    },

    async createTeacher(teacherData: { name: string; subject?: string; system: 'dual' | 'vollzeit'; room?: string }): Promise<ApiTeacher> {
      const response = await fetch(`${API_BASE}/admin/teachers`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(teacherData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || error.message || 'Fehler beim Anlegen der Lehrkraft');
      }

      const data = await response.json();
      return data.teacher;
    },

    async updateTeacher(id: number, teacherData: { name: string; subject?: string; system: 'dual' | 'vollzeit'; room?: string }): Promise<ApiTeacher> {
      const response = await fetch(`${API_BASE}/admin/teachers/${id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(teacherData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Fehler beim Aktualisieren der Lehrkraft');
      }

      const data = await response.json();
      return data.teacher;
    },

    async deleteTeacher(id: number): Promise<{ success: boolean }> {
      const response = await fetch(`${API_BASE}/admin/teachers/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || error.message || 'Fehler beim Löschen der Lehrkraft');
      }

      return response.json();
    },

    async getSettings(): Promise<ApiSettings> {
      const response = await fetch(`${API_BASE}/admin/settings`, {
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Fehler beim Laden der Einstellungen');
      }

      return response.json();
    },

    async updateSettings(settings: { event_name: string; event_date: string }): Promise<ApiSettings> {
      const response = await fetch(`${API_BASE}/admin/settings`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(settings),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Fehler beim Aktualisieren der Einstellungen');
      }

      const data = await response.json();
      return data.settings;
    },

    async createSlot(slotData: { teacher_id: number; time: string; date: string }): Promise<ApiSlot> {
      const response = await fetch(`${API_BASE}/admin/slots`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(slotData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Fehler beim Anlegen des Slots');
      }

      const data = await response.json();
      return data.slot;
    },

    async updateSlot(id: number, slotData: { time: string; date: string }): Promise<ApiSlot> {
      const response = await fetch(`${API_BASE}/admin/slots/${id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(slotData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Fehler beim Aktualisieren des Slots');
      }

      const data = await response.json();
      return data.slot;
    },

    async deleteSlot(id: number): Promise<{ success: boolean }> {
      const response = await fetch(`${API_BASE}/admin/slots/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Fehler beim Löschen des Slots');
      }

      return response.json();
    },
  },
};
