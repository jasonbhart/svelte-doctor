export async function load({ fetch }) {
  const [users, posts] = await Promise.all([
    fetch('/api/users'),
    fetch('/api/posts'),
  ]);
  return { users, posts };
}
