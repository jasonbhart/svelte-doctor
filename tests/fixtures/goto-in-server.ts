import { goto } from '$app/navigation';
import { redirect } from '@sveltejs/kit';

export async function load({ params }) {
  if (!params.id) {
    goto('/');
  }
  return { id: params.id };
}
