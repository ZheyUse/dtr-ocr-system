import { useContext } from 'react';
import { DTRContext } from '../context/DTRContext';

export const useDTR = () => {
  const context = useContext(DTRContext);

  if (!context) {
    throw new Error('useDTR must be used within DTRProvider.');
  }

  return context;
};
