import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';

test('renders dtr upload title', () => {
  render(<App />);
  const titleElement = screen.getByText(/dtr ocr system/i);
  expect(titleElement).toBeInTheDocument();
});
