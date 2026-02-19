<script>
  import { enhance } from '$app/forms';
  let { data } = $props();
</script>

<form method="POST" use:enhance>
  <input name="email" type="email" />
  <button type="submit">Submit</button>
</form>
