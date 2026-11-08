// Observe the production player's real, detached HTMLAudioElements. This proxy
// returns each original native object and never changes media state or methods.
const elements = []
const NativeAudio = window.Audio
window.Audio = new Proxy(NativeAudio, {
  construct(target, args, newTarget) {
    const audio = Reflect.construct(target, args, newTarget)
    elements.push(audio)
    return audio
  },
  apply(target, thisArg, args) {
    const audio = Reflect.apply(target, thisArg, args)
    elements.push(audio)
    return audio
  },
})
Object.defineProperty(window, '__luxEvidenceAudioElements', {
  configurable: false,
  get: () => Object.freeze([...elements]),
})
