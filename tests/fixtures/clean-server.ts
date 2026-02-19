const API_VERSION = 'v2';

export async function load({ params, locals }) {
  let requestData = null;
  requestData = await fetch(`/api/${API_VERSION}/${params.id}`);
  return requestData;
}
