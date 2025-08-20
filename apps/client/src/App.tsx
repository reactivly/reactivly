import { useEndpoints } from "./hooks/useEndpoint";

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

function OrdersByItem() {
  const { data } = useEndpoints().query("ordersByItem", {  });

  return <pre>{JSON.stringify(data, null, 2)}</pre>;
}
