<script>
  let { title } = $props();
</script>

<div>
  <h1>{title}</h1>
  <slot />
  <slot name="footer" />
</div>
