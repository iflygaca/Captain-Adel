import { useEffect, useState } from 'react';

export interface AuthUser {
  id: string;
  email: string;
  name?: string;
  tenantId?: string;
}

export interface UseAuthReturn {
  user: AuthUser | null;
  loading: boolean;
  signOut: () => void;
}

/**
 * Hook to get the current authenticated user.
 * Checks for authentication token in localStorage or makes an API call
 * to verify the current session.
 */
export function useAuth(): UseAuthReturn {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        // Check if there's a token
        const token = localStorage.getItem('auth_token');
        if (!token) {
          setUser(null);
          setLoading(false);
          return;
        }

        // Verify token with the API
        const response = await fetch('/api/auth/me', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          localStorage.removeItem('auth_token');
          setUser(null);
          setLoading(false);
          return;
        }

        const userData = await response.json();
        setUser(userData as AuthUser);
      } catch (error) {
        console.error('Failed to check auth:', error);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, []);

  const signOut = () => {
    localStorage.removeItem('auth_token');
    setUser(null);
    window.location.href = '/';
  };

  return { user, loading, signOut };
}
