import React, { useContext, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Store } from '../Store';

export default function GoogleCallbackScreen() {
  const navigate = useNavigate();
  const { dispatch } = useContext(Store);
  useEffect(() => {
    try {
      const encoded = new URLSearchParams(window.location.hash.slice(1)).get('user');
      if (!encoded) throw new Error('Missing sign-in result');
      const user = JSON.parse(encoded);
      if (!user.token || !user._id) throw new Error('Invalid sign-in result');
      window.history.replaceState(null, '', '/oauth/google/callback');
      localStorage.setItem('userInfo', JSON.stringify(user));
      dispatch({ type: 'USER_SIGNIN', payload: user });
      navigate('/', { replace: true });
    } catch {
      navigate('/signin', { replace: true });
    }
  }, [dispatch, navigate]);
  return <p>Completing Google sign-in…</p>;
}
