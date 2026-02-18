import type { Teacher } from '../types';
import { teacherDisplayName } from '../utils/teacherDisplayName';

interface TeacherListProps {
  teachers: Teacher[];
  selectedTeacherId: number | null;
  onSelectTeacher: (teacherId: number) => void;
}

export const TeacherList = ({
  teachers,
  selectedTeacherId,
  onSelectTeacher,
}: TeacherListProps) => {
  return (
    <div className="teacher-list" role="region" aria-label="Lehrkräfte-Auswahl">
      <h2>Lehrkräfte</h2>
      <div className="teachers-container" role="list">
        {teachers.map((teacher) => (
          <button
            key={teacher.id}
            className={`teacher-card ${
              selectedTeacherId === teacher.id ? 'selected' : ''
            }`}
            type="button"
            onClick={() => onSelectTeacher(teacher.id)}
            role="listitem"
            aria-pressed={selectedTeacherId === teacher.id}
          >
            <h3>{teacherDisplayName(teacher)}</h3>
            <p className="subject">{teacher.subject}</p>
          </button>
        ))}
      </div>
    </div>
  );
};
