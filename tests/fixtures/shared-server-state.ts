let cache = new Map();
let requestCount = 0;

export async function load({ params }) {
  requestCount++;
  if (cache.has(params.id)) {
    return cache.get(params.id);
  }
  const data = await fetch(`/api/${params.id}`);
  cache.set(params.id, data);
  return data;
}
