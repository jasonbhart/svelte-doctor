<script>
  let { title, children, footer } = $props();
</script>

<div>
  <h1>{title}</h1>
  {@render children?.()}
  {@render footer?.()}
</div>
