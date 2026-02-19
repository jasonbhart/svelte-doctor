<script>
  let count = 0;
  $: doubled = count * 2;
  $: {
    console.log(count);
  }
</script>

<p>{doubled}</p>
