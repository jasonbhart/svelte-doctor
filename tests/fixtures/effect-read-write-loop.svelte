<script>
  let count = $state(0);

  $effect(() => {
    count = count + 1;
  });
</script>

<p>{count}</p>
