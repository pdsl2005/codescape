import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';

jest.mock('@supabase/auth-helpers-react', () => ({
  // Simulate a signed-out state by returning no user
  useUser: () => null,
}));

test('renders sign in button when signed out', () => {
  render(<App />);
  const signInButton = screen.getByRole('button', { name: /sign in/i });
  expect(signInButton).toBeInTheDocument();
});
