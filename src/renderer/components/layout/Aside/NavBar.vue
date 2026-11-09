<template>
  <nav :class="$style.menu" :aria-label="$t('shell_primary_navigation')">
    <ul :class="$style.list">
      <li v-for="item in menus" :key="item.to" :class="$style.navItem">
        <router-link :class="[$style.link, {[$style.active]: $route.meta.name == item.name}]" :aria-current="$route.meta.name == item.name ? 'page' : undefined" :to="item.to" :aria-label="item.tips">
          <svg aria-hidden="true" :viewBox="item.iconSize" height="20" width="20">
            <use :xlink:href="item.icon" />
          </svg>
          <span>{{ item.tips }}</span>
        </router-link>
      </li>
    </ul>
  </nav>
</template>

<script lang="ts">
import { appSetting } from '@renderer/store/setting'
import { useI18n } from '@root/lang'
import { computed } from '@common/utils/vueTools'

export default {
  name: 'NavBar',
  setup() {
    const t = useI18n()

    const menus = computed(() => {
      return [
        {
          to: '/search',
          tips: t('search'),
          icon: '#icon-search-2',
          iconSize: '0 0 425.2 425.2',
          name: 'Search',
          enable: true,
        },
        {
          to: '/songList/list',
          tips: t('song_list'),
          icon: '#icon-album',
          iconSize: '0 0 425.2 425.2',
          name: 'SongList',
          enable: true,
        },
        {
          to: '/leaderboard',
          tips: t('leaderboard'),
          icon: '#icon-leaderboard',
          iconSize: '0 0 425.22 425.2',
          name: 'Leaderboard',
          enable: true,
        },
        {
          to: '/list',
          tips: t('my_list'),
          icon: '#icon-love',
          iconSize: '0 0 444.87 391.18',
          name: 'List',
          enable: true,
        },
        {
          to: '/download',
          tips: t('download'),
          icon: '#icon-download-2',
          iconSize: '0 0 425.2 425.2',
          enable: appSetting['download.enable'],
          name: 'Download',
        },
        {
          to: '/setting',
          tips: t('setting'),
          icon: '#icon-setting',
          iconSize: '0 0 493.23 436.47',
          enable: true,
          name: 'Setting',
        },
      ].filter(m => m.enable)
    })
    return {
      appSetting,
      menus,
    }
  },
}
</script>

<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.menu {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: .25rem .75rem;
  -webkit-app-region: no-drag;
}
.list { display: flex; flex-direction: column; gap: .25rem; }
.navItem { flex: none; }
.link {
  display: flex;
  align-items: center;
  gap: .75rem;
  min-height: 2.75rem;
  box-sizing: border-box;
  padding: .5rem .75rem;
  border-left: var(--lux-marker-width) solid transparent;
  color: var(--lux-ink);
  font-size: var(--lux-type-body);
  line-height: 1.25;
  text-decoration: none;
  transition: background-color @transition-fast;
  svg { flex: none; }
  span { overflow-wrap: anywhere; }
  &:hover { background-color: var(--lux-faint); }
  &.active {
    border-left-color: var(--lux-accent-ink);
    background-color: var(--lux-accent-soft);
    font-weight: var(--lux-weight-label);
  }
}
@media (max-width: 900px) {
  .menu { padding-right: .5rem; padding-left: .5rem; }
  .link { gap: .5rem; padding-right: .375rem; padding-left: .5rem; min-height: 2.5rem; }
}
@media (max-height: 650px) {
  .link { min-height: 2.25rem; }
}
</style>
