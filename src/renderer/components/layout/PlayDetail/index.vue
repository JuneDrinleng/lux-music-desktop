<template lang="pug">
transition(enter-active-class="animated slideInRight" leave-active-class="animated slideOutDown" @after-enter="handleAfterEnter" @after-leave="handleAfterLeave")
  div(v-if="isShowPlayerDetail" data-action="play-detail" :class="[$style.container, { fullscreen: isFullscreen }]" @contextmenu="handleContextMenu")
    div(:class="$style.bg")
    //- div(:class="$style.bg" :style="bgStyle")
    //- div(:class="$style.bg2")
    ControlBtnsLeftHeader(v-if="appSetting['common.controlBtnPosition'] == 'left'")
    ControlBtnsRightHeader(v-else)
    div(:class="[$style.main, {[$style.showComment]: isShowPlayComment}]")
      div.left(:class="$style.left")
        //- div(:class="$style.info")
        div(:class="$style.info")
          div(:class="$style.cover")
            img(v-if="musicInfo.pic" :class="$style.img" :src="musicInfo.pic" alt="")
            div(v-else :class="$style.placeholder" aria-hidden="true")
          div.description(:class="['scroll', $style.description]")
            p(:class="$style.eyebrow") {{ $t('player__music_name') }}
            h1 {{ musicInfo.name }}
            p {{ $t('player__music_singer') }}{{ musicInfo.singer }}
            p(v-if="musicInfo.album") {{ $t('player__music_album') }}{{ musicInfo.album }}

      transition(enter-active-class="animated fadeIn" leave-active-class="animated fadeOut")
        LyricPlayer(v-if="visibled")
      music-comment(v-if="visibled" :class="$style.comment" :show="isShowPlayComment" :music-info="playMusicInfo.musicInfo" @close="hideComment")
    transition(enter-active-class="animated fadeIn" leave-active-class="animated fadeOut")
      play-bar(v-if="visibled")
    transition(enter-active-class="animated-slow fadeIn" leave-active-class="animated-slow fadeOut")
      common-audio-visualizer(v-if="appSetting['player.audioVisualization'] && visibled")
</template>


<script>
import { ref, watch } from '@common/utils/vueTools'
import { isFullscreen } from '@renderer/store'
import {
  isShowPlayerDetail,
  isShowPlayComment,
  musicInfo,
  playMusicInfo,
} from '@renderer/store/player/state'
import {
  setShowPlayerDetail,
  setShowPlayComment,
  setShowPlayLrcSelectContentLrc,
} from '@renderer/store/player/action'
import LyricPlayer from './LyricPlayer.vue'
import PlayBar from './PlayBar.vue'
import MusicComment from './components/MusicComment/index.vue'
import ControlBtnsLeftHeader from './ControlBtnsLeftHeader.vue'
import ControlBtnsRightHeader from './ControlBtnsRightHeader.vue'
import { registerAutoHideMounse, unregisterAutoHideMounse } from './autoHideMounse'
import { appSetting } from '@renderer/store/setting'
import { closeWindow, maxWindow, minWindow, setFullScreen } from '@renderer/utils/ipc'

export default {
  name: 'CorePlayDetail',
  components: {
    ControlBtnsLeftHeader,
    ControlBtnsRightHeader,
    LyricPlayer,
    PlayBar,
    MusicComment,
  },
  setup() {
    const visibled = ref(false)

    let clickTime = 0

    const hide = () => {
      setShowPlayerDetail(false)
    }
    const handleContextMenu = () => {
      if (window.performance.now() - clickTime > 400) {
        clickTime = window.performance.now()
        return
      }
      clickTime = 0
      hide()
    }

    const hideComment = () => {
      setShowPlayComment(false)
    }

    const handleAfterEnter = () => {
      if (isFullscreen.value) registerAutoHideMounse()

      visibled.value = true
    }

    const handleAfterLeave = () => {
      setShowPlayLrcSelectContentLrc(false)
      hideComment()
      visibled.value = false

      unregisterAutoHideMounse()
    }

    watch(isFullscreen, isFullscreen => {
      (isFullscreen ? registerAutoHideMounse : unregisterAutoHideMounse)()
    })


    return {
      appSetting,
      playMusicInfo,
      isShowPlayerDetail,
      isShowPlayComment,
      musicInfo,
      hide,
      handleContextMenu,
      hideComment,
      handleAfterEnter,
      handleAfterLeave,
      visibled,
      isFullscreen,
      fullscreenExit() {
        void setFullScreen(false).then((fullscreen) => {
          isFullscreen.value = fullscreen
        })
      },
      min() {
        minWindow()
      },
      max() {
        maxWindow()
      },
      close() {
        closeWindow()
      },
    }
  },
}
</script>


