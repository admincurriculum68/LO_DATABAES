import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext';

export default function ProtectedRoute({ children, allowedRoles }) {
    const { currentUser } = useAuth();

    if (!currentUser) {
        return <Navigate to="/login" />;
    }

    if (allowedRoles && !allowedRoles.includes(currentUser.role)) {
        // redirect to their default dashboard depending on role
        switch (currentUser.role) {
            case 'admin':
                return <Navigate to="/admin" />;
            case 'student':
                return <Navigate to="/student" />;
            case 'executive':
                return <Navigate to="/executive" />;
            default:
                return <Navigate to="/" />;
        }
    }

    return children;
}
