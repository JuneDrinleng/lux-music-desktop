import { type I18n } from '@root/lang'

declare module '@vue/runtime-core' {
  interface ComponentCustomProperties {
    $t: I18n['t']
  }
}
