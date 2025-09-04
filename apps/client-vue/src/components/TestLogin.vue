<template>
  <template v-if="me.data.value">
    <div>{{ me.data.value }}</div>
    <button @click="logout.mutateAsync(undefined)">Logout</button>
  </template>
  <template v-else>
    <button @click="doLogin">Login</button>
  </template>
</template>

<script setup lang="ts">
import { endpointClient } from "../composables/endpointClient";

const me = endpointClient.query("sessionUser");
const login = endpointClient.mutation("login");
const logout = endpointClient.mutation("logout");

// Call mutation
const doLogin = () => login.mutateAsync({ username: "test", password: "123" });
</script>
