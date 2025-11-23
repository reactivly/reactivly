import { useMutation } from '@tanstack/react-query';
import { trpc } from './utils/trpc';
import { useSubscription } from '@trpc/tanstack-react-query';
import { useRef } from 'react';

export function Posts() {
  const setPostMinLength = useMutation(trpc.post.setPostMinLength.mutationOptions({}));
  const posts = useSubscription(trpc.post.posts.subscriptionOptions());
  const createPost = useMutation(trpc.post.create.mutationOptions({}));
  const deletePost = useMutation(trpc.post.delete.mutationOptions({}));
  const text = useRef<HTMLInputElement>(null);

  return <>
    <input type="text" ref={text} /><button onClick={e => createPost.mutate({ val: text.current?.value })}>Add Post</button>
    <br />
    Set Post Min Length:
    <input type="number" onChange={e => setPostMinLength.mutate({ val: +e.target.value })} />
    <div>{(posts.data)?.map(post =>
      <div key={post.id}>Post #{post.id}: {post.name}
      <button onClick={e => deletePost.mutate({ id: post.id })}>Delete</button>
    </div>
    )}</div>
  </>;
}
