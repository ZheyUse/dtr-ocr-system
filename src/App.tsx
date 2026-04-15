import React from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { UploadPage } from './pages/UploadPage';
import { DTRResultPage } from './pages/DTRResultPage';
import { DTRProvider } from './context/DTRContext';

function App() {
  return (
    <DTRProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<UploadPage />} />
          <Route path="/dtr-result" element={<DTRResultPage />} />
        </Routes>
      </BrowserRouter>
    </DTRProvider>
  );
}

export default App;
