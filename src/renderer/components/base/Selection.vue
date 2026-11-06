<template>
  <div class="content" :class="[$style.select, show ? $style.active : '']">
    <div ref="dom_btn" class="label-content" :class="$style.label" @click="handleShow">
      <span class="label">{{ label }}</span>
      <div class="icon" :class="$style.icon">
        <svg version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" height="100%" viewBox="0 0 451.847 451.847" space="preserve">
          <use xlink:href="#icon-down" />
        </svg>
      </div>
    </div>
    <ul v-if="show" ref="dom_list" class="selection-list scroll" :class="$style.list" :style="listStyles">
      <li
        v-for="(item, index) in list" :key="index" :class="[$style.listItem, itemValue(item) == modelValue ? $style.active : null]"
        :aria-label="String(itemLabel(item) ?? '')" @click="handleClick(item)"
      >
        {{ itemLabel(item) }}
      </li>
    </ul>
  </div>
</template>

<script lang="ts">
import { defineComponent, type PropType } from 'vue'

type SelectionValue = string | number
type SelectionItem = SelectionValue | Record<string, SelectionValue>

export default defineComponent({
  props: {
    list: {
      type: Array as PropType<SelectionItem[]>,
      default() {
        return []
      },
    },
    modelValue: {
      type: [String, Number],
      required: true,
    },
    itemName: {
      type: String,
      default: '',
    },
    itemKey: {
      type: String,
      default: '',
    },
  },
  emits: ['update:modelValue', 'change'],
  data() {
    return {
      show: false,
      hideListener: null as ((event: MouseEvent) => void) | null,
      listStyles: {
        transform: 'scaleY(0) translateY(0)',
      },
    }
  },
  computed: {
    activeIndex() {
      if (this.modelValue == null) return -1
      if (!this.itemName) return this.list.indexOf(this.modelValue)
      return this.list.findIndex(l => this.itemValue(l) == this.modelValue)
    },
    label() {
      if (this.modelValue == null) return ''
      if (this.itemName == null) return this.modelValue
      const item = this.list[this.activeIndex]
      if (!item) return ''
      return typeof item === 'object' ? item[this.itemName] : (this.itemName ? undefined : item)
    },
  },
  mounted() {
    this.hideListener = event => { this.handleHide(event) }
    document.addEventListener('click', this.hideListener, true)
  },
  beforeUnmount() {
    if (this.hideListener) document.removeEventListener('click', this.hideListener, true)
  },
  methods: {
    itemValue(item: SelectionItem) {
      return this.itemKey ? (typeof item === 'object' ? item[this.itemKey] : undefined) : item
    },
    itemLabel(item: SelectionItem) {
      return this.itemName ? (typeof item === 'object' ? item[this.itemName] : undefined) : item
    },
    handleHide(e: MouseEvent) {
      if (!this.show) return
      // if (e && e.target.parentNode != this.$refs.dom_list && this.show) return this.show = false
      const button = this.$refs.dom_btn
      if (button instanceof HTMLElement && e.target instanceof Node && (e.target == button || button.contains(e.target))) return
      this.listStyles.transform = 'scaleY(0) translateY(0)'
      setTimeout(() => {
        this.show = false
      }, 50)
    },
    handleClick(item: SelectionItem) {
      // console.log(this.modelValue)
      if (item === this.modelValue) return
      this.$emit('update:modelValue', this.itemValue(item))
      this.$emit('change', item)
    },
    handleShow() {
      this.show = true
      void this.$nextTick(() => {
        this.listStyles.transform = `scaleY(1) translateY(${this.handleGetOffset()}px)`

        const list = this.$refs.dom_list
        if (!(list instanceof HTMLElement)) return
        const activeItem = list.children[this.activeIndex]
        if (activeItem instanceof HTMLElement) list.scrollTop = activeItem.offsetTop - list.clientHeight * 0.38
      })
    },
    handleGetOffset() {
      const list = this.$refs.dom_list
      if (!(list instanceof HTMLElement)) return 0
      const listHeight = list.clientHeight
      const dom_select = list.offsetParent
      if (!(dom_select instanceof HTMLElement)) return 0
      const dom_container = dom_select.offsetParent
      if (!(dom_container instanceof HTMLElement)) return 0
      const containerHeight = dom_container.clientHeight
      if (containerHeight < listHeight) return 0
      const offsetHeight = (dom_container.scrollTop + containerHeight) - (dom_select.offsetTop + listHeight)
      if (offsetHeight > 0) return 0
      return offsetHeight - 5
    },
  },
})
</script>


<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

@selection-height: 28px;

.select {
  display: inline-block;
  font-size: 12px;
  position: relative;
  width: var(--selection-width, 300px);

  &.active {
    .label {
      background-color: var(--color-button-background);
    }
    .list {
      opacity: 1;
    }
    .icon {
      svg{
        transform: rotate(180deg);
      }
    }
  }
}

.label {
  background-color: var(--color-button-background);
  padding: 0 10px;
  transition: background-color @transition-normal;
  height: @selection-height;
  // line-height: 27px;
  line-height: 1.5;
  box-sizing: border-box;
  color: var(--color-button-font);
  border-radius: @form-radius;
  cursor: pointer;
  display: flex;
  align-items: center;

  span {
    flex: auto;
    .mixin-ellipsis-1();
  }
  .icon {
    flex: none;
    margin-left: 7px;
    line-height: 0;
    svg {
      width: 1em;
      transition: transform .2s ease;
      transform: rotate(0);
    }
  }

  &:hover {
    background-color: var(--color-button-background-hover);
  }
  &:active {
    background-color: var(--color-button-background-active);
  }
}

.list {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  background-color: var(--color-content-background);
  opacity: 0;
  transform: scaleY(0) translateY(0);
  transform-origin: 0 (@selection-height / 2) 0;
  transition: .25s ease;
  transition-property: transform, opacity;
  z-index: 10;
  border-radius: @form-radius;
  box-shadow: 0 0 4px rgba(0, 0, 0, .15);
  overflow: auto;
  max-height: 200px;
}
.listItem {
  cursor: pointer;
  padding: 0 10px;
  line-height: @selection-height;
  // color: var(--color-button-font);
  outline: none;
  transition: background-color @transition-normal;
  background-color: transparent;
  box-sizing: border-box;
  .mixin-ellipsis-1();

  &:hover {
    background-color: var(--color-button-background-hover);
  }
  &:active {
    background-color: var(--color-button-background-active);
  }
  &.active {
    color: var(--color-button-font);
  }
}


</style>
