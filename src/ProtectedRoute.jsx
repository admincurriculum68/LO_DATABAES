import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { defaultRouteFor, hasAnyRole } from './lib/roles';

export default function ProtectedRoute({ children, allowedRoles }) {
    const { currentUser } = useAuth();

    if (!currentUser) {
        return <Navigate to="/login" />;
    }

    // ครู 1 คนมีได้หลายบทบาท จึงต้องตรวจว่ามีบทบาทใดบทบาทหนึ่งที่เข้าถึงได้
    if (!hasAnyRole(currentUser, allowedRoles)) {
        return <Navigate to={defaultRouteFor(currentUser)} />;
    }

    return children;
}
