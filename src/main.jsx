import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import './styles.css';

const queries = new QueryClient({ 
  defaultOptions: { 
    queries: { 
      staleTime: 30_000, 
      retry: 1, 
      refetchOnWindowFocus: false 
    }, 
    mutations: { 
      retry: false 
    } 
  } 
});

class ErrorBoundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) { 
    return { error }; 
  }
  render() {
    return this.state.error ? (
      <div className="flex items-center justify-center h-screen" role="alert">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">页面遇到了一点问题</h1>
          <p className="text-gray-600 mb-6">重新打开页面后，你的本机数据仍会保留。</p>
          <button 
            className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700" 
            onClick={() => location.reload()}
          >
            重新加载
          </button>
        </div>
      </div>
    ) : this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queries}>
        <HashRouter>
          <App />
        </HashRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
