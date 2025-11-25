const API_BASE = import.meta.env.VITE_API_URL || 'https://elternsprechtagneu.onrender.com/api';

export interface ApiTeacher {
  id: number;
  name: string;
  subject: string;
  system: 'dual' | 'vollzeit';
}

export interface ApiSlot {
  id: number;
  teacherId: number;
  time: string;
  date: string;
  booked: boolean;
  parentName?: string;
  studentName?: string;
  className?: string;
}

export interface ApiBookingRequest {
  parentName: string;
  studentName: string;
  className: string;
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
  user?: {
    username: string;
    role: 'admin' | 'teacher';
    teacherId?: number;
  };
}

export const api = {
  async getTeachers(): Promise<ApiTeacher[]> {
    const response = await fetch(`${API_BASE}/teachers`, {
      credentials: 'include',
    });
    if (!response.ok) {
      throw new Error('Fehler beim Laden der Lehrkräfte');
    }
    const data = await response.json();
    return data.teachers;
  },

  async getSlots(teacherId: number): Promise<ApiSlot[]> {
    const response = await fetch(`${API_BASE}/slots?teacherId=${teacherId}`, {
      credentials: 'include',
    });
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
      credentials: 'include',
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
    const response = await fetch(`${API_BASE}/health`, {
      credentials: 'include',
    });
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
        credentials: 'include',
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
        credentials: 'include',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Logout fehlgeschlagen');
      }

      return response.json();
    },

    async verify(): Promise<AuthResponse> {
      const response = await fetch(`${API_BASE}/auth/verify`, {
        credentials: 'include',
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
        credentials: 'include',
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
        credentials: 'include',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Fehler beim Stornieren');
      }

      return response.json();
    },

    async createTeacher(teacherData: { name: string; subject: string; system: 'dual' | 'vollzeit' }): Promise<ApiTeacher> {
      const response = await fetch(`${API_BASE}/admin/teachers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(teacherData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Fehler beim Anlegen der Lehrkraft');
      }

      const data = await response.json();
      return data.teacher;
    },

    async updateTeacher(id: number, teacherData: { name: string; subject: string; system: 'dual' | 'vollzeit' }): Promise<ApiTeacher> {
      const response = await fetch(`${API_BASE}/admin/teachers/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
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
        credentials: 'include',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Fehler beim Löschen der Lehrkraft');
      }

      return response.json();
    },
  },
};
