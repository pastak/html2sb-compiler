'use strict'
var HTMLParser = require('htmlparser2/lib/Parser')
var styleParser = require('style-parser')
var trim = require('lodash.trim')

function parseSimple (variant, context, node) {
  var children
  if (node.children) {
    children = parseNodes(node.children).children
  }
  var result = {
    type: 'text',
    children: children
  }
  if (variant === 'blockquote') {
    result.blockquote = 1
  } else if (variant) {
    result[variant] = true
  }
  context.children.push(result)
  return result
}

function list (variant, context, node) {
  var result = {
    type: 'list',
    variant: variant,
    children: []
  }
  node.children.forEach(function (child) {
    parseSimple(null, result, child)
  })
  context.children.push(result)
}

function ignore (context, node) {
  if (node.children) {
    parseNodes(node.children, context)
  }
}

function parseStyle (context, node) {
  var fontSize = style(node, 'font-size')
  var parsed
  var enlarge = 0
  if (fontSize && (parsed = /^([0-9]+)\s*px\s*$/i.exec(fontSize))) {
    var num = parseInt(parsed[1], 10)
    if (num > 68) {
      enlarge += 1
    }
    if (num > 56) {
      enlarge += 1
    }
    if (num > 42) {
      enlarge += 1
    }
    if (num > 30) {
      enlarge += 1
    }
    if (num > 21) {
      enlarge += 1
    }
  }
  var bold = style(node, 'font-weight') === 'bold'
  var italic = /(^|\s)italic(\s|$)/i.test(style(node, 'font-style'))
  var underline = /(^|\s)underline(\s|$)/i.test(style(node, 'text-decoration')) ||
    style(node, '-evernote-highlight') === 'true'
  var strikeThrough = /(^|\s)line-through(\s|$)/i.test(style(node, 'text-decoration'))
  var addedNode = parseSimple(null, context, node)
  if (enlarge !== 0) {
    addedNode.enlarge = enlarge
  }
  if (bold) {
    addedNode.bold = true
  }
  if (underline) {
    addedNode.underline = true
  }
  if (strikeThrough) {
    addedNode.strike = true
  }
  if (italic) {
    addedNode.italic = true
  }
}

function style (node, prop) {
  if (!node.style) {
    if (!node.attribs || !node.attribs.style) {
      return ''
    }
    node.style = styleParser(node.attribs.style)
  }
  return node.style[prop] || ''
}

var tags = {
  'img': function (context, node) {
    context.children.push({
      type: 'img',
      href: node.attribs.src
    })
  },
  'a': function (context, node) {
    var childData = parseNodes(node.children)
    context.children.push({
      type: 'link',
      href: node.attribs.href,
      children: childData.children
    })
  },
  'note': function (context, node) {
    node.children.forEach(function (child) {
      if (child.tagName === 'title') {
        context.title = child.children[0].content
      } else if (child.tagName === 'tag') {
        if (!context.tags) {
          context.tags = []
        }
        context.tags.push(child.children[0].content)
      } else if (child.tagName === 'content') {
        var contentNodes = parseHTML(child.children[0].content)
        parseNode(context, {
          children: contentNodes
        })
      }
    })
  },
  'br': function (context, node) {
    context.children.push({
      type: 'br'
    })
  },
  'td': function (context, node) {
    var simple = parseSimple(null, context, node)
    simple.type = 'td'
  },
  'tbody': ignore,
  'tr': function (context, node) {
    var result = {
      type: 'tr',
      children: []
    }
    if (node.children) {
      parseNodes(node.children.filter(function (node) {
        return node.tagName === 'td'
      }), result)
    }
    context.children.push(result)
  },
  'table': function (context, node) {
    var result = {
      type: 'table',
      children: []
    }
    if (node.children) {
      parseNodes(node.children, result)
    }
    context.children.push(result)
  },
  'span': parseStyle,
  'font': parseStyle,
  'ol': list.bind(null, 'ol'),
  'ul': list.bind(null, 'ul'),
  'div': function (context, node) {
    // <en-todo> are inline tags which are super weird.
    // This way .checkNode will be filled somehow.
    if (
      node.children &&
      node.children.length >= 1 &&
      node.children[0].tagName === 'en-todo'
    ) {
      // Remove the check node
      var checkNode = node.children.shift()
      var result = {
        type: 'check',
        checked: checkNode.attribs && /^true$/i.test(checkNode.attribs.checked),
        children: []
      }
      parseSimple(null, result, checkNode)
      context.checkNode = result
      return
    }

    // The fontfamily, namely the Monaco or Consolas font indicates
    // that we are in a code block
    if (
      node.children &&
      /Monaco|Consolas/.test(style(node, 'font-family'))
    ) {
      var data = []
      node.children.forEach(function (child) {
        if (
          child.tagName === 'div' &&
          child.children.length === 1 &&
          child.children[0].type === 'Text'
        ) {
          data.push(child.children[0].content)
        }
      })
      context.children.push({
        type: 'code',
        text: data.join('\n')
      })
      return
    }

    parseSimple(null, context, node)

    // A line break after a div ensures that the formatting stays readable
    context.children.push({
      type: 'br'
    })
  },
  'hr': function (context, node) {
    context.children.push({
      type: 'hr'
    })
  },
  'blockquote': parseSimple.bind(null, 'blockquote'),
  'b': parseSimple.bind(null, 'bold'),
  'strong': parseSimple.bind(null, 'bold'),
  'i': parseSimple.bind(null, 'italic'),
  'em': parseSimple.bind(null, 'italic'),
  'u': parseSimple.bind(null, 'underline'),
  's': parseSimple.bind(null, 'strike')
}

