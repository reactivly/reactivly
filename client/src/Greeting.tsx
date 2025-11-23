import { useMutation, useQuery } from '@tanstack/react-query';
import { trpc } from './utils/trpc';
import { useSubscription } from '@trpc/tanstack-react-query';

export function Greeting() {
  const userName = useSubscription(trpc.greeting.get.subscriptionOptions());
  const login = useMutation(trpc.greeting.setName.mutationOptions({}));
  const logout = useMutation(trpc.greeting.logout.mutationOptions({}));

  return <div>
    { userName.data?.length ?
    <span>
      Hello, {userName.data}!{' '}
      <button onClick={() => logout.mutate()} style={{ marginLeft: 8 }}>
        Logout
      </button>
    </span>
    : 
    <button onClick={() => login.mutate({ name: 'Alice' })}>Set Name</button>
    }
    <br />
  </div>;
}
