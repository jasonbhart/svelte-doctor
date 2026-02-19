import { redirect } from '@sveltejs/kit';

export async function load({ params }) {
  if (!params.id) {
    throw redirect(302, '/');
  }
  return { id: params.id };
}