<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

@control-btn-width: @height-toolbar * .26;

.container {
  position: absolute;
  display: flex;
  flex-flow: column nowrap;
  width: 100%;
  height: 100%;
  top: 0;
  left: 0;
  background-color: var(--lux-paper);
  z-index: 10;
  // -webkit-app-region: drag;
  overflow: hidden;
  border-radius: @radius-border;
  color: var(--lux-ink);
  // border-left: 12px solid var(--color-primary-alpha-900);
  -webkit-app-region: no-drag;
  contain: strict;

  box-sizing: border-box;

  * {
    box-sizing: border-box;
  }
}
.bg {
  position: absolute;
  width: 100%;
  height: 100%;
  top: 0;
  left: 0;
  background: var(--background-image) var(--background-image-position) no-repeat;
  background-size: var(--background-image-size);
  // background-size: 110% 110%;
  // filter: blur(60px);
  opacity: .12;
  z-index: -1;
  &:before {
    content: '';
    display: block;
    width: 100%;
    height: 100%;
    background-color: var(--lux-paper);
  }
  &:after {
    position: absolute;
    left: 0;
    top: 0;
    content: '';
    display: block;
    width: 100%;
    height: 100%;
    background-color: var(--lux-paper);
  }
}
// .bg2 {
//   position: absolute;
//   width: 100%;
//   height: 100%;
//   top: 0;
//   left: 0;
//   z-index: -1;
//   background-color: rgba(255, 255, 255, .8);
// }

.main {
  flex: auto;
  min-height: 0;
  overflow: hidden;
  display: flex;
  margin: 0 var(--lux-page-gutter);
  border-top: var(--lux-rule-width) solid var(--lux-rule);
  position: relative;

  &.showComment {
    :global {
      .left {
        flex-basis: 18%;
        .description p {
          font-size: 12px;
        }
      }
      .right {
        flex-basis: 30%;
        .lyricSelectContent {
          font-size: 14px;
        }
      }
      .comment {
        opacity: 1;
        transform: scaleX(1);
      }
    }
  }
}
.left {
  flex: 0 0 40%;
  min-width: 0;
  display: flex;
  justify-content: center;
  padding: var(--lux-space-5) var(--lux-space-6) var(--lux-space-3) 0;
  overflow: hidden;
  border-right: var(--lux-hairline-width) solid var(--lux-hairline);
  transition: flex-basis @transition-normal;
}
.info {
  display: flex;
  flex-flow: column nowrap;
  align-items: flex-start;
  width: 100%;
  max-width: 23rem;
  min-height: 0;
}
.cover {
  width: min(100%, 36vh);
  aspect-ratio: 1;
  flex: none;
  padding: var(--lux-space-2);
  background: var(--lux-paper-raised);
  border: var(--lux-hairline-width) solid var(--lux-rule);
}
.img, .placeholder {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.placeholder {
  display: grid;
  place-items: center;
  background: var(--lux-placeholder);
  &::before {
    content: '';
    width: 68%;
    aspect-ratio: 1;
    border: var(--lux-rule-width) solid var(--lux-muted);
    border-radius: 50%;
    background: radial-gradient(circle, var(--lux-accent) 0 9%, transparent 10% 26%, var(--lux-hairline) 27% 28%, transparent 29% 47%, var(--lux-hairline) 48% 49%, transparent 50%);
  }
}
.description {
  width: 100%;
  margin-top: var(--lux-space-4);
  padding: 0 var(--lux-space-2) var(--lux-space-3) 0;
  min-height: 0;
  h1 {
    margin: var(--lux-space-2) 0 var(--lux-space-3);
    color: var(--lux-display);
    font-size: var(--lux-type-detail);
    font-weight: var(--lux-weight-display);
    line-height: 1.15;
    overflow-wrap: anywhere;
  }
  p {
    line-height: 1.6;
    font-size: var(--lux-type-body);
    overflow-wrap: anywhere;
  }
  .eyebrow {
    color: var(--lux-eyebrow);
    font-size: var(--lux-type-eyebrow);
    font-weight: var(--lux-weight-label);
    letter-spacing: .08em;
  }
}
@media (max-height: 600px) {
  .left { padding-top: var(--lux-space-3); }
  .cover { width: min(100%, 29vh); }
  .description { margin-top: var(--lux-space-2); }
  .description h1 { font-size: var(--lux-type-section); }
}


.comment {
  position: absolute;
  right: 0;
  top: 0;
  width: 50%;
  height: 100%;
  opacity: 1;
  margin-left: 10px;
  transform: scaleX(0);
}


</style>
