<script>
  let { title } = $props();
</script>

<div {...$$restProps}>
  <h1>{title}</h1>
  <pre>{JSON.stringify($$props)}</pre>
</div>
