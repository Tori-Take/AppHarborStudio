import { describe, it, expect } from 'vitest'
import { kanaToRomaji, softSlug, slugify, isAbsolutePath } from '@/lib/slug'

describe('kanaToRomaji', () => {
  it('カタカナ語をローマ字化する（長音は省略）', () => {
    expect(kanaToRomaji('モノポリー')).toBe('monopori')
    expect(kanaToRomaji('ポーカー')).toBe('poka')
    expect(kanaToRomaji('コーヒー')).toBe('kohi')
  })

  it('ひらがなも同じ表で処理する', () => {
    expect(kanaToRomaji('たいぴんぐ')).toBe('taipingu')
    expect(kanaToRomaji('しょうぎ')).toBe('shougi')
  })

  it('拗音・外来音を2文字で解決する', () => {
    expect(kanaToRomaji('シャツ')).toBe('shatsu')
    expect(kanaToRomaji('ジャンプ')).toBe('janpu')
    expect(kanaToRomaji('フィルター')).toBe('firuta')
  })

  it('促音「ッ」は次の子音を重ねる（ch は t）', () => {
    expect(kanaToRomaji('ベッド')).toBe('beddo')
    expect(kanaToRomaji('マッチ')).toBe('matchi')
  })

  it('撥音「ン」は n', () => {
    expect(kanaToRomaji('パン')).toBe('pan')
  })

  it('漢字・英数字はそのまま通す（後段で除去）', () => {
    // 漢字部分は変換されず残る → softSlug 側で落ちる
    expect(kanaToRomaji('タイピング練習')).toBe('taipingu練習')
    expect(kanaToRomaji('Game2')).toBe('Game2')
  })
})

describe('softSlug（タイプ中用：末尾ハイフン保持）', () => {
  it('左から打ってもハイフンが消えない', () => {
    // 制御入力で1文字ずつ append しても "my-app" を維持できる
    let value = ''
    for (const ch of 'my-app') value = softSlug(value + ch)
    expect(value).toBe('my-app')
  })

  it('日本語名はローマ字 slug になる', () => {
    expect(softSlug('モノポリー')).toBe('monopori')
    expect(softSlug('タイピング練習')).toBe('taipingu') // 漢字は落ちる
  })

  it('純漢字は空（→ 手入力フォールバック）', () => {
    expect(softSlug('大画面')).toBe('')
  })
})

describe('slugify（確定版：先頭/末尾ハイフン除去）', () => {
  it('末尾ハイフンを除去する', () => {
    expect(slugify('a-')).toBe('a')
    expect(slugify('-abc-')).toBe('abc')
  })
})

describe('isAbsolutePath', () => {
  it('絶対パスを許可、相対パスを拒否する', () => {
    expect(isAbsolutePath('C:\\Users\\you\\Projects')).toBe(true)
    expect(isAbsolutePath('D:/work')).toBe(true)
    expect(isAbsolutePath('\\\\srv\\share')).toBe(true)
    expect(isAbsolutePath('/home/u')).toBe(true)
    expect(isAbsolutePath('foo/bar')).toBe(false)
    expect(isAbsolutePath('')).toBe(false)
  })
})
