import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from './lib/supabase';

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
                    if (savedUser.role === 'student') {
                        const { data } = await supabase.from('users_students').select('student_status').eq('student_id', savedUser.id).single();
                        if (data && data.student_status === 'active') {
                            setCurrentUser(savedUser);
                        } else {
                            localStorage.removeItem('loUser');
                        }
                    } else {
                        // Check teachers table
                        const { data } = await supabase.from('users_teachers').select('role, is_active').eq('teacher_id', savedUser.id).single();
                        if (data && data.is_active) {
                            // Overwrite role to whatever is in the database to prevent manual tampering
                            const verifiedUser = { ...savedUser, role: data.role };
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

    return (
        <AuthContext.Provider value={{ currentUser, loginUser, logoutUser, loading }}>
            {!loading && children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    return useContext(AuthContext);
}
