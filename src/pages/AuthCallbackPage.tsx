import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { setToken } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { Loader2 } from 'lucide-react';

export default function AuthCallbackPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { refreshUser } = useAuth();

  useEffect(() => {
    const token = searchParams.get('token');
    if (token) {
      setToken(token);
      refreshUser().then(() => navigate('/dashboard', { replace: true }));
    } else {
      navigate('/login?error=no_token', { replace: true });
    }
  }, [searchParams, navigate, refreshUser]);

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <div className="flex items-center gap-3 text-zinc-400">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm">Signing you in...</span>
      </div>
    </div>
  );
}
