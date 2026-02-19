import { SECRET_KEY } from '$env/static/private';

export function load() {
  return { key: SECRET_KEY };
}
