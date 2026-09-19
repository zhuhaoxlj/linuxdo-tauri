import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { bootstrapSharedStorage } from './shared/sharedStorage';
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
  componentDidCatch(error, info) {
    // 之前这里把异常完全吞掉，出问题时只看到"页面遇到了一点问题"，无法定位
    console.error('render error:', error, info);
  }
  render() {
    return this.state.error ? (
      <div className="flex items-center justify-center h-screen" role="alert">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">页面遇到了一点问题</h1>
          <p className="text-gray-600 mb-6">重新打开页面后，你的本机数据仍会保留。</p>
          <pre className="mb-6 max-w-2xl overflow-auto rounded bg-gray-100 p-3 text-left text-xs text-gray-700">
            {String(this.state.error?.stack || this.state.error?.message || this.state.error)}
          </pre>
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

// 先把开发版/正式版的共享数据对齐到本机 localStorage，再让应用读取设置、草稿、看板等
bootstrapSharedStorage().finally(() => {
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
});
