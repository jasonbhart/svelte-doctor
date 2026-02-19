<script>
  let { value = $bindable(0) } = $props();

  let internal = $state(0);

  $effect(() => {
    value = internal * 2;
  });
</script>

<p>{value}</p>
