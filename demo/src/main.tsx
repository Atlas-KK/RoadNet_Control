import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';

const root = document.getElementById('root');
if (!root) throw new Error('应用根节点 #root 不存在');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
