import { useEndpoint } from "./hooks/useEndpoint";

export function App() {
  const { data, isLoading } = useEndpoint("itemsList");

  if (isLoading) return <div>Loading...</div>;
  if (!data) return <div>No items</div>;

  return (
    <ul>
      {data.map((item) => (
        <li key={item.id}>{item.name}</li>
      ))}
    </ul>
  );
}
