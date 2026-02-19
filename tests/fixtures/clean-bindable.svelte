<script>
  let { count = $bindable(0), name } = $props();

  function increment() {
    count = count + 1;
  }
</script>

<button onclick={increment}>{count} - {name}</button>
