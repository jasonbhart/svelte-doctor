<script>
  let initialized = $state(false);

  $effect(() => {
    if (initialized) return;
    initialized = true;
    console.log('initialized!');
  });
</script>

<p>{initialized}</p>
