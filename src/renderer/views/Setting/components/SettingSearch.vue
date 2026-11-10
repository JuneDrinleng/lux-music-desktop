<template lang="pug">
dt#search(:class="$style.heading") {{ $t('setting__search') }}
dd(:class="$style.search")
  .gap-top(:class="$style.row")
    base-checkbox(id="setting_search_showHot_enable" :model-value="appSetting['search.isShowHotSearch']" :label="$t('setting__search_hot')" @update:model-value="updateSetting({'search.isShowHotSearch': $event})")
  .gap-top(:class="$style.row")
    base-checkbox(id="setting_search_showHistory_enable" :model-value="appSetting['search.isShowHistorySearch']" :label="$t('setting__search_history')" @update:model-value="updateSetting({'search.isShowHistorySearch': $event})")
  .gap-top(:class="$style.row")
    base-checkbox(id="setting_search_focusSearchBox_enable" :model-value="appSetting['search.isFocusSearchBox']" :label="$t('setting__search_focus_search_box')" @update:model-value="updateSetting({'search.isFocusSearchBox': $event})")

</template>

<script>
// import { ref, onBeforeUnmount } from '@common/utils/vueTools'
import { appSetting, updateSetting } from '@renderer/store/setting'

export default {
  name: 'SettingSearch',
  setup() {
    return {
      appSetting,
      updateSetting,
    }
  },
}
</script>

<style lang="less" module>
.heading:global(#search) {
  color: var(--lux-ink);
  border-top: var(--lux-rule-width) solid var(--lux-rule);
  letter-spacing: -.025em;
}

.search {
  background-color: var(--lux-paper);
  color: var(--lux-ink);
  font-family: inherit;

  > .row:global(.gap-top) {
    margin: 0;
    padding: var(--lux-space-4) var(--lux-space-2);
    border-bottom: var(--lux-hairline-width) solid var(--lux-hairline);
  }
}

.row :global {
  label {
    align-items: flex-start;
    gap: var(--lux-space-3);
    font: inherit;
  }

  [role=checkbox] {
    width: 1.125em;
    height: 1.125em;
    margin-top: .2em;
    color: var(--lux-ink);

    &:after {
      border: var(--lux-hairline-width) solid var(--lux-muted);
      border-radius: 0;
    }
  }

  input:checked + label [role=checkbox]:after {
    border-color: var(--lux-ink);
  }

  svg {
    border-radius: 0;
  }

  label > span {
    min-width: 0;
    margin-left: 0;
    line-height: 1.6;
    overflow-wrap: anywhere;
  }
}
</style>
