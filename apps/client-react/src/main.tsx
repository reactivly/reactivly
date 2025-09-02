import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import {AddItem, App, FileWatcher, Login} from './App.tsx'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const queryClient = new QueryClient()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <Login />
      <App />
      <AddItem />
      <FileWatcher />
    </QueryClientProvider>
  </StrictMode>,
)
