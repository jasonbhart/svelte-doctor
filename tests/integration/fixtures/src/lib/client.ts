import App from './App.svelte';

// sv-no-component-constructor: legacy new Component({ target }) pattern
const app = new App({
  target: document.body,
  props: { name: 'world' },
});

export default app;
