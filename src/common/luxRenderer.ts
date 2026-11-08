import { rendererInvoke } from './rendererIpc'
import { LUX_ACCOUNT_CHANNEL, type LuxCommand, type LuxReplies, type LuxResult } from './luxIpc'

export const invokeLux = async<K extends keyof LuxReplies>(command: LuxCommand & { action: K }): Promise<LuxResult<LuxReplies[K]>> => {
  return rendererInvoke<LuxCommand, LuxResult<LuxReplies[K]>>(LUX_ACCOUNT_CHANNEL, command)
}
