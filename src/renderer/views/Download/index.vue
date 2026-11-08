<template>
  <div :class="$style.download" data-page="downloads">
    <div :class="$style.header">
      <div :class="$style.heading">
        <h1>{{ $t('download') }}</h1>
        <span :class="$style.count">{{ list.length.toString().padStart(2, '0') }}</span>
      </div>
      <base-tab v-model="activeTab" :class="$style.tab" :list="tabs" />
    </div>
    <div :class="$style.content">
      <div class="thead" :class="$style.thead">
        <table>
          <thead>
            <tr>
              <th class="num" style="width: 2.75rem;">#</th>
              <th class="nobreak">{{ $t('music_name') }}</th>
              <th class="nobreak" style="width: 20%;">{{ $t('download__progress') }}</th>
              <th class="nobreak" style="width: 22%;">{{ $t('download__status') }}</th>
              <th class="nobreak" style="width: 4.5rem;">{{ $t('download__quality') }}</th>
              <th class="nobreak" style="width: 7rem;">{{ $t('action') }}</th>
            </tr>
          </thead>
        </table>
      </div>
      <div v-if="list.length" ref="dom_listContent" :class="$style.content">
        <base-virtualized-list
          ref="listRef" v-slot="{ item, index }" :list="list" key-name="id" :item-height="listItemHeight"
          container-class="scroll" content-class="list"
        >
          <div
            class="list-item" :data-status="item.status" :data-task-id="item.id"
            :class="[{[$style.active]: playTaskId == item.id }, { selected: rightClickSelectedIndex == index }, { active: selectedList.includes(item) }]"
            @click="handleListItemClick($event, index)" @contextmenu="handleListItemRightClick($event, index)"
          >
            <div class="list-item-cell no-select" :class="$style.num" style="flex: 0 0 2.75rem;">
              <transition name="play-active">
                <div v-if="playTaskId == item.id" :class="$style.playIcon">
                  <svg version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" height="50%" viewBox="0 0 512 512" space="preserve">
                    <use xlink:href="#icon-play-outline" />
                  </svg>
                </div>
                <div v-else class="num">{{ (index + 1).toString().padStart(2, '0') }}</div>
              </transition>
            </div>
            <div class="list-item-cell auto name">
              <span class="select name" :aria-label="getName(item)">{{ getName(item) }}</span>
            </div>
            <div class="list-item-cell" :class="$style.progress" style="flex: 0 0 20%;">
              <span>{{ item.progress }}%<span v-if="item.status == downloadStatus.RUN && item.speed" :class="$style.speed"> · {{ item.speed }}/s</span></span>
              <progress :value="item.progress" max="100" :aria-label="$t('download__progress')" />
            </div>
            <div class="list-item-cell" :class="$style.status" style="flex: 0 0 22%;" :aria-label="item.statusText">{{ item.statusText }}</div>
            <div class="list-item-cell" style="flex: 0 0 4.5rem;">{{ getTypeName(item.metadata.quality) }}</div>
            <div class="list-item-cell" :class="$style.actions" style="flex: 0 0 7rem; padding-left: 0; padding-right: 0;">
              <material-list-buttons
                :index="index" :download-btn="false" :file-btn="item.status != downloadStatus.ERROR" remove-btn="remove-btn"
                :start-btn="!item.isComplate && item.status != downloadStatus.WAITING && (item.status != downloadStatus.RUN)"
                :pause-btn="!item.isComplate && (item.status == downloadStatus.RUN || item.status == downloadStatus.WAITING)"
                :list-add-btn="false" :play-btn="item.status == downloadStatus.COMPLETED"
                :search-btn="item.status == downloadStatus.ERROR" @btn-click="handleListBtnClick"
              />
            </div>
          </div>
        </base-virtualized-list>
      </div>
      <div v-else :class="$style.noItem">
        <p v-text="$t('no_item')" />
      </div>
      <base-menu v-model="isShowItemMenu" :menus="menus" :xy="menuLocation" item-name="name" @menu-click="handleMenuClick" />
      <!-- <base-menu :menus="listItemMenu" :location="listMenu.menuLocation" item-name="name" :is-show="listMenu.isShowItemMenu" @menu-click="handleListItemMenuClick" /> -->
    </div>
    <common-list-add-modal v-model:show="isShowListAdd" :music-info="selectedAddMusicInfo" teleport="#view" />
    <common-list-add-multiple-modal v-model:show="isShowListAddMultiple" :music-list="selectedList" teleport="#view" @confirm="removeAllSelect" />
  </div>
