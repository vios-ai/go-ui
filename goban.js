// Go game and goban model and canvas drawing.
// (c)2017,2018 All Rights Reserved by Laurent Demailly

var Stones = {
  EMPTY: 0, // evaluates to false
  BLACK: 1,
  WHITE: 2
}

var DEBUG = false
var VERSION = '0.3.5' // Don't we love caching issues...

// Class encapsulating the logic for a Go Game (valid games, capture, history
// sgf import/export, etc...)
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
    this.nextMove = Stones.BLACK
    this.nextGid = [0, Stones.BLACK, Stones.WHITE]
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
      return new Set()
    }
    return this.liberties[p]
  }

  // TODO this doesn't do neutral quite right
  Score () {
    var score = [new Set(), new Set(), new Set()]
    var toVisit = []
    var seen = new Set()
    // First pass... from the existing groups starting with the next color
    var nextTurn = this.NextTurn()
    console.log('nextTurn', nextTurn)
    for (var t = 0; t < 2; t++) {
      var offset = (t + nextTurn) % 2 // do all next turn player groups first
      console.log('offset', t, offset)
      for (var idx = offset; idx < this.groups.length; idx += 2) {
        var g = this.groups[idx]
        if (!g) {
          continue
        }
        console.log('processing score for gid', idx)
        var color = GoGame.ThisColor(idx)
        var otherColor = GoGame.OtherColor(color)
        for (var j = 0; j < g.length; j++) {
          score[color].add(g[j])
        }
        for (var l of this.liberties[idx]) {
          if (seen.has(l)) {
            // already classified spot
            continue
          }
          seen.add(l)
          var n = this.Neighbors(l)
          if (n.types[otherColor].size) {
            score[Stones.EMPTY].add(l)
            toVisit.push({p: l, c: Stones.EMPTY})
          } else {
            score[color].add(l)
            toVisit.push({p: l, c: color})
          }
        }
      }
    }
    // Then 'recursively' from each seen
    while (toVisit.length > 0) {
      var cur = toVisit.shift()
      n = this.Neighbors(cur.p)
      for (l of n.types[Stones.EMPTY]) {
        if (seen.has(l)) {
          continue
        }
        seen.add(l)
        score[cur.c].add(l)
        toVisit.push({p: l, c: cur.c})
      }
    }
    return score
  }

  static PosToLetter (i) {
    if (i >= 8) {
      i++ // skip I
    }
    return String.fromCharCode(65 + i)
  }

  // Extra when talking about next move or rolled back move, otherwise using
  // last move # from history.
  UserCoordLong (i, j, color, extra = 0) {
    return '#' + (this.history.length + extra) + ' ' + ((color === Stones.WHITE) ? 'w ' : 'b ') + this.UserCoord(i, j)
  }

  UserCoord (i, j) {
    return GoGame.PosToLetter(i) + (this.n - j)
  }

  NextMove () {
    return this.nextMove++
  }

  static IsPass (i, j) {
    return (i === -1) && (j === -1)
  }

  Pass (move, stone) {
    if (stone === Stones.EMPTY) {
      // this is just erasing a pass
      return
    }
    this.history.push({
      x: -1,
      y: -1,
      color: stone,
      move: move,
      prev: null
    })
  }

  // whose turn is it ?
  NextTurn () {
    var l = this.history.length
    if (l === 0) {
      return Stones.BLACK
    }
    var lastColor = this.history[l - 1].color
    return GoGame.OtherColor(lastColor)
  }

  // Returns true if move is valid/placed, false otherwise.
  // Always succeeds for Stones.EMPTY which clears the position.
  Play (i, j, stone) {
    return this.Move(i, j, stone, this.NextMove())
  }

  Move (i, j, stone, move) {
    this.hascapture = false
    if (GoGame.IsPass(i, j)) {
      this.Pass(move, stone)
      return true
    }
    if (this.OutOfBounds(i, j)) {
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
    /*
    if (move && (stone !== GoGame.ThisColor(move))) {
      console.log('Wrong color for the turn ' + this.UserCoordLong(i, j, stone, 1) + ' ' + i + ' ' + j + ' ' + stone)
      this.nextMove--
      return false
    }
    */
    this.history.push({
      x: i,
      y: j,
      color: stone,
      move: move,
      undo: Stones.EMPTY
    })
    var gid = this.Update(i, j, p, stone, move)
    var suicide = this.RemoveLiberty(gid, p)
    if (this.HasCapture()) {
      this.history[this.history.length - 1].undo = -1 // capture not simple undo
    }
    if (suicide) {
      console.log('Illegal suicide at ' + this.UserCoordLong(i, j, stone))
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

  // Last move requires a redraw (gid change or capture)
  LastMoveIsComplex () {
    var l = this.history.length - 1
    if (l < 0) {
      return false
    }
    return (this.history[l].undo !== -1)
  }

  NextGid (stone) {
    if (this.nextGid[Stones.WHITE] < this.nextGid[Stones.BLACK] - 1) {
      this.nextGid[Stones.WHITE] = this.nextGid[Stones.BLACK] - 1
    }
    if (this.nextGid[Stones.BLACK] < this.nextGid[Stones.WHITE] - 1) {
      this.nextGid[Stones.BLACK] = this.nextGid[Stones.WHITE] - 1
    }
    var res = this.nextGid[stone]
    this.nextGid[stone] += 2
    return res
  }

  Update (i, j, p, stone) {
    var gid = this.NextGid(stone)
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
    var merge = n.types[stone].size
    for (g of n.types[stone]) {
      gid = this.Merge(g, gid)
    }
    console.log(this.UserCoordLong(i, j, stone) +
      ' merge# ' + merge + ' -> gid ' + gid + ' liberties=' + this.liberties[gid].size)
    if (merge >= 1) {
      // Mark this move as creating a merge (need refresh and special undo)
      this.history[this.history.length - 1].undo = -1
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
    if (pos.move) {
      this.nextMove--
    }
    this.nextGid[pos.color] -= 2
    if (pos.undo === -1) {
      // there was a multi merge or capture... let's replay everything brute force
      this.ReplayHistory()
    } else {
      // no merge so we just need to erase that stone or put back a stone
      // and delete the group/liberty
      // TODO restore single merge optimization while making score work after undo
      if (!GoGame.IsPass(pos.x, pos.y)) {
        this.board[this.c2idx(pos.x, pos.y)] = pos.undo
        delete this.groups[pos.move]
        delete this.liberties[pos.move]
      }
    }
    return true
  }

  ReplayHistory () {
    var h = this.history
    console.log('Replay all')
    this.Reset()
    for (var i = 0; i < h.length; i++) {
      var pos = h[i]
      this.Move(pos.x, pos.y, pos.color, pos.move)
      if (pos.move) {
        this.nextMove = pos.move + 1
      }
    }
  }

  static PosToSgfCoord (pos) {
    return '[' + String.fromCharCode(97 + pos.x, 97 + pos.y) + ']'
  }

  static ColorToSgfColor (color) {
    return (color === Stones.WHITE) ? 'W' : 'B'
  }

  // SGF format black/white move
  static SgfMove (res, prev, pos) {
    if (pos.move === 0) {
      if (!prev || prev.move !== 0 || prev.color !== pos.color) {
        if (prev) {
          res += ';'
        }
        res += 'A' + GoGame.ColorToSgfColor(pos.color)
      }
      res += GoGame.PosToSgfCoord(pos)
      return res
    }
    res += ';' + GoGame.ColorToSgfColor(pos.color)
    if (GoGame.IsPass(pos.x, pos.y)) {
      // pass
      res += '[]' // or "tt" as used for 19x19 pass by many
    } else {
      res += GoGame.PosToSgfCoord(pos)
    }
    res += '\n'
    return res
  }

  SgfToCoord (color, sgfCoord) {
    var n = this.n
    return sgfCoord.split('[').map(function (val) {
      var x = val.charCodeAt(0) - 97
      var y = val.charCodeAt(1) - 97
      if (sgfCoord === ']' || (n <= 19 && sgfCoord === 'tt]')) {
        x = y = -1 // it's a pass
      }
      return {
        x,
        y,
        color
      }
    })
  }

  // Parse back to our coords/colors
  SgfToPos (allmatch, sgfColor, sgfCoord) {
    var play = true
    if (sgfColor[0] === 'A') {
      sgfColor = sgfColor[1]
      play = false
    } else {
      // deal with case where the B/W is not a move but the player name:
      // (ie in the header, without a semi colon)
      if (!allmatch.includes(';')) {
        return {
          play,
          moves: []
        }
      }
    }
    var color = (sgfColor === 'W' ? Stones.WHITE : Stones.BLACK)
    return {
      play,
      moves: this.SgfToCoord(color, sgfCoord)
    }
  }

  // Returns game history in basic SGF format
  Save () {
    var res = '(;FF[4]GM[1]SZ[' + this.n + ']AP[vios.ai jsgo:' + VERSION + ']\n'
    var prev
    for (var i = 0; i < this.history.length; i++) {
      var pos = this.history[i]
      res = GoGame.SgfMove(res, prev, pos)
      prev = pos
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
    if (!/\(.*;.*FF\[[1-5]\]/.exec(sgf)) {
      console.log("Invalid SGF, can't find '(;FF[1-5]' file format header", sgf)
      return false
    }
    // Stop at the first variant/mainline:
    // first get rid of ) that are inside [] so we don't stop because of a smiley in a comment
    sgf = sgf.replace(/(\[[^\]]*)\)([^\]]*\])/g, '$1$2')
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
    // console.log('sgf', sgf)
    var re = /[\];\r\n\t ]*(A?[BW])((\[[a-z]*\])+)/g
    for (var m; (m = re.exec(sgf));) {
      // console.log('match:', m)
      var positions = this.SgfToPos(m[0], m[1], m[2].substring(1)) // skip first [
      // console.log('moves:', positions.play, positions.moves)
      for (var i = 0; i < positions.moves.length; i++) {
        var pos = positions.moves[i]
        if (!this.Move(pos.x, pos.y, pos.color, positions.play ? this.NextMove() : 0)) {
          console.log('Aborting load: unexpected illegal move at ' +
              this.UserCoordLong(pos.x, pos.y, pos.color, 1) + ' sgf: ' + m[0])
          return true
        }
      }
    }
    // If the SGF says it's white turn and it's not
    var pl = /PL\[W\]/.exec(sgf)
    if (pl && this.NextTurn !== Stones.WHITE) {
      this.Pass(0, Stones.BLACK)
    }
    return true
  }
}

//  ----------- UI / Drawing ------------

// TODO: how to fix "not used" standard lint
class GoBan { // eslint-disable-line no-unused-vars
  constructor (size = 19) {
    this.g = new GoGame(size)
    this.withCoordinates = true
    this.withSounds = true
    this.withLastMoveHighlight = false
    this.withMoveNumbers = false
    this.withGroupNumbers = true
    this.withAutoSave = true
    this.withMouseMove = true
    this.cursorI = -1
    this.cursorJ = -1
    this.underCursor = Stones.EMPTY
    this.mode = 'P' // Normal play
    this.ui = true
  }

  SetMode (mode) {
    this.mode = mode
  }

  // forward to Game object
  get n () {
    return this.g.n
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
    this.ctx.textAlign = 'right'
    this.ctx.fillText('B ' + this.g.captured[Stones.BLACK] + ', W ' + this.g.captured[Stones.WHITE],
      this.posToCoord(this.n - 0.1), this.posToCoord(-0.7))
    this.ctx.font = '' + this.sz1 * 0.3 + 'px Arial'
    this.ctx.textAlign = 'right'
    this.ctx.fillText('vios.ai ' + VERSION, this.posToCoord(this.n - 0.1), this.posToCoord(this.n - 0.1))
  }

  drawLibertyCount (color, n) {
    this.drawTransientText(((color === Stones.WHITE) ? 'White' : 'Black') + ': ' + n +
      ' libert' + ((n > 1) ? 'ies.' : 'y. atari!'))
  }

  drawTransientText (txt) {
    this.ctx.font = '' + this.sz1 * 0.3 + 'px Arial'
    this.ctx.fillStyle = 'purple'
    this.ctx.textAlign = 'left'
    this.ctx.fillText(txt, this.posToCoord(-0.9), this.posToCoord(this.n - 0.1))
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
    var l = this.g.history.length
    if ((!this.withLastMoveHighlight) || (l === 0)) {
      return
    }
    var lastMove = this.g.history[l - 1]
    if (this.OutOfBounds(lastMove.x, lastMove.y)) {
      return
    }
    var highlight = this.HighlightColor(lastMove.color)
    this.drawHighlight(highlight, lastMove.x, lastMove.y)
  }

  drawHighlight (color, i, j, width = 2, rs = this.stoneRadius * 0.6, len = rs / 3) {
    var ctx = this.ctx
    ctx.beginPath()
    ctx.strokeStyle = color
    ctx.lineWidth = width
    var x = this.posToCoord(i)
    var y = this.posToCoord(j)
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
    var l = this.g.history.length
    if ((!this.withLastMoveHighlight) || (l <= 1)) {
      return
    }
    var lastMove = this.g.history[l - 2]
    this.drawStone(lastMove.x, lastMove.y, lastMove.color, l - 1)
  }

  RecordMove (x, y, color) {
    if (!this.g.Move(x, y, this.BlackOrWhite(color), (this.mode === 'P' ? this.g.NextMove() : 0))) {
      return false
    }
    this.RemoveHighlight()
    this.drawStone(x, y, color, this.g.history.length, this.withLastMoveHighlight)
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
      if (GoGame.IsPass(i, j)) {
        if (DEBUG) {
          console.log('Skipping pass move')
        }
      } else {
        console.log('Skipping OOB ' + i + ' ' + j)
      }
      return
    }
    var what = this.At(i, j)
    if (!what) {
      if (DEBUG) {
        console.log('Skipping removed stone ' + i + ' ' + j)
      }
      return
    }
    if (this.underCursor && this.withGroupNumbers && what === this.underCursor) {
      this.drawStoneNC(i, j, color, num, true)
      this.drawHighlight(this.HighlightColor(color), i, j)
    } else {
      this.drawStoneNC(i, j, color, num, skipHighlight)
    }
  }

  // No Check draw
  drawStoneNC (i, j, color, num, skipHighlight, highlight = this.HighlightColor(color)) {
    var x = this.posToCoord(i)
    var y = this.posToCoord(j)
    var ctx = this.ctx
    ctx.lineWidth = 0.5
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
    if (this.withGroupNumbers) {
      num = this.At(i, j)
    }
    if (num && (this.withMoveNumbers || this.withGroupNumbers)) {
      ctx.fillStyle = highlight
      ctx.textAlign = 'center'
      // checked it fits with highlight and 399
      var fontSz = Math.round(this.sz1 * 0.35 * 10) / 10
      ctx.font = '' + fontSz + 'px Arial'
      ctx.fillText('' + num, x, y + fontSz / 3)
    }
    ctx.beginPath()
    ctx.strokeStyle = 'grey'
    ctx.arc(x, y, this.stoneRadius, 0, 2 * Math.PI)
    ctx.stroke()
  }

  drawLiberty (p) {
    var [i, j] = this.g.idx2c(p)
    var x = this.posToCoord(i)
    var y = this.posToCoord(j)
    var ctx = this.ctx
    ctx.lineWidth = this.stoneRadius / 5
    ctx.strokeStyle = 'rgba(128, 0, 128, 0.75)' // purple + alpha
    ctx.beginPath()
    ctx.arc(x, y, this.stoneRadius / 4, 0, 2 * Math.PI)
    ctx.stroke()
  }

  drawScore (p, color) {
    var [i, j] = this.g.idx2c(p)
    var x = this.posToCoord(i)
    var y = this.posToCoord(j)
    var ctx = this.ctx
    ctx.fillStyle = color
    ctx.beginPath()
    var delta = this.stoneRadius / 3
    ctx.fillRect(x - delta, y - delta, 2 * delta, 2 * delta)
  }

  // internal utility for coord -> pixels translation
  posToCoord (x) {
    return this.delta + x * this.sz1
  }
  // inverse of above
  coordToPos (x) {
    return (x - this.delta) / this.sz1
  }

  // Draw the main board on the given canvas
  Draw (c, scale = 24) {
    this.sz1 = scale
    this.stoneRadius = scale / 2 - 0.5
    if (!this.canvas) {
      // First time, setup listener
      var self = this
      c.addEventListener('mousedown', function (event) {
        self.clickPosition(event)
      })
      c.addEventListener('mouseleave', function (event) {
        self.withLastMoveHighlight = false
        self.scoreShown = false
        self.updateCursor(-1, -1)
        self.Redraw()
      })
      c.addEventListener('mouseenter', function (event) {
        self.withLastMoveHighlight = true
        self.scoreShown = false
        self.Redraw()
      })
      c.addEventListener('mousemove', function (event) {
        self.mouseMove(event)
      })
      this.canvas = c
    }
    this.Redraw()
  }

  updateCursor (x, y) {
    var i = Math.round(x)
    var j = Math.round(y)
    this.cursorI = i
    this.cursorJ = j
    this.underCursor = this.At(i, j)
  }

  mouseMove (event) {
    var x = this.coordToPos(event.offsetX)
    var y = this.coordToPos(event.offsetY)
    this.updateCursor(x, y)
    if (this.withMouseMove) {
      if (this.scoreShown) {
        this.Score(false)
      } else {
        this.Redraw()
      }
      this.drawMouse(x, y, this.scoreShown)
    }
  }

  drawText (x, y, color1, color2, txt) {
    this.ctx.font = '' + this.sz1 * 0.3 + 'px Arial'
    this.ctx.fillStyle = color1
    this.ctx.textAlign = 'center'
    var xx = this.posToCoord(x)
    var yy = this.posToCoord(y + 0.1)
    if (color2) {
      this.ctx.lineWidth = 4
      this.ctx.strokeStyle = color2
      this.ctx.strokeText(txt, xx, yy)
    }
    this.ctx.fillText(txt, xx, yy)
  }

  NextColor () {
    switch (this.mode) {
      case 'B':
        return Stones.BLACK
      case 'W':
        return Stones.WHITE
      default: // normal P play mode
        return this.g.NextTurn()
    }
  }

  IsCorner () {
    if (GoGame.IsPass(this.cursorI, this.cursorJ)) {
      return 'TL'
    }
    if ((this.cursorI === -1) && (this.cursorJ === this.n)) {
      return 'BL'
    }
    if ((this.cursorI === this.n) && (this.cursorJ === -1)) {
      return 'TR'
    }
    if ((this.cursorI === this.n) && (this.cursorJ === this.n)) {
      return 'BR'
    }
    return null
  }

  OnLastMove () {
    if (this.OutOfBounds()) {
      return false
    }
    var l = this.g.history.length
    if (l === 0) {
      return false
    }
    var pos = this.g.history[l - 1]
    return (pos.x === this.cursorI) && (pos.y === this.cursorJ)
  }

  drawMouse (x, y, forceHighlight = false) {
    var color = this.NextColor()
    var highlight = GoGame.OtherColor(color)
    switch (this.IsCorner()) {
      case 'TL':
        return this.drawText(x, y, this.Color(color), this.Color(highlight), 'pass')
      case 'BL':
        return this.drawText(x, y, 'purple', null, this.ui ? 'UI off' : 'UI on')
      case 'TR':
        return this.drawText(x, y, 'purple', null, 'Score')
      case 'BR':
        return this.drawText(x, y, 'purple', null, 'Info')
    }
    if (this.OnLastMove()) {
      return this.drawText(x, y, this.Color(highlight), this.Color(color), 'Undo')
    }
    if (forceHighlight || this.OutOfBounds() || !this.Empty()) {
      this.drawHighlight(this.Color(highlight), x, y, 5, 6, 5)
      this.drawHighlight(this.Color(color), x, y, 3, 5, 3)
    } else {
      this.drawStoneNC(x, y, this.Color(color, 0.5), 0, false, this.Color(highlight, 0.7))
    }
  }

  Score (clicked = false) {
    if (clicked && this.scoreShown) {
      this.scoreShown = false
      return this.Redraw()
    }
    this.scoreShown = true
    var savedSettingG = this.withGroupNumbers
    var savedSettingN = this.withMoveNumbers
    this.withGroupNumbers = false
    this.withMoveNumbers = false
    this.withLastMoveHighlight = false
    this.Redraw()
    var s = this.g.Score()
    this.drawTransientText('Territory: B ' + s[Stones.BLACK].size + ', W ' + s[Stones.WHITE].size + ' (neutral ' + s[Stones.EMPTY].size + ')')
    for (var c = Stones.EMPTY; c <= Stones.WHITE; c++) {
      var color
      if (c) {
        color = this.Color(c, 0.8)
      } else {
        color = 'rgba(20,20, 255, 0.5)'
      }
      for (var p of s[c]) {
        this.drawScore(p, color)
      }
    }
    this.withGroupNumbers = savedSettingG
    this.withMoveNumbers = savedSettingN
    this.withLastMoveHighlight = true
  }

  Info () {
    window.open('http://vios.ai/', '_blank')
  }

  ToggleUI () {
    var elements = document.getElementsByClassName('ui')
    var vis
    if (this.ui) {
      this.ui = false
      this.withCoordinates = false
      this.savedMoveNumbersSetting = this.withMoveNumbers
      this.withMoveNumbers = false
      this.savedGroupNumbersSetting = this.withGroupNumbers
      this.withGroupNumbers = false
      vis = 'none'
    } else {
      this.ui = true
      this.withCoordinates = true
      this.withMoveNumbers = this.savedMoveNumbersSetting
      this.withGroupNumbers = this.savedGroupNumbersSetting
      vis = 'inline'
    }
    for (var i = 0; i < elements.length; i++) {
      elements[i].style.display = vis
    }
    if (!resizeHandler()) { // eslint-disable-line no-undef
      this.Redraw()
    }
  }

  clickPosition (event) {
    var x = this.coordToPos(event.offsetX)
    var y = this.coordToPos(event.offsetY)
    this.updateCursor(x, y)
    if (this.OnLastMove()) {
      this.g.Undo()
      this.scoreShown = false
      this.updateCursor(x, y)
      this.Redraw()
      this.drawMouse(x, y)
      return
    }
    switch (this.IsCorner()) {
      case 'BL':
        return this.ToggleUI()
      case 'BR':
        return this.Info()
      case 'TR':
        return this.Score(true)
    }
    this.scoreShown = false
    var color = this.NextColor()
    var coord = this.g.UserCoord(this.cursorI, this.cursorJ)
    if (this.RecordMove(this.cursorI, this.cursorJ, color)) {
      this.underCursor = this.At(this.cursorI, this.cursorJ)
      if (this.withMouseMove || this.g.LastMoveIsComplex() || this.withGroupNumbers) {
        this.Redraw()
        // this.drawMouse(x, y, true)
      }
      console.log('Valid move #' + this.g.history.length + ' at ' + coord + ' for ' + color)
      if (this.withSounds) {
        // Only load sound if needed/used
        if (!audio) {
          // Stone sound (c)2017 All Rights Reserved by Laurent Demailly
          audio = new window.Audio('gostone.m4a')
        }
        window.setTimeout(playSound)
      }
      if (this.withAutoSave) {
        window.localStorage.setItem('sgf-autoSave', this.g.Save())
      }
    } else {
      if (this.withMouseMove) {
        this.Redraw()
        this.drawMouse(x, y, true)
      }
      if (!this.OutOfBounds() && (!this.withGroupNumbers || this.Empty())) {
        this.drawTransientText('Invalid move ' + coord)
      }
      console.log('Invalid move ' + coord)
    }
  }

  Redraw () {
    if (DEBUG) {
      console.log('Redraw called')
      console.trace()
    }
    var offset = this.sz1
    this.gobanSz = (this.n + 1) * this.sz1
    if (this.ui) {
      this.delta = this.sz1 * 1.5
    } else {
      this.delta = this.sz1
      offset = 0
    }
    var c = this.canvas
    var ctx = c.getContext('2d')
    ctx.clearRect(0, 0, c.width, c.height)
    // Deal with pixel density (retina etc)
    var scale = window.devicePixelRatio
    var initialSz = this.gobanSz + offset
    c.style.width = initialSz + 'px'
    c.style.height = initialSz + 'px'
    c.width = initialSz * scale
    c.height = initialSz * scale
    ctx.scale(scale, scale)
    if (DEBUG) {
      console.log('Scale is ', scale, ' sz ', initialSz, ' canvas ', this.canvas)
    }
    // TODO: figure out new sharpness magic offset with devicePixelRatio
    // this.delta += 1 / scale / 2
    /*
    if ((scale * this.delta - 0.5) !== Math.floor(scale * this.delta)) {
      // need 0.5 to look sharp/black instead of grey
      this.delta += 0.5 / scale
    }
    */
    this.ctx = ctx
    ctx.fillStyle = 'moccasin'
    ctx.fillRect(offset / 2, offset / 2, this.gobanSz, this.gobanSz)
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
    var len = this.g.history.length - 1

    var underCursor
    if (this.withGroupNumbers && !this.OutOfBounds()) {
      underCursor = this.underCursor
    }

    // TODO: if history is longer than maybe 1/2 of the board, maybe faster to use the board instead of replaying from first move
    for (i = 0; i <= len; i++) {
      var skipHighlight = (i === len && this.withLastMoveHighlight && !underCursor) // for the last move
      var pos = this.g.history[i]
      this.drawStone(pos.x, pos.y, pos.color, pos.move, skipHighlight)
    }
    if (underCursor) {
      i = 0
      for (var l of this.g.Liberties(this.cursorI, this.cursorJ)) {
        this.drawLiberty(l)
        i++
      }
      this.drawLibertyCount(GoGame.ThisColor(underCursor), i)
    } else {
      this.AddHighlight()
    }
  }

  // Forwards to Game object:

  Undo () {
    if (this.g.Undo()) {
      this.Redraw()
    }
  }

  Resize (n) {
    if (this.n === n) {
      return // noop
    }
    this.g.n = n
    this.g.ReplayHistory()
  }

  OutOfBounds (i = this.cursorI, j = this.cursorJ) {
    return this.g.OutOfBounds(i, j)
  }
  Empty (i = this.cursorI, j = this.cursorJ) {
    return this.g.Empty(i, j)
  }
  At (i, j) {
    return this.g.At(i, j)
  }
  Load (sgf) {
    return this.g.Load(sgf)
  }
  Save () {
    return this.g.Save()
  }
}

var audio

function playSound () {
  audio.play()
}
