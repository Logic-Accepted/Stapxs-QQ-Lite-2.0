/*
 * @FileDescription: MsgBody.vue 所使模块用的通用的消息显示相关
 * @Author: Stapxs
 * @Date: 2022/11/29
 * @Version: 1.0
 * @Description: 此模块抽离出了本来在 MsgBody.vue 中的一些较为通用的方法便于进行多 Bot 适配。
*/

import Xss from 'xss'

import Util from './util'

import { popInfo } from './base'
import { connect as connecter } from './connect'

export class MsgBodyFuns {
  /**
   * 判断消息块是否要行内显示
   * @param { string } typeName 消息类型
   * @returns T/F
   */
  static isMsgInline (typeName) {
    switch (typeName) {
      case 'at':
      case 'text':
      case 'face': return true
      case 'bface':
      case 'image':
      case 'record':
      case 'video':
      case 'file':
      case 'json':
      case 'xml': return false
    }
  }
  /**
   * 尝试渲染 xml 消息
   * @param { string } xml xml 消息内容
   * @param { string } id xml 消息 id（不知道有啥用）
   * @param { string } msgid 消息 id
   * @returns 处理完成的 HTML 代码
   */
  static buildXML (xml, id, msgid) {
    // <msg> 标签内的为本体
    let item = xml.substring(xml.indexOf('<item'), xml.indexOf('</msg>'))
    // 尝试转换标签为 html
    // item = item.replaceAll('/>', '>')
    item = item.replaceAll('item', 'div') // item
    item = item.replaceAll('<div', '<div class="msg-xml"')
    item = item.replaceAll('title', 'p') // title
    item = item.replaceAll('summary', 'a') // summary
    item = item.replaceAll('<a', '<a class="msg-xml-summary"')
    item = item.replaceAll('<picture', '<img class="msg-xml-img"') // picture
    // 将不正确的参数改为 dataset
    item = item.replaceAll('size=', 'data-size=')
    item = item.replaceAll('linespace=', 'data-linespace=')
    item = item.replaceAll('cover=', 'src=')
    // 处理出处标签
    item = item.replace('source name=', 'source data-name=')
    // 处理错误的 style 位置
    const div = document.createElement('div')
    div.id = 'xml-' + msgid
    div.dataset.id = id
    div.innerHTML = item
    for (let i = 0; i < div.children[0].children.length; i++) {
      switch (div.children[0].children[i].nodeName) {
        case 'P': {
          div.children[0].children[i].style.fontSize = Number(div.children[0].children[i].dataset.size) / 30 + 'rem'
          div.children[0].children[i].style.marginBottom = Number(div.children[0].children[i].dataset.size) / 5 + 'px'
          break
        }
      }
    }
    // 解析 msg 消息体
    let msgHeader = xml.substring(xml.indexOf('<msg'), xml.indexOf('<item')) + '</msg>'
    msgHeader = msgHeader.replace('msg', 'div')
    msgHeader = msgHeader.replace('m_resid=', 'data-resid=')
    msgHeader = msgHeader.replace('url=', 'data-url=')
    let header = document.createElement('div')
    header.innerHTML = msgHeader
    // 处理特殊的出处
    let sourceBody = ''
    for (let i = 0; i < div.children.length; i++) {
      if (div.children[i].nodeName === 'SOURCE') {
        sourceBody = div.children[i]
      }
    }
    const source = sourceBody.dataset.name
    switch (source) {
      case '聊天记录': {
        // 合并转发消息
        div.dataset.type = 'forward'
        div.dataset.id = header.children[0].dataset.resid
        div.style.cursor = 'pointer'
        break
      }
      case '群投票': {
        // 群投票
        return '<a class="msg-unknow">（' + Util.$t('chat_xml_unsupport') + '：' + source + '）</a>'
      }
    }
    // 附带链接的 xml 消息处理
    if (header.children[0].dataset.url !== undefined) {
      div.dataset.url = header.children[0].dataset.url
      div.style.cursor = 'pointer'
    }
    return div.outerHTML
  }
  /**
   * 尝试渲染 json 消息
   * @param {object } data json 消息内容
   * @param { string } msgId 消息 id
   * @returns 处理完成的 html 代码
   */
  static buildJSON (data, msgId) {
    // 解析 JSON
    let json = JSON.parse(data)
    let body = json.meta[Object.keys(json.meta)[0]]
    // App 信息
    let name = body.tag === undefined ? body.title : body.tag
    let icon = body.icon === undefined ? body.source_icon : body.icon

    let title = body.title
    let desc = body.desc

    let preview = body.preview
    if (preview !== undefined && preview.indexOf('http') === -1) preview = '//' + preview

    // 一些特殊判定
    if (json.desc === '群公告') {
      title = json.desc
      desc = json.prompt
      preview = undefined
      icon = ''
      name = json.desc
    }

    let url = body.qqdocurl === undefined ? body.jumpUrl : body.qqdocurl
    // 构建 HTML
    let html = '<div class="msg-json" id="json-' + msgId + '" data-url="' + url + '">' +
               '<p>' + title + '</p>' +
               '<span>' + desc + '</span>' +
               '<img style="' + (preview === undefined ? 'display:none' : '') + '" src="' + preview + '">' +
               '<div><img src="' + icon + '"><span>' + name + '</span></div>' +
               '</div>'
    // 返回
    return html
  }
  /**
   * xml, json 消息的点击事件
   * @param { string } bodyId 用于寻找 DOM 的 id
   */
  static xmlClick (bodyId) {
    const sender = document.getElementById(bodyId)
    const type = sender.dataset.type
    // 如果存在 url 项，优先打开 url
    if (sender.dataset.url !== undefined && sender.dataset.url !== 'undefined' && sender.dataset.url !== '') {
      window.open(sender.dataset.url, '_blank')
      return
    }
    // 接下来按类型处理
    if (type === 'forward') {
      // 解析合并转发消息
      if (sender.dataset.id !== 'undefined') {
        connecter.send('get_forward_msg', { 'resid': sender.dataset.id }, 'getForwardMsg')
      } else {
        popInfo.add(popInfo.appMsgType.err, this.$t('pop_chat_forward_toooomany'))
      }
    }
  }
  /**
   * 处理纯文本消息（处理换行，转义字符并进行 xss 过滤便于高亮链接）
   * @param { string } text 文本
   * @returns 处理完成的文本
   */
  static parseText (text) {
    // 把 r 转为 n
    text = text.replaceAll('\r\n', '\n').replaceAll('\r', '\n')
    // 防止意外渲染转义字符串
    text = text.replaceAll('&', '&amp;')
    // XSS 过滤
    text = Xss(text)
    // 返回
    return text
  }
}