</template>

<script>
// import { checkPath, openDirInExplorer, openUrl } from '@common/utils/electron'

import { ref } from '@common/utils/vueTools'
import useListInfo from './useListInfo'
import useList from './useList'
import useTab from './useTab'
import useMenu from './useMenu'
import usePlay from './usePlay'
import useTaskActions from './useTaskActions'
import useMusicAdd from './useMusicAdd'
import { downloadStatus } from '@renderer/store/download/state'
import { appSetting } from '@renderer/store/setting'
import { formatMusicName } from '@renderer/utils'

export default {
  name: 'Download',
  setup() {
    const listRef = ref()
    const { tabs, activeTab } = useTab()

    const {
      rightClickSelectedIndex,
      dom_listContent,
      listAll,
      list,
      playTaskId,
    } = useListInfo(activeTab)

    const {
      selectedList,
      listItemHeight,
      removeAllSelect,
      handleSelectData,
    } = useList({ listRef, list, listAll })

    const {
      handlePlayMusic,
      handlePlayMusicLater,
    } = usePlay({ selectedList, list, listAll, removeAllSelect })

    const {
      handleSearch,
      handleOpenMusicDetail,
      handleStartTask,
      handlePauseTask,
      handleRemoveTask,
      handleOpenFile,
    } = useTaskActions({ list, removeAllSelect, selectedList })

    const {
      isShowListAdd,
      isShowListAddMultiple,
      selectedAddMusicInfo,
      handleShowMusicAddModal,
    } = useMusicAdd({ selectedList, list })

    const {
      menus,
      menuLocation,
      isShowItemMenu,
      showMenu,
      menuClick,
    } = useMenu({
      handleStartTask,
      handlePauseTask,
      handleRemoveTask,
      handleOpenFile,
      handlePlayMusic,
      handlePlayMusicLater,
      handleShowMusicAddModal,
      handleSearch,
      handleOpenMusicDetail,
    })

    let clickTime = 0
    let clickIndex = -1
    const doubleClickPlay = index => {
      if (
        window.performance.now() - clickTime > 400 ||
      clickIndex !== index
      ) {
        clickTime = window.performance.now()
        clickIndex = index
        return
      }
      const task = list.value[index]
      if (task.isComplate) {
        handlePlayMusic(list.value.indexOf(task))
      } else if (task.status === downloadStatus.RUN || task.status === downloadStatus.WAITING) {
        void handlePauseTask(index, true)
      } else {
        void handleStartTask(index, true)
      }
      clickTime = 0
      clickIndex = -1
    }

    const handleListItemClick = (event, index) => {
      if (rightClickSelectedIndex.value > -1) return
      handleSelectData(index)
      doubleClickPlay(index)
    }
    const handleListItemRightClick = (event, index) => {
      rightClickSelectedIndex.value = index
      showMenu(event, list.value[index])
    }
    const handleMenuClick = (action) => {
      let index = rightClickSelectedIndex.value
      rightClickSelectedIndex.value = -1
      menuClick(action, index)
    }

    const handleListBtnClick = ({ action, index }) => {
      switch (action) {
        case 'play':
          handlePlayMusic(index)
          break
        case 'start':
          void handleStartTask(index, true)
          break
        case 'pause':
          void handlePauseTask(index, true)
          break
        case 'remove':
          void handleRemoveTask(index, true)
          break
        case 'file':
          void handleOpenFile(index)
          break
        case 'search':
          handleSearch(index)
          break
      }
    }

    const getName = (downloadInfo) => {
      return formatMusicName(appSetting['download.fileName'], downloadInfo.metadata.musicInfo.name, downloadInfo.metadata.musicInfo.singer)
    }
    const getTypeName = (quality) => {
      return quality == 'flac24bit' ? 'FLAC Hires' : quality?.toUpperCase()
    }
    return {
      listRef,
      list,
      downloadStatus,
      rightClickSelectedIndex,
      dom_listContent,
      tabs,
      activeTab,
      selectedList,
      listItemHeight,
      playTaskId,

      isShowListAdd,
      isShowListAddMultiple,
      selectedAddMusicInfo,

      removeAllSelect,

      menus,
      menuLocation,
      isShowItemMenu,

      handleListItemClick,
      handleListItemRightClick,
      handleMenuClick,
      handleListBtnClick,

      getName,
      getTypeName,
    }
  },
}
</script>

