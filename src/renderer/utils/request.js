import needle from 'needle'
// import progress from 'request-progress'
import { debugRequest } from './env'
import { requestMsg } from './message'
import { bHh } from './musicSdk/options'
import { deflateRaw } from 'zlib'
import { proxy } from '@renderer/store'
import { httpOverHttp, httpsOverHttp } from 'tunnel'
// import fs from 'fs'

const httpsRxp = /^https:/
const getRequestAgent = url => {
  let options
  if (proxy.enable && proxy.host) {
    options = {
      proxy: {
        host: proxy.host,
        port: Number(proxy.port || 80),
      },
    }
  } else if (proxy.envProxy) {
    options = {
      proxy: {
        host: proxy.envProxy.host,
        port: Number(proxy.envProxy.port || 80),
      },
    }
  }
  return options ? (httpsRxp.test(url) ? httpsOverHttp : httpOverHttp)(options) : undefined
}


const request = (url, options, callback) => {
  let data
  if (options.body) {
    data = options.body
  } else if (options.form) {
    data = options.form
    // data.content_type = 'application/x-www-form-urlencoded'
    options.json = false
  } else if (options.formData) {
    data = options.formData
    // data.content_type = 'multipart/form-data'
    options.json = false
  }
  options.response_timeout = options.timeout

  // The retained Needle fork exposes its cancellable ClientRequest on the
  // returned stream (lib/needle.js); upstream @types/needle omits that field.
  const stream = /** @type {ReturnType<typeof needle.request> & { request: import('node:http').ClientRequest }} */ (needle.request(options.method || 'get', url, data, options, (err, resp, body) => {
    if (!err) {
      body = resp.body = resp.raw.toString()
      try {
        resp.body = JSON.parse(resp.body)
      } catch (_) {}
      body = resp.body
    }
    callback(err, resp, body)
  }))
  return stream.request
}


const defaultHeaders = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36',
}
// var proxyUrl = "http://" + user + ":" + password + "@" + host + ":" + port;
// var proxiedRequest = request.defaults({'proxy': proxyUrl});

/**
 * @template [Response=import('needle').NeedleResponse]
 * @typedef {Object} HttpTask
 * @property {boolean} isCancelled
 * @property {() => void} cancelHttp
 * @property {Promise<Response>} promise Active response promise; cancellation disposes this handle.
 * @property {import('node:http').ClientRequest | null} requestObj
 * @property {((reason?: unknown) => void) | null} cancelFn
 */

/**
 * Change a task's response payload while retaining its identity and live cancel
 * handler. Music SDK adapters return lyrics / metadata instead of HTTP responses.
 * @template Response, Result
 * @param {HttpTask<Response>} task
 * @param {(response: Response) => Result | PromiseLike<Result>} transform
 * @returns {Omit<HttpTask<Response>, 'promise'> & { promise: Promise<Result> }}
 */
export const mapHttpTask = (task, transform) => Object.assign(task, { promise: task.promise.then(transform) })

/**
 * promise 形式的请求方法
 * @param {*} url
 * @param {*} options
 */
const buildHttpPromose = (url, options) => {
  /** @type {HttpTask} */
  let obj = {
    isCancelled: false,
    promise: null,
    requestObj: null,
    cancelFn: null,
    cancelHttp: () => {
      if (!obj.requestObj) return obj.isCancelled = true
      cancelHttp(obj.requestObj)
      obj.requestObj = null
      obj.promise = obj.cancelHttp = null
      obj.cancelFn(new Error(requestMsg.cancelRequest))
      obj.cancelFn = null
    },
  }
  obj.promise = new Promise((resolve, reject) => {
    obj.cancelFn = reject
    debugRequest && console.log(`\n---send request------${url}------------`)
    fetchData(url, options.method, options, (err, resp, body) => {
      // options.isShowProgress && window.api.hideProgress()
      debugRequest && console.log(`\n---response------${url}------------`)
      debugRequest && console.log(body)
      obj.requestObj = null
      obj.cancelFn = null
      if (err) return reject(err)
      resolve(resp)
    }).then(ro => {
      obj.requestObj = ro
      if (obj.isCancelled) obj.cancelHttp()
    })
  })
  return obj
}

/**
 * 请求超时自动重试
 * @param {*} url
 * @param {*} options
 */
export const httpFetch = (url, options = { method: 'get' }) => {
  const requestObj = buildHttpPromose(url, options)
  requestObj.promise = requestObj.promise.catch(err => {
    // console.log('出错', err)
    if (err.message === 'socket hang up') {
      // window.globalObj.apiSource = 'temp'
      return Promise.reject(new Error(requestMsg.unachievable))
    }
    switch (err.code) {
      case 'ETIMEDOUT':
      case 'ESOCKETTIMEDOUT':
        return Promise.reject(new Error(requestMsg.timeout))
      case 'ENOTFOUND':
        return Promise.reject(new Error(requestMsg.notConnectNetwork))
      default:
        return Promise.reject(err)
    }
  })
  return requestObj
}

/**
 * 取消请求
 * @param {import('node:http').ClientRequest} requestObj
 */
export const cancelHttp = requestObj => {
  // console.log(requestObj)
  if (!requestObj) return
  // console.log('cancel:', requestObj)
  if (!requestObj.abort) return
  requestObj.abort()
}


/**
 * http 请求
 * @param {*} url 地址
 * @param {*} options 选项
 * @param {*} cb 回调
 * @return {Promise<import('node:http').ClientRequest>} 用于取消请求的对象
 */
