<script setup lang="ts">
import { ref } from "vue";
import { useEndpoints } from "../composables/useEndpoints";

const input = ref("");

const { data, isLoading } = useEndpoints().query("itemsList");
const addItem = useEndpoints().mutation("addItem");
const deleteItem = useEndpoints().mutation("deleteItem");
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
  <input v-model="input" />
  <button @click="addItem.mutate({ name: input })">Add item</button>
</template>
