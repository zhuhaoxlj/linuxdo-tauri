import React from 'react';
import { Link as BaseLink, NavLink as BaseNavLink, useNavigate as useBaseNavigate } from 'react-router-dom';
import { appPath } from './api';

export function Link({ to, ...props }) {
  return <BaseLink to={appPath(to)} {...props} />;
}

export function NavLink({ to, ...props }) {
  return <BaseNavLink to={appPath(to)} {...props} />;
}

export function useNavigate() {
  const navigate = useBaseNavigate();
  return (to, options) => navigate(appPath(to), options);
}
