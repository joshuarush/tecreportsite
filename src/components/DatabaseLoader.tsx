import { useState, useEffect } from 'react';
import { onInitStatusChange, waitForInit, type InitStatus } from '../lib/duckdb';

interface DatabaseLoaderProps {
  children: React.ReactNode;
}

const statusMessages: Record<InitStatus, string> = {
  'idle': 'Preparing database...',
  'loading-wasm': 'Loading database engine...',
  'loading-data': 'Connecting to data sources...',
  'ready': 'Ready',
  'error': 'Failed to load database',
};

export default function DatabaseLoader({ children }: DatabaseLoaderProps) {
  const [status, setStatus] = useState<InitStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Start initialization
    waitForInit().catch(() => {
      // Error is handled by status listener
    });

    // Listen for status changes
    const unsubscribe = onInitStatusChange((newStatus, err) => {
      setStatus(newStatus);
      if (err) setError(err);
    });

    return unsubscribe;
  }, []);

  if (status === 'ready') {
    return <>{children}</>;
  }

  if (status === 'error') {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="text-red-500 mb-4">
          <svg className="w-16 h-16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-slate-900 mb-2">Failed to Load Database</h3>
        <p className="text-slate-600 text-center max-w-md mb-4">
          {error || 'An unexpected error occurred while loading the database.'}
        </p>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-texas-blue text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-20">
      <div className="relative mb-6">
        {/* Spinning loader */}
        <div className="w-16 h-16 border-4 border-slate-200 border-t-texas-blue rounded-full animate-spin"></div>
      </div>
      <h3 className="text-lg font-semibold text-slate-900 mb-2">
        {statusMessages[status]}
      </h3>
      <p className="text-slate-500 text-sm text-center max-w-md">
        {status === 'loading-data'
          ? 'This may take a moment on first load as we connect to Texas campaign finance data...'
          : 'Setting up the in-browser database engine...'}
      </p>
      {/* Progress dots */}
      <div className="flex space-x-1 mt-4">
        <div className={`w-2 h-2 rounded-full ${status === 'loading-wasm' || status === 'loading-data' ? 'bg-texas-blue' : 'bg-slate-300'}`}></div>
        <div className={`w-2 h-2 rounded-full ${status === 'loading-data' ? 'bg-texas-blue' : 'bg-slate-300'}`}></div>
        <div className={`w-2 h-2 rounded-full bg-slate-300`}></div>
      </div>
    </div>
  );
}
