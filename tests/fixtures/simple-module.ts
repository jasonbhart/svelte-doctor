export async function load() {
  const data = await fetch('/api/data');
  return { data };
}
