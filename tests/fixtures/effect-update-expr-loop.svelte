<script>
  let count = $state(0);

  $effect(() => {
    count++;
  });
</script>

<p>{count}</p>
