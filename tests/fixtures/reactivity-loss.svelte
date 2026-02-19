<script>
  let { value, label } = $props();

  function processValue(val) {
    return val * 2;
  }

  let result = processValue(value);
</script>

<p>{label}: {result}</p>
