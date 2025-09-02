import { useRef } from "react";
import { endpointClient } from "./hooks/endpointClient";

export function Login() {
  const me = endpointClient.query("whoami");
  const login = endpointClient.mutation("login");
  const logout = endpointClient.mutation("logout");

  return (
    <div>
      {me.data ? (
        <>
          <pre>{JSON.stringify(me.data, null, 2)}</pre>
          <button
            onClick={async () => {
              await logout.mutateAsync();
            }}
          >
            Logout
          </button>
        </>
      ) : (
        <button
          onClick={async () => {
            await login.mutateAsync({ username: "test", password: "123" });
          }}
        >
          Login
        </button>
      )}
    </div>
  );
}

export function App() {
  const { data, isLoading } = endpointClient.query("itemsList");
  const deleteItem = endpointClient.mutation("deleteItem");

  if (isLoading) return <div>Loading...</div>;
  return (
    <ul>
      {data?.map((item) => (
        <li key={item.id}>
          {item.name}{" "}
          <button onClick={() => deleteItem.mutate({ id: item.id })}>X</button>
        </li>
      ))}
    </ul>
  );
}

export function AddItem() {
  const inputRef = useRef<HTMLInputElement>(null);
  const addItem = endpointClient.mutation("addItem");

  return (
    <form onSubmit={(e) => e.preventDefault()}>
      <input ref={inputRef} disabled={addItem.isPending} style={{ backgroundColor: addItem.isPending ? 'red' : 'unset' }} />
      <button
        onClick={async () => {
          console.log(inputRef.current?.value);
          if (!inputRef.current?.value) return;
          await addItem.mutateAsync({ name: inputRef.current?.value });
          inputRef.current.value = "";
        }}
      >
        Add Item
      </button>
    </form>
  );
}

export function OrdersByItem() {
  const { data } = endpointClient.query("ordersByItem", { filter: "all" });

  return <pre>{JSON.stringify(data, null, 2)}</pre>;
}

export function FileWatcher() {
  const { data } = endpointClient.query("fileWatcher");

  return <pre>{data}</pre>;
}
