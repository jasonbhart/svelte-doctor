<script>
  let userId = $state('123');
  let userData = $state(null);

  $effect(async () => {
    const res = await fetch(`/api/users/${userId}`);
    userData = await res.json();
  });
</script>

<p>{JSON.stringify(userData)}</p>
