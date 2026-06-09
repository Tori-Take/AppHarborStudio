/**
 * カートリッジ識別子（slug）生成ユーティリティ。
 *
 * 日本語アプリ名からも識別子候補を作れるよう、かな→ローマ字変換（AIなし・
 * 辞書なし・依存なし）を内蔵する。漢字は読みが文脈依存で確定できないため
 * 変換せず、後段の slug 整形で除去される（= かな部分だけが残る or 空になる）。
 */

/**
 * ヘボン式 かな→ローマ字 変換表。
 * 2文字（拗音・外来音）を優先判定し、無ければ 1 文字で引く。
 * 促音「ッ」と長音「ー」は kanaToRomaji 側で特別扱いするので含めない。
 */
const ROMAJI: Record<string, string> = {
  // 拗音・外来音（2文字 → 先に判定）
  'キャ':'kya','キュ':'kyu','キョ':'kyo','シャ':'sha','シュ':'shu','ショ':'sho',
  'チャ':'cha','チュ':'chu','チョ':'cho','ニャ':'nya','ニュ':'nyu','ニョ':'nyo',
  'ヒャ':'hya','ヒュ':'hyu','ヒョ':'hyo','ミャ':'mya','ミュ':'myu','ミョ':'myo',
  'リャ':'rya','リュ':'ryu','リョ':'ryo','ギャ':'gya','ギュ':'gyu','ギョ':'gyo',
  'ジャ':'ja','ジュ':'ju','ジョ':'jo','ビャ':'bya','ビュ':'byu','ビョ':'byo',
  'ピャ':'pya','ピュ':'pyu','ピョ':'pyo',
  'ファ':'fa','フィ':'fi','フェ':'fe','フォ':'fo','フュ':'fyu',
  'ウィ':'wi','ウェ':'we','ウォ':'wo',
  'ヴァ':'va','ヴィ':'vi','ヴェ':'ve','ヴォ':'vo','ヴュ':'vyu',
  'ティ':'ti','トゥ':'tu','テュ':'tyu','ディ':'di','ドゥ':'du','デュ':'dyu',
  'シェ':'she','ジェ':'je','チェ':'che','ツァ':'tsa','ツィ':'tsi','ツェ':'tse','ツォ':'tso',
  // 清音・濁音・半濁音（1文字）
  'ア':'a','イ':'i','ウ':'u','エ':'e','オ':'o',
  'カ':'ka','キ':'ki','ク':'ku','ケ':'ke','コ':'ko',
  'ガ':'ga','ギ':'gi','グ':'gu','ゲ':'ge','ゴ':'go',
  'サ':'sa','シ':'shi','ス':'su','セ':'se','ソ':'so',
  'ザ':'za','ジ':'ji','ズ':'zu','ゼ':'ze','ゾ':'zo',
  'タ':'ta','チ':'chi','ツ':'tsu','テ':'te','ト':'to',
  'ダ':'da','ヂ':'ji','ヅ':'zu','デ':'de','ド':'do',
  'ナ':'na','ニ':'ni','ヌ':'nu','ネ':'ne','ノ':'no',
  'ハ':'ha','ヒ':'hi','フ':'fu','ヘ':'he','ホ':'ho',
  'バ':'ba','ビ':'bi','ブ':'bu','ベ':'be','ボ':'bo',
  'パ':'pa','ピ':'pi','プ':'pu','ペ':'pe','ポ':'po',
  'マ':'ma','ミ':'mi','ム':'mu','メ':'me','モ':'mo',
  'ヤ':'ya','ユ':'yu','ヨ':'yo',
  'ラ':'ra','リ':'ri','ル':'ru','レ':'re','ロ':'ro',
  'ワ':'wa','ヲ':'o','ン':'n','ヴ':'vu',
  // 小書き単独（拗音にできなかった場合のフォールバック）
  'ァ':'a','ィ':'i','ゥ':'u','ェ':'e','ォ':'o','ャ':'ya','ュ':'yu','ョ':'yo',
}

/**
 * かな（ひらがな/カタカナ）をヘボン式ローマ字へ変換する（AIなし）。
 * 漢字・英数字・記号はそのまま通し、後段の softSlug で整形/除去される。
 * 例: モノポリー → monopori / タイピング練習 → taipingu（漢字は落ちる）。
 */
export function kanaToRomaji(input: string): string {
  // ひらがな(U+3041–U+3096) を カタカナ(+0x60) に寄せて 1 つの表で引く
  const kata = input.replace(/[ぁ-ゖ]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) + 0x60))

  let out = ''
  let sokuon = false // 直前が促音「ッ」
  for (let i = 0; i < kata.length; i++) {
    const one = kata[i]
    if (one === 'ッ') { sokuon = true; continue }
    if (one === 'ー') { continue } // 長音は ASCII では省略（モノポリー→monopori）

    const two = kata.slice(i, i + 2)
    let r: string | undefined
    if (ROMAJI[two]) { r = ROMAJI[two]; i++ }
    else if (ROMAJI[one]) { r = ROMAJI[one] }

    if (r === undefined) {
      out += one // かな以外はそのまま通す
      sokuon = false
      continue
    }
    if (sokuon) {
      // 促音: 次の子音を重ねる（母音始まりなら重ねない、ch は t に）
      if (!/^[aiueo]/.test(r)) out += r.startsWith('ch') ? 't' : r[0]
      sokuon = false
    }
    out += r
  }
  return out
}

/**
 * タイプ中用の slug 整形。slugify と違い末尾ハイフンを残すので、
 * `my-app` を左から素直に打ってもハイフンが消えない。
 * 先頭で kanaToRomaji を噛ませ、日本語名から識別子候補を作れるようにする。
 */
export function softSlug(input: string): string {
  return kanaToRomaji(input)
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .slice(0, 40)
}

/**
 * 確定版の ID 整形（先頭/末尾ハイフンを除去）。
 * blur 時・送信時・アプリ名からの自動候補に使う。
 */
export function slugify(input: string): string {
  return softSlug(input).replace(/^-+|-+$/g, '')
}

/** Windows ドライブパス / UNC / POSIX 絶対パスを大まかに判定 */
export function isAbsolutePath(p: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(p) || /^\\\\/.test(p) || p.startsWith('/')
}
