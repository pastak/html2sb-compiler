const fs = require('fs')
const path = require('path')
const test = require('tape').test
const parse = require('../parse')
const toScrapbox = require('../toScrapbox')

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
    t.equal(sb, expectedOutput, file + '#output')
  }

  [
    'formatting',
    'evernote',
    'blocks',
    'code',
    'list',
    'header',
    'hr',
    'table',
    'complex',
    'links',
    'text-styles'
  ].forEach(testFixture)
  t.end()
})
