import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readPlateauSettings, writePlateauSettings } from '../src/lib/nilgirisViewState'

test('plateau links restore the toggle and starting elevation', () => {
  assert.deepEqual(readPlateauSettings('?stretch=1&stretchStart=2300'), {
    stretched: true,
    stretchStart: 2300,
  })
  assert.deepEqual(readPlateauSettings(''), { stretched: false, stretchStart: 2000 })
  assert.equal(readPlateauSettings('?stretch=0&stretchStart=0').stretchStart, 0)
})

test('invalid elevations are normalized to the slider range and step', () => {
  for (const [input, expected] of [
    ['NaN', 2000],
    ['Infinity', 2000],
    ['', 2000],
    ['-500', 0],
    ['9000', 2700],
    ['2355', 2400],
  ] as const) {
    assert.equal(readPlateauSettings(`?stretchStart=${input}`).stretchStart, expected)
  }
})

test('updating stretch preserves camera and unrelated parameters and remembers the disabled start', () => {
  const search = writePlateauSettings('?lng=76.6&zoom=12&custom=yes&stretch=1', false, 2400)
  const params = new URLSearchParams(search)
  assert.equal(params.get('lng'), '76.6')
  assert.equal(params.get('zoom'), '12')
  assert.equal(params.get('custom'), 'yes')
  assert.deepEqual(readPlateauSettings(search), { stretched: false, stretchStart: 2400 })
})
