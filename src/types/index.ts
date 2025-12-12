export interface Teacher {
  id: number;
  name: string;
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
