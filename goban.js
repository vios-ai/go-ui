// Creates a goban of the requested size - each of the size lines are seperated
// by scale pixels.
function GoBan(size = 19, scale = 24) {
  this.n = size;
  this.sz1 = scale;
  this.stoneRadius = scale / 2 - .5;
  this.gobanSz = (size + 1) * scale
  this.delta = scale * 1.5;

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
    return String.fromCharCode(65+i)
  }

  this.drawCoordinates = function() {
    this.ctx.font="bold "+this.sz1*.38+"px Arial"
    this.ctx.fillStyle = "DimGray"
    //this.ctx.font="30px Arial";
    for (var i=0; i<this.n; i++) {
      this.ctx.fillText(""+(this.n-i), this.posToCoord(-1.52), this.posToCoord(i+.1))
      this.ctx.fillText(""+(this.n-i), this.posToCoord(this.n+.1), this.posToCoord(i+.15))
      this.ctx.fillText(this.posToLetter(i), this.posToCoord(i-0.1), this.posToCoord(this.n + 0.35))
      this.ctx.fillText(this.posToLetter(i), this.posToCoord(i-0.1), this.sz1/3)
    }
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

  // Draw the main board on the given canvas
  this.Draw = function(c) {
    this.canvas = c;
    c.height = this.gobanSz + this.sz1;
    c.width = this.gobanSz + this.sz1 ;
    var ctx = c.getContext("2d");
    this.ctx = ctx;
    ctx.fillStyle = "moccasin";
    ctx.fillRect(this.sz1/2, this.sz1/2, this.gobanSz, this.gobanSz);
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
    this.drawCoordinates()
  }
}
