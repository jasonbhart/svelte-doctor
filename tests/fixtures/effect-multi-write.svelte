<script>
  let count = $state(0);
  let label = $state('');

  $effect(() => {
    label = `Count is ${count}`;
  });

  function reset() {
    label = 'reset';
  }
</script>

<p>{label}</p>
<button onclick={reset}>Reset</button>
