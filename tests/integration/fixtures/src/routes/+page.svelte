<script>
  import { createEventDispatcher } from 'svelte';
  export let name;
  export let count = 0;

  const dispatch = createEventDispatcher();
</script>

<button on:click={() => dispatch('increment')}>
  {name}: {count}
</button>

<slot />

<form method="POST">
  <input name="q" />
  <button type="submit">Search</button>
</form>
