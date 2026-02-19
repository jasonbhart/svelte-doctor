import { goto } from '$app/navigation';

let cache = new Map();

export async function load({ fetch }) {
  const users = await fetch('/api/users');
  const posts = await fetch('/api/posts');
  return { users, posts };
}
