export async function restoreAuthSession(invoke, storedAuth) {
  const user = await invoke('restore_session');
  if (user?.username) return { user, guest: false };
  return storedAuth?.guest ? { user: null, guest: true } : null;
}

export async function terminateAuthSession(invoke) {
  await invoke('logout');
}
