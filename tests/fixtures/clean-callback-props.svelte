<script>
  let { onsubmit } = $props();

  function handleClick() {
    onsubmit?.({ value: 42 });
  }
</script>

<button onclick={handleClick}>Submit</button>
