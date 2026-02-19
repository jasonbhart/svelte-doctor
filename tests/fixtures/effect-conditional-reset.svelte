<script>
  let count = $state(0);

  $effect(() => {
    if (count > 100) {
      count = 0;
    }
  });
</script>

<p>{count}</p>
