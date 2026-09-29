import React, { useState } from 'react';
import { supabase } from '../services/supabaseClient';

interface LoginProps {
  onLogin: () => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password.trim();

    if (!cleanEmail || !cleanPassword) {
      setError('Please enter your email and password.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      if (isSignUp) {
        const { error: signUpError } = await supabase.auth.signUp({
          email: cleanEmail,
          password: cleanPassword,
        });
        if (signUpError) throw signUpError;
        onLogin();
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password: cleanPassword,
        });
        if (signInError) throw signInError;
        onLogin();
      }
    } catch (err: any) {
      if (err.message?.includes('Invalid login credentials')) {
        setError('Invalid email or password. Please check your credentials.');
      } else if (err.message?.includes('already registered')) {
        setError('An account with this email already exists. Try signing in instead.');
      } else {
        setError(err.message || 'Authentication failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-app-bg flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-app-surface border border-app-border rounded-xl p-8 shadow-2xl">
        <div className="flex flex-col items-center mb-8">
          <h1 className="text-2xl font-mono uppercase tracking-widest text-white mb-2">Prompt Studio</h1>
          <p className="text-app-muted text-sm text-center uppercase tracking-wider">
            {isSignUp ? 'Create Account' : 'Login to Access'}
          </p>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/50 rounded text-red-400 text-sm font-mono text-center">
              {error}
            </div>
          )}
          
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-app-muted mb-2">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-app-bg border border-app-border rounded-lg px-4 py-3 text-white focus:ring-1 focus:ring-app-accent outline-none font-mono text-sm transition-shadow"
              required
              disabled={loading}
            />
          </div>
          
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-app-muted mb-2">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-app-bg border border-app-border rounded-lg px-4 py-3 text-white focus:ring-1 focus:ring-app-accent outline-none font-mono text-sm transition-shadow"
              required
              disabled={loading}
            />
          </div>
          
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-app-accent hover:bg-app-accentHover text-black font-bold uppercase tracking-widest text-sm py-4 rounded-lg transition-colors border border-transparent hover:border-app-accentHover mt-4 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Please wait...' : isSignUp ? 'Sign Up' : 'Login'}
          </button>

          <div className="text-center">
            <button
              type="button"
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError('');
              }}
              className="text-xs font-mono text-app-muted hover:text-app-accent uppercase tracking-wider transition-colors"
            >
              {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Login;
