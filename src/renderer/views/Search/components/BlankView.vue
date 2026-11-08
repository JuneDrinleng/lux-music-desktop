<template>
  <transition enter-active-class="animated-fast fadeIn" leave-active-class="animated-fast fadeOut">
    <div v-show="props.visible" :class="$style.noitem">
      <div v-if="appSetting['search.isShowHotSearch'] || (appSetting['search.isShowHistorySearch'] && historyList.length)" class="scroll" :class="$style.noitemListContainer">
        <dl v-if="appSetting['search.isShowHotSearch']" :class="$style.noitemList">
          <dt :class="$style.noitemListTitle">{{ $t('search__hot_search') }}</dt>
          <dd v-for="(item, index) in hotSearchList" :key="index" :class="$style.noitemListItem"><button type="button" @click="handleSearch(item)">{{ item }}</button></dd>
        </dl>
        <dl v-if="appSetting['search.isShowHistorySearch'] && historyList.length" :class="$style.noitemList">
          <dt :class="$style.noitemListTitle">
            <span>{{ $t('history_search') }}</span><button type="button" :class="$style.historyClearBtn" :aria-label="$t('history_clear')" @click="clearHistoryList">
              <svg version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" height="100%" viewBox="0 0 512 512" space="preserve">
                <use xlink:href="#icon-eraser" />
              </svg></button>
          </dt>
          <dd v-for="(item, index) in historyList" :key="index + item" :class="$style.noitemListItem" :aria-label="$t('history_remove')" @contextmenu="removeHistoryWord(index)"><button type="button" @click="handleSearch(item)">{{ item }}</button></dd>
        </dl>
      </div>
      <div v-else :class="$style.noitem_label">
        <p>{{ $t('search__welcome') }}</p>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { watch, shallowRef } from '@common/utils/vueTools'
import { historyList } from '@renderer/store/search/state'
import { getHistoryList, removeHistoryWord, clearHistoryList } from '@renderer/store/search/action'
import { getList } from '@renderer/store/hotSearch'
import { appSetting } from '@renderer/store/setting'
import { useRouter } from '@common/utils/vueRouter'

const props = defineProps({
  visible: Boolean,
  source: {
    type: /** @type {import('vue').PropType<import('@renderer/store/hotSearch').Source>} */ (String),
    required: true,
  },
})

const hotSearchList = shallowRef([])

if (appSetting['search.isShowHotSearch']) {
  watch(() => props.visible, (visible) => {
    if (!visible) return
    void getList(props.source).then(list => {
      hotSearchList.value = list
    })
  }, {
    immediate: true,
  })

  watch(() => props.source, (source) => {
    if (!props.visible) return
    void getList(source).then(list => {
      if (source != props.source) return
      hotSearchList.value = list
    })
  })
}

if (appSetting['search.isShowHistorySearch']) {
  void getHistoryList()
}

const router = useRouter()
const handleSearch = (text) => {
  void router.replace({
    path: '/search',
    query: {
      text,
    },
  })
}

</script>

<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.noitem {
  position: absolute;
  inset: 0;
  overflow: hidden;
  display: flex;
  flex-flow: column nowrap;
}
.noitemListContainer {
  padding: var(--lux-space-5) 0 var(--lux-space-4);
  min-height: 0;
  flex: auto;
}
.noitemList + .noitemList {
  margin-top: var(--lux-space-6);
  padding-top: var(--lux-space-3);
  border-top: var(--lux-rule-width) solid var(--lux-rule);
}
.noitemListTitle {
  display: flex;
  align-items: center;
  gap: var(--lux-space-2);
  margin-bottom: var(--lux-space-3);
  color: var(--lux-display);
  font-size: var(--lux-type-section);
  font-weight: var(--lux-weight-display);
}
.noitemListItem {
  display: inline-block;
  max-width: 100%;
  margin: 0 var(--lux-space-3) var(--lux-space-2) 0;
  button {
    display: block;
    max-width: 100%;
    padding: var(--lux-space-2) var(--lux-space-3);
    border: var(--lux-hairline-width) solid var(--lux-hairline);
    border-radius: 0;
    background: transparent;
    color: var(--lux-list);
    font-size: var(--lux-type-body);
    line-height: 1.4;
    cursor: pointer;
    .mixin-ellipsis-1();
    &:hover, &:active { background: var(--lux-accent-soft); color: var(--lux-ink); }
  }
}
.historyClearBtn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--lux-hit-icon);
  height: var(--lux-hit-icon);
  padding: var(--lux-space-2);
  border: none;
  background: transparent;
  color: var(--lux-option);
  cursor: pointer;
  &:hover { background: var(--lux-accent-soft); color: var(--lux-ink); }
  svg { width: 100%; }
}
.noitem_label {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  p { font-size: var(--lux-type-section); color: var(--lux-muted); text-align: center; }
}
</style>
