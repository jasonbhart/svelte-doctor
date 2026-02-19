<script>
  let dep = $state(0);
  let count = $state(0);

  $effect(() => {
    count = dep * 2;
  });

  function increment() {
    count++;
  }
</script>

<button onclick={increment}>{count}</button>
