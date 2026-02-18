export function mapSlotRow(slot) {
  if (!slot) return null;
  return {
    id: slot.id,
    eventId: slot.event_id ?? undefined,
    teacherId: slot.teacher_id,
    time: slot.time,
    date: slot.date,
    booked: slot.booked,
    status: slot.status,
    verifiedAt: slot.verified_at,
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
    teacherSubject: slot.teacher?.subject || 'Unknown',
  };
}

export function mapBookingRequestRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    eventId: row.event_id ?? undefined,
    teacherId: row.teacher_id,
    requestedTime: row.requested_time,
    date: row.date,
    status: row.status,
    verifiedAt: row.verified_at,
    confirmationSentAt: row.confirmation_sent_at,
    assignedSlotId: row.assigned_slot_id,
    visitorType: row.visitor_type,
    parentName: row.parent_name,
    companyName: row.company_name,
    studentName: row.student_name,
    traineeName: row.trainee_name,
    representativeName: row.representative_name,
    className: row.class_name,
    email: row.email,
    message: row.message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
