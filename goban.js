// Go game and goban model and canvas drawing.
// (c)2017 All Rights Reserved by Laurent Demailly

var Stones = {
  EMPTY: 0, // evaluates to false
  BLACK: 1,
  WHITE: 2
}

var DEBUG = false

// Logic
class GoGame {
  constructor (size) {
    this.n = size
    this.Reset()
  }

  Reset () {
    this.history = []
    this.board = new Array(this.n * this.n)
    this.groups = []
    this.liberties = [] // matches the group
    this.hascapture = false
    this.captured = [0, 0, 0]
  }

  // x,y coordinates to flat array coordinates
  c2idx (i, j) {
    return i * this.n + j
  }
  // flat index coordinates back to x,y coordinates
  idx2c (p) {
    return [Math.floor(p / this.n), p % this.n]
  }

  // Update a Neighbors result object based what is contained at position i
  updateN (res, i) {
    res.idxs.push(i)
    var v = this.board[i]
    var color = GoGame.ThisColor(v)
    // push either the gids in the set, or for empty just the liberties coords
    res.types[color].add(color === Stones.EMPTY ? i : v)
  }

  // Returns the neighbors at position p
  Neighbors (p) {
    var res = {
      // Indexes (positions)
      idxs: [],
      // Sets by neighbor type (empty/liberties, black, white)
      types: [new Set(), new Set(), new Set()]
    }
    var [x, y] = this.idx2c(p)
    if (x > 0) {
      this.updateN(res, this.c2idx(x - 1, y))
    }
    if (x < this.n - 1) {
      this.updateN(res, this.c2idx(x + 1, y))
    }
    if (y > 0) {
      this.updateN(res, this.c2idx(x, y - 1))
    }
    if (y < this.n - 1) {
      this.updateN(res, this.c2idx(x, y + 1))
    }
    return res
  }

  HasCapture () {
    return this.hascapture
  }

  Liberties (i, j) {
    var p = this.At(i, j)
    if (!p) {
      return 'x'
    }
    return this.liberties[p].size
  }

  static PosToLetter (i) {
    if (i >= 8) {
      i++ // skip I
    }
    return String.fromCharCode(65 + i)
  }

  // Extra when talking about next move or rolled back move, otherwise using
  // last move # from history.
  UserCoord (i, j, color, extra = 0) {
    return '#' + (this.history.length + extra) + ' ' +
      ((color === Stones.WHITE) ? 'w ' : 'b ') + GoGame.PosToLetter(i) + (this.n - j)
  }

  Pass (stone) {
    if (stone === Stones.EMPTY) {
      // this is just erasing a pass
      return
    }
    this.history.push({
      x: -1,
      y: -1,
      color: stone,
      merged: false,
      capture: false
    })
  }

  // Returns true if move is valid/placed, false otherwise.
  // Always succeeds for Stones.EMPTY which clears the position.
  Place (i, j, stone, checkoob = true) {
    this.hascapture = false
    if (i === -1 && j === -1) {
      this.Pass(stone)
      return true
    }
    if (checkoob && this.OutOfBounds(i, j)) {
      return false
    }
    var p = this.c2idx(i, j)
    if (stone === Stones.EMPTY) {
      this.board[p] = stone
      return true
    }
    if (this.board[p]) {
      return false
    }
    if (stone !== GoGame.ThisColor(this.history.length + 1)) {
      console.log('Wrong color for the turn ' + this.UserCoord(i, j, stone, 1) + ' ' + i + ' ' + j + ' ' + stone)
      return false
    }
    this.history.push({
      x: i,
      y: j,
      color: stone,
      merged: false,
      capture: false
    })
    var gid = this.Update(i, j, p, stone)
    var suicide = this.RemoveLiberty(gid, p)
    this.history[this.history.length - 1].capture = this.hascapture
    if (suicide) {
      console.log('Illegal suicide at ' + this.UserCoord(i, j, stone))
      this.Undo()
      return false
    }
    return true
  }

  RemoveLiberty (from, which) {
    this.liberties[from].delete(which)
    if (this.liberties[from].size !== 0) {
      return false
    }
    // last liberty is gone, delete this group
    this.DeleteGroup(from)
    return true
  }

  DeleteGroup (gid) {
    console.log('Deleting group ' + gid)
    this.hascapture = true
    var g = this.groups[gid]
    var otherColor = GoGame.OtherColor(gid)
    this.captured[otherColor] += g.length
    for (var i = 0; i < g.length; i++) {
      var p = g[i]
      this.board[p] = Stones.EMPTY
      var n = this.Neighbors(p)
      for (var c of n.types[otherColor]) {
        this.liberties[c].add(p)
      }
    }
    delete this.groups[gid]
    delete this.liberties[gid]
  }

