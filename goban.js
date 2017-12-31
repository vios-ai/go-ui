// Go game and goban model and canvas drawing.
// (c)2017 All Rights Reserved by Laurent Demailly

var Stones = {
  EMPTY: 0, // evaluates to false
  BLACK: 1,
  WHITE: 2,
};

// Logic
class GoGame {

  constructor(size) {
    this.n = size
    this.Reset()
  }

  Reset() {
    this.history = [];
    this.board = new Array(this.n * this.n)
    this.groups = [];
    this.liberties = []; // matches the group
  }

  c2idx(i, j) {
    return i * this.n + j
  }

  Liberties(i, j) {
    var p = this.At(i, j)
    if (!p) {
      return "x"
    }
    return this.liberties[p].size
  }
  // Returns true if move is valid/placed, false otherwise.
  // Always succeeds for Stones.EMPTY which clears the position.
  Place(i, j, stone, checkoob = true) {
    if (checkoob && this.OutOfBounds(i, j)) {
      return false
    }
    var p = this.c2idx(i, j)
    if (stone == Stones.EMPTY) {
      this.board[p] = stone;
      return true
    }
    if (this.board[p]) {
      return false
    }
    this.history.push({
      x: i,
      y: j,
      color: stone,
      merged: false,
    })
    this.board[p] = this.GetGid(i, j, p, stone)
    return true
  }

  RemoveLiberty(from, which) {
    this.liberties[from].delete(which)
    if (this.liberties[from].size == 0) {
      // last liberty is gone, delete this group
      this.DeleteGroup(from)
    }
  }

  DeleteGroup(gid) {
    var g = this.groups[gid]
    for (var i = 0; i < g.length; i++) {
      var p = g[i]
      this.board[p] = Stones.EMPTY
      // TODO: add liberties back to neighbors
      // TODO: repaint
    }
  }

  LastMoveMergedGroups() {
    var l = this.history.length - 1;
    if (l < 0) {
      return false;
    }
    return this.history[l].merged
  }

  // TODO: refactor, ugly
  GetGid(i, j, p, stone) {
    var gid = this.history.length
    var merge = 0
    var liberties = new Set()
    if (i > 0) {
      var pp = this.c2idx(i - 1, j)
      var left = this.board[pp]
      if (!left) {
        liberties.add(pp)
      } else {
        if (GoGame.SameColor(left, stone)) {
          gid = left
          merge++
        } else {
          // opposite group; let's remove this liberty
          this.RemoveLiberty(left, p);
        }
      }
    }
    if (i < this.n - 1) {
      var pp = this.c2idx(i + 1, j)
      var right = this.board[pp]
      if (!right) {
        liberties.add(pp)
      } else {
        if (!GoGame.SameColor(right, stone)) {
          this.RemoveLiberty(right, p);
        } else {
          // make sure we don't create an infinite loop by merging with oneself
          if (right != gid) {
            if (merge) {
              gid = this.Merge(gid, right)
            } else {
              gid = right
            }
            merge++
          }
        }
      }
    }
    if (j > 0) {
      var pp = this.c2idx(i, j - 1)
      var top = this.board[pp]
      if (!top) {
        liberties.add(pp)
      } else {
        if (!GoGame.SameColor(top, stone)) {
          this.RemoveLiberty(top, p);
        } else {
          if (top != gid) {
            if (merge) {
              gid = this.Merge(gid, top)
            } else {
              gid = top
            }
            merge++
          }
        }
      }
    }
    if (j < this.n - 1) {
      var pp = this.c2idx(i, j + 1)
      var bottom = this.board[pp]
      if (!bottom) {
        liberties.add(pp)
      } else {
        if (!GoGame.SameColor(bottom, stone)) {
          this.RemoveLiberty(bottom, p);
        } else {
          if (bottom != gid) {
            if (merge) {
              gid = this.Merge(gid, bottom)
            } else {
              gid = bottom
            }
            merge++
          }
        }
      }
    }
    console.log("Merged " + merge + " -> " + gid + " liberties=" + liberties.size)
    if (!merge) {
      this.groups[gid] = [p]
      this.liberties[gid] = liberties
    } else {
      this.groups[gid].push(p)
      for (var v of liberties) {
        this.liberties[gid].add(v)
      }
      this.RemoveLiberty(gid, p); // TODO: if this is suicide, it's illegal
      if (merge > 1) {
        // Mark this move as creating a merge (need refresh and special undo)
        this.history[this.history.length - 1].merged = true
      }
    }
    return gid
  }

