<script>
  import { createEventDispatcher } from 'svelte';
  export let name;
  export let count = 0;

  const dispatch = createEventDispatcher();

  // sv-no-reactive-statements: legacy $: reactive statement
  $: doubled = count * 2;

  // sv-no-magic-props: legacy $$props usage
  let allProps = $$props;
</script>

<button on:click={() => dispatch('increment')}>
  {name}: {count} (doubled: {doubled}, props: {allProps})
</button>

<!-- sv-no-svelte-component: deprecated dynamic component syntax -->
<svelte:component this={name} />

<slot />

<form method="POST">
  <input name="q" />
  <button type="submit">Search</button>
</form>
