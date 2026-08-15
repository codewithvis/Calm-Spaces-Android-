export interface SessionRequest {
  id: string;
  student_name: string;
  student_registration_number: string;
  student_id: string;
  student_email: string;
  student_course: string;
  session_date: string;
  session_time: string;
  booking_mode?: 'online' | 'offline';
  status: 'pending' | 'approved' | 'rejected';
  updated_at: string;
  notes?: string;
  expert_name?: string;
  expert_registration_number?: string;
  expert_id?: string;
}