  LastMoveMergedGroups () {
    var l = this.history.length - 1
    if (l < 0) {
      return false
    }
    return this.history[l].merged
  }

  LastMoveHadCapture () {
    var l = this.history.length - 1
    if (l < 0) {
      return false
    }
    return this.history[l].capture
  }

  Update (i, j, p, stone) {
    var gid = this.history.length
    var sameColor = GoGame.ThisColor(gid)
    if (sameColor !== stone) {
      console.log(this.UserCoord(i, j, stone) + ' unexpected at this turn! ' + stone + ' ' + gid)
    }
    var otherColor = GoGame.OtherColor(gid)
    // Place as new group first:
    var n = this.Neighbors(p)
    this.groups[gid] = [p]
    this.liberties[gid] = n.types[Stones.EMPTY]
    this.board[p] = gid
    // Kill enemies (which may restore liberties to this group)
    for (var g of n.types[otherColor]) {
      this.RemoveLiberty(g, p)
    }
    // Merge friendly groups
    var merge = n.types[sameColor].size
    for (g of n.types[sameColor]) {
      gid = this.Merge(g, gid)
    }
    console.log(this.UserCoord(i, j, stone) +
      ' merge# ' + merge + ' -> gid ' + gid + ' liberties=' + this.liberties[gid].size)
    if (merge > 1) {
      // Mark this move as creating a merge (need refresh and special undo)
      this.history[this.history.length - 1].merged = true
    }
    return gid
  }

  Merge (gid1, gid2) {
    if (gid1 === gid2) {
      console.log('BUG!!! same gid ' + gid1)
      return 'BUG'
    }
    if (gid1 > gid2) {
      [gid1, gid2] = [gid2, gid1]
    }
    for (var i = 0; i < this.groups[gid2].length; i++) {
      var p = this.groups[gid2][i]
      this.board[p] = gid1
      this.groups[gid1].push(p)
    }
    for (var v of this.liberties[gid2]) {
      this.liberties[gid1].add(v)
    }
    delete this.groups[gid2]
    delete this.liberties[gid2]
    return gid1
  }

  static SameColor (s1, s2) {
    return (s1 > 0 && s2 > 0) && (s1 % 2 === s2 % 2)
  }

  static OtherColor (gid) {
    if (!gid || gid < 0) {
      return Stones.EMPTY
    }
    return GoGame.ThisColor(gid + 1)
  }

  static ThisColor (gid) {
    if (!gid || gid < 0) {
      return Stones.EMPTY
    }
    return (gid % 2) ? Stones.BLACK : Stones.WHITE
  }

  // Are the coordinates out of bound ?
  OutOfBounds (i, j) {
    return (i < 0 || j < 0 || i >= this.n || j >= this.n)
  }
  // Is that position empty.
  Empty (i, j) {
    return !this.At(i, j)
  }
  At (i, j) {
    return this.board[this.c2idx(i, j)]
  }
  Undo () {
    var l = this.history.length
    if (l === 0) {
      return false
    }
    l--
    var pos = this.history[l]
    this.history.length = l // truncate
    if (pos.merged || pos.capture) {
      // there was a multi merge or capture... let's replay everything brute force
      this.ReplayHistory()
    } else {
      // no multi merge so we just need to erase that stone
      this.Place(pos.x, pos.y, Stones.EMPTY, false)
    }
    return true
  }

  ReplayHistory () {
    var h = this.history
    console.log('Replay all')
    this.Reset()
    for (var i = 0; i < h.length; i++) {
      var pos = h[i]
      this.Place(pos.x, pos.y, pos.color, false /* don't check oob, for resize */)
    }
  }

  // SGF format black/white move
  static SgfMove (color, x, y) {
    var pos
    if (x === -1 && y === -1) {
      // pass
      pos = '' // or "tt" as used for 19x19 pass by many
    } else {
      pos = String.fromCharCode(97 + x, 97 + y)
    }
    return ';' + ((color === Stones.WHITE) ? 'W[' : 'B[') + pos + ']\n'
  }

