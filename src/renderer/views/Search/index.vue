<template>
  <div :class="$style.container" data-search-page>
    <div :class="$style.masthead">
      <p :class="$style.eyebrow">LUX MUSIC · SEARCH</p>
      <h1>{{ $t('search') }}</h1>
    </div>
    <div :class="$style.header">
      <base-tab v-model="source" data-search-sources :list="sources" @change="handleSourceChange" />
      <base-tab v-model="searchType" data-search-types :list="searchTypes" @change="handleTypeChange" />
    </div>
    <div :class="$style.main">
      <song-list-list v-if="searchType == 'songlist'" v-show="searchText" :page="page" :source-id="source" />
      <music-list v-else v-show="searchText" :page="page" :source-id="source" />
      <blank-view :visible="!searchText" :source="source" />
    </div>
  </div>
</template>

<script>
import { useRoute, useRouter } from '@common/utils/vueRouter'
import { searchText } from '@renderer/store/search/state'
import { getSearchSetting, setSearchSetting } from '@renderer/utils/data'
import { sources as _sources } from '@renderer/store/search/music'

import MusicList from './MusicList/index.vue'
import SongListList from './SongListList/index.vue'
import BlankView from './components/BlankView.vue'
import { computed, ref } from '@common/utils/vueTools'
import { sourceNames } from '@renderer/store'

/** @type {import('vue').Ref<import('@renderer/store/hotSearch').Source>} */
const source = ref('kw')
const searchType = ref(null)
const page = ref(1)

const verifyQueryParams = async(to, from, next) => {
  let _source = to.query.source
  let _type = to.query.type
  let _page = to.query.page

  if (_source == null || _type == null) {
    const setting = await getSearchSetting()
    _source ??= setting.source
    _type ??= setting.type

    next({
      path: to.path,
      query: { ...to.query, source: _source, type: _type, page: _page },
    })
    return
  }
  source.value = _source
  searchType.value = _type

  if (_page) page.value = parseInt(_page)

  if (to.query.text != null) {
    searchText.value = to.query.text
    if (!_page) page.value = 1
  }
  next()
  void setSearchSetting({ source: _source, type: _type })
}

export default {
  components: {
    MusicList,
    SongListList,
    BlankView,
  },
  beforeRouteEnter: verifyQueryParams,
  beforeRouteUpdate: verifyQueryParams,
  setup() {
    const route = useRoute()
    const router = useRouter()

    const sources = _sources.map(id => {
      return {
        id,
        label: sourceNames.value[id],
      }
    })
    const handleSourceChange = (id) => {
      void router.replace({
        path: route.path,
        query: {
          ...route.query,
          source: id,
          page: 1,
        },
      })
    }

    const searchTypes = computed(() => {
      return [
        { label: window.i18n.t('search__type_music'), id: 'music' },
        { label: window.i18n.t('search__type_songlist'), id: 'songlist' },
      ]
    })
    const handleTypeChange = (type) => {
      void router.replace({
        path: route.path,
        query: {
          ...route.query,
          type,
          page: 1,
        },
      })
    }


    return {
      sources,
      source,
      handleSourceChange,
      searchTypes,
      searchType,
      handleTypeChange,
      page,
      searchText,
    }
  },
}


</script>

<style lang="less" module>
.container {
  display: flex;
  flex-flow: column nowrap;
  padding: var(--lux-space-4) var(--lux-page-gutter) 0;
  box-sizing: border-box;
  color: var(--lux-list);
  background: var(--lux-paper);
}
.masthead {
  flex: none;
  margin-bottom: var(--lux-space-4);
  h1 {
    margin-top: var(--lux-space-2);
    font-family: var(--lux-font-display);
    font-size: var(--lux-type-page);
    line-height: var(--lux-type-page-line);
    font-weight: var(--lux-weight-display);
    letter-spacing: -.025em;
    color: var(--lux-display);
  }
}
.eyebrow {
  font-size: var(--lux-type-eyebrow);
  font-weight: var(--lux-weight-label);
  letter-spacing: .12em;
  color: var(--lux-eyebrow);
}
.header {
  flex: none;
  display: flex;
  justify-content: space-between;
  gap: var(--lux-space-4);
  border-bottom: var(--lux-rule-width) solid var(--lux-rule);
  :global([role='tablist']) {
    min-width: 0;
    overflow-x: auto;
    gap: var(--lux-space-5);
    padding: 0;
    font-size: var(--lux-type-body);
  }
  :global([role='tab']) {
    flex: none;
    color: var(--lux-option);
    font-weight: 600;
    > span { padding: var(--lux-space-3) 0; }
  }
  :global([aria-selected='true']) {
    color: var(--lux-ink);
    font-weight: var(--lux-weight-display);
    > span::after {
      height: var(--lux-marker-width);
      border-radius: 0;
      background: var(--lux-ink);
    }
  }
}
.main {
  position: relative;
  flex: auto;
  min-height: 0;
}
@media (max-width: 1100px) {
  .header { flex-wrap: wrap; gap: 0 var(--lux-space-4); }
}
// The retained toolbar input/suggestions are themed only while Search is mounted.
:global(#root:has([data-search-page]) #toolbar > div:first-child > div) {
  border-radius: 0;
  background: var(--lux-paper-raised);
  box-shadow: none;
  border-bottom: var(--lux-rule-width) solid var(--lux-rule);
  input { color: var(--lux-ink); }
  li { border-top: var(--lux-hairline-width) solid var(--lux-hairline); color: var(--lux-list); }
}
</style>
