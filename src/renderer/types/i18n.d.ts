import { type I18n } from '@root/lang'
import { type dialog } from '@renderer/plugins/Dialog'

declare module '@vue/runtime-core' {
  interface ComponentCustomProperties {
    $t: I18n['t']
    $dialog: typeof dialog
    readonly $style: Record<string, string>
  }
}
