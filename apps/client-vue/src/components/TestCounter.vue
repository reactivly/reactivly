<template>
  <template v-if="isLoading">
    <p>Loading...</p>
  </template>
  <template v-else>
    <p>Counter: {{ data }}</p>
    <button @click="incrementCounter.mutateAsync({step: 1})">
      Increment
    </button>
  </template>
</template>

<script setup lang="ts">
import { endpointClient } from '../composables/endpointClient';

const incrementCounter = endpointClient.mutation('incrementCounter');
const { data, isLoading } = endpointClient.query('getCounter');
</script>