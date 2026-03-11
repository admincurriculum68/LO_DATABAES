import { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext();

export function AuthProvider({ children }) {
    const [currentUser, setCurrentUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const savedUser = localStorage.getItem('loUser');
        if (savedUser) setCurrentUser(JSON.parse(savedUser));
        setLoading(false);
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
