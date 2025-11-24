import { useMutation } from "@tanstack/react-query";
import { trpc } from "./utils/trpc";
import { useSubscription } from "@trpc/tanstack-react-query";
import { useRef } from "react";

export function Greeting() {
  const name = useRef<HTMLInputElement>(null);
  const userName = useSubscription(trpc.greeting.get.subscriptionOptions());
  const login = useMutation(trpc.greeting.login.mutationOptions({}));
  const logout = useMutation(trpc.greeting.logout.mutationOptions({}));
  const fileContent = useSubscription(
    trpc.greeting.file.subscriptionOptions()
  );

  return (
    <div>
      <p>{fileContent.data}</p>
      {userName.data?.length ? (
        <span>
          Hello, {userName.data}!{" "}
          <button onClick={() => logout.mutate()} style={{ marginLeft: 8 }}>
            Logout
          </button>
        </span>
      ) : (
        <div>
          <input type="text" ref={name} />
          <button onClick={(e) => login.mutate({ name: name.current?.value })}>
            Login
          </button>
        </div>
      )}
      <br />
    </div>
  );
}
