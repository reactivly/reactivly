<script setup lang="ts">
import { useEndpoints } from '../composables/useEndpoints';

const { data, isLoading } = useEndpoints().query('fileWatcher');
</script>

<template>
  <template v-if="isLoading">
    <p>Loading...</p>
  </template>
  <template v-else>
    {{ data }}
  </template>
</template>
