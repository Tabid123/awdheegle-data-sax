import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

// Validate Somali phone format: 9 digits starting with 61, 77, or 68
const isValidSomaliPhone = (phone: string | null): boolean => {
  if (!phone) return false;
  return /^(61|77|62|68)\d{7}$/.test(phone);
};

const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const navigate = useNavigate();
  
  // Check if user has verified phone
  const verifiedPhone = localStorage.getItem('verifiedPhone');
  const hasAccess = isValidSomaliPhone(verifiedPhone);
  useEffect(() => {
    if (!hasAccess) {
      // Clear invalid data and redirect
      localStorage.removeItem('verifiedPhone');
      localStorage.removeItem('isGuestUser');
      navigate('/', { replace: true });

    }
  }, [navigate, hasAccess]);

  // Only render children if verified
  if (!hasAccess) {
    return null;
  }

  return <>{children}</>;
};

export default ProtectedRoute;

