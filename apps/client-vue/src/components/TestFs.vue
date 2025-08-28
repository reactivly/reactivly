<script setup lang="ts">
import { endpointClient } from '../composables/endpointClient';

const { data, isLoading } = endpointClient.query('fileWatcher');
</script>

<template>
  <template v-if="isLoading">
    <p>Loading...</p>
  </template>
  <template v-else>
    {{ data }}
  </template>
</template>
