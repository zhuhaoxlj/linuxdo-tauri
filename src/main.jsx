import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './context/AuthContext';
import { AppProvider } from './context/AppContext';
import App from './App';
import './styles.css';

const queries = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false }, mutations: { retry: false } } });

class ErrorBoundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    return this.state.error ? <div className="state-view" role="alert"><h1>页面遇到了一点问题</h1><p>重新打开页面后，你的本机草稿仍会保留。</p><button className="button primary" onClick={() => location.reload()}>重新加载</button></div> : this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary><QueryClientProvider client={queries}><AuthProvider><AppProvider><HashRouter><App /></HashRouter></AppProvider></AuthProvider></QueryClientProvider></ErrorBoundary>
  </React.StrictMode>
);
