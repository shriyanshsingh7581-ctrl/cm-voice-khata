import React, { useState } from 'react';
import { Eye, EyeOff, Mail, Lock, Store, ArrowRight, Loader2 } from 'lucide-react';
import {
  auth,
  googleProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
} from '../firebase';
import { APP_OFFICIAL_NAME, CM_LOGO_PATH } from '../types';

export const SplashScreen: React.FC = () => {
  return (
    <div className="fixed inset-0 z-50 bg-[#FBF9F1] flex flex-col items-center justify-between py-12 px-6">
      <div className="h-6" />
      <div className="flex flex-col items-center">
        {/* Soundwave animation bars above the logo */}
        <div className="flex items-end gap-1.5 h-10 mb-5" aria-hidden="true">
          {[0.4, 0.85, 1, 0.65, 0.95, 0.55, 0.75].map((scale, idx) => (
            <span
              key={idx}
              className="w-1.5 rounded-full bg-gradient-to-t from-[#6A4CFF] to-[#1B9B62] animate-pulse"
              style={{
                height: `${Math.round(scale * 36)}px`,
                animationDelay: `${idx * 110}ms`,
              }}
            />
          ))}
        </div>

        <div className="w-28 h-28 rounded-[28px] bg-white p-2 shadow-xl shadow-[#6A4CFF]/15 border border-slate-100 flex items-center justify-center">
          <img
            src={CM_LOGO_PATH}
            alt={APP_OFFICIAL_NAME}
            className="w-full h-full object-contain rounded-2xl"
          />
        </div>

        <h1 className="mt-5 text-2xl font-extrabold tracking-tight text-slate-900">
          {APP_OFFICIAL_NAME}
        </h1>
        <p className="mt-1 text-sm font-medium text-slate-500">
          AI Digital Khata &amp; Smart Voice Billing
        </p>
      </div>

      <div className="flex flex-col items-center gap-2">
        <div className="flex items-center gap-2 text-xs font-bold tracking-wider text-slate-600 uppercase">
          <span>🇮🇳</span>
          <span>MADE IN INDIA</span>
        </div>
        <div className="w-32 h-1 bg-slate-200 rounded-full overflow-hidden">
          <div className="h-full bg-[#1B9B62] rounded-full animate-[pulse_1.2s_ease-in-out_infinite] w-2/3" />
        </div>
      </div>
    </div>
  );
};

interface AuthScreenProps {
  onSuccess?: () => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onSuccess }) => {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [businessName, setBusinessName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (!email.trim() || !password.trim()) {
      setErrorMsg('Please enter your email and password.');
      return;
    }
    if (password.length < 6) {
      setErrorMsg('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'signup') {
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        if (businessName.trim()) {
          await updateProfile(cred.user, { displayName: businessName.trim() });
          localStorage.setItem(`cm_pending_biz_${cred.user.uid}`, businessName.trim());
        }
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      }
      onSuccess?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Authentication failed';
      if (msg.includes('auth/invalid-credential') || msg.includes('auth/wrong-password')) {
        setErrorMsg('Invalid email or password. Please check and try again.');
      } else if (msg.includes('auth/email-already-in-use')) {
        setErrorMsg('An account with this email already exists. Please Sign In.');
      } else if (msg.includes('auth/operation-not-allowed')) {
        setErrorMsg(
          'Email/Password sign-in is disabled in Firebase Console. Please use Google Sign-In below or enable Email/Password provider.'
        );
      } else {
        setErrorMsg(msg.replace('Firebase: ', ''));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setErrorMsg('');
    setLoading(true);
    try {
      await signInWithPopup(auth, googleProvider);
      onSuccess?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Google Sign-In failed';
      setErrorMsg(msg.replace('Firebase: ', ''));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FBF9F1] flex flex-col justify-between px-5 py-8 sm:items-center sm:justify-center">
      <div className="w-full max-w-md mx-auto">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-20 h-20 rounded-3xl bg-white p-1.5 shadow-md border border-slate-100 mb-3">
            <img
              src={CM_LOGO_PATH}
              alt={APP_OFFICIAL_NAME}
              className="w-full h-full object-contain rounded-2xl"
            />
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            {APP_OFFICIAL_NAME}
          </h1>
          <p className="text-xs font-medium text-slate-500 mt-1">
            Bol Kar Bill Banayein · Digital Khata &amp; Smart GST Invoices
          </p>
        </div>

        {/* Auth Card */}
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200/80">
          {/* Segmented Toggle */}
          <div className="grid grid-cols-2 gap-1 p-1 bg-[#FBF9F1] rounded-2xl mb-5 border border-slate-200/60">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setErrorMsg('');
              }}
              className={`py-2.5 text-sm font-bold rounded-xl transition ${
                mode === 'login'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('signup');
                setErrorMsg('');
              }}
              className={`py-2.5 text-sm font-bold rounded-xl transition ${
                mode === 'signup'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Create Account
            </button>
          </div>

          {errorMsg && (
            <div className="mb-4 p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
              {errorMsg}
            </div>
          )}

          <form onSubmit={handleEmailAuth} className="space-y-3.5">
            {mode === 'signup' && (
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                  Shop / Business Name
                </label>
                <div className="relative">
                  <Store className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    placeholder="e.g. Sharma Kirana Store"
                    className="w-full pl-10 pr-4 py-3 rounded-2xl bg-[#FBF9F1] border border-slate-200 text-sm font-medium text-slate-900 focus:outline-none focus:border-[#6A4CFF]"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="shop@example.com"
                  className="w-full pl-10 pr-4 py-3 rounded-2xl bg-[#FBF9F1] border border-slate-200 text-sm font-medium text-slate-900 focus:outline-none focus:border-[#6A4CFF]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min. 6 characters"
                  className="w-full pl-10 pr-11 py-3 rounded-2xl bg-[#FBF9F1] border border-slate-200 text-sm font-medium text-slate-900 focus:outline-none focus:border-[#6A4CFF]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-700"
                  aria-label="Toggle password visibility"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 px-4 rounded-2xl bg-[#1B9B62] text-white font-bold text-sm flex items-center justify-center gap-2 shadow-md shadow-[#1B9B62]/20 hover:bg-[#168452] active:scale-[0.99] transition disabled:opacity-60"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <span>{mode === 'login' ? 'Sign In to Khata' : 'Start My Digital Khata'}</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <div className="relative my-5">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-white px-3 text-slate-400 font-semibold">OR</span>
            </div>
          </div>

          <button
            type="button"
            disabled={loading}
            onClick={handleGoogleSignIn}
            className="w-full py-3 px-4 rounded-2xl bg-white border border-slate-200 text-slate-800 font-bold text-sm flex items-center justify-center gap-2.5 hover:bg-slate-50 active:scale-[0.99] transition disabled:opacity-60"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
              />
              <path
                fill="#FBBC05"
                d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
              />
              <path
                fill="#EA4335"
                d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
              />
            </svg>
            <span>Continue with Google</span>
          </button>
        </div>
      </div>

      <p className="text-center text-xs font-semibold text-slate-400 mt-6">
        🇮🇳 Made in India · 100% Isolated Cloud Backup
      </p>
    </div>
  );
};