export const http = (url, options, cb) => {
  if (typeof options === 'function') {
    cb = options
    options = {}
  }

  // 默认选项
  if (options.method == null) options.method = 'get'

  debugRequest && console.log(`\n---send request------${url}------------`)
  return fetchData(url, options.method, options, (err, resp, body) => {
    // options.isShowProgress && window.api.hideProgress()
    debugRequest && console.log(`\n---response------${url}------------`)
    debugRequest && console.log(body)
    if (err) {
      debugRequest && console.log(JSON.stringify(err))
    }
    cb(err, resp, body)
  })
}

/**
 * http get 请求
 * @param {*} url 地址
 * @param {*} options 选项
 * @param {*} callback 回调
 * @return {Promise<import('node:http').ClientRequest>} 用于取消请求的对象
 */
export const httpGet = (url, options, callback) => {
  if (typeof options === 'function') {
    callback = options
    options = {}
  }
  // options.isShowProgress && window.api.showProgress({
  //   title: options.progressMsg || '请求中',
  //   modal: true,
  // })

  debugRequest && console.log(`\n---send request-------${url}------------`)
  return fetchData(url, 'get', options, function(err, resp, body) {
    // options.isShowProgress && window.api.hideProgress()
    debugRequest && console.log(`\n---response------${url}------------`)
    debugRequest && console.log(body)
    if (err) {
      debugRequest && console.log(JSON.stringify(err))
    }
    callback(err, resp, body)
  })
}

/**
 * http post 请求
 * @param {*} url 请求地址
 * @param {*} data 提交的数据
 * @param {*} options 选项
 * @param {*} callback 回调
 * @return {Promise<import('node:http').ClientRequest>} 用于取消请求的对象
 */
export const httpPost = (url, data, options, callback) => {
  if (typeof options === 'function') {
    callback = options
    options = {}
  }
  // options.isShowProgress && window.api.showProgress({
  //   title: options.progressMsg || '请求中',
  //   modal: true,
  // })
  options.data = data

  debugRequest && console.log(`\n---send request-------${url}------------`)
  return fetchData(url, 'post', options, function(err, resp, body) {
    // options.isShowProgress && window.api.hideProgress()
    debugRequest && console.log(`\n---response------${url}------------`)
    debugRequest && console.log(body)
    if (err) {
      debugRequest && console.log(JSON.stringify(err))
    }
    callback(err, resp, body)
  })
}

/**
 * http jsonp 请求
 * @param {*} url 请求地址
 * @param {*} options 选项
 *             options.jsonpCallback 回调
 * @param {*} callback 回调
 * @return {Promise<import('node:http').ClientRequest>} 用于取消请求的对象
 */
export const http_jsonp = (url, options, callback) => {
  if (typeof options === 'function') {
    callback = options
    options = {}
  }

  let jsonpCallback = 'jsonpCallback'
  if (url.indexOf('?') < 0) url += '?'
  url += `&${options.jsonpCallback}=${jsonpCallback}`

  options.format = 'script'

  // options.isShowProgress && window.api.showProgress({
  //   title: options.progressMsg || '请求中',
  //   modal: true,
  // })

  debugRequest && console.log(`\n---send request-------${url}------------`)
  return fetchData(url, 'get', options, function(err, resp, body) {
    // options.isShowProgress && window.api.hideProgress()
    debugRequest && console.log(`\n---response------${url}------------`)
    debugRequest && console.log(body)
    if (err) {
      debugRequest && console.log(JSON.stringify(err))
    } else {
      body = JSON.parse(body.replace(new RegExp(`^${jsonpCallback}\\(({.*})\\)$`), '$1'))
    }

    callback(err, resp, body)
  })
}

const handleDeflateRaw = data => new Promise((resolve, reject) => {
  deflateRaw(data, (err, buf) => {
    if (err) return reject(err)
    resolve(buf)
  })
})

const regx = /(?:\d\w)+/g

const fetchData = async(url, method, {
  headers = {},
  format = 'json',
  timeout = 15000,
  ...options
}, callback) => {
  // console.log(url, options)
  console.log('---start---', url)
  headers = Object.assign({}, headers)
  if (headers[bHh]) {
    const path = url.replace(/^https?:\/\/[\w.:]+\//, '/')
    let s = Buffer.from(bHh, 'hex').toString()
    s = s.replace(s.substr(-1), '')
    s = Buffer.from(s, 'base64').toString()
    let v = process.versions.app.split('-')[0].split('.').map(n => n.length < 3 ? n.padStart(3, '0') : n).join('')
    let v2 = process.versions.app.split('-')[1] || ''
    headers[s] = !s || `${(await handleDeflateRaw(Buffer.from(JSON.stringify(`${path}${v}`.match(regx), null, 1).concat(v)).toString('base64'))).toString('hex')}&${parseInt(v)}${v2}`
    delete headers[bHh]
  }
  return request(url, {
    ...options,
    method,
    headers: Object.assign({}, defaultHeaders, headers),
    timeout,
    agent: getRequestAgent(url),
    json: format === 'json',
  }, (err, resp, body) => {
    if (err) return callback(err, null)
    callback(null, resp, body)
  })
}

export const checkUrl = (url, options = {}) => {
  return new Promise((resolve, reject) => {
    fetchData(url, 'head', options, (err, resp) => {
      if (err) return reject(err)
      if (resp.statusCode === 200) {
        resolve()
      } else {
        reject(new Error(resp.statusCode))
      }
    })
  })
}
