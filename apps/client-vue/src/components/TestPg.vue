<script setup lang="ts">
import { ref } from "vue";
import { endpointClient } from "../composables/endpointClient";

const input = ref("");

const { data, isLoading } = endpointClient.query("itemsList");
const addItem = endpointClient.mutation("addItem");
const deleteItem = endpointClient.mutation("deleteItem");
</script>

<template>
  <template v-if="isLoading">
    <p>Loading...</p>
  </template>
  <template v-else>
    <ul>
      <li v-for="item in data" :key="item.id">
        {{ item.name }}
        <button @click="deleteItem.mutate({ id: item.id })">X</button>
      </li>
    </ul>
  </template>
  <form @submit.prevent>
    <input v-model="input" :style="addItem.isPending.value ? 'background-color: red' : ''" />
    <button @click="addItem.mutateAsync({ name: input }); input = ''">Add item</button>
  </form>
</template>
