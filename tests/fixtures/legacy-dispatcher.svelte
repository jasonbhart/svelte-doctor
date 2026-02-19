<script>
  import { createEventDispatcher } from 'svelte';
  const dispatch = createEventDispatcher();

  function handleClick() {
    dispatch('submit', { value: 42 });
  }
</script>

<button on:click={handleClick}>Submit</button>
