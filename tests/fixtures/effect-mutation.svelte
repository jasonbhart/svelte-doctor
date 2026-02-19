<script>
  let count = $state(0);
  let doubled = $state(0);

  $effect(() => {
    doubled = count * 2;
  });
</script>

<p>{doubled}</p>
