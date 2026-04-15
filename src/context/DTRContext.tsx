import React, { createContext, useMemo, useState } from 'react';
import { DTRRecord } from '../types/dtr.types';

interface DTRContextValue {
  record: DTRRecord | null;
  loading: boolean;
  error: string | null;
  mergedFileCount: number;
  setRecord: (record: DTRRecord, mergedFileCount: number) => void;
  clearRecord: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const DTRContext = createContext<DTRContextValue | undefined>(undefined);

interface DTRProviderProps {
  children: React.ReactNode;
}

export const DTRProvider: React.FC<DTRProviderProps> = ({ children }) => {
  const [record, setRecordState] = useState<DTRRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mergedFileCount, setMergedFileCount] = useState(0);

  const setRecord = (nextRecord: DTRRecord, filesMerged: number): void => {
    setRecordState(nextRecord);
    setMergedFileCount(filesMerged);
  };

  const clearRecord = (): void => {
    setRecordState(null);
    setMergedFileCount(0);
  };

  const contextValue = useMemo(
    () => ({
      record,
      loading,
      error,
      mergedFileCount,
      setRecord,
      clearRecord,
      setLoading,
      setError,
    }),
    [record, loading, error, mergedFileCount]
  );

  return <DTRContext.Provider value={contextValue}>{children}</DTRContext.Provider>;
};
