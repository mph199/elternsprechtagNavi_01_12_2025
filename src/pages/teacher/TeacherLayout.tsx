import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { useAuth } from '../../contexts/useAuth';
import api from '../../services/api';
import '../AdminDashboard.css';

export type TeacherInfo = {
  id: number;
  name: string;
  subject: string;
  system?: string;
  room?: string;
};

export type TeacherOutletContext = {
  teacher: TeacherInfo | null;
  refreshTeacher: () => Promise<void>;
};

export function TeacherLayout() {
  const { user, setActiveView } = useAuth();
  const [teacher, setTeacher] = useState<TeacherInfo | null>(null);

  const canSwitchView = Boolean(user?.role === 'admin' && user.teacherId);

  useEffect(() => {
    if (!canSwitchView) return;
    queueMicrotask(() => setActiveView('teacher'));
  }, [canSwitchView, setActiveView]);

  const refreshTeacher = async () => {
    try {
      const t = await api.teacher.getInfo().catch(() => null);
      setTeacher((t as TeacherInfo) || null);
    } catch {
      setTeacher(null);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const t = await api.teacher.getInfo().catch(() => null);
        if (!cancelled) setTeacher((t as TeacherInfo) || null);
      } catch {
        if (!cancelled) setTeacher(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const outletContext: TeacherOutletContext = {
    teacher,
    refreshTeacher,
  };

  return (
    <div className="admin-dashboard admin-dashboard--teacher">
      <main className="admin-main">
        <Outlet context={outletContext} />
      </main>
    </div>
  );
}
