import { useQuery, useMutation } from '@tanstack/react-query';
import { trpc } from './utils/trpc';
import { useSubscription } from '@trpc/tanstack-react-query';

export function WSTest() {
  const mut = useMutation(trpc.post.incrementStore.mutationOptions({}));
  const rn = useSubscription(trpc.post.globalStore.subscriptionOptions());

  return (
    <>
      <button onClick={() => mut.mutate({ val: 10 })}>Incr</button>
      <div>{rn.data}</div>
    </>
  );
}