<style lang="less" module>
.download {
  position: relative;
  overflow: hidden;
  height: 100%;
  display: flex;
  flex-flow: column nowrap;
  padding: 0 var(--lux-page-gutter);
  box-sizing: border-box;
  background: var(--lux-paper);
  color: var(--lux-ink);

  :global(.scroll) {
    // Match the header's reserved scrollbar width even for short lists.
    scrollbar-gutter: stable;
  }

  :global(.list-item) {
    border-bottom: var(--lux-hairline-width) solid var(--lux-hairline);
    color: var(--lux-list);
    font-size: var(--lux-type-meta);
    box-shadow: inset var(--lux-marker-width) 0 transparent;

    &:hover, &:global(.selected) {
      background: var(--lux-paper-raised);
    }
    &:global(.active) {
      color: var(--lux-ink);
      background: var(--lux-accent-soft);
      box-shadow: inset var(--lux-marker-width) 0 var(--lux-ink);
    }
    &:global(.active) .status, &:global(.active) .num :global(.num) {
      color: var(--lux-ink);
    }
    &.active {
      box-shadow: inset var(--lux-marker-width) 0 var(--lux-accent);
    }
    :global(.name) {
      min-width: 0;
      font-weight: var(--lux-weight-label);
    }
    :global(.num) {
      color: var(--lux-muted);
      font-size: var(--lux-type-meta);
      font-variant-numeric: tabular-nums;
    }
    &[data-status=run] .status {
      color: var(--lux-accent-ink);
    }
    &[data-status=error] .status {
      color: var(--lux-danger);
    }
  }
}
.header {
  flex: none;
  padding-top: var(--lux-space-5);
  border-bottom: var(--lux-rule-width) solid var(--lux-rule);
}
.heading {
  display: flex;
  align-items: baseline;
  gap: var(--lux-space-3);
  margin-bottom: var(--lux-space-4);

  h1 {
    color: var(--lux-display);
    font-size: var(--lux-type-page);
    line-height: var(--lux-type-page-line);
    font-weight: var(--lux-weight-display);
    letter-spacing: -.04em;
  }
}
.count {
  color: var(--lux-muted);
  font-size: var(--lux-type-section);
  font-variant-numeric: tabular-nums;
}
.tab {
  padding: 0;
  gap: var(--lux-space-5);
  font-size: var(--lux-type-body);

  [role=tab] {
    color: var(--lux-muted);
  }
  [aria-selected=true] {
    color: var(--lux-ink);
    font-weight: var(--lux-weight-label);
  }
  [role=tab] > span::after {
    border-radius: 0;
    background: var(--lux-ink);
  }
}
.thead {
  border-bottom: var(--lux-hairline-width) solid var(--lux-hairline);

  table {
    table-layout: fixed;
  }
  th {
    box-sizing: border-box;
    color: var(--lux-muted);
    font-size: var(--lux-type-meta);
    font-weight: var(--lux-weight-label);
  }
}
.num, .playIcon {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}
.playIcon {
  position: absolute;
  inset: 0;
  color: var(--lux-accent-ink);
}
.content {
  min-height: 0;
  display: flex;
  flex-flow: column nowrap;
  flex: auto;
}
.progress {
  font-variant-numeric: tabular-nums;

  progress {
    display: block;
    width: 100%;
    height: var(--lux-marker-width);
    margin-top: var(--lux-space-1);
    appearance: none;
    border: 0;
    &::-webkit-progress-bar { background: var(--lux-hairline); }
    &::-webkit-progress-value { background: var(--lux-ink); }
  }
}
.speed, .status {
  color: var(--lux-muted);
}
.actions {
  > div { display: flex; }
  button {
    width: var(--lux-hit-icon);
    height: var(--lux-hit-icon);
    padding: var(--lux-space-2);
    margin: 0;
    border-radius: 0;
    color: var(--lux-ink);
    &:hover { background: var(--lux-hairline); }
  }
}
.noItem {
  flex: auto;
  display: flex;
  justify-content: center;
  align-items: center;
  color: var(--lux-muted);
  font-size: var(--lux-type-section);
}
</style>
