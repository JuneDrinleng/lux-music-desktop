<template>
  <div :class="$style.entry">
    <button ref="trigger" data-action="queue-toggle" :class="$style.toggle" :aria-label="$t('queue__title')" :aria-expanded="visible" aria-controls="play-queue" aria-haspopup="dialog" @click.stop="toggle">
      <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><use xlink:href="#icon-list-add" /></svg>
    </button>
    <base-popup v-model:visible="visible" :btn-el="trigger">
      <section id="play-queue" :inert="!visible || undefined" :class="$style.panel" role="dialog" :aria-label="$t('queue__title')" @keydown.esc.stop="close">
        <header :class="$style.header">
          <h2>{{ $t('queue__title') }} <span>{{ tempPlayList.length.toString().padStart(2, '0') }}</span></h2>
          <button ref="closeButton" :aria-label="$t('close')" @click="close">×</button>
        </header>
        <p v-if="musicInfo.id" :class="$style.current">{{ $t('queue__current') }} · {{ musicInfo.name }}</p>
        <div :class="$style.tools">
          <span>{{ $t('list__play_later') }}</span>
          <button data-action="queue-clear" :disabled="!tempPlayList.length" @click="clearTempPlayeList">{{ $t('queue__clear') }}</button>
        </div>
        <ol ref="rows" class="scroll" :class="$style.rows">
          <li v-for="(item, index) in tempPlayList" :key="keyFor(item)" :data-queue-id="item.musicInfo.id" :class="$style.row">
            <button data-action="queue-drag" :class="$style.drag" :aria-label="$t('queue__reorder') + ': ' + trackInfo(item).name" @keydown.up.prevent="move(index, index - 1)" @keydown.down.prevent="move(index, index + 1)">⠿</button>
            <span :class="$style.number">{{ (index + 1).toString().padStart(2, '0') }}</span>
            <button data-action="queue-play" :class="$style.track" :aria-label="$t('list__play') + ': ' + trackInfo(item).name" @click="playQueued(index)">
              <strong>{{ trackInfo(item).name }}</strong>
              <span>{{ trackInfo(item).singer || '—' }} · {{ trackInfo(item).interval || '--:--' }}</span>
            </button>
            <button data-action="queue-remove" :aria-label="$t('list__remove') + ': ' + trackInfo(item).name" @click="removeTempPlayList(index)">×</button>
          </li>
        </ol>
        <p v-if="!tempPlayList.length" :class="$style.empty">{{ $t('queue__empty') }}</p>
        <p :class="$style.hint">{{ $t('queue__hint') }}</p>
      </section>
    </base-popup>
  </div>
</template>

<script setup>
import Sortable from 'sortablejs'
import { ref, nextTick, onMounted, onBeforeUnmount } from '@common/utils/vueTools'
import { tempPlayList, musicInfo } from '@renderer/store/player/state'
import { removeTempPlayList, clearTempPlayeList } from '@renderer/store/player/action'
import { playNext } from '@renderer/core/player'

const itemKeys = new WeakMap()
const keyFor = (item) => {
  if (!itemKeys.has(item)) itemKeys.set(item, Symbol('queue-item'))
  return itemKeys.get(item)
}
const trackInfo = (item) => 'progress' in item.musicInfo ? item.musicInfo.metadata.musicInfo : item.musicInfo
const visible = ref(false)
const trigger = ref(null)
const closeButton = ref(null)
const rows = ref(null)
const close = () => { visible.value = false; trigger.value?.focus() }
const toggle = async() => {
  visible.value = !visible.value
  if (visible.value) { await nextTick(); closeButton.value?.focus() }
}
const move = (from, to) => {
  if (from === to || to < 0 || to >= tempPlayList.length) return
  tempPlayList.splice(to, 0, tempPlayList.splice(from, 1)[0])
}
const playQueued = (index) => {
  move(index, 0)
  // The original next-track path consumes one pending item and retains its listId.
  void playNext()
}
let sortable
let dragOrder = []
onMounted(() => {
  sortable = Sortable.create(rows.value, {
    handle: '[data-action=queue-drag]',
    forceFallback: true,
    onStart() { dragOrder = [...tempPlayList] },
    onEnd({ item, oldIndex, newIndex }) {
      // Restore Sortable's DOM move before Vue applies the state change.
      const currentIndex = tempPlayList.indexOf(dragOrder[oldIndex])
      item.remove()
      if (currentIndex < 0) return
      rows.value.insertBefore(item, rows.value.children[currentIndex] || null)
      // Playback can consume an item during dragging; never reorder a stale index.
      if (dragOrder.length !== tempPlayList.length || dragOrder.some((entry, index) => entry !== tempPlayList[index])) return
      move(oldIndex, newIndex)
    },
  })
})
onBeforeUnmount(() => sortable?.destroy())
</script>

<style lang="less" module>
.entry { flex: none; display: flex; height: 100%; }
.toggle { width: var(--lux-hit-icon); color: var(--lux-ink); }
// The shared Popup has a Teleport root; scope its outer surface to this panel.
:global(#root > div[aria-hidden]):has(.panel) { background: var(--lux-paper-raised); border: var(--lux-rule-width) solid var(--lux-rule); border-radius: 0; filter: none; }
:global(#root > div[aria-hidden]):has(.panel)::before { display: none; }
.panel {
  width: min(28rem, calc(100vw - 6.5rem));
  color: var(--lux-ink);
  font-size: var(--lux-type-body);
  padding: var(--lux-space-4);
  box-sizing: border-box;
  button { color: inherit; background: transparent; border: none; cursor: pointer; min-width: var(--lux-hit-icon); min-height: var(--lux-hit-icon); }
  button:hover { background: var(--lux-accent-soft); }
  button:disabled { opacity: .45; cursor: default; }
}
.toggle { background: transparent; border: none; cursor: pointer; }
.header, .tools, .row { display: flex; align-items: center; gap: var(--lux-space-2); }
.header { justify-content: space-between; border-bottom: var(--lux-rule-width) solid var(--lux-rule); padding-bottom: var(--lux-space-3); }
.header h2 { font-size: var(--lux-type-section); font-weight: var(--lux-weight-display); }
.header h2 span { color: var(--lux-accent-ink); font-variant-numeric: tabular-nums; margin-left: var(--lux-space-2); }
.current { margin: var(--lux-space-3) 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tools { justify-content: space-between; font-size: var(--lux-type-meta); font-weight: var(--lux-weight-label); }
.rows { max-height: min(40vh, 22rem); overflow-y: auto; padding: var(--lux-space-1); list-style: none; }
.row { border-bottom: var(--lux-hairline-width) solid var(--lux-hairline); min-height: 3.5rem; }
.drag { cursor: grab !important; }
.number { color: var(--lux-option); font-size: var(--lux-type-meta); font-variant-numeric: tabular-nums; }
.track { text-align: left; flex: 1; min-width: 0 !important; padding: var(--lux-space-2); }
.track strong, .track span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.track strong { font-size: var(--lux-type-row); font-weight: var(--lux-weight-label); line-height: 1.6; }
.track span, .hint { color: var(--lux-option); font-size: var(--lux-type-meta); line-height: 1.6; }
.hint { margin-top: var(--lux-space-3); border-top: var(--lux-rule-width) solid var(--lux-rule); padding-top: var(--lux-space-3); }
.empty { padding: var(--lux-space-6) var(--lux-space-2); line-height: 1.8; }
</style>
