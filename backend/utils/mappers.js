export function mapSlotRow(slot) {
  if (!slot) return null;
  return {
    id: slot.id,
    teacherId: slot.teacher_id,
    time: slot.time,
    date: slot.date,
    booked: slot.booked,
    status: slot.status,
    visitorType: slot.visitor_type,
    parentName: slot.parent_name,
    companyName: slot.company_name,
    studentName: slot.student_name,
    traineeName: slot.trainee_name,
    representativeName: slot.representative_name,
    className: slot.class_name,
    email: slot.email,
    message: slot.message,
  };
}

export function mapBookingRowWithTeacher(slot) {
  const mapped = mapSlotRow(slot);
  if (!mapped) return null;
  return {
    ...mapped,
    teacherName: slot.teacher?.name || 'Unknown',
    teacherSubject: slot.teacher?.subject || 'Unknown',
  };
}
