export interface Teacher {
  id: number;
  name: string;
  email?: string;
  salutation?: 'Herr' | 'Frau' | 'Divers';
  subject: string;
  room?: string;
  system?: 'dual' | 'vollzeit';
}

export interface TimeSlot {
  id: number;
  teacherId: number;
  time: string;
  date: string;
  booked: boolean;
  status?: 'reserved' | 'confirmed';
  verifiedAt?: string | null;
  // Present on some admin/teacher booking list responses
  teacherName?: string;
  teacherSubject?: string;
  visitorType?: 'parent' | 'company';
  parentName?: string;
  companyName?: string;
  studentName?: string;
  traineeName?: string;
  representativeName?: string;
  className?: string;
  email?: string;
  message?: string;
}

export interface BookingFormData {
  visitorType: 'parent' | 'company';
  parentName?: string;
  companyName?: string;
  studentName?: string;
  traineeName?: string;
  representativeName?: string;
  className: string;
  email: string;
  message?: string;
}

export interface Settings {
  id?: number;
  event_name: string;
  event_date: string;
  updated_at?: string;
}

export interface FeedbackItem {
  id: number;
  message: string;
  created_at: string;
}

export interface UserAccount {
  id: number;
  username: string;
  role: 'admin' | 'teacher' | 'user';
  teacher_id?: number | null;
  created_at?: string;
  updated_at?: string;
}
