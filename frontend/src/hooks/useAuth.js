import { useState, useEffect } from 'react';
import { authManager } from '../utils/authManager';

export const useAuth = () => {
  const [authState, setAuthState] = useState(() => {
    const initialState = authManager.getAuthState();
    return initialState;
  });

  useEffect(() => {
    const unsubscribe = authManager.addListener((newState) => {
      setAuthState(newState);
    });
    
    return () => {
      unsubscribe();
    };
  }, []);

  return {
    ...authState,
    login: authManager.login.bind(authManager),
    logout: authManager.logout.bind(authManager),
    updateUser: authManager.updateUser.bind(authManager),
    apiRequest: authManager.apiRequest.bind(authManager)
  };
};

export default useAuth; 