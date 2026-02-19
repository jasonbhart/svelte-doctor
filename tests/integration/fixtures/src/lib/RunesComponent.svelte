<script>
  // sv-no-stale-derived-let: plain let from $props var
  let { myProp } = $props();
  let staleVal = myProp + 1;

  // sv-reactivity-loss-primitive: reactive var passed to plain function call
  let formatted = String(myProp);

  // sv-no-effect-state-mutation: $state var mutated inside $effect
  // sv-prefer-derived-over-effect: $effect with single assignment
  let effectVal = $state(0);
  $effect(() => {
    effectVal = myProp * 2;
  });

  // sv-require-bindable-rune: prop mutated without $bindable()
  function reset() {
    myProp = 'default';
  }

  // perf-no-function-derived: $derived with arrow function
  let computedVal = $derived(() => myProp + 1);

  // perf-prefer-state-raw: $state with large array (>20 elements)
  let bigList = $state([
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
    21
  ]);
</script>

<div>{staleVal} {formatted} {effectVal} {computedVal} {bigList.length}</div>