  // Parse back to our coords/colors
  SgfToPos (sgfColor, sgfCoord) {
    var color = (sgfColor === 'W' ? Stones.WHITE : Stones.BLACK)
    var x = sgfCoord.charCodeAt(0) - 97
    var y = sgfCoord.charCodeAt(1) - 97
    if (sgfCoord === '' || (this.n <= 19 && sgfCoord === 'tt')) {
      x = y = -1 // it's a pass
    }
    return {
      x,
      y,
      color
    }
  }

  // Returns game history in basic SGF format
  Save () {
    var res = '(;FF[4]GM[1]SZ[' + this.n + ']AP[vios.ai jsgo:0.1]\n'
    for (var i = 0; i < this.history.length; i++) {
      var pos = this.history[i]
      res += GoGame.SgfMove(pos.color, pos.x, pos.y)
    }
    res += ')\n'
    return res
  }

  // Parse a simple SGF and loads as history
  Load (sgf) {
    if (!sgf) {
      console.log("Invalid 'false' SGF")
      return false
    }
    if (!/\([\r\n\t ]*;[\r\n\t ]*FF\[/.exec(sgf)) {
      console.log("Invalid SGF, can't find '(;FF[' file format header")
      return false
    }
    // Stop at the first variant/mainline:
    sgf = sgf.substring(0, sgf.indexOf(')'))
    var sz = /SZ\[([0-9]+)]/.exec(sgf)
    var szN = -1
    if (sz) {
      szN = parseInt(sz[1])
    } else {
      console.log('SZ missing, defaulting to 19')
      szN = 19 // be nice and default to 19 (some alphago sgf files lack SZ!)
    }
    if (szN < 2 || szN > 26) {
      console.log('Invalid SGF, bad board size SZ ' + szN)
      return false
    }
    this.n = szN
    this.Reset()
    var re = /;[\r\n\t ]*([BW])\[([a-z]*)\]/g
    for (var m;
      (m = re.exec(sgf));) {
      var pos = this.SgfToPos(m[1], m[2])
      if (!this.Place(pos.x, pos.y, pos.color)) {
        console.log('Aborting load: unexpected illegal move at ' +
          this.UserCoord(pos.x, pos.y, pos.color, 1) +
          ' sgf: ' + m[0])
        return true
      }
    }
    return true
  }
}

// UI / Drawing
// TODO: show liberties actual location on mouse over ? (and count somewhere else than on stones)
// TODO: should has a GoGame not extend.
// TODO: how to fix "not used" standard lint
class GoBan extends GoGame { // eslint-disable-line no-unused-vars
  constructor (size = 19) {
    super(size)
    this.withCoordinates = true
    this.withSounds = true
    this.withLastMoveHighlight = false
    this.withMoveNumbers = true
    this.withGroupNumbers = false
    this.withAutoSave = true
    this.withMouseMove = true
  }
  // Draw 1 hoshi (star point) at x,y
  hoshi (x, y) {
    var ctx = this.ctx
    ctx.fillStyle = 'black'
    ctx.beginPath()
    ctx.arc(this.posToCoord(x), this.posToCoord(y), 2.5, 0, 2 * Math.PI)
    ctx.fill()
  }

  // Draw all the hoshis
  drawHoshis () {
    var mid = (this.n - 1) / 2
    if (this.n % 2 !== 0) {
      this.hoshi(mid, mid)
    }
    var h = 3
    if (this.n < 13) {
      h = 2
    }
    var g = this.n - h - 1
    if (h < mid) {
      this.hoshi(h, h)
      this.hoshi(g, h)
      this.hoshi(h, g)
      this.hoshi(g, g)
    }
    if (this.n > 13 && this.n % 2 !== 0) {
      this.hoshi(h, mid)
      this.hoshi(g, mid)
      this.hoshi(mid, h)
      this.hoshi(mid, g)
    }
  }

  // TODO: use stones isn't of text for B/W labels
  drawInfo () {
    this.ctx.font = '' + this.sz1 * 0.33 + 'px Arial'
    this.ctx.fillStyle = 'black'
    this.ctx.fillText('B ' + this.captured[Stones.BLACK] + ', W ' + this.captured[Stones.WHITE],
      this.posToCoord(-0.9), this.posToCoord(-0.7))
  }

  drawCoordinates () {
    this.ctx.font = 'bold ' + this.sz1 * 0.38 + 'px Arial'
    this.ctx.fillStyle = 'DimGray'
    for (var i = 0; i < this.n; i++) {
      var num = '' + (this.n - i)
      this.ctx.fillText(num, this.posToCoord(-1.51), this.posToCoord(i + 0.1))
      this.ctx.fillText(num, this.posToCoord(this.n + 0.08), this.posToCoord(i + 0.15))
      var letter = GoGame.PosToLetter(i)
      this.ctx.fillText(letter, this.posToCoord(i - 0.1), this.posToCoord(this.n + 0.35))
      this.ctx.fillText(letter, this.posToCoord(i - 0.1), this.sz1 / 3)
    }
  }

  AddHighlight () {
    var l = this.history.length
    if ((!this.withLastMoveHighlight) || (l === 0)) {
      return
    }
    var lastMove = this.history[l - 1]
    if (this.OutOfBounds(lastMove.x, lastMove.y)) {
      return
    }
    var highlight = this.HighlightColor(lastMove.color)
    var ctx = this.ctx
    ctx.beginPath()
    ctx.strokeStyle = highlight
    ctx.lineWidth = 2
    var rs = this.stoneRadius * 0.6
    var len = rs / 3
    var x = this.posToCoord(lastMove.x)
    var y = this.posToCoord(lastMove.y)
    ctx.moveTo(x - rs, y - rs)
    ctx.lineTo(x - rs + len, y - rs + len)
    ctx.moveTo(x + rs, y + rs)
    ctx.lineTo(x + rs - len, y + rs - len)
    ctx.moveTo(x + rs, y - rs)
    ctx.lineTo(x + rs - len, y - rs + len)
    ctx.moveTo(x - rs, y + rs)
    ctx.lineTo(x - rs + len, y + rs - len)
    ctx.stroke()
  }

  RemoveHighlight () {
    // We remove highlight on the one before last
    var l = this.history.length
    if ((!this.withLastMoveHighlight) || (l <= 1)) {
      return
    }
    var lastMove = this.history[l - 2]
    this.drawStone(lastMove.x, lastMove.y, lastMove.color, l - 1)
  }

  RecordMove (x, y, color) {
    if (!this.Place(x, y, this.BlackOrWhite(color))) {
      return false
    }
    this.RemoveHighlight()
    this.drawStone(x, y, color, this.history.length, this.withLastMoveHighlight)
    this.AddHighlight()
    return true
  }

  BlackOrWhite (color) {
    if ((color === Stones.WHITE) || (color === 'white')) {
      return Stones.WHITE
    }
    return Stones.BLACK
  }

  Color (color, alpha = 1.0) {
    if (color === Stones.WHITE) {
      return 'rgba(255,255,255,' + alpha + ')'
    }
    if (color === Stones.BLACK) {
      return 'rgba(0,0,0,' + alpha + ')'
    }
    return color
  }

  HighlightColor (color) {
    if (color === 'white' || color === Stones.WHITE) {
      return 'black'
    } else {
      return 'white'
    }
  }

  drawStone (i, j, color, num, skipHighlight = false) {
    if (this.OutOfBounds(i, j)) {
      if ((i === -1) && (j === -1)) {
        if (DEBUG) {
          console.log('Skipping pass move')
        }
      } else {
        console.log('Skipping OOB ' + i + ' ' + j)
      }
      return
    }
    if (this.Empty(i, j)) {
      if (DEBUG) {
        console.log('Skipping removed stone ' + i + ' ' + j)
      }
      return
    }
    this.drawStoneNC(i, j, color, num, skipHighlight)
  }

  // No Check draw
  drawStoneNC (i, j, color, num, skipHighlight, highlight = this.HighlightColor(color)) {
    var x = this.posToCoord(i)
    var y = this.posToCoord(j)
    var ctx = this.ctx
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.fillStyle = this.Color(color)
    ctx.arc(x, y, this.stoneRadius, 0, 2 * Math.PI)
    ctx.fill()
    if (!skipHighlight) {
      ctx.beginPath()
      ctx.strokeStyle = highlight
      ctx.arc(x, y, this.stoneRadius * 0.7, 0.2, Math.PI / 2 - 0.2)
      ctx.stroke()
    }
    if (num && (this.withMoveNumbers || this.withGroupNumbers)) {
      ctx.fillStyle = highlight
      ctx.textAlign = 'center'
      // checked it fits with highlight and 399
      var fontSz = Math.round(this.sz1 * 0.35 * 10) / 10
      ctx.font = '' + fontSz + 'px Arial'
      if (this.withGroupNumbers) {
        num = '' + this.At(i, j) + ',' + this.Liberties(i, j)
      }
      ctx.fillText('' + num, x, y + fontSz / 3)
    }
    ctx.beginPath()
    ctx.strokeStyle = 'grey'
    ctx.arc(x, y, this.stoneRadius, 0, 2 * Math.PI)
    ctx.stroke()
  }

  // internal utility for coord -> pixels translation
  posToCoord (x) {
    // need 0.5 to look sharp/black instead of grey
    return 0.5 + this.delta + x * this.sz1
  }
  // inverse of above
  coordToPos (x, continous = false) {
    var r = (x - 0.5 - this.delta) / this.sz1
    if (continous) {
      return r
    }
    return Math.round(r)
  }

  // Draw the main board on the given canvas
  Draw (c, scale = 24) {
    this.sz1 = scale
    this.stoneRadius = scale / 2 - 0.5
    this.gobanSz = (this.n + 1) * scale
    this.delta = scale * 1.5
    if (!this.canvas) {
      // First time, setup listener
      var self = this
      c.addEventListener('mousedown', function (event) {
        self.clickPosition(event)
      })
      c.addEventListener('mouseleave', function (event) {
        self.withLastMoveHighlight = false
        self.Redraw()
      })
      c.addEventListener('mouseenter', function (event) {
        self.withLastMoveHighlight = true
        self.Redraw()
      })
      c.addEventListener('mousemove', function (event) {
        self.mouseMove(event)
      })
      this.canvas = c
    }
    this.Redraw()
  }

  mouseMove (event) {
    if (this.withMouseMove) {
      var x = event.offsetX
      var y = event.offsetY
      var i = this.coordToPos(x, true)
      var j = this.coordToPos(y, true)
      var n = this.history.length
      var color = (n % 2 === 0) ? Stones.BLACK : Stones.WHITE
      var highlight = GoGame.OtherColor(color)
      this.Redraw()
      this.drawStoneNC(i, j, this.Color(color, 0.5), 0, false, this.Color(highlight, 0.7))
    }
  }

  clickPosition (event) {
    var x = event.offsetX
    var y = event.offsetY
    var i = this.coordToPos(x)
    var j = this.coordToPos(y)
    var color = (this.history.length % 2 === 0) ? Stones.BLACK : Stones.WHITE
    if (this.RecordMove(i, j, color)) {
      if (this.withMouseMove || this.HasCapture() || /* this.LastMoveMergedGroups() && */ this.withGroupNumbers) {
        this.Redraw()
      }
      console.log('Valid move #' + this.history.length + ' at ' + i + ' , ' + j + ' for ' + this.Color(color))
      if (this.withSounds) {
        audio.play()
      }
      if (this.withAutoSave) {
        window.localStorage.setItem('sgf-autoSave', this.Save())
      }
    } else {
      console.log('Invalid move ' + i + ' , ' + j)
    }
  }

  Redraw () {
    if (DEBUG) {
      console.log('Redraw called')
    }
    var c = this.canvas
    var ctx = c.getContext('2d')
    ctx.clearRect(0, 0, c.width, c.height)
    c.height = this.gobanSz + this.sz1
    c.width = this.gobanSz + this.sz1
    this.ctx = ctx
    ctx.fillStyle = 'moccasin'
    ctx.fillRect(this.sz1 / 2, this.sz1 / 2, this.gobanSz, this.gobanSz)
    ctx.fillStyle = 'black'
    var zero = this.posToCoord(0)
    var last = this.posToCoord(this.n - 1)
    for (var i = 0; i < this.n; i++) {
      var x = this.posToCoord(i)
      ctx.moveTo(x, zero)
      ctx.lineTo(x, last)
      ctx.moveTo(zero, x)
      ctx.lineTo(last, x)
    }
    ctx.stroke()
    this.drawHoshis()
    if (this.withCoordinates) {
      this.drawCoordinates()
    }
    this.drawInfo()
    var len = this.history.length - 1
    // TODO: if history is longer than maybe 1/2 of the board, maybe faster to use the board instead of replaying from first move
    for (i = 0; i <= len; i++) {
      var skipHighlight = (i === len && this.withLastMoveHighlight) // for the last move
      this.drawStone(this.history[i].x, this.history[i].y, this.history[i].color, i + 1, skipHighlight)
    }
    this.AddHighlight()
  }

  Undo () {
    if (super.Undo()) {
      this.Redraw()
    }
  }

  Resize (n) {
    if (this.n === n) {
      return // noop
    }
    this.n = n
    this.ReplayHistory()
  }
}

// Stone sound (c)2017 All Rights Reserved by Laurent Demailly
var audio = new window.Audio('gostone.m4a')
