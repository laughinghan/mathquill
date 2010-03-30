/**
 * All the symbols, operators and commands.
 */

function VanillaSymbol(ch, html) 
{
  Symbol.call(this, ch, '<span>'+(html || ch)+'</span>');
}
VanillaSymbol.prototype = Symbol.prototype;

function Variable(ch)
{
  Symbol.call(this, ch, '<i>'+ch+'</i>');
}
Variable.prototype = Symbol.prototype;

function BinaryOperator(cmd, html)
{
  Symbol.call(this, cmd, '<span class="operator">'+html+'</span>');
}
BinaryOperator.prototype = new Symbol; //so instanceof will work

function PlusMinus(cmd, html)
{
  VanillaSymbol.apply(this, arguments);
}
PlusMinus.prototype = new BinaryOperator; //so instanceof will work
PlusMinus.prototype.respace = function()
{
  if(!this.prev || this.prev instanceof BinaryOperator)
    this.jQ.removeClass('operator');
  else
    this.jQ.addClass('operator');
  return this;
};

function SupSub(cmd, html)
{
  MathCommand.call(this, cmd, html);
}
SupSub.prototype = $.extend(new MathCommand, {
  initBlocks: function()
  {
    this.jQ.data('[[latexlive internal data]]').block = this.firstChild = this.lastChild = new MathBlock;
    this.firstChild.parent = this;
    this.firstChild.jQ = this.jQ;
    var me = this;
    this.jQ.change(function()
    {
      me.respace();
      if(me.next)
        me.next.respace();
      if(me.prev)
        me.prev.respace();
    });
  },
  respace: function()
  {
    if(this.respaced = this.prev instanceof SupSub && this.prev.cmd != this.cmd && !this.prev.respaced)
      this.jQ.css({
        left: -this.prev.jQ.innerWidth(),
        marginRight: 1-Math.min(this.jQ.innerWidth(), this.prev.jQ.innerWidth()) //1px adjustment very important!
      });
    else
      this.jQ.css({
        left: 0,
        marginRight: 0
      });
    return this;
  }
});

function Fraction()
{
  MathCommand.call(this, '\\frac ', '<span class="fraction"><span class="numerator"></span><span class="denominator"></span></span>');
}
Fraction.prototype = new MathCommand;
function LiveFraction()
{
  Fraction.call(this);
}
LiveFraction.prototype = new Fraction;
LiveFraction.prototype.placeCursor = function(cursor)
{
  var prev = this.prev;
  while(prev && !(prev instanceof BinaryOperator)) //lookbehind for operator
    prev = prev.prev;
  if(prev !== this.prev)
  {
    var newBlock = new MathFragment(this.parent, prev, this).blockify();
    newBlock.jQ = this.firstChild.removeEmpty().jQ.prepend(newBlock.jQ);
    newBlock.next = this.lastChild;
    newBlock.parent = this;
    this.firstChild = this.lastChild.prev = newBlock;
  }
  cursor.prependTo(this.lastChild);
};

// Parens/Brackets/Braces etc
function Parens(open, close)
{
  MathCommand.call(this, open, '<span><span class="open-paren">'+open+'</span><span class="parens"></span><span class="close-paren">'+close+'</span></span>');
  this.end = close;
  this.firstChild.jQ.change(function()
  {
    var block = $(this), height = block.height();
    block.prev().add(block.next()).css('fontSize', block.height()).css('top', -2-height/15);
  });
}
Parens.prototype = $.extend(new MathCommand, {
  initBlocks: function(){
    this.firstChild = this.lastChild = new MathBlock;
    this.firstChild.parent = this;
    this.firstChild.jQ = this.jQ.children().eq(1);
  },
  latex: function(){
    return this.cmd + this.firstChild.latex() + this.end;
  },
});

var SingleCharacterCommands = {
  ' ': function(){ return new VanillaSymbol('\\,', '&nbsp;'); },
  '*': function(){ return new VanillaSymbol('\\cdot ', '&sdot;'); },
  "'": function(){ return new VanillaSymbol("'", '&prime;');},
  '=': function(){ return new BinaryOperator('=', '='); },
  '<': function(){ return new BinaryOperator('<', '&lt;'); },
  '>': function(){ return new BinaryOperator('>', '&gt;'); },
  '+': function(){ return new PlusMinus('+'); },
  '-': function(){ return new PlusMinus('-', '&minus;'); },
  '^': function(){ return new SupSub('^', '<sup></sup>'); },
  '_': function(){ return new SupSub('_', '<sub></sub>'); },
  '/': function(){ return new LiveFraction(); },
  '(': function(){ return new Parens('(', ')'); },
  '[': function(){ return new Parens('[', ']'); },
  '{': function(){ return new Parens('{', '}'); },
  '|': function(){ return new Parens('|', '|'); },
};
