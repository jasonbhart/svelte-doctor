<script>
  let count = $state(0);
  let doubled = $derived(() => count * 2);
  let tripled = $derived(() => count * 3);
</script>

<p>{doubled} {tripled}</p>
