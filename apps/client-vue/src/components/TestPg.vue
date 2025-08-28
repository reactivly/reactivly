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
  <form @submit.prevent>
    <input v-model="input" :style="addItem.isPending.value ? 'background-color: red' : ''" />
    <button @click="addItem.mutateAsync({ name: input }); input = ''">Add item</button>
  </form>
</template>
