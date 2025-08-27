import { useRef } from "react";
import { useEndpoints } from "./hooks/useEndpoints";

export function App() {
  const { data, isLoading } = useEndpoints().query("itemsList");
  const deleteItem = useEndpoints().mutation("deleteItem")

  if (isLoading) return <div>Loading...</div>;
  return (
    <ul>
      {data?.map(item => (
        <li key={item.id}>{item.name} <button onClick={() => deleteItem.mutate({id: item.id})}>X</button></li>
      ))}
    </ul>
  );
}

export function AddItem() {
  const inputRef = useRef<HTMLInputElement>(null)
  const addItem = useEndpoints().mutation("addItem")

  return (
    <div>
      <input ref={inputRef} />
      <button onClick={() => { console.log(inputRef.current?.value); addItem.mutate({ name: inputRef.current?.value }) }}>
        Add Item
      </button>
    </div>
  )
}

export function OrdersByItem() {
  const { data } = useEndpoints().query("ordersByItem", { filter: "all" });

  return <pre>{JSON.stringify(data, null, 2)}</pre>;
}

export function FileWatcher() {
  const { data } = useEndpoints().query("fileWatcher");

  return <pre>{data}</pre>;
}
