<script>
  let { name, count = 0 } = $props();
  let doubled = $derived(count * 2);
</script>

<p>{name}: {doubled}</p>
