<script>
  function handleClick() { console.log('clicked'); }
  function handleKey(e) { console.log(e.key); }
</script>

<button onclick={handleClick}>Click</button>
<input onkeydown={handleKey} />
