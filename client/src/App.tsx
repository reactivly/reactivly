import { QueryClientProvider } from '@tanstack/react-query';
import { Greeting } from './Greeting';
import { queryClient } from './utils/trpc';
import { WSTest } from './WSTest';
import { WSSession } from './WSSession';

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      Test
      <Greeting />
      <WSTest />
      <WSSession />
    </QueryClientProvider>
  );
}
