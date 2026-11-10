<template>
  <div data-action="detail-controls" :class="$style.footer">
    <div :class="$style.footerLeft">
      <control-btns />
      <div :class="$style.progressContainer">
        <div :class="$style.progressContent">
          <common-progress-bar
            :class-name="$style.progress"
            :progress="progress"
            :handle-transition-end="handleTransitionEnd"
            :is-active-transition="isActiveTransition"
          />
        </div>
      </div>
      <div :class="$style.timeLabel"><span :class="$style.status" style="margin-right: 15px">{{ status }}</span><span>{{ nowPlayTimeStr }}</span><span style="margin: 0 5px;">/</span><span>{{ maxPlayTimeStr }}</span></div>
    </div>
    <div :class="$style.playControl">
      <button type="button" :class="$style.playBtn" :aria-label="$t('player__prev')" @click="playPrev()">
        <svg version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" height="100%" viewBox="0 0 1024 1024" space="preserve">
          <use xlink:href="#icon-prevMusic" />
        </svg>
      </button>
      <button type="button" :class="$style.playBtn" :aria-label="isPlay ? $t('player__pause') : $t('player__play')" @click="togglePlay">
        <svg v-if="isPlay" version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" height="100%" viewBox="0 0 1024 1024" space="preserve">
          <use xlink:href="#icon-pause" />
        </svg>
        <svg v-else version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" height="100%" viewBox="0 0 1024 1024" space="preserve">
          <use xlink:href="#icon-play" />
        </svg>
      </button>
      <button type="button" :class="$style.playBtn" :aria-label="$t('player__next')" @click="playNext()">
        <svg version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" height="100%" viewBox="0 0 1024 1024" space="preserve">
          <use xlink:href="#icon-nextMusic" />
        </svg>
      </button>
    </div>
  </div>
</template>

<script setup>
import { playNext, playPrev, togglePlay } from '@renderer/core/player'
import { status, isPlay } from '@renderer/store/player/state'
import usePlayProgress from '@renderer/utils/compositions/usePlayProgress'

import ControlBtns from './components/ControlBtns.vue'

const {
  nowPlayTimeStr,
  maxPlayTimeStr,
  progress,
  isActiveTransition,
  handleTransitionEnd,
} = usePlayProgress()

</script>

<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.footer {
  flex: none;
  display: flex;
  align-items: center;
  gap: var(--lux-space-5);
  margin: 0 var(--lux-page-gutter);
  padding: var(--lux-space-3) 0 var(--lux-space-4);
  border-top: var(--lux-rule-width) solid var(--lux-rule);
}
.footerLeft {
  flex: auto;
  min-width: 0;
  display: flex;
  flex-flow: column nowrap;
  gap: var(--lux-space-1);
}
.progressContainer { width: 100%; position: relative; padding: 3px 0; }
.progressContent { position: relative; height: 16px; padding: 5px 0; width: 100%; }
.progress { height: 100%; }
.timeLabel {
  display: flex;
  width: 100%;
  color: var(--lux-muted);
  font-size: var(--lux-type-meta);
  font-variant-numeric: tabular-nums;
}
.status { flex: auto; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.playControl { flex: none; display: flex; align-items: center; gap: var(--lux-space-2); padding: var(--lux-space-2); }
.playBtn {
  display: grid;
  place-items: center;
  width: var(--lux-hit-primary);
  height: var(--lux-hit-primary);
  padding: var(--lux-space-2);
  color: var(--lux-ink);
  background: var(--lux-paper-raised);
  border: var(--lux-hairline-width) solid var(--lux-rule);
  cursor: pointer;
  &:nth-child(2) { width: 3.5rem; height: 3.5rem; background: var(--lux-ink); color: var(--lux-on-ink); }
  &:hover { background: var(--lux-accent); color: var(--lux-on-accent); }
  svg { width: 100%; fill: currentColor; }
}
@media (max-width: 900px) {
  .footer { gap: var(--lux-space-3); }
  .playControl { gap: var(--lux-space-1); }
}
</style>
