<template>
  <div :class="[$style.aside, { [$style.fullscreen]: isFullscreen }]">
    <ControlBtns v-if="appSetting['common.controlBtnPosition'] == 'left'" />
    <div :class="$style.brand" aria-label="Lux Music">
      <span :class="$style.wordmark">LUX<span :class="$style.dot">.</span></span>
      <span :class="$style.music">MUSIC</span>
    </div>
    <NavBar />
    <div :class="$style.edition">{{ $t('shell_desktop_edition') }}</div>
  </div>
</template>

<script setup>
import { isFullscreen } from '@renderer/store'
import { appSetting } from '@renderer/store/setting'

import ControlBtns from './ControlBtns.vue'
import NavBar from './NavBar.vue'

</script>


<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.aside {
  -webkit-app-region: drag;
  -webkit-user-select: none;
  display: flex;
  flex-flow: column nowrap;
  min-height: 0;
  border-right: var(--lux-rule-width) solid var(--lux-ink);
  color: var(--lux-ink);
  &.fullscreen { -webkit-app-region: no-drag; }
}
.brand {
  flex: none;
  display: flex;
  flex-flow: column nowrap;
  padding: 1.25rem 1.25rem 1.5rem;
  font-family: var(--lux-font-display);
  font-weight: var(--lux-weight-display);
}
.wordmark {
  font-size: 2.5rem;
  line-height: .95;
  letter-spacing: -.1rem;
}
.dot { color: var(--lux-accent-ink); }
.music {
  padding-top: .4rem;
  font-size: .75rem;
  letter-spacing: .38rem;
}
.edition {
  flex: none;
  margin: .75rem 1.25rem 1rem;
  padding-top: .75rem;
  border-top: 1px solid var(--lux-hairline);
  color: var(--lux-muted);
  font-size: .625rem;
  letter-spacing: .08rem;
  text-transform: uppercase;
}
@media (max-width: 900px) {
  .brand { padding: 1rem 1rem 1.25rem; }
  .edition { margin-right: 1rem; margin-left: 1rem; }
}
@media (max-height: 650px) {
  .brand { padding: .75rem 1rem; }
  .wordmark { font-size: 2rem; }
  .music { padding-top: .25rem; font-size: .625rem; }
  .edition { margin: .5rem 1rem; padding-top: .5rem; }
}
</style>
