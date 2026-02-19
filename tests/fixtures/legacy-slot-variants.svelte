<script>
  let { title } = $props();
</script>

<div>
  <slot name='header' />
  <slot name="sidebar" data={items} />
  <slot>fallback content</slot>
</div>
