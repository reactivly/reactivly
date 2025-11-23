import { QueryClientProvider } from '@tanstack/react-query';
import { Greeting } from './Greeting';
import { queryClient } from './utils/trpc';
import { WSTest } from './WSTest';
import { Posts } from './Posts';

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      Test
      <Greeting />
      <Posts />
      <WSTest />
    </QueryClientProvider>
  );
}
