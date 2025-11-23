import { useQuery } from '@tanstack/react-query';
import { trpc } from './utils/trpc';
import { useSubscription } from '@trpc/tanstack-react-query';

export function Posts() {
  const posts = useSubscription(trpc.post.posts.subscriptionOptions());

  return <div>{(posts.data)?.map(post => 
    <div key={post.id}>Post #{post.id}: {post.name}</div>
  )}</div>;
}
