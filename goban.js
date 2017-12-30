// Creates a goban of the requested size - each of the size lines are seperated
// by scale pixels.
// (c)2017 All Rights Reserved by Laurent Demailly
function GoBan(size = 19, scale = 24) {
  this.n = size;
  this.sz1 = scale;
  this.stoneRadius = scale / 2 - .5;
  this.gobanSz = (size + 1) * scale
  this.delta = scale * 1.5;
  this.game = [];
  this.board = new Array(size)
  for (var i = 0; i < size; i++) {
    this.board[i] = new Array(size)
  }
  this.withCoordinates = true

  // Draw 1 hoshi (star point) at x,y
  this.hoshi = function(x, y) {
    var ctx = this.ctx
    ctx.fillStyle = "black";
    ctx.beginPath();
    ctx.arc(this.posToCoord(x), this.posToCoord(y), 2.5, 0, 2 * Math.PI);
    ctx.fill();
  }

  // Draw all the hoshis
  this.drawHoshis = function() {
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

  this.posToLetter = function(i) {
    if (i >= 8) {
      i++ // skip I
    }
    return String.fromCharCode(65 + i)
  }

  this.drawCoordinates = function() {
    this.ctx.font = "bold " + this.sz1 * .38 + "px Arial"
    this.ctx.fillStyle = "DimGray"
    for (var i = 0; i < this.n; i++) {
      var num = "" + (this.n - i)
      this.ctx.fillText(num, this.posToCoord(-1.52), this.posToCoord(i + .1))
      this.ctx.fillText(num, this.posToCoord(this.n + .1), this.posToCoord(i + .15))
      var letter = this.posToLetter(i)
      this.ctx.fillText(letter, this.posToCoord(i - 0.1), this.posToCoord(this.n + 0.35))
      this.ctx.fillText(letter, this.posToCoord(i - 0.1), this.sz1 / 3)
    }
  }

  this.RecordMove = function(x, y, color) {
    this.game.push({
      x,
      y,
      color
    });
    this.board[x][y] = color
    this.drawStone(x, y, color);
  }

  this.drawStone = function(x, y, color) {
    var highlight = "white"
    if (color == "white") {
      highlight = "black"
    }
    var ctx = this.ctx
    ctx.beginPath();
    ctx.fillStyle = color;
    ctx.arc(this.posToCoord(x), this.posToCoord(y), this.stoneRadius, 0, 2 * Math.PI);
    ctx.fill();
    ctx.beginPath();
    ctx.strokeStyle = highlight;
    ctx.arc(this.posToCoord(x), this.posToCoord(y), this.stoneRadius * 2 / 3, 0.15, Math.PI / 2 - .15);
    ctx.stroke();
    ctx.beginPath();
    ctx.strokeStyle = "grey"
    ctx.arc(this.posToCoord(x), this.posToCoord(y), this.stoneRadius, 0, 2 * Math.PI);
    ctx.stroke();
  }

  // internal utility for coord -> pixels translation
  this.posToCoord = function(x) {
    // need 0.5 to look sharp/black instead of grey
    return 0.5 + this.delta + x * this.sz1;
  }
  // inverse of above
  this.coordToPos = function(x) {
    return Math.round((x - 0.5 - this.delta) / this.sz1);
  }

  // Draw the main board on the given canvas
  this.Draw = function(c) {
    this.canvas = c;
    var self = this
    c.addEventListener("mousedown", function(event) {
      self.clickPosition(event);
    }, false);
    this.Redraw()
  }

  this.isValid = function(i, j) {
    if (i < 0 || j < 0 || i >= this.n || j > this.n) {
      return false
    }
    return !this.board[i][j]
  }

  this.clickPosition = function(event) {
    var x = event.offsetX
    var y = event.offsetY
    var i = this.coordToPos(x)
    var j = this.coordToPos(y)
    if (this.isValid(i, j)) {
      audio.play();
      this.RecordMove(i, j, (this.game.length % 2 == 0) ? "black" : "white")
    } else {
      console.log("Invalid move " + i + " , " + j)
    }
  }

  this.Redraw = function() {
    c = this.canvas
    c.height = this.gobanSz + this.sz1;
    c.width = this.gobanSz + this.sz1;
    var ctx = c.getContext("2d");
    this.ctx = ctx;
    ctx.clearRect(0, 0, c.width, c.height);
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
    for (var i = 0; i < this.game.length; i++) {
      this.drawStone(this.game[i].x, this.game[i].y, this.game[i].color)
    }
  }

  this.Undo = function() {
    var l = this.game.length
    if (l == 0) {
      return
    }
    l--
    var pos = this.game[l]
    this.game.length = l // truncate
    delete this.board[pos.x][pos.y]
    this.Redraw()
  }

}

// Stone sound (c)2017 All Rights Reserved by Laurent Demailly
var audio = new Audio('gostone.m4a');
