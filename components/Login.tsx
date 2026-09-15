import React, { useState } from 'react';

interface LoginProps {
  onLogin: () => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password.trim();

    const allowedEmails = [
      'funframephoto@gmail.com',
      'ryan@funframephoto.com',
      'admin@funframephoto.com',
      'admin'
    ];

    const validPasswords = [
      '1loveFunfr@mePh0t0',
      'IloveFunfr@mePh0t0',
      'iloveFunfr@mePh0t0',
      '1lovefunframephoto',
      'ilovefunframephoto',
      'admin',
      'funframe2026'
    ];

    if (allowedEmails.includes(cleanEmail) && validPasswords.includes(cleanPassword)) {
      localStorage.setItem('isAuthenticated', 'true');
      onLogin();
    } else {
      setError('Invalid email or password. Please check your credentials.');
    }
  };

  return (
    <div className="min-h-screen bg-app-bg flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-app-surface border border-app-border rounded-xl p-8 shadow-2xl">
        <div className="flex flex-col items-center mb-8">
          <h1 className="text-2xl font-mono uppercase tracking-widest text-white mb-2">Prompt Studio</h1>
          <p className="text-app-muted text-sm text-center uppercase tracking-wider">Login to Access</p>
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
            />
          </div>
          
          <button
            type="submit"
            className="w-full bg-app-accent hover:bg-app-accentHover text-black font-bold uppercase tracking-widest text-sm py-4 rounded-lg transition-colors border border-transparent hover:border-app-accentHover mt-4"
          >
            Login
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;
