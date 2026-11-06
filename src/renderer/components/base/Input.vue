<template>
  <input
    ref="dom_input"
    :class="$style.input"
    :type="type"
    :placeholder="placeholder"
    :value="modelValue"
    :disabled="disabled"
    tabindex="0"
    @input="handleInput"
    @change="$emit('change', inputValue($event))"
    @keyup.enter="$emit('submit', inputValue($event))"
    @contextmenu="handleContextMenu"
  >
</template>

<script>
import { defineComponent } from 'vue'
import { clipboardReadText } from '@common/utils/electron'

export default defineComponent({
  props: {
    placeholder: {
      type: String,
      default: '',
    },
    disabled: {
      type: Boolean,
      default: false,
    },
    modelValue: {
      type: [String, Number],
      default: '',
    },
    type: {
      type: String,
      default: 'text',
    },
    trim: {
      type: Boolean,
      default: true,
    },
    stopContentEventPropagation: {
      type: Boolean,
      default: true,
    },
    autoPaste: {
      type: Boolean,
      default: true,
    },
    // bindValue: {
    //   type: Boolean,
    //   default: true,
    // },
  },
  emits: ['update:modelValue', 'submit', 'change'],
  methods: {
    inputValue(event) {
      return event.target instanceof HTMLInputElement ? event.target.value.trim() : ''
    },
    handleInput(event) {
      let value = event.target.value
      if (this.trim) {
        value = value.trim()
        event.target.value = value
      }
      this.$emit('update:modelValue', value)
    },
    focus() {
      const input = this.$refs.dom_input
      if (input instanceof HTMLInputElement) input.focus()
    },
    handleContextMenu(event) {
      if (this.stopContentEventPropagation) event.stopPropagation()
      if (!this.autoPaste) return
      let dom_input = this.$refs.dom_input
      if (!(dom_input instanceof HTMLInputElement)) return
      if (dom_input.selectionStart === null) return
      let str = clipboardReadText()
      str = str.trim()
      str = str.replace(/\t|\r\n|\n|\r/g, ' ')
      str = str.replace(/\s+/g, ' ')
      const text = dom_input.value
      // if (dom_input.selectionStart == dom_input.selectionEnd) {
      const value = text.substring(0, dom_input.selectionStart) + str + text.substring(dom_input.selectionEnd, text.length)
      event.target.value = value
      this.$emit('update:modelValue', value)
      // } else {
      //   clipboardWriteText(text.substring(dom_input.selectionStart, dom_input.selectionEnd))
      // }
    },
  },
})
</script>


<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.input {
  display: inline-block;
  border: none;
  border-radius: @form-radius;
  padding: 7px 8px;
  color: var(--color-button-font);
  outline: none;
  transition: background-color 0.2s ease;
  background-color: var(--color-primary-background);
  font-size: 13.3px;

  &::-webkit-outer-spin-button,
  &::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  &[disabled] {
    opacity: .4;
  }

  &:hover, &:focus {
    background-color: var(--color-primary-background-hover);
  }
  &:active {
    background-color: var(--color-primary-background-active);
  }
}

.min {
  padding: 3px 8px;
  font-size: 12px;
}

</style>
