export async function load({ fetch }) {
  const users = await fetch('/api/users');
  const posts = await fetch('/api/posts');
  return { users, posts };
}
