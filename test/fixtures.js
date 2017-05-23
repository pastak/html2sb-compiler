const fs = require('fs')
const path = require('path')
const test = require('tape').test
const parse = require('../parse')
const toScrapbox = require('../toScrapbox')
const guessTitle = require('../guessTitle')

function readFixture (file) {
  return fs.readFileSync(path.join(__dirname, 'fixtures', file), 'utf8')
}

test('fixtures', function (t) {
  function testFixture (file) {
    const tokens = parse(readFixture(file + '.html'), {
      evernote: true
    })
    const sb = toScrapbox(tokens)
    const expectedTokens = JSON.parse(readFixture(file + '.json'))
    const expectedOutput = readFixture(file + '.txt')
    // console.log(JSON.stringify(tokens, null, 2))
    t.deepEqual(tokens, expectedTokens, file + '#tokens')
    sb.title = guessTitle(tokens, sb, function (tokens, foundTitle, template) {
      var named = 'Untitled'
      return foundTitle || template(named) || named
    })
    t.equal((sb.title ? sb.title + '\n' : '') + sb.lines.join('\n') + '\n', expectedOutput, file + '#output')
  }

  [
    'formatting',
    'evernote',
    'blocks',
    'code',
    'list',
    'list-in-list',
    'header',
    'hr',
    'table',
    'table-in-div',
    'complex',
    'links',
    'text-styles'
  ].forEach(testFixture)
  t.end()
})
