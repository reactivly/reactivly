import { useEndpoints } from "./hooks/useEndpoints";

export function App() {
  const { data, isLoading } = useEndpoints().query("itemsList");

  if (isLoading) return <div>Loading...</div>;
  return (
    <ul>
      {data?.map(item => (
        <li key={item.id}>{item.name}</li>
      ))}
    </ul>
  );
}

export function OrdersByItem() {
  const { data } = useEndpoints().query("ordersByItem", {filter : "all"});

  return <pre>{JSON.stringify(data, null, 2)}</pre>;
}

export function FileWatcher() {
  const { data } = useEndpoints().query("fileWatcher");

  return <pre>{data}</pre>;
}
