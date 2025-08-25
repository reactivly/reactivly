<script setup lang="ts">
import { useEndpoints } from "../composables/useEndpoints";

const { data, isLoading } = useEndpoints().query("itemsList");
</script>

<template>
  <template v-if="isLoading">
    <p>Loading...</p>
  </template>
  <template v-else>
    <ul>
      <li v-for="item in data" :key="item.id">{{ item.name }}</li>
    </ul>
  </template>
</template>