function parseNodes (nodes, context) {
  if (!context) {
    context = {
      title: null,
      children: []
    }
  }
  parseNode.bind(null, context)
  var checklist = null
  var applyChecklist = function (index) {
    if (checklist) {
      context.children.splice(checklist.index, 0, {
        type: 'list',
        variant: 'ul',
        children: checklist.entries
      })
      checklist = null
    }
  }
  nodes.forEach(function (node) {
    if (node.type === 'Text' && node.content === '\n') {
      return
    }
    parseNode(context, node)
    if (context.checkNode) {
      if (!checklist) {
        checklist = {
          index: context.children.length,
          entries: []
        }
      }
      checklist.entries.push(context.checkNode)
      delete context.checkNode
    } else if (node.tagName === 'br' || node.tagName === 'div') {
      applyChecklist(node)
    }
  })
  applyChecklist()
  return context
}

function parseNode (context, node) {
  if (!node.tagName) {
    if (node.type === 'Text') {
      context.children.push({
        type: 'text',
        text: node.content
      })
    }
  }
  var parser = tags[node.tagName]
  if (parser) {
    parser(context, node)
  } else if (node.type === 'Text') {
    parseSimple(null, context, node)
  } else {
    ignore(context, node)
  }
}

function reduceSameProperties (tokens, parent) {
  if (tokens.length === 0) {
    return
  }
  ['bold', 'underline', 'strike', 'italic', 'href'].forEach(function (prop) {
    var value = tokens[0][prop]
    for (var i = 1; i < tokens.length; i++) {
      if (tokens[i][prop] !== value) {
        return
      }
    }
    tokens.forEach(function (token) {
      delete token[prop]
    })
    if (value !== undefined) {
      parent[prop] = value
    }
  })
}

function reduceSimpleNodes (tokens, parent) {
  tokens = tokens.filter(function (token) {
    if (token.type !== 'text') {
      return true
    }
    if (token.children) {
      return true
    }
    if (token.text === undefined || token.text === null) {
      return false
    }
    if (/^\s+$/i.test(token.text)) {
      return false
    }
    token.text = trim(token.text)
    return true
  })
  var allText = true
  tokens.forEach(function (token) {
    if (token.children) {
      token.children = reduceSimpleNodes(token.children, token)
    }
    if (token.type !== 'text') {
      allText = false
    }
    if (
      token.type === 'text' &&
      token.children &&
      token.children.length === 1 &&
      token.children[0].type === 'text'
    ) {
      var targetToken = token.children[0]
      if (token.href && targetToken.href) {
        return
      }
      if (targetToken.href) {
        token.href = targetToken.href
      }
      if (targetToken.bold || token.bold) {
        token.bold = true
      }
      if (targetToken.italic || token.italic) {
        token.italic = true
      }
      if (targetToken.strike || token.strike) {
        token.strike = true
      }
      if (targetToken.underline || token.underline) {
        token.underline = true
      }
      if (targetToken.enlarge) {
        token.bold = true
        token.enlarge = (token.enlarge || 0) + targetToken.enlarge
      }
      if (targetToken.blockquote) {
        token.blockquote = (token.blockquote || 0) + targetToken.blockquote
      }
      if (targetToken.children) {
        token.children = targetToken.children
      } else {
        delete token.children
      }
      if (targetToken.text) {
        token.text = targetToken.text
      } else {
        delete token.text
      }
    }
  })
  if (allText && tokens.length > 1) {
    reduceSameProperties(tokens, parent)
  }
  return tokens.filter(function (token) {
    if (!token.children && token.hasOwnProperty('children')) {
      delete token.children
    }
    return !token.children || token.children.length !== 0 || parent.type === 'tr'
  })
}

function parseHTML (input) {
  var current = {}
  var stack = []
  var root = current
  var parser = new HTMLParser({
    onopentag: function (name, attribs) {
      stack.push(current)
      var next = {
        tagName: name
      }
      if (Object.keys(attribs).length > 0) {
        next.attribs = attribs
      }
      if (!current.children) {
        current.children = []
      }
      current.children.push(next)
      current = next
    },
    ontext: function (text) {
      if (!current.children) {
        current.children = []
      }
      current.children.push({
        type: 'Text',
        content: text
      })
    },
    onclosetag: function (tagName) {
      for (var i = stack.length - 1; i >= 0; i--) {
        if (stack[i].tagName === tagName) {
          while (stack.length > i) {
            current = stack.pop()
          }
          return
        }
      }
      if (current.tagName === tagName) {
        current = stack.pop()
      }
      // ignore tags that are ever opened
    }
  }, {
    recognizeCDATA: true,
    decodeEntities: true
  })
  parser.write(String(input))
  parser.end()
  return root.children || []
}

module.exports = function (input) {
  var tokens = parseNodes(parseHTML(input))
  tokens.children = reduceSimpleNodes(tokens.children, tokens)
  // console.log(JSON.stringify(tokens, null, 2))
  return tokens
}
