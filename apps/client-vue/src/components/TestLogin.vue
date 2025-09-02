<template>
  <div>{{ session }}</div>
  <button @click="doLogin">Login</button>
</template>

<script setup lang="ts">
import { endpointClient } from '../composables/endpointClient';

const session = endpointClient.useSession(); // reactive ref

const login = endpointClient.mutation("login");

// Call mutation
const doLogin = () => login.mutateAsync({ username: "test", password: "123" }).then(() => {
  console.log("JWT after login:", session.value.token);
  console.log("User info:", session.value.user);
});
</script>