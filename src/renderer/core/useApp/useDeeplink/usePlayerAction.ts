import { collectMusic, dislikeMusic, pause, play, playNext, playPrev, togglePlay, uncollectMusic } from '@renderer/core/player'

type Action = 'play' | 'pause' | 'skipNext' | 'skipPrev' | 'togglePlay' | 'collect' | 'uncollect' | 'dislike'

export default () => {
  return async(action: Action) => {
    switch (action) {
      case 'play':
        play()
        break
      case 'pause':
        pause()
        break
      case 'skipNext':
        await playNext()
        break
      case 'skipPrev':
        await playPrev()
        break
      case 'togglePlay':
        togglePlay()
        break
      case 'collect':
        collectMusic()
        break
      case 'uncollect':
        uncollectMusic()
        break
      case 'dislike':
        await dislikeMusic()
        break
      default: throw new Error('Unknown action: ' + (action as any ?? ''))
    }
  }
}
