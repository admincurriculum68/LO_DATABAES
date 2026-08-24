import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from './lib/supabase';
import { resolveTeacherRoles } from './lib/auth';
import { hasRole } from './lib/roles';

const AuthContext = createContext();

export function AuthProvider({ children }) {
    const [currentUser, setCurrentUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const verifyUser = async () => {
            const savedUserStr = localStorage.getItem('loUser');
            if (savedUserStr) {
                try {
                    const savedUser = JSON.parse(savedUserStr);
                    // Fetch from database to prevent LocalStorage modification bypass
                    if (hasRole(savedUser, 'student')) {
                        const { data } = await supabase.from('users_students').select('student_status').eq('student_id', savedUser.id).single();
                        if (data && data.student_status === 'active') {
                            setCurrentUser(savedUser);
                        } else {
                            localStorage.removeItem('loUser');
                        }
                    } else {
                        // Check teachers table
                        // ดึงบทบาททั้งหมดจากฐานข้อมูลใหม่ทุกครั้ง ไม่ใช่แค่คอลัมน์ role
                        // มิฉะนั้นบทบาทที่ฝ่ายวิชาการเพิ่งเพิ่มให้จะหายทุกครั้งที่รีเฟรชหน้า
                        const { data } = await supabase.from('users_teachers')
                            .select('role, is_active, teacher_roles(role, is_primary)')
                            .eq('teacher_id', savedUser.id).single();
                        if (data && data.is_active) {
                            // เขียนทับบทบาทด้วยค่าจากฐานข้อมูลเสมอ เพื่อกันการแก้ localStorage
                            const verifiedUser = { ...savedUser, ...resolveTeacherRoles(data) };
                            setCurrentUser(verifiedUser);
                            localStorage.setItem('loUser', JSON.stringify(verifiedUser));
                        } else {
                            localStorage.removeItem('loUser');
                        }
                    }
                } catch (err) {
                    console.error('Session verification failed:', err);
                    localStorage.removeItem('loUser');
                }
            }
            setLoading(false);
        };
        verifyUser();
    }, []);

    const loginUser = (user) => {
        setCurrentUser(user);
        localStorage.setItem('loUser', JSON.stringify(user));
    };

    const logoutUser = () => {
        setCurrentUser(null);
        localStorage.removeItem('loUser');
    };

    const updateCurrentUser = (updates) => {
        setCurrentUser(previous => {
            if (!previous) return previous;
            const next = { ...previous, ...updates };
            localStorage.setItem('loUser', JSON.stringify(next));
            return next;
        });
    };

    return (
        <AuthContext.Provider value={{ currentUser, loginUser, logoutUser, updateCurrentUser, loading }}>
            {!loading && children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    return useContext(AuthContext);
}
