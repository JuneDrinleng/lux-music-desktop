<template>
  <div :class="$style.container">
    <material-online-list
      ref="listRef"
      :page="listInfo.page"
      :limit="listInfo.limit"
      :total="listInfo.total"
      :list="listInfo.list"
      :no-item="listInfo.noItemLabel"
      :source-tag="sourceId == 'all'"
      check-api-source
      @toggle-page="handleTogglePage"
      @play-list="handlePlayList"
    />
  </div>
</template>

<script setup lang="ts">
import { watch } from '@common/utils/vueTools'
import { searchText } from '@renderer/store/search/state'
import { useRouter, useRoute } from '@common/utils/vueRouter'
import useList, { type SearchSource } from './useList'

interface Props {
  sourceId: SearchSource
  page: number
}

const props = defineProps<Props>()
const router = useRouter()
const route = useRoute()

const {
  listRef,
  listInfo,
  search,
  handlePlayList,
} = useList()

watch(() => [props.sourceId, props.page], ([sourceId, page]) => {
  setTimeout(() => {
    search(searchText.value, sourceId as SearchSource, page as number || 1)
  })
})
watch(searchText, (searchText) => {
  setTimeout(() => {
    search(searchText, props.sourceId, props.page)
  })
}, {
  immediate: true,
})

const handleTogglePage = (page: number) => {
  void router.replace({
    path: route.path,
    query: {
      ...route.query,
      page,
    },
  })
}


</script>


<style lang="less" module>
.container {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
}

// Inset paint only: never change the fixed virtual slot height or cell padding.
.container :global(.thead) {
  border-bottom: var(--lux-hairline-width) solid var(--lux-hairline);
  th { color: var(--lux-option); font-weight: var(--lux-weight-label); }
}
.container :global(.list-item) {
  box-shadow: inset 0 calc(-1 * var(--lux-hairline-width)) var(--lux-hairline);
  color: var(--lux-list);
  font-variant-numeric: tabular-nums;
  font-size: var(--lux-type-body);
  :global(.name > .name) { color: var(--lux-ink); font-weight: var(--lux-weight-label); }
  &:hover, &:global(.active), &:global(.selected) { background: var(--lux-accent-soft); }
  &:global(.active) { box-shadow: inset var(--lux-marker-width) 0 var(--lux-ink), inset 0 -1px var(--lux-hairline); }
}
.container :global(p) { color: var(--lux-muted); font-size: var(--lux-type-section); }
</style>
