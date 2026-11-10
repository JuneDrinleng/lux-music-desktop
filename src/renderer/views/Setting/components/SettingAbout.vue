<template lang="pug">
dt#about {{ $t('setting__about') }}
dd(:class="$style.about")
  .p.small
    | 本软件完全免费，代码已开源。开源地址：
    span.hover.underline(:aria-label="$t('setting__click_open')" @click="openUrl('https://github.com/lyswhut/lx-music-desktop#readme')") https://github.com/lyswhut/lx-music-desktop
  .p.small
    | 最新版下载地址：
    span.hover.underline(:aria-label="$t('setting__click_open')" @click="openUrl('https://github.com/lyswhut/lx-music-desktop/releases')") GitHub Releases
  .p.small
    | 软件的常见问题可转至：
    span.hover.underline(:aria-label="$t('setting__click_open')" @click="openUrl('https://lyswhut.github.io/lx-music-doc/desktop/faq')") 桌面版常见问题
  .p.small
    strong 本软件没有客服
    | ，但我们整理了一些常见的使用问题。
    strong 仔细、仔细、仔细
    | 地阅读常见问题后，
  .p.small
    | 仍有问题可到&nbsp;GitHub&nbsp;
    span.hover.underline(:aria-label="$t('setting__click_open')" @click="openUrl('https://github.com/lyswhut/lx-music-desktop/issues?q=is%3Aissue+')") 提交&nbsp;Issue
    | 。
  br
  .p.small(:class="$style.section") 由于软件开发的初衷仅是为了对新技术的学习与研究，因此软件直至停止维护都将会一直保持纯净。
  .p.small
    | 目前本项目的原始发布地址
    strong 只有&nbsp;GitHub
    | ，其他渠道均为第三方转载发布，可信度请自行鉴别。
  .p.small
    strong 本项目没有微信公众号之类的所谓「官方账号」，谨防被骗！

  .p.small(:class="$style.section")
    | 你已签署本软件的
    base-btn(min @click="handleShowPact") 许可协议
    | ，协议的在线版本在
    strong.hover.underline(:aria-label="$t('setting__click_open')" @click="openUrl('https://github.com/lyswhut/lx-music-desktop#%E9%A1%B9%E7%9B%AE%E5%8D%8F%E8%AE%AE')") 这里
    | 。
  br

  .p.small(:class="$style.credit")
    | By:&nbsp;
    strong 落雪无痕
</template>

<script>
// import { ref, onBeforeUnmount } from '@common/utils/vueTools'
import { isShowPact } from '@renderer/store'
import { openUrl, clipboardWriteText } from '@common/utils/electron'

export default {
  name: 'SettingAbout',
  setup() {
    const handleShowPact = () => {
      isShowPact.value = true
    }
    return {
      openUrl,
      clipboardWriteText,
      handleShowPact,
    }
  },
}
</script>

<style lang="less" module>
.about {
  min-width: 0;
  background-color: var(--lux-paper);
  color: var(--lux-ink);
  font-family: inherit;
  overflow-wrap: anywhere;

  > :global(.p) {
    padding: var(--lux-space-2) 0;
    font-size: var(--lux-type-body);
    line-height: 1.85;
  }

  > br {
    display: none;
  }

  strong {
    font-weight: var(--lux-weight-label);
  }

  :global(.underline) {
    display: inline-block;
    max-width: 100%;
    vertical-align: baseline;
    color: var(--lux-ink);
    text-decoration-thickness: var(--lux-hairline-width);
    text-underline-offset: .2em;
  }

  @media (max-width: 900px) {
    :global(.underline) {
      max-width: 26ch;
    }
  }

  button {
    margin: 0 var(--lux-space-2);
    font-family: inherit;
    vertical-align: baseline;
  }

  > .section {
    margin-top: var(--lux-space-4);
    padding-top: var(--lux-space-4);
    border-top: var(--lux-hairline-width) solid var(--lux-hairline);
  }

  > .credit {
    margin-top: var(--lux-space-5);
    padding-top: var(--lux-space-3);
    border-top: var(--lux-rule-width) solid var(--lux-rule);
    color: var(--lux-muted);
  }
}
</style>
