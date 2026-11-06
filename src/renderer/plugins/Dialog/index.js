import Dialog from './Dialog.vue'
import { createApp } from 'vue'


const defaultOptions = {
  message: '',
  teleport: '#root',
  showCancel: false,
  cancelButtonText: '',
  confirmButtonText: '',
  selection: false,
}

/**
 * @typedef {Object} DialogOptions
 * @property {string} [message]
 * @property {string} [teleport]
 * @property {boolean} [showCancel]
 * @property {string} [cancelButtonText]
 * @property {string} [confirmButtonText]
 * @property {boolean} [selection]
 */
/**
 * @param {string | DialogOptions} options
 * @returns {Promise<boolean>}
 */
export const dialog = function(options) {
  const { message, showCancel, cancelButtonText, confirmButtonText, teleport, selection } =
    Object.assign({}, defaultOptions, typeof options == 'string' ? { message: options } : options || {})
  return new Promise(resolve => {
    let app = createApp(Dialog, {
      afterLeave() {
        app?.unmount()
        app = null
      },
    })

    let instance = /** @type {InstanceType<typeof Dialog>} */ (app.mount(document.createElement('div')))

    // 属性设置
    instance.visible = true
    instance.message = message
    instance.showCancel = showCancel
    instance.cancelButtonText = cancelButtonText
    instance.confirmButtonText = confirmButtonText
    instance.teleport = teleport
    instance.selection = selection

    // 挂载
    document.getElementById('container').appendChild(instance.$el)

    instance.handleCancel = () => {
      instance.visible = false
      resolve(false)
    }

    instance.handleComfirm = () => {
      instance.visible = false
      resolve(true)
    }
  })
}

dialog.confirm = options => dialog(
  typeof options == 'string'
    ? { message: options, showCancel: true }
    : { ...options, showCancel: true },
)

const dialogPlugin = {
  install(Vue, options) {
    Vue.config.globalProperties.$dialog = dialog
  },
}

export default dialogPlugin
