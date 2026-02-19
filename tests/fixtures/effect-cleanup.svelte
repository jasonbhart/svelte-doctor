<script>
  let count = $state(0);
  let tick = $state(0);

  $effect(() => {
    tick = count;
    const interval = setInterval(() => { tick++; }, 1000);
    return () => clearInterval(interval);
  });
</script>

<p>{tick}</p>
