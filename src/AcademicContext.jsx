import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from './lib/supabase';
import { useAuth } from './AuthContext';

const AcademicContext = createContext();

export function AcademicProvider({ children }) {
    const { currentUser } = useAuth();

    // Default values — will be overridden from DB
    const [academicYear, setAcademicYear] = useState(null);
    const [semester, setSemester] = useState(null);
    const [loading, setLoading] = useState(true);

    // Load active year/semester from school settings
    useEffect(() => {
        if (!currentUser?.school_id) {
            setLoading(false);
            return;
        }

        const loadSettings = async () => {
            try {
                const { data } = await supabase
                    .from('schools')
                    .select('active_academic_year, active_semester')
                    .eq('school_id', currentUser.school_id)
                    .single();

                if (data) {
                    setAcademicYear(data.active_academic_year || 2569);
                    setSemester(data.active_semester || 1);
                } else {
                    setAcademicYear(2569);
                    setSemester(1);
                }
            } catch {
                setAcademicYear(2569);
                setSemester(1);
            } finally {
                setLoading(false);
            }
        };

        loadSettings();
    }, [currentUser?.school_id]);

    // Save to DB when admin changes the settings
    const updateAcademicSettings = useCallback(async (year, sem) => {
        if (!currentUser?.school_id) return;
        setAcademicYear(year);
        setSemester(sem);
        try {
            await supabase
                .from('schools')
                .update({ active_academic_year: year, active_semester: sem })
                .eq('school_id', currentUser.school_id);
        } catch (err) {
            console.error('Failed to save academic settings:', err);
        }
    }, [currentUser?.school_id]);

    return (
        <AcademicContext.Provider value={{
            academicYear,
            semester,
            setAcademicYear,
            setSemester,
            updateAcademicSettings,
            loading: loading
        }}>
            {children}
        </AcademicContext.Provider>
    );
}

export function useAcademic() {
    return useContext(AcademicContext);
}