  Merge(gid1, gid2) {
    if (gid1 == gid2) {
      console.log("BUG!!! same gid " + gid1)
      return "BUG"
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

  static SameColor(s1, s2) {
    return (s1 > 0 && s2 > 0) && (s1 % 2 == s2 % 2)
  }

  // Are the coordinates out of bound ?
  OutOfBounds(i, j) {
    return (i < 0 || j < 0 || i >= this.n || j >= this.n)
  }
  // Is that position empty.
  Empty(i, j) {
    return !At(i, j)
  }
  At(i, j) {
    return this.board[this.c2idx(i, j)]
  }
  Undo() {
    var l = this.history.length
    if (l == 0) {
      return false
    }
    l--
    var pos = this.history[l]
    this.history.length = l // truncate
    if (pos.merged) {
      // there was a multi merge... let's replay everything brute force
      this.ReplayHistory()
    } else {
      // no multi merge so we just need to erase that stone
      this.Place(pos.x, pos.y, Stones.EMPTY)
    }
    return true
  }

  ReplayHistory() {
    var h = this.history
    console.log("Replay all")
    this.Reset();
    for (var i = 0; i < h.length; i++) {
      var pos = h[i]
      this.Place(pos.x, pos.y, pos.color, false /* don't check oob, for resize */ )
    }
  }
}


// UI / Drawing
class GoBan extends GoGame {
  constructor(size = 19) {
    super(size)
    this.withCoordinates = true
    this.withSounds = true
    this.withLastMoveHighlight = false
    this.withMoveNumbers = true
    this.withGroupNumbers = false
  }
  // Draw 1 hoshi (star point) at x,y
  hoshi(x, y) {
    var ctx = this.ctx
    ctx.fillStyle = "black";
    ctx.beginPath();
    ctx.arc(this.posToCoord(x), this.posToCoord(y), 2.5, 0, 2 * Math.PI);
    ctx.fill();
  }

  // Draw all the hoshis
  drawHoshis() {
    var mid = (this.n - 1) / 2
    this.hoshi(mid, mid)
    var h = 3
    if (this.n < 13) {
      var h = 2
    }
    var g = this.n - h - 1;
    this.hoshi(h, h)
    this.hoshi(g, h)
    this.hoshi(h, g)
    this.hoshi(g, g)
    if (this.n > 13) {
      this.hoshi(h, mid)
      this.hoshi(g, mid)
      this.hoshi(mid, h)
      this.hoshi(mid, g)
    }
  }

  posToLetter(i) {
    if (i >= 8) {
      i++ // skip I
    }
    return String.fromCharCode(65 + i)
  }

  drawCoordinates() {
    this.ctx.font = "bold " + this.sz1 * .38 + "px Arial"
    this.ctx.fillStyle = "DimGray"
    for (var i = 0; i < this.n; i++) {
      var num = "" + (this.n - i)
      this.ctx.fillText(num, this.posToCoord(-1.51), this.posToCoord(i + .1))
      this.ctx.fillText(num, this.posToCoord(this.n + .08), this.posToCoord(i + .15))
      var letter = this.posToLetter(i)
      this.ctx.fillText(letter, this.posToCoord(i - 0.1), this.posToCoord(this.n + 0.35))
      this.ctx.fillText(letter, this.posToCoord(i - 0.1), this.sz1 / 3)
    }
  }

  AddHighlight() {
    var l = this.history.length
    if ((!this.withLastMoveHighlight) || (l == 0)) {
      return
    }
    var lastMove = this.history[l - 1]
    if (this.OutOfBounds(lastMove.x, lastMove.y)) {
      return
    }
    var highlight = this.HighlightColor(lastMove.color)
    var ctx = this.ctx
    ctx.beginPath();
    ctx.strokeStyle = highlight;
    ctx.lineWidth = 2;
    var rs = this.stoneRadius * .6
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
    ctx.stroke();
  }

  RemoveHighlight() {
    // We remove highlight on the one before last
    var l = this.history.length;
    if ((!this.withLastMoveHighlight) || (l <= 1)) {
      return
    }
    var lastMove = this.history[l - 2]
    this.drawStone(lastMove.x, lastMove.y, lastMove.color, l - 1)
  }

  RecordMove(x, y, color) {
    if (!this.Place(x, y, color)) {
      return false
    }
    this.RemoveHighlight();
    this.drawStone(x, y, color, this.history.length, this.withLastMoveHighlight);
    this.AddHighlight();
    return true
  }

  Color(color) {
    if (color == Stones.WHITE) {
      return "white"
    }
    if (color == Stones.BLACK) {
      return "black"
    }
    return color
  }

  HighlightColor(color) {
    if (color == "white" || color == Stones.WHITE) {
      return "black"
    } else {
      return "white"
    }
  }

  drawStone(i, j, color, num, skipHighlight = false) {
    if (this.OutOfBounds(i, j)) {
      console.log("Skipping OOB " + i + " " + j)
      return
    }
    var x = this.posToCoord(i);
    var y = this.posToCoord(j);
    var highlight = this.HighlightColor(color)
    var ctx = this.ctx
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.fillStyle = this.Color(color);
    ctx.arc(x, y, this.stoneRadius, 0, 2 * Math.PI);
    ctx.fill();
    if (!skipHighlight) {
      ctx.beginPath();
      ctx.strokeStyle = highlight;
      ctx.arc(x, y, this.stoneRadius * .7, 0.15, Math.PI / 2 - .15);
      ctx.stroke();
    }
    if (num && (this.withMoveNumbers || this.withGroupNumbers)) {
      ctx.fillStyle = highlight;
      ctx.textAlign = "center";
      // checked it fits with highlight and 399
      var fontSz = Math.round(this.sz1 * .35 * 10) / 10
      ctx.font = "" + fontSz + "px Arial";
      if (this.withGroupNumbers) {
        num = "" + this.At(i, j) + "," + this.Liberties(i, j)
      }
      ctx.fillText("" + num, x, y + fontSz / 3);
    }
    ctx.beginPath();
    ctx.strokeStyle = "grey"
    ctx.arc(x, y, this.stoneRadius, 0, 2 * Math.PI);
    ctx.stroke();
  }

  // internal utility for coord -> pixels translation
  posToCoord(x) {
    // need 0.5 to look sharp/black instead of grey
    return 0.5 + this.delta + x * this.sz1;
  }
  // inverse of above
  coordToPos(x) {
    return Math.round((x - 0.5 - this.delta) / this.sz1);
  }

  // Draw the main board on the given canvas
  Draw(c, scale = 24) {
    this.sz1 = scale;
    this.stoneRadius = scale / 2 - .5;
    this.gobanSz = (this.n + 1) * scale
    this.delta = scale * 1.5;
    if (!this.canvas) {
      // First time, setup listener
      var self = this
      c.addEventListener("mousedown", function(event) {
        self.clickPosition(event);
      });
      c.addEventListener("mouseleave", function(event) {
        self.withLastMoveHighlight = false;
        self.Redraw();
      });
      c.addEventListener("mouseenter", function(event) {
        self.withLastMoveHighlight = true;
        self.Redraw();
      });
      this.canvas = c;
    }
    this.Redraw()
  }

  clickPosition(event) {
    var x = event.offsetX
    var y = event.offsetY
    var i = this.coordToPos(x)
    var j = this.coordToPos(y)
    var color = (this.history.length % 2 == 0) ? Stones.BLACK : Stones.WHITE;
    if (this.RecordMove(i, j, color)) {
      if ( /*this.LastMoveMergedGroups() && */ this.withGroupNumbers) {
        this.Redraw()
      }
      console.log("Valid move #" + this.history.length + " at " + i + " , " + j + " for " + this.Color(color))
      if (this.withSounds) {
        audio.play();
      }
    } else {
      console.log("Invalid move " + i + " , " + j)
    }
  }

  Redraw() {
    var c = this.canvas
    var ctx = c.getContext("2d");
    ctx.clearRect(0, 0, c.width, c.height);
    c.height = this.gobanSz + this.sz1;
    c.width = this.gobanSz + this.sz1;
    this.ctx = ctx;
    ctx.fillStyle = "moccasin";
    ctx.fillRect(this.sz1 / 2, this.sz1 / 2, this.gobanSz, this.gobanSz);
    ctx.fillStyle = "black";
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
    var len = this.history.length - 1
    for (var i = 0; i <= len; i++) {
      var skipHighlight = (i == len && this.withLastMoveHighlight) // for the last move
      this.drawStone(this.history[i].x, this.history[i].y, this.history[i].color, i + 1, skipHighlight)
    }
    this.AddHighlight();
  }

  Undo() {
    if (super.Undo()) {
      this.Redraw()
    }
  }

  Resize(n) {
    if (this.n == n) {
      return // noop
    }
    this.n = n
    this.ReplayHistory()
  }

}

// Stone sound (c)2017 All Rights Reserved by Laurent Demailly
var audio = new Audio('gostone.m4a');
