<script>
  function handleClick(e) {
    console.log('clicked');
  }
  function handleSubmit(e) {
    console.log('submitted');
  }
</script>

<button on:click|preventDefault={handleClick}>Click</button>
<form on:submit|preventDefault|stopPropagation={handleSubmit}>
  <button type="submit">Submit</button>
</form>
