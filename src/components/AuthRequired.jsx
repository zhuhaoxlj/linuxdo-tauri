import React from 'react';
import { useAuth } from '../context/AuthContext';
import { Empty } from './Common';

export default function AuthRequired({ children, title = '登录后使用这项功能' }) {
  const { user, requestLogin } = useAuth();
  return user ? children : <Empty title={title} description="通过浏览器授权，继续你的社区之旅。"><button className="button primary" onClick={requestLogin}>浏览器登录</button></Empty>;
}
