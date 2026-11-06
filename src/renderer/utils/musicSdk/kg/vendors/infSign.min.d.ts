type SignatureValue = string | number | boolean | null
type SignatureParams = Record<string, SignatureValue>
type SignedParams = SignatureParams & { signature: string }
type SignatureBody = string | Record<string, unknown> | null
type SignatureCallback = (params: SignedParams, body?: string | Record<string, unknown>) => void

interface SignatureOptions {
  callback?: SignatureCallback
  useH5?: boolean
  isCDN?: boolean
  postType?: 'json' | 'urlencoded'
  log?: boolean
}

// Public callback boundary of the retained, unmodified Kugou UMD vendor file.
// The application uses the H5 path; native Android/iOS bridge internals are not
// desktop application source and are not claimed as type checked here.
declare function infSign(params?: SignatureParams, body?: SignatureBody, options?: SignatureOptions | SignatureCallback): void

export default infSign
