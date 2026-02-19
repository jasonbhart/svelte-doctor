<script>
  function handleClick() { console.log('clicked'); }
  function handleKey(e) { console.log(e.key); }
</script>

<button on:click={handleClick}>Click</button>
<input on:keydown={handleKey} />
