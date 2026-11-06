import { setting, musicInfo, isPlay } from './state'
import { updateSetting as saveSetting } from '@lyric/utils/ipc'

export const initSetting = (newSetting: LX.DesktopLyric.Config) => {
  mergeSetting(newSetting)
}

export const mergeSetting = (newSetting: Partial<LX.DesktopLyric.Config>) => {
  Object.assign(setting, newSetting)
}

export const updateSetting = (setting: Partial<LX.DesktopLyric.Config>) => {
  void saveSetting(setting)
}

type MusicInfoKeys = keyof typeof musicInfo
const musicInfoKeys: MusicInfoKeys[] = Object.keys(musicInfo) as MusicInfoKeys[]

export const setMusicInfo = (_musicInfo: Partial<typeof musicInfo>) => {
  for (const key of musicInfoKeys) {
    const val = _musicInfo[key]
    if (val !== undefined) {
      // @ts-expect-error
      musicInfo[key] = val
    }
  }
}

export const setIsPlay = (_status: boolean) => {
  isPlay.value = _status
}
