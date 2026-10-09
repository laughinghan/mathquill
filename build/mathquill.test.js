/**
 * MathQuill v0.10.1, by Han, Jeanine, and Mary
 * http://mathquill.com | maintainers@mathquill.com
 *
 * This Source Code Form is subject to the terms of the
 * Mozilla Public License, v. 2.0. If a copy of the MPL
 * was not distributed with this file, You can obtain
 * one at http://mozilla.org/MPL/2.0/.
 */
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
(function () {
    var L = -1;
    var R = 1;
    var jQuery = window.jQuery;
    var min = Math.min;
    var max = Math.max;
    if (!jQuery)
        throw 'MathQuill requires jQuery 1.5.2+ to be loaded first';
    function noop() { }
    /**
     * a development-only debug method.  This definition and all
     * calls to `pray` will be stripped from the minified
     * build of mathquill.
     *
     * This function must be called by name to be removed
     * at compile time.  Do not define another function
     * with the same name, and only call this function by
     * name.
     */
    function pray(message, cond) {
        if (!cond)
            throw new Error('prayer failed: ' + message);
    }
    function prayDirection(dir) {
        pray('a direction was passed', dir === L || dir === R);
    }
    var Aria = /** @class */ (function () {
        function Aria(controller) {
            this.jQ = jQuery('<span class="mq-aria-alert" aria-live="assertive" aria-atomic="true"></span>');
            this.msg = '';
            this.items = [];
            this.controller = controller;
        }
        Aria.prototype.setContainer = function (el) {
            this.jQ.appendTo(el);
        };
        Aria.prototype.queue = function (item, shouldDescribe) {
            if (shouldDescribe === void 0) { shouldDescribe = false; }
            var output = '';
            if (item instanceof MQNode) {
                // Some constructs include verbal shorthand (such as simple fractions and exponents).
                // Since ARIA alerts relate to moving through interactive content, we don't want to use that shorthand if it exists
                // since doing so may be ambiguous or confusing.
                var itemMathspeak = item.mathspeak({ ignoreShorthand: true });
                if (shouldDescribe) {
                    // used to ensure item is described when cursor reaches block boundaries
                    if (item.parent &&
                        item.parent.ariaLabel &&
                        item.ariaLabel === 'block') {
                        output = item.parent.ariaLabel + ' ' + itemMathspeak;
                    }
                    else if (item.ariaLabel) {
                        output = item.ariaLabel + ' ' + itemMathspeak;
                    }
                }
                if (output === '') {
                    output = itemMathspeak;
                }
            }
            else {
                output = item || '';
            }
            this.items.push(output);
            return this;
        };
        Aria.prototype.queueDirOf = function (dir) {
            prayDirection(dir);
            return this.queue(dir === L ? 'before' : 'after');
        };
        Aria.prototype.queueDirEndOf = function (dir) {
            prayDirection(dir);
            return this.queue(dir === L ? 'beginning of' : 'end of');
        };
        Aria.prototype.alert = function (t) {
            if (t)
                this.queue(t);
            if (this.items.length) {
                // To cut down on potential verbiage from multiple Mathquills firing near-simultaneous ARIA alerts,
                // update the text of this instance if its container also has keyboard focus.
                // If it does not, leave the DOM unchanged but flush the queue regardless.
                // Note: updating the msg variable regardless of focus for unit tests.
                this.msg = this.items
                    .join(' ')
                    .replace(/ +(?= )/g, '')
                    .trim();
                if (this.controller.containerHasFocus()) {
                    this.jQ.empty().text(this.msg);
                }
            }
            return this.clear();
        };
        Aria.prototype.clear = function () {
            this.items.length = 0;
            return this;
        };
        return Aria;
    }());
    /*************************************************
     * Base classes of edit tree-related objects
     *
     * Only doing tree node manipulation via these
     * adopt/ disown methods guarantees well-formedness
     * of the tree.
     ************************************************/
    /**
     * Tiny extension of jQuery adding directionalized DOM manipulation methods.
     */
    var $ = jQuery;
    $.fn.insDirOf = function (dir, el) {
        return dir === L
            ? this.insertBefore(el.first())
            : this.insertAfter(el.last());
    };
    $.fn.insAtDirEnd = function (dir, el) {
        return dir === L ? this.prependTo(el) : this.appendTo(el);
    };
    /** A cursor-like location in an mq node tree. */
    var Point = /** @class */ (function () {
        function Point(parent, leftward, rightward) {
            this.init(parent, leftward, rightward);
        }
        // keeping init around only for tests
        Point.prototype.init = function (parent, leftward, rightward) {
            this.parent = parent;
            this[L] = leftward;
            this[R] = rightward;
        };
        Point.copy = function (pt) {
            return new Point(pt.parent, pt[L], pt[R]);
        };
        return Point;
    }());
    /*
      Mathquill used to create a global dictionary that held onto
      all nodes ever created. It was up to the mathquill instances
      to call .dispose() on all of the nodes they created. That .dispose()
      method would remove the node from the global dictionary. That
      leaked memory for these reasons:
      1) mathField.revert() didn't actually call the .dispose() method
         on ANY of the nodes.
      2) parts of the code create temporary nodes that never get linked
         to anything. So they definitely didn't get their dispose() method
         called.
      3) even if everything above worked it's really common for users of
         mathquill to forget to tear it down correctly.
    
      It turns out mathquill always uses the Node and the Element as pairs. So we
      can store the Node on the Element and the Element on the Node. That makes it
      possible to get one from the other. This also has the added benefit of meaning
      the Node isn't stored in a global dictionary. If you lose all references to
      the Element, then you'll also lose all references to the Node. This means the
      browser can garbage collect all of mathquill's internals when the DOM is destroyed.
    
      There's only 1 small gotcha. The linking between Element and Node is a little clumsy.
      1) All of the Nodes will be created.
      2) Then all of the Elements will be created.
      3) Then the two will be linked
    
      The problem is that the linking step only has access to the elements. It doesn't have
      access to the nodes. That means we need to store the id of the node we want on the element
      at creation time. Then we need to lookup that Node by id during the linking step. This
      means we still need a dictionary. But at least it can be a temporary dictionary.
      Steps 1 - 3 happen synchronously. So after those steps we can simply clean out the
      temporary dictionary and remove all hard references to the Nodes.
    
      Any time we create a Node we schedule a task to clean all Nodes out of the dictionary
      on the next frame. That's safe because there's no opportunity for nodes to be created
      and NOT linked between the time we schedule the cleaning step and actually do it.
    */
    function eachNode(ends, yield_) {
        var el = ends[L];
        if (!el)
            return;
        var stop = ends[R];
        if (!stop)
            return; //shouldn't happen because ends[L] is defined;
        stop = stop[R];
        // TODO - this cast as MQNode is actually important to keep tests passing. I went to
        // fix this code to gracefully handle an undefined el and there are tests that actually
        // verify that this will throw an error. So I'm keeping the behavior but ignoring the
        // type error.
        for (; el !== stop; el = el[R]) {
            var result = yield_(el); // TODO - might be passing in 0 intead of a MQNode, but tests want this
            if (result === false)
                break;
        }
    }
    function foldNodes(ends, fold, yield_) {
        var el = ends[L];
        if (!el)
            return fold;
        var stop = ends[R];
        if (!stop)
            return fold; //shouldn't happen because ends[L] is defined;
        stop = stop[R];
        // TODO - this cast as MQNode is actually important to keep tests passing. I went to
        // fix this code to gracefully handle an undefined el and there are tests that actually
        // verify that this will throw an error. So I'm keeping the behavior but ignoring the
        // type error.
        for (; el !== stop; el = el[R]) {
            fold = yield_(fold, el); // TODO - might be passing in 0 intead of a MQNode, but tests want this
        }
        return fold;
    }
    /**
     * MathQuill virtual-DOM tree-node abstract base class
     */
    var defaultJQ = $();
    var NodeBase = /** @class */ (function () {
        function NodeBase() {
            var _c;
            // TODO - life would be so much better in typescript of these were undefined instead of
            // 0. The ! would save us in cases where we know a node is defined.
            this[_a] = 0;
            this[_b] = 0;
            // TODO - can this ever actually stay 0? if so we need to add null checks
            this.parent = 0;
            /** The (doubly-linked) list of this node's children. */
            this.ends = (_c = {}, _c[L] = 0, _c[R] = 0, _c);
            this.jQ = defaultJQ;
            this.id = NodeBase.uniqueNodeId();
            NodeBase.TempByIdDict[this.id] = this;
            NodeBase.scheduleDictionaryCleaning();
        }
        NodeBase.uniqueNodeId = function () {
            return (NodeBase.idCounter += 1);
        };
        NodeBase.getNodeOfElement = function (el) {
            if (!el)
                return;
            if (!el.nodeType)
                throw new Error('must pass an HTMLElement to NodeBase.getNodeOfElement');
            var elTrackingNode = el;
            return elTrackingNode.mqBlockNode || elTrackingNode.mqCmdNode;
        };
        NodeBase.linkElementByBlockId = function (elm, id) {
            NodeBase.linkElementByBlockNode(elm, NodeBase.TempByIdDict[id]);
        };
        NodeBase.linkElementByBlockNode = function (elm, blockNode) {
            elm.mqBlockNode = blockNode;
        };
        NodeBase.linkElementByCmdNode = function (elm, cmdNode) {
            elm.mqCmdNode = cmdNode;
        };
        NodeBase.scheduleDictionaryCleaning = function () {
            if (!NodeBase.cleaningScheduled) {
                NodeBase.cleaningScheduled = true;
                setTimeout(NodeBase.cleanDictionary);
            }
        };
        NodeBase.cleanDictionary = function () {
            NodeBase.cleaningScheduled = false;
            NodeBase.TempByIdDict = {};
        };
        NodeBase.prototype.toString = function () {
            return '{{ MathQuill Node #' + this.id + ' }}';
        };
        NodeBase.prototype.jQadd = function (jQ) {
            return (this.jQ = this.jQ.add(jQ));
        };
        /** Generate a DOM representation of this node and attach references to the corresponding MQ nodes to each DOM node.
         *
         * TODO: The only part of this method that depends on `this` is generating the DOM, so maybe pull out the rest into
         * a static function (and remove the `el` parameter from this method).
         */
        NodeBase.prototype.jQize = function (el) {
            // jQuery-ifies this.html() and links up the .jQ of all corresponding Nodes
            var jQ = $(el || this.html());
            function jQadd(el) {
                if ('getAttribute' in el) {
                    var cmdId = el.getAttribute('mathquill-command-id');
                    if (cmdId) {
                        el.removeAttribute('mathquill-command-id');
                        var cmdNode = NodeBase.TempByIdDict[cmdId];
                        cmdNode.jQadd(el);
                        NodeBase.linkElementByCmdNode(el, cmdNode);
                    }
                    var blockId = el.getAttribute('mathquill-block-id');
                    if (blockId) {
                        el.removeAttribute('mathquill-block-id');
                        var blockNode = NodeBase.TempByIdDict[blockId];
                        blockNode.jQadd(el);
                        NodeBase.linkElementByBlockNode(el, blockNode);
                    }
                }
                for (var child = el.firstChild; child; child = child.nextSibling) {
                    jQadd(child);
                }
            }
            for (var i = 0; i < jQ.length; i += 1)
                jQadd(jQ[i]);
            return jQ;
        };
        NodeBase.prototype.createDir = function (dir, cursor) {
            prayDirection(dir);
            var node = this;
            node.jQize();
            node.jQ.insDirOf(dir, cursor.jQ);
            cursor[dir] = node.adopt(cursor.parent, cursor[L], cursor[R]); // TODO - assuming not undefined, could be 0
            return node;
        };
        NodeBase.prototype.createLeftOf = function (cursor) {
            this.createDir(L, cursor);
        };
        NodeBase.prototype.selectChildren = function (leftEnd, rightEnd) {
            return new MQSelection(leftEnd, rightEnd);
        };
        NodeBase.prototype.bubble = function (yield_) {
            var self = this.getSelfNode();
            for (var ancestor = self; ancestor; ancestor = ancestor.parent) {
                var result = yield_(ancestor);
                if (result === false)
                    break;
            }
            return this;
        };
        NodeBase.prototype.postOrder = function (yield_) {
            var self = this.getSelfNode();
            (function recurse(descendant) {
                if (!descendant)
                    return false;
                descendant.eachChild(recurse);
                yield_(descendant);
                return true;
            })(self);
            return self;
        };
        NodeBase.prototype.isEmpty = function () {
            return this.ends[L] === 0 && this.ends[R] === 0;
        };
        NodeBase.prototype.isQuietEmptyDelimiter = function (dlms) {
            if (!this.isEmpty())
                return false;
            if (!dlms)
                return false;
            if (!this.parent || this.parent.ctrlSeq === undefined)
                return false;
            // Remove any leading \left or \right from the ctrl sequence before looking it up.
            var key = this.parent.ctrlSeq.replace(/^\\(left|right)?/, '');
            return dlms.hasOwnProperty(key);
        };
        NodeBase.prototype.isStyleBlock = function () {
            return false;
        };
        NodeBase.prototype.isTextBlock = function () {
            return false;
        };
        NodeBase.prototype.children = function () {
            return new Fragment(this.ends[L], this.ends[R]);
        };
        NodeBase.prototype.eachChild = function (yield_) {
            eachNode(this.ends, yield_);
            return this;
        };
        NodeBase.prototype.foldChildren = function (fold, yield_) {
            return foldNodes(this.ends, fold, yield_);
        };
        NodeBase.prototype.withDirAdopt = function (dir, parent, withDir, oppDir) {
            var self = this.getSelfNode();
            new Fragment(self, self).withDirAdopt(dir, parent, withDir, oppDir);
            return this;
        };
        /**
         * Add this node to the given parent node's children, at the position between the adjacent
         * children `leftward` (or the beginning if omitted) and `rightward` (or the end if omitted).
         * See `Fragment#adopt()`
         */
        NodeBase.prototype.adopt = function (parent, leftward, rightward) {
            var self = this.getSelfNode();
            new Fragment(self, self).adopt(parent, leftward, rightward);
            return this.getSelfNode();
        };
        NodeBase.prototype.disown = function () {
            var self = this.getSelfNode();
            new Fragment(self, self).disown();
            return this;
        };
        NodeBase.prototype.remove = function () {
            this.jQ.remove();
            return this.disown();
        };
        NodeBase.prototype.shouldIgnoreSubstitutionInSimpleSubscript = function (options) {
            if (!options.disableAutoSubstitutionInSubscripts)
                return false;
            if (!this.parent)
                return false;
            if (!(this.parent.parent instanceof SupSub))
                return false;
            // Mathquill is gross. There are many different paths that
            // create subscripts and sometimes we don't even construct
            // true instances of `LatexCmds._`. Another problem is that
            // the relationship between the sub and the SupSub isn't
            // completely setup during a paste at the time we check
            // this. I wanted to use: `this.parent.parent.sub !== this.parent`
            // but that check doesn't always work. This seems to be the only
            // check that always works. I'd rather live with this than try
            // to change the init order of things.
            if (!this.parent.jQ.hasClass('mq-sub'))
                return false;
            return true;
        };
        NodeBase.prototype.getSelfNode = function () {
            // dumb dance to tell typescript that we eventually become a MQNode
            return this;
        };
        // Overridden by child classes
        NodeBase.prototype.parser = function () {
            return undefined;
        };
        /** Render this node to an HTML string */
        NodeBase.prototype.html = function () {
            return '';
        };
        NodeBase.prototype.text = function () {
            return '';
        };
        NodeBase.prototype.latex = function () {
            return '';
        };
        NodeBase.prototype.finalizeTree = function (_options, _dir) { };
        NodeBase.prototype.contactWeld = function (_cursor, _dir) { };
        NodeBase.prototype.blur = function (_cursor) { };
        NodeBase.prototype.focus = function () { };
        NodeBase.prototype.intentionalBlur = function () { };
        NodeBase.prototype.reflow = function () { };
        NodeBase.prototype.registerInnerField = function (_innerFields, _mathField) { };
        NodeBase.prototype.chToCmd = function (_ch, _options) {
            return undefined;
        };
        NodeBase.prototype.mathspeak = function (_options) {
            return '';
        };
        NodeBase.prototype.seek = function (_pageX, _cursor) { };
        NodeBase.prototype.siblingDeleted = function (_options, _dir) { };
        NodeBase.prototype.siblingCreated = function (_options, _dir) { };
        NodeBase.prototype.finalizeInsert = function (_options, _cursor) { };
        NodeBase.prototype.fixDigitGrouping = function (_opts) { };
        NodeBase.prototype.writeLatex = function (_cursor, _latex) { };
        NodeBase.prototype.write = function (_cursor, _ch) { };
        var _a, _b;
        _a = L, _b = R;
        NodeBase.idCounter = 0;
        NodeBase.TempByIdDict = {};
        NodeBase.cleaningScheduled = false;
        return NodeBase;
    }());
    function prayWellFormed(parent, leftward, rightward) {
        pray('a parent is always present', parent);
        pray('leftward is properly set up', (function () {
            // either it's empty and `rightward` is the left end child (possibly empty)
            if (!leftward)
                return parent.ends[L] === rightward;
            // or it's there and its [R] and .parent are properly set up
            return leftward[R] === rightward && leftward.parent === parent;
        })());
        pray('rightward is properly set up', (function () {
            // either it's empty and `leftward` is the right end child (possibly empty)
            if (!rightward)
                return parent.ends[R] === leftward;
            // or it's there and its [L] and .parent are properly set up
            return rightward[L] === leftward && rightward.parent === parent;
        })());
    }
    /**
     * An entity outside the virtual tree with one-way pointers (so it's only a
     * "view" of part of the tree, not an actual node/entity in the tree) that
     * delimits a doubly-linked list of sibling nodes.
     * It's like a fanfic love-child between HTML DOM DocumentFragment and the Range
     * classes: like DocumentFragment, its contents must be sibling nodes
     * (unlike Range, whose contents are arbitrary contiguous pieces of subtrees),
     * but like Range, it has only one-way pointers to its contents, its contents
     * have no reference to it and in fact may still be in the visible tree (unlike
     * DocumentFragment, whose contents must be detached from the visible tree
     * and have their 'parent' pointers set to the DocumentFragment).
     */
    var Fragment = /** @class */ (function () {
        function Fragment(withDir, oppDir, dir) {
            this.jQ = defaultJQ;
            this.disowned = false;
            if (dir === undefined)
                dir = L;
            prayDirection(dir);
            pray('no half-empty fragments', !withDir === !oppDir);
            this.ends = {};
            if (!withDir || !oppDir)
                return;
            pray('withDir is passed to Fragment', withDir instanceof MQNode);
            pray('oppDir is passed to Fragment', oppDir instanceof MQNode);
            pray('withDir and oppDir have the same parent', withDir.parent === oppDir.parent);
            this.ends[dir] = withDir;
            this.ends[-dir] = oppDir;
            // To build the jquery collection for a fragment, accumulate elements
            // into an array and then call jQ.add once on the result. jQ.add sorts the
            // collection according to document order each time it is called, so
            // building a collection by folding jQ.add directly takes more than
            // quadratic time in the number of elements.
            //
            // https://github.com/jquery/jquery/blob/2.1.4/src/traversing.js#L112
            var accum = this.fold([], function (accum, el) {
                accum.push.apply(accum, el.jQ.get());
                return accum;
            });
            this.jQ = this.jQ.add(accum);
        }
        // like Cursor::withDirInsertAt(dir, parent, withDir, oppDir)
        Fragment.prototype.withDirAdopt = function (dir, parent, withDir, oppDir) {
            return dir === L
                ? this.adopt(parent, withDir, oppDir)
                : this.adopt(parent, oppDir, withDir);
        };
        /**
         * Splice this fragment into the given parent node's children, at the position between the adjacent
         * children `leftward` (or the beginning if omitted) and `rightward` (or the end if omitted).
         *
         * TODO: why do we need both leftward and rightward? It seems to me that `rightward` is always expected to be `leftward ? leftward[R] : parent.ends[L]`.
         */
        Fragment.prototype.adopt = function (parent, leftward, rightward) {
            prayWellFormed(parent, leftward, rightward);
            var self = this;
            this.disowned = false;
            var leftEnd = self.ends[L];
            if (!leftEnd)
                return this;
            var rightEnd = self.ends[R];
            if (!rightEnd)
                return this;
            if (leftward) {
                // NB: this is handled in the ::each() block
                // leftward[R] = leftEnd
            }
            else {
                parent.ends[L] = leftEnd;
            }
            if (rightward) {
                rightward[L] = rightEnd;
            }
            else {
                parent.ends[R] = rightEnd;
            }
            rightEnd[R] = rightward;
            self.each(function (el) {
                el[L] = leftward;
                el.parent = parent;
                if (leftward)
                    leftward[R] = el;
                leftward = el;
                return true;
            });
            return self;
        };
        /**
         * Remove the nodes in this fragment from their parent.
         */
        Fragment.prototype.disown = function () {
            var self = this;
            var leftEnd = self.ends[L];
            // guard for empty and already-disowned fragments
            if (!leftEnd || self.disowned)
                return self;
            this.disowned = true;
            var rightEnd = self.ends[R];
            if (!rightEnd)
                return self;
            var parent = leftEnd.parent;
            prayWellFormed(parent, leftEnd[L], leftEnd);
            prayWellFormed(parent, rightEnd, rightEnd[R]);
            if (leftEnd[L]) {
                var leftLeftEnd = leftEnd[L];
                leftLeftEnd[R] = rightEnd[R];
            }
            else {
                parent.ends[L] = rightEnd[R];
            }
            if (rightEnd[R]) {
                var rightRightEnd = rightEnd[R];
                rightRightEnd[L] = leftEnd[L];
            }
            else {
                parent.ends[R] = leftEnd[L];
            }
            return self;
        };
        Fragment.prototype.remove = function () {
            this.jQ.remove();
            return this.disown();
        };
        Fragment.prototype.each = function (yield_) {
            eachNode(this.ends, yield_); // TODO - the types of Ends are not compatible
            return this;
        };
        Fragment.prototype.fold = function (fold, yield_) {
            return foldNodes(this.ends, fold, yield_); // TODO - the types of Ends are not compatible
        };
        return Fragment;
    }());
    /**
     * Registry of LaTeX commands and commands created when typing
     * a single character.
     *
     * (Commands are all subclasses of Node.)
     */
    var LatexCmds = {};
    var CharCmds = {};
    function isMQNodeClass(cmd) {
        return cmd && cmd.prototype instanceof MQNode;
    }
    /********************************************
     * Cursor and Selection "singleton" classes
     *******************************************/
    /* The main thing that manipulates the Math DOM. Makes sure to manipulate the
    HTML DOM to match. */
    /* Sort of singletons, since there should only be one per editable math
    textbox, but any one HTML document can contain many such textboxes, so any one
    JS environment could actually contain many instances. */
    //A fake cursor in the fake textbox that the math is rendered in.
    var Anticursor = /** @class */ (function (_super) {
        __extends(Anticursor, _super);
        function Anticursor(parent, leftward, rightward) {
            var _this = _super.call(this, parent, leftward, rightward) || this;
            _this.ancestors = {};
            return _this;
        }
        Anticursor.fromCursor = function (cursor) {
            return new Anticursor(cursor.parent, cursor[L], cursor[R]);
        };
        return Anticursor;
    }(Point));
    var Cursor = /** @class */ (function (_super) {
        __extends(Cursor, _super);
        function Cursor(initParent, options, controller) {
            var _this = _super.call(this, initParent) || this;
            /** Slightly more than just a "cache", this remembers the cursor's position in each block node, so that we can return to the right
             * point in that node when moving up and down among blocks.
             */
            _this.upDownCache = {};
            _this.controller = controller;
            _this.options = options;
            var jQ = (_this.jQ = _this._jQ = $('<span class="mq-cursor">&#8203;</span>'));
            //closured for setInterval
            _this.blink = function () {
                jQ.toggleClass('mq-blink');
            };
            return _this;
        }
        Cursor.prototype.show = function () {
            this.jQ = this._jQ.removeClass('mq-blink');
            if (this.intervalId)
                //already was shown, just restart interval
                clearInterval(this.intervalId);
            else {
                //was hidden and detached, insert this.jQ back into HTML DOM
                if (this[R]) {
                    var selection = this.selection;
                    if (selection && selection.ends[L][L] === this[L])
                        this.jQ.insertBefore(selection.jQ);
                    else
                        this.jQ.insertBefore(this[R].jQ.first());
                }
                else
                    this.jQ.appendTo(this.parent.jQ);
                this.parent.focus();
            }
            this.intervalId = setInterval(this.blink, 500);
            return this;
        };
        Cursor.prototype.hide = function () {
            if (this.intervalId)
                clearInterval(this.intervalId);
            this.intervalId = 0;
            this.jQ.detach();
            this.jQ = $();
            return this;
        };
        Cursor.prototype.withDirInsertAt = function (dir, parent, withDir, oppDir) {
            var oldParent = this.parent;
            this.parent = parent;
            this[dir] = withDir;
            this[-dir] = oppDir;
            // by contract, .blur() is called after all has been said and done
            // and the cursor has actually been moved
            // FIXME pass cursor to .blur() so text can fix cursor pointers when removing itself
            if (oldParent !== parent && oldParent.blur)
                oldParent.blur(this);
        };
        /** Place the cursor before or after `el`, according the side specified by `dir`. */
        Cursor.prototype.insDirOf = function (dir, el) {
            prayDirection(dir);
            this.jQ.insDirOf(dir, el.jQ);
            this.withDirInsertAt(dir, el.parent, el[dir], el);
            this.parent.jQ.addClass('mq-hasCursor');
            return this;
        };
        Cursor.prototype.insLeftOf = function (el) {
            return this.insDirOf(L, el);
        };
        Cursor.prototype.insRightOf = function (el) {
            return this.insDirOf(R, el);
        };
        /** Place the cursor inside `el` at either the left or right end, according the side specified by `dir`. */
        Cursor.prototype.insAtDirEnd = function (dir, el) {
            prayDirection(dir);
            this.jQ.insAtDirEnd(dir, el.jQ);
            this.withDirInsertAt(dir, el, 0, el.ends[dir]);
            el.focus();
            return this;
        };
        Cursor.prototype.insAtLeftEnd = function (el) {
            return this.insAtDirEnd(L, el);
        };
        Cursor.prototype.insAtRightEnd = function (el) {
            return this.insAtDirEnd(R, el);
        };
        /**
         * jump up or down from one block Node to another:
         * - cache the current Point in the node we're jumping from
         * - check if there's a Point in it cached for the node we're jumping to
         *   + if so put the cursor there,
         *   + if not seek a position in the node that is horizontally closest to
         *     the cursor's current position
         */
        Cursor.prototype.jumpUpDown = function (from, to) {
            var self = this;
            self.upDownCache[from.id] = Point.copy(self);
            var cached = self.upDownCache[to.id];
            if (cached) {
                var cachedR = cached[R];
                if (cachedR) {
                    self.insLeftOf(cachedR);
                }
                else {
                    self.insAtRightEnd(cached.parent);
                }
            }
            else {
                var pageX = self.offset().left;
                to.seek(pageX, self);
            }
            self.controller.aria.queue(to, true);
        };
        Cursor.prototype.offset = function () {
            //in Opera 11.62, .getBoundingClientRect() and hence jQuery::offset()
            //returns all 0's on inline elements with negative margin-right (like
            //the cursor) at the end of their parent, so temporarily remove the
            //negative margin-right when calling jQuery::offset()
            //Opera bug DSK-360043
            //http://bugs.jquery.com/ticket/11523
            //https://github.com/jquery/jquery/pull/717
            var self = this, offset = self.jQ.removeClass('mq-cursor').offset();
            self.jQ.addClass('mq-cursor');
            return offset;
        };
        Cursor.prototype.unwrapGramp = function () {
            var gramp = this.parent.parent;
            var greatgramp = gramp.parent;
            var rightward = gramp[R];
            var cursor = this;
            var leftward = gramp[L];
            gramp.disown().eachChild(function (uncle) {
                if (uncle.isEmpty())
                    return true;
                uncle
                    .children()
                    .adopt(greatgramp, leftward, rightward)
                    .each(function (cousin) {
                    cousin.jQ.insertBefore(gramp.jQ.first());
                    return true;
                });
                leftward = uncle.ends[R];
                return true;
            });
            if (!this[R]) {
                //then find something to be rightward to insLeftOf
                var thisL = this[L];
                if (thisL)
                    this[R] = thisL[R];
                else {
                    while (!this[R]) {
                        var newParent = this.parent[R];
                        if (newParent) {
                            this.parent = newParent;
                            this[R] = newParent.ends[L];
                        }
                        else {
                            this[R] = gramp[R];
                            this.parent = greatgramp;
                            break;
                        }
                    }
                }
            }
            var thisR = this[R];
            if (thisR)
                this.insLeftOf(thisR);
            else
                this.insAtRightEnd(greatgramp);
            gramp.jQ.remove();
            var grampL = gramp[L];
            var grampR = gramp[R];
            if (grampL)
                grampL.siblingDeleted(cursor.options, R);
            if (grampR)
                grampR.siblingDeleted(cursor.options, L);
        };
        Cursor.prototype.startSelection = function () {
            var anticursor = (this.anticursor = Anticursor.fromCursor(this));
            var ancestors = anticursor.ancestors;
            for (var ancestor = anticursor; ancestor.parent; ancestor = ancestor.parent) {
                ancestors[ancestor.parent.id] = ancestor;
            }
        };
        Cursor.prototype.endSelection = function () {
            delete this.anticursor;
        };
        Cursor.prototype.select = function () {
            var _lca;
            var anticursor = this.anticursor;
            if (this[L] === anticursor[L] && this.parent === anticursor.parent)
                return false;
            // Find the lowest common ancestor (`lca`), and the ancestor of the cursor
            // whose parent is the LCA (which'll be an end of the selection fragment).
            for (var ancestor = this; ancestor.parent; ancestor = ancestor.parent) {
                if (ancestor.parent.id in anticursor.ancestors) {
                    _lca = ancestor.parent;
                    break;
                }
            }
            pray('cursor and anticursor in the same tree', _lca);
            var lca = _lca;
            // The cursor and the anticursor should be in the same tree, because the
            // mousemove handler attached to the document, unlike the one attached to
            // the root HTML DOM element, doesn't try to get the math tree node of the
            // mousemove target, and Cursor::seek() based solely on coordinates stays
            // within the tree of `this` cursor's root.
            // The other end of the selection fragment, the ancestor of the anticursor
            // whose parent is the LCA.
            var antiAncestor = anticursor.ancestors[lca.id];
            // Now we have two either Nodes or Points, guaranteed to have a common
            // parent and guaranteed that if both are Points, they are not the same,
            // and we have to figure out which is the left end and which the right end
            // of the selection.
            var leftEnd, rightEnd, dir = R;
            // This is an extremely subtle algorithm.
            // As a special case, `ancestor` could be a Point and `antiAncestor` a Node
            // immediately to `ancestor`'s left.
            // In all other cases,
            // - both Nodes
            // - `ancestor` a Point and `antiAncestor` a Node
            // - `ancestor` a Node and `antiAncestor` a Point
            // `antiAncestor[R] === rightward[R]` for some `rightward` that is
            // `ancestor` or to its right, if and only if `antiAncestor` is to
            // the right of `ancestor`.
            if (ancestor[L] !== antiAncestor) {
                for (var rightward = ancestor; rightward; rightward = rightward[R]) {
                    if (rightward[R] === antiAncestor[R]) {
                        dir = L;
                        leftEnd = ancestor;
                        rightEnd = antiAncestor;
                        break;
                    }
                }
            }
            if (dir === R) {
                leftEnd = antiAncestor;
                rightEnd = ancestor;
            }
            // only want to select Nodes up to Points, can't select Points themselves
            if (leftEnd instanceof Point)
                leftEnd = leftEnd[R];
            if (rightEnd instanceof Point)
                rightEnd = rightEnd[L];
            this.hide().selection = lca.selectChildren(leftEnd, rightEnd);
            var insEl = this.selection.ends[dir];
            this.insDirOf(dir, insEl);
            this.selectionChanged();
            return true;
        };
        Cursor.prototype.resetToEnd = function (controller) {
            this.clearSelection();
            var root = controller.root;
            this[R] = 0;
            this[L] = root.ends[R];
            this.parent = root;
        };
        Cursor.prototype.clearSelection = function () {
            if (this.selection) {
                this.selection.clear();
                delete this.selection;
                this.selectionChanged();
            }
            return this;
        };
        Cursor.prototype.deleteSelection = function () {
            var selection = this.selection;
            if (!selection)
                return;
            this[L] = selection.ends[L][L];
            this[R] = selection.ends[R][R];
            selection.remove();
            this.selectionChanged();
            delete this.selection;
        };
        Cursor.prototype.replaceSelection = function () {
            var seln = this.selection;
            if (seln) {
                this[L] = seln.ends[L][L];
                this[R] = seln.ends[R][R];
                delete this.selection;
            }
            return seln;
        };
        Cursor.prototype.depth = function () {
            var node = this;
            var depth = 0;
            while ((node = node.parent)) {
                depth += node instanceof MathBlock ? 1 : 0;
            }
            return depth;
        };
        Cursor.prototype.isTooDeep = function (offset) {
            if (this.options.maxDepth !== undefined) {
                return this.depth() + (offset || 0) > this.options.maxDepth;
            }
            else {
                return false;
            }
        };
        // can be overridden
        Cursor.prototype.selectionChanged = function () { };
        return Cursor;
    }(Point));
    var MQSelection = /** @class */ (function (_super) {
        __extends(MQSelection, _super);
        function MQSelection(withDir, oppDir, dir) {
            var _this = _super.call(this, withDir, oppDir, dir) || this;
            _this.jQ = _this.jQ.wrapAll('<span class="mq-selection"></span>').parent();
            return _this;
            //can't do wrapAll(this.jQ = $(...)) because wrapAll will clone it
        }
        MQSelection.prototype.adopt = function (parent, leftward, rightward) {
            this.jQ.replaceWith((this.jQ = this.jQ.children()));
            return _super.prototype.adopt.call(this, parent, leftward, rightward);
        };
        MQSelection.prototype.clear = function () {
            // using the browser's native .childNodes property so that we
            // don't discard text nodes.
            this.jQ.replaceWith(this.jQ[0].childNodes);
            return this;
        };
        MQSelection.prototype.join = function (methodName, separator) {
            if (separator === void 0) { separator = ''; }
            return this.fold('', function (fold, child) {
                return fold + separator + child[methodName]();
            });
        };
        return MQSelection;
    }(Fragment));
    /*********************************************
     * Controller for a MathQuill instance
     ********************************************/
    var ControllerBase = /** @class */ (function () {
        function ControllerBase(root, container, options) {
            this.id = root.id;
            this.data = {};
            this.root = root;
            this.container = container;
            this.options = options;
            this.aria = new Aria(this.getControllerSelf());
            this.ariaLabel = 'Math Input';
            this.ariaPostLabel = '';
            root.controller = this.getControllerSelf();
            this.cursor = root.cursor = new Cursor(root, options, this.getControllerSelf());
            // TODO: stop depending on root.cursor, and rm it
        }
        ControllerBase.prototype.getControllerSelf = function () {
            // dance we have to do to tell this thing it's a full controller
            return this;
        };
        ControllerBase.prototype.handle = function (name, dir) {
            var handlers = this.options.handlers;
            if (handlers && handlers.fns[name]) {
                var mq = new handlers.APIClasses[this.KIND_OF_MQ](this);
                if (dir === L || dir === R)
                    handlers.fns[name](dir, mq);
                else
                    handlers.fns[name](mq);
            }
        };
        ControllerBase.onNotify = function (f) {
            ControllerBase.notifyees.push(f);
        };
        ControllerBase.prototype.notify = function (e) {
            for (var i = 0; i < ControllerBase.notifyees.length; i += 1) {
                ControllerBase.notifyees[i](this.cursor, e);
            }
            return this;
        };
        ControllerBase.prototype.setAriaLabel = function (ariaLabel) {
            var oldAriaLabel = this.getAriaLabel();
            if (ariaLabel && typeof ariaLabel === 'string' && ariaLabel !== '') {
                this.ariaLabel = ariaLabel;
            }
            else if (this.editable) {
                this.ariaLabel = 'Math Input';
            }
            else {
                this.ariaLabel = '';
            }
            // If this field doesn't have focus, update its computed mathspeak value.
            // We check for focus because updating the aria-label attribute of a focused element will cause most screen readers to announce the new value (in our case, label along with the expression's mathspeak).
            // If the field does have focus at the time, it will be updated once a blur event occurs.
            // Unless we stop using fake text inputs and emulating screen reader behavior, this is going to remain a problem.
            if (this.ariaLabel !== oldAriaLabel && !this.containerHasFocus()) {
                this.updateMathspeak();
            }
            return this;
        };
        ControllerBase.prototype.getAriaLabel = function () {
            if (this.ariaLabel !== 'Math Input') {
                return this.ariaLabel;
            }
            else if (this.editable) {
                return 'Math Input';
            }
            else {
                return '';
            }
        };
        ControllerBase.prototype.setAriaPostLabel = function (ariaPostLabel, timeout) {
            var _this = this;
            if (ariaPostLabel &&
                typeof ariaPostLabel === 'string' &&
                ariaPostLabel !== '') {
                if (ariaPostLabel !== this.ariaPostLabel && typeof timeout === 'number') {
                    if (this._ariaAlertTimeout)
                        clearTimeout(this._ariaAlertTimeout);
                    this._ariaAlertTimeout = setTimeout(function () {
                        if (_this.containerHasFocus()) {
                            // Voice the new label, but do not update content mathspeak to prevent double-speech.
                            _this.aria.alert(_this.root.mathspeak().trim() + ' ' + ariaPostLabel.trim());
                        }
                        else {
                            // This mathquill does not have focus, so update its mathspeak.
                            _this.updateMathspeak();
                        }
                    }, timeout);
                }
                this.ariaPostLabel = ariaPostLabel;
            }
            else {
                if (this._ariaAlertTimeout)
                    clearTimeout(this._ariaAlertTimeout);
                this.ariaPostLabel = '';
            }
            return this;
        };
        ControllerBase.prototype.getAriaPostLabel = function () {
            return this.ariaPostLabel || '';
        };
        ControllerBase.prototype.containerHasFocus = function () {
            return (document.activeElement &&
                this.container &&
                this.container[0] &&
                this.container[0].contains(document.activeElement));
        };
        ControllerBase.prototype.getTextareaOrThrow = function () {
            var textarea = this.textarea;
            if (!textarea)
                throw new Error('expected a textarea');
            return textarea;
        };
        ControllerBase.prototype.getTextareaSpanOrThrow = function () {
            var textareaSpan = this.textareaSpan;
            if (!textareaSpan)
                throw new Error('expected a textareaSpan');
            return textareaSpan;
        };
        // based on http://www.gh-mathspeak.com/examples/quick-tutorial/
        // and http://www.gh-mathspeak.com/examples/grammar-rules/
        ControllerBase.prototype.exportMathSpeak = function () {
            return this.root.mathspeak();
        };
        // overridden
        ControllerBase.prototype.updateMathspeak = function () { };
        ControllerBase.prototype.scrollHoriz = function () { };
        ControllerBase.prototype.selectionChanged = function () { };
        ControllerBase.prototype.setOverflowClasses = function () { };
        ControllerBase.notifyees = [];
        return ControllerBase;
    }());
    /*********************************************************
     * The publicly exposed MathQuill API.
     ********************************************************/
    var API = {};
    var EMBEDS = {};
    var OptionProcessors = /** @class */ (function () {
        function OptionProcessors() {
        }
        return OptionProcessors;
    }());
    var optionProcessors = new OptionProcessors();
    var Options = /** @class */ (function () {
        function Options() {
        }
        return Options;
    }());
    var Progenote = /** @class */ (function () {
        function Progenote() {
        }
        return Progenote;
    }());
    /**
     * Interface Versioning (#459, #495) to allow us to virtually guarantee
     * backcompat. v0.10.x introduces it, so for now, don't completely break the
     * API for people who don't know about it, just complain with console.warn().
     *
     * The methods are shimmed in outro.js so that MQ.MathField.prototype etc can
     * be accessed.
     */
    var insistOnInterVer = function () {
        if (window.console)
            console.warn('You are using the MathQuill API without specifying an interface version, ' +
                'which will fail in v1.0.0. Easiest fix is to do the following before ' +
                'doing anything else:\n' +
                '\n' +
                '    MathQuill = MathQuill.getInterface(1);\n' +
                '    // now MathQuill.MathField() works like it used to\n' +
                '\n' +
                'See also the "`dev` branch (2014–2015) → v0.10.0 Migration Guide" at\n' +
                '  https://github.com/mathquill/mathquill/wiki/%60dev%60-branch-(2014%E2%80%932015)-%E2%86%92-v0.10.0-Migration-Guide');
    };
    // globally exported API object
    function MathQuill(el) {
        insistOnInterVer();
        return MQ1(el);
    }
    MathQuill.prototype = Progenote.prototype;
    MathQuill.VERSION = 'v0.10.1';
    MathQuill.interfaceVersion = function (v) {
        // shim for #459-era interface versioning (ended with #495)
        if (v !== 1)
            throw 'Only interface version 1 supported. You specified: ' + v;
        insistOnInterVer = function () {
            if (window.console)
                console.warn('You called MathQuill.interfaceVersion(1); to specify the interface ' +
                    'version, which will fail in v1.0.0. You can fix this easily by doing ' +
                    'this before doing anything else:\n' +
                    '\n' +
                    '    MathQuill = MathQuill.getInterface(1);\n' +
                    '    // now MathQuill.MathField() works like it used to\n' +
                    '\n' +
                    'See also the "`dev` branch (2014–2015) → v0.10.0 Migration Guide" at\n' +
                    '  https://github.com/mathquill/mathquill/wiki/%60dev%60-branch-(2014%E2%80%932015)-%E2%86%92-v0.10.0-Migration-Guide');
        };
        insistOnInterVer();
        return MathQuill;
    };
    MathQuill.getInterface = getInterface;
    var MIN = (getInterface.MIN = 1), MAX = (getInterface.MAX = 2);
    function getInterface(v) {
        if (!(MIN <= v && v <= MAX))
            throw ('Only interface versions between ' +
                MIN +
                ' and ' +
                MAX +
                ' supported. You specified: ' +
                v);
        /**
         * Function that takes an HTML element and, if it's the root HTML element of a
         * static math or math or text field, returns an API object for it (else, null).
         *
         *   var mathfield = MQ.MathField(mathFieldSpan);
         *   assert(MQ(mathFieldSpan).id === mathfield.id);
         *   assert(MQ(mathFieldSpan).id === MQ(mathFieldSpan).id);
         *
         */
        var MQ = function (el) {
            if (!el || !el.nodeType)
                return null; // check that `el` is a HTML element, using the
            // same technique as jQuery: https://github.com/jquery/jquery/blob/679536ee4b7a92ae64a5f58d90e9cc38c001e807/src/core/init.js#L92
            var blockNode = NodeBase.getNodeOfElement($(el).children('.mq-root-block')[0]); // TODO - assumng it's a MathBlock
            var ctrlr = blockNode && blockNode.controller;
            return ctrlr ? new APIClasses[ctrlr.KIND_OF_MQ](ctrlr) : null;
        };
        MQ.L = L;
        MQ.R = R;
        MQ.saneKeyboardEvents = saneKeyboardEvents;
        function config(currentOptions, newOptions) {
            if (newOptions && newOptions.handlers) {
                newOptions.handlers = {
                    fns: newOptions.handlers,
                    APIClasses: APIClasses,
                };
            }
            for (var name in newOptions)
                if (newOptions.hasOwnProperty(name)) {
                    var value = newOptions[name]; // TODO - think about typing this better
                    var processor = optionProcessors[name]; // TODO - validate option processors better
                    currentOptions[name] = processor ? processor(value) : value; // TODO - think about typing better
                }
        }
        MQ.config = function (opts) {
            config(Options.prototype, opts);
            return this;
        };
        MQ.registerEmbed = function (name, options) {
            if (!/^[a-z][a-z0-9]*$/i.test(name)) {
                throw 'Embed name must start with letter and be only letters and digits';
            }
            EMBEDS[name] = options;
        };
        var AbstractMathQuill = /** @class */ (function (_super) {
            __extends(AbstractMathQuill, _super);
            function AbstractMathQuill(ctrlr) {
                var _this = _super.call(this) || this;
                _this.__controller = ctrlr;
                _this.__options = ctrlr.options;
                _this.id = ctrlr.id;
                _this.data = ctrlr.data;
                return _this;
            }
            AbstractMathQuill.prototype.__mathquillify = function (classNames) {
                var ctrlr = this.__controller, root = ctrlr.root, el = ctrlr.container;
                ctrlr.createTextarea();
                var contents = el.addClass(classNames).contents().detach();
                root.jQ = $('<span class="mq-root-block"/>').appendTo(el);
                NodeBase.linkElementByBlockId(root.jQ[0], root.id);
                this.latex(contents.text());
                this.revert = function () {
                    return el
                        .empty()
                        .unbind('.mathquill')
                        .removeClass('mq-editable-field mq-math-mode mq-text-mode')
                        .append(contents);
                };
            };
            AbstractMathQuill.prototype.config = function (opts) {
                config(this.__options, opts);
                return this;
            };
            AbstractMathQuill.prototype.el = function () {
                return this.__controller.container[0];
            };
            AbstractMathQuill.prototype.text = function () {
                return this.__controller.exportText();
            };
            AbstractMathQuill.prototype.mathspeak = function () {
                return this.__controller.exportMathSpeak();
            };
            AbstractMathQuill.prototype.latex = function (latex) {
                if (arguments.length > 0) {
                    this.__controller.renderLatexMath(latex);
                    var cursor = this.__controller.cursor;
                    if (this.__controller.blurred)
                        cursor.hide().parent.blur(cursor);
                    return this;
                }
                return this.__controller.exportLatex();
            };
            AbstractMathQuill.prototype.html = function () {
                return this.__controller.root.jQ
                    .html()
                    .replace(/ mathquill-(?:command|block)-id="?\d+"?/g, '')
                    .replace(/<span class="?mq-cursor( mq-blink)?"?>.?<\/span>/i, '')
                    .replace(/ mq-hasCursor|mq-hasCursor ?/, '')
                    .replace(/ class=(""|(?= |>))/g, '');
            };
            AbstractMathQuill.prototype.reflow = function () {
                this.__controller.root.postOrder(function (node) {
                    node.reflow();
                });
                return this;
            };
            return AbstractMathQuill;
        }(Progenote));
        MQ.prototype = AbstractMathQuill.prototype;
        var EditableField = /** @class */ (function (_super) {
            __extends(EditableField, _super);
            function EditableField() {
                return _super !== null && _super.apply(this, arguments) || this;
            }
            EditableField.prototype.__mathquillify = function (classNames) {
                _super.prototype.__mathquillify.call(this, classNames);
                this.__controller.editable = true;
                this.__controller.delegateMouseEvents();
                this.__controller.editablesTextareaEvents();
                return this;
            };
            EditableField.prototype.focus = function () {
                this.__controller.getTextareaOrThrow()[0].focus();
                this.__controller.scrollHoriz();
                return this;
            };
            EditableField.prototype.blur = function () {
                this.__controller.getTextareaOrThrow().blur();
                return this;
            };
            EditableField.prototype.write = function (latex) {
                this.__controller.writeLatex(latex);
                this.__controller.scrollHoriz();
                var cursor = this.__controller.cursor;
                if (this.__controller.blurred)
                    cursor.hide().parent.blur(cursor);
                return this;
            };
            EditableField.prototype.empty = function () {
                var root = this.__controller.root, cursor = this.__controller.cursor;
                root.ends[L] = root.ends[R] = 0;
                root.jQ.empty();
                delete cursor.selection;
                cursor.insAtRightEnd(root);
                return this;
            };
            EditableField.prototype.cmd = function (cmd) {
                var ctrlr = this.__controller.notify(undefined), cursor = ctrlr.cursor;
                if (/^\\[a-z]+$/i.test(cmd) && !cursor.isTooDeep()) {
                    cmd = cmd.slice(1);
                    var klass = LatexCmds[cmd];
                    var node;
                    if (klass) {
                        if (klass.constructor) {
                            node = new klass(cmd);
                        }
                        else {
                            node = klass(cmd);
                        }
                        if (cursor.selection)
                            node.replaces(cursor.replaceSelection());
                        node.createLeftOf(cursor.show());
                    } /* TODO: API needs better error reporting */
                    else
                        ;
                }
                else
                    cursor.parent.write(cursor, cmd);
                ctrlr.scrollHoriz();
                if (ctrlr.blurred)
                    cursor.hide().parent.blur(cursor);
                return this;
            };
            EditableField.prototype.select = function () {
                this.__controller.selectAll();
                return this;
            };
            EditableField.prototype.clearSelection = function () {
                this.__controller.cursor.clearSelection();
                return this;
            };
            EditableField.prototype.hasSelection = function () {
                return !!this.__controller.cursor.selection;
            };
            EditableField.prototype.selectionIsUnderlined = function () {
                var _this = this;
                var selection = this.__controller.cursor.selection;
                if (!selection)
                    return false;
                var allNodesUnderlined = true;
                selection.each(function (node) {
                    var ancestor = node;
                    var isUnderlined = false;
                    while (ancestor && ancestor !== _this.__controller.root) {
                        if (ancestor.ctrlSeq === '\\underline') {
                            isUnderlined = true;
                            break;
                        }
                        ancestor = ancestor.parent;
                    }
                    if (!isUnderlined) {
                        allNodesUnderlined = false;
                        return false;
                    }
                    return undefined;
                });
                return allNodesUnderlined;
            };
            EditableField.prototype.moveToDirEnd = function (dir) {
                this.__controller
                    .notify('move')
                    .cursor.insAtDirEnd(dir, this.__controller.root);
                return this;
            };
            EditableField.prototype.moveToLeftEnd = function () {
                return this.moveToDirEnd(L);
            };
            EditableField.prototype.moveToRightEnd = function () {
                return this.moveToDirEnd(R);
            };
            EditableField.prototype.keystroke = function (keysString, evt) {
                var keys = keysString.replace(/^\s+|\s+$/g, '').split(/\s+/);
                for (var i = 0; i < keys.length; i += 1) {
                    this.__controller.keystroke(keys[i], evt || { preventDefault: noop });
                }
                return this;
            };
            EditableField.prototype.typedText = function (text) {
                for (var i = 0; i < text.length; i += 1)
                    this.__controller.typedText(text.charAt(i));
                return this;
            };
            EditableField.prototype.dropEmbedded = function (pageX, pageY, options) {
                var clientX = pageX - $(window).scrollLeft();
                var clientY = pageY - $(window).scrollTop();
                var el = document.elementFromPoint(clientX, clientY);
                this.__controller.seek($(el), pageX, pageY);
                var cmd = new EmbedNode().setOptions(options);
                cmd.createLeftOf(this.__controller.cursor);
            };
            EditableField.prototype.setAriaLabel = function (ariaLabel) {
                this.__controller.setAriaLabel(ariaLabel);
                return this;
            };
            EditableField.prototype.getAriaLabel = function () {
                return this.__controller.getAriaLabel();
            };
            EditableField.prototype.setAriaPostLabel = function (ariaPostLabel, timeout) {
                this.__controller.setAriaPostLabel(ariaPostLabel, timeout);
                return this;
            };
            EditableField.prototype.getAriaPostLabel = function () {
                return this.__controller.getAriaPostLabel();
            };
            EditableField.prototype.clickAt = function (clientX, clientY, target) {
                target = target || document.elementFromPoint(clientX, clientY);
                var ctrlr = this.__controller, root = ctrlr.root;
                if (!jQuery.contains(root.jQ[0], target))
                    target = root.jQ[0];
                ctrlr.seek($(target), clientX + pageXOffset, clientY + pageYOffset);
                if (ctrlr.blurred)
                    this.focus();
                return this;
            };
            EditableField.prototype.ignoreNextMousedown = function (fn) {
                this.__controller.cursor.options.ignoreNextMousedown = fn;
                return this;
            };
            return EditableField;
        }(AbstractMathQuill));
        MQ.EditableField = function () {
            throw "wtf don't call me, I'm 'abstract'";
        };
        MQ.EditableField.prototype = EditableField.prototype;
        var APIClasses = {
            AbstractMathQuill: AbstractMathQuill,
            EditableField: EditableField,
        };
        /**
         * Export the API functions that MathQuill-ify an HTML element into API objects
         * of each class. If the element had already been MathQuill-ified but into a
         * different kind (or it's not an HTML element), return null.
         */
        for (var kind in API)
            (function (kind, defAPIClass) {
                var APIClass = (APIClasses[kind] = defAPIClass(APIClasses));
                MQ[kind] = function (el, opts) {
                    var mq = MQ(el);
                    if (mq instanceof APIClass || !el || !el.nodeType)
                        return mq;
                    var ctrlr = new Controller(new APIClass.RootBlock(), $(el), new Options());
                    ctrlr.KIND_OF_MQ = kind;
                    return new APIClass(ctrlr).__mathquillify(opts, v);
                };
                MQ[kind].prototype = APIClass.prototype;
            })(kind, API[kind]);
        return MQ;
    }
    MathQuill.noConflict = function () {
        window.MathQuill = origMathQuill;
        return MathQuill;
    };
    var origMathQuill = window.MathQuill;
    window.MathQuill = MathQuill;
    function RootBlockMixin(_) {
        _.moveOutOf = function (dir) {
            this.controller.handle('moveOutOf', dir);
        };
        _.deleteOutOf = function (dir) {
            this.controller.handle('deleteOutOf', dir);
        };
        _.selectOutOf = function (dir) {
            this.controller.handle('selectOutOf', dir);
        };
        _.upOutOf = function (dir) {
            this.controller.handle('upOutOf', dir);
        };
        _.downOutOf = function (dir) {
            this.controller.handle('downOutOf', dir);
        };
        _.reflow = function () {
            this.controller.handle('reflow');
            this.controller.handle('edited');
            this.controller.handle('edit');
        };
    }
    function parseError(stream, message) {
        if (stream) {
            stream = "'" + stream + "'";
        }
        else {
            stream = 'EOF';
        }
        throw 'Parse Error: ' + message + ' at ' + stream;
    }
    var Parser = /** @class */ (function () {
        // The Parser object is a wrapper for a parser function.
        // Externally, you use one to parse a string by calling
        //   var result = SomeParser.parse('Me Me Me! Parse Me!');
        // You should never call the constructor, rather you should
        // construct your Parser from the base parsers and the
        // parser combinator methods.
        function Parser(body) {
            this._ = body;
        }
        Parser.prototype.parse = function (stream) {
            return this.skip(Parser.eof)._('' + stream, success, parseError);
            function success(_stream, result) {
                return result;
            }
        };
        // -*- primitive combinators -*- //
        Parser.prototype.or = function (alternative) {
            pray('or is passed a parser', alternative instanceof Parser);
            var self = this;
            return new Parser(function (stream, onSuccess, onFailure) {
                return self._(stream, onSuccess, failure);
                function failure(_newStream) {
                    return alternative._(stream, onSuccess, onFailure);
                }
            });
        };
        Parser.prototype.then = function (next) {
            var self = this;
            return new Parser(function (stream, onSuccess, onFailure) {
                return self._(stream, success, onFailure);
                function success(newStream, result) {
                    var nextParser = next instanceof Parser ? next : next(result);
                    pray('a parser is returned', nextParser instanceof Parser);
                    return nextParser._(newStream, onSuccess, onFailure);
                }
            });
        };
        // -*- optimized iterative combinators -*- //
        Parser.prototype.many = function () {
            var self = this;
            return new Parser(function (stream, onSuccess, _onFailure) {
                var xs = [];
                while (self._(stream, success, failure))
                    ;
                return onSuccess(stream, xs);
                function success(newStream, x) {
                    stream = newStream;
                    xs.push(x);
                    return true;
                }
                function failure() {
                    return false;
                }
            });
        };
        Parser.prototype.times = function (min, max) {
            if (arguments.length < 2)
                max = min;
            var self = this;
            return new Parser(function (stream, onSuccess, onFailure) {
                var xs = [];
                var result = true;
                var failure;
                for (var i = 0; i < min; i += 1) {
                    // TODO, this may be incorrect for parsers that return boolean
                    // (or generally, falsey) values
                    result = !!self._(stream, success, firstFailure);
                    if (!result)
                        return onFailure(stream, failure);
                }
                for (; i < max && result; i += 1) {
                    self._(stream, success, secondFailure);
                }
                return onSuccess(stream, xs);
                function success(newStream, x) {
                    xs.push(x);
                    stream = newStream;
                    return true;
                }
                function firstFailure(newStream, msg) {
                    failure = msg;
                    stream = newStream;
                    return false;
                }
                function secondFailure(_newStream, _msg) {
                    return false;
                }
            });
        };
        // -*- higher-level combinators -*- //
        Parser.prototype.result = function (res) {
            return this.then(Parser.succeed(res));
        };
        Parser.prototype.atMost = function (n) {
            return this.times(0, n);
        };
        Parser.prototype.atLeast = function (n) {
            var self = this;
            return self.times(n).then(function (start) {
                return self.many().map(function (end) {
                    return start.concat(end);
                });
            });
        };
        Parser.prototype.map = function (fn) {
            return this.then(function (result) {
                return Parser.succeed(fn(result));
            });
        };
        Parser.prototype.skip = function (two) {
            return this.then(function (result) {
                return two.result(result);
            });
        };
        // -*- primitive parsers -*- //
        Parser.string = function (str) {
            var len = str.length;
            var expected = "expected '" + str + "'";
            return new Parser(function (stream, onSuccess, onFailure) {
                var head = stream.slice(0, len);
                if (head === str) {
                    return onSuccess(stream.slice(len), head);
                }
                else {
                    return onFailure(stream, expected);
                }
            });
        };
        Parser.regex = function (re) {
            pray('regexp parser is anchored', re.toString().charAt(1) === '^');
            var expected = 'expected ' + re;
            return new Parser(function (stream, onSuccess, onFailure) {
                var match = re.exec(stream);
                if (match) {
                    var result = match[0];
                    return onSuccess(stream.slice(result.length), result);
                }
                else {
                    return onFailure(stream, expected);
                }
            });
        };
        Parser.succeed = function (result) {
            return new Parser(function (stream, onSuccess) {
                return onSuccess(stream, result);
            });
        };
        Parser.fail = function (msg) {
            return new Parser(function (stream, _, onFailure) {
                return onFailure(stream, msg);
            });
        };
        Parser.letter = Parser.regex(/^[a-z]/i);
        Parser.letters = Parser.regex(/^[a-z]*/i);
        Parser.digit = Parser.regex(/^[0-9]/);
        Parser.digits = Parser.regex(/^[0-9]*/);
        Parser.whitespace = Parser.regex(/^\s+/);
        Parser.optWhitespace = Parser.regex(/^\s*/);
        Parser.any = new Parser(function (stream, onSuccess, onFailure) {
            if (!stream)
                return onFailure(stream, 'expected any character');
            return onSuccess(stream.slice(1), stream.charAt(0));
        });
        Parser.all = new Parser(function (stream, onSuccess, _onFailure) {
            return onSuccess('', stream);
        });
        Parser.eof = new Parser(function (stream, onSuccess, onFailure) {
            if (stream)
                return onFailure(stream, 'expected EOF');
            return onSuccess(stream, stream);
        });
        return Parser;
    }());
    var saneKeyboardEvents = (function () {
        // The following [key values][1] map was compiled from the
        // [DOM3 Events appendix section on key codes][2] and
        // [a widely cited report on cross-browser tests of key codes][3],
        // except for 10: 'Enter', which I've empirically observed in Safari on iOS
        // and doesn't appear to conflict with any other known key codes.
        //
        // [1]: http://www.w3.org/TR/2012/WD-DOM-Level-3-Events-20120614/#keys-keyvalues
        // [2]: http://www.w3.org/TR/2012/WD-DOM-Level-3-Events-20120614/#fixed-virtual-key-codes
        // [3]: http://unixpapa.com/js/key.html
        var KEY_VALUES = {
            8: 'Backspace',
            9: 'Tab',
            10: 'Enter',
            13: 'Enter',
            16: 'Shift',
            17: 'Control',
            18: 'Alt',
            20: 'CapsLock',
            27: 'Esc',
            32: 'Spacebar',
            33: 'PageUp',
            34: 'PageDown',
            35: 'End',
            36: 'Home',
            37: 'Left',
            38: 'Up',
            39: 'Right',
            40: 'Down',
            45: 'Insert',
            46: 'Del',
            144: 'NumLock',
        };
        // To the extent possible, create a normalized string representation
        // of the key combo (i.e., key code and modifier keys).
        function stringify(evt) {
            var which = evt.which || evt.keyCode;
            var keyVal = KEY_VALUES[which];
            var key;
            var modifiers = [];
            if (evt.ctrlKey)
                modifiers.push('Ctrl');
            if (evt.originalEvent && evt.originalEvent.metaKey)
                modifiers.push('Meta');
            if (evt.altKey)
                modifiers.push('Alt');
            if (evt.shiftKey)
                modifiers.push('Shift');
            key = keyVal || String.fromCharCode(which);
            if (!modifiers.length && !keyVal)
                return key;
            modifiers.push(key);
            return modifiers.join('-');
        }
        // create a keyboard events shim that calls callbacks at useful times
        // and exports useful public methods
        return function saneKeyboardEvents(el, controller) {
            var keydown = null;
            var keypress = null;
            var textarea = jQuery(el);
            var target = jQuery(controller.container || textarea);
            // checkTextareaFor() is called after key or clipboard events to
            // say "Hey, I think something was just typed" or "pasted" etc,
            // so that at all subsequent opportune times (next event or timeout),
            // will check for expected typed or pasted text.
            // Need to check repeatedly because #135: in Safari 5.1 (at least),
            // after selecting something and then typing, the textarea is
            // incorrectly reported as selected during the input event (but not
            // subsequently).
            var checkTextarea = noop;
            var timeoutId;
            function checkTextareaFor(checker) {
                checkTextarea = checker;
                clearTimeout(timeoutId);
                timeoutId = setTimeout(checker);
            }
            function checkTextareaOnce(checker) {
                checkTextareaFor(function (e) {
                    checkTextarea = noop;
                    clearTimeout(timeoutId);
                    checker(e);
                });
            }
            target.bind('keydown keypress input keyup paste', function (e) {
                checkTextarea(e);
            });
            function guardedTextareaSelect() {
                try {
                    // IE can throw an 'Incorrect Function' error if you
                    // try to select a textarea that is hidden. It seems
                    // likely that we don't really care if the selection
                    // fails to happen in this case. Why would the textarea
                    // be hidden? And who would even be able to tell?
                    textarea[0].select();
                }
                catch (e) { }
            }
            // -*- public methods -*- //
            function select(text) {
                // check textarea at least once/one last time before munging (so
                // no race condition if selection happens after keypress/paste but
                // before checkTextarea), then never again ('cos it's been munged)
                checkTextarea();
                checkTextarea = noop;
                clearTimeout(timeoutId);
                textarea.val(text);
                if (text)
                    guardedTextareaSelect();
                shouldBeSelected = !!text;
            }
            var shouldBeSelected = false;
            // -*- helper subroutines -*- //
            // Determine whether there's a selection in the textarea.
            // This will always return false in IE < 9, which don't support
            // HTMLTextareaElement::selection{Start,End}.
            function hasSelection() {
                var dom = textarea[0];
                if (!('selectionStart' in dom))
                    return false;
                return dom.selectionStart !== dom.selectionEnd;
            }
            function handleKey() {
                if (controller.options && controller.options.overrideKeystroke) {
                    controller.options.overrideKeystroke(stringify(keydown), keydown);
                }
                else {
                    controller.keystroke(stringify(keydown), keydown);
                }
            }
            // -*- event handlers -*- //
            function onKeydown(e) {
                if (e.target !== textarea[0])
                    return;
                keydown = e;
                keypress = null;
                if (shouldBeSelected)
                    checkTextareaOnce(function (e) {
                        if (!(e && e.type === 'focusout')) {
                            // re-select textarea in case it's an unrecognized key that clears
                            // the selection, then never again, 'cos next thing might be blur
                            guardedTextareaSelect();
                        }
                    });
                handleKey();
            }
            function isArrowKey(e) {
                if (!e || !e.originalEvent)
                    return false;
                // The keyPress event in FF reports which=0 for some reason. The new
                // .key property seems to report reasonable results, so we're using that
                switch (e.originalEvent.key) {
                    case 'ArrowRight':
                    case 'ArrowLeft':
                    case 'ArrowDown':
                    case 'ArrowUp':
                        return true;
                }
                return false;
            }
            function onKeypress(e) {
                if (e.target !== textarea[0])
                    return;
                // call the key handler for repeated keypresses.
                // This excludes keypresses that happen directly
                // after keydown.  In that case, there will be
                // no previous keypress, so we skip it here
                if (keydown && keypress)
                    handleKey();
                keypress = e;
                // only check for typed text if this key can type text. Otherwise
                // you can end up with mathquill thinking text was typed if you
                // use the mq.keystroke('Right') command while a single character
                // is selected. Only detected in FF.
                if (!isArrowKey(e)) {
                    checkTextareaFor(typedText);
                }
            }
            function onKeyup(e) {
                if (e.target !== textarea[0])
                    return;
                // Handle case of no keypress event being sent
                if (!!keydown && !keypress) {
                    // only check for typed text if this key can type text. Otherwise
                    // you can end up with mathquill thinking text was typed if you
                    // use the mq.keystroke('Right') command while a single character
                    // is selected. Only detected in FF.
                    if (!isArrowKey(e)) {
                        checkTextareaFor(typedText);
                    }
                }
            }
            function typedText() {
                // If there is a selection, the contents of the textarea couldn't
                // possibly have just been typed in.
                // This happens in browsers like Firefox and Opera that fire
                // keypress for keystrokes that are not text entry and leave the
                // selection in the textarea alone, such as Ctrl-C.
                // Note: we assume that browsers that don't support hasSelection()
                // also never fire keypress on keystrokes that are not text entry.
                // This seems reasonably safe because:
                // - all modern browsers including IE 9+ support hasSelection(),
                //   making it extremely unlikely any browser besides IE < 9 won't
                // - as far as we know IE < 9 never fires keypress on keystrokes
                //   that aren't text entry, which is only as reliable as our
                //   tests are comprehensive, but the IE < 9 way to do
                //   hasSelection() is poorly documented and is also only as
                //   reliable as our tests are comprehensive
                // If anything like #40 or #71 is reported in IE < 9, see
                // b1318e5349160b665003e36d4eedd64101ceacd8
                if (hasSelection())
                    return;
                var text = textarea.val();
                if (text.length === 1) {
                    textarea.val('');
                    if (controller.options && controller.options.overrideTypedText) {
                        controller.options.overrideTypedText(text);
                    }
                    else {
                        controller.typedText(text);
                    }
                } // in Firefox, keys that don't type text, just clear seln, fire keypress
                // https://github.com/mathquill/mathquill/issues/293#issuecomment-40997668
                else if (text)
                    guardedTextareaSelect(); // re-select if that's why we're here
            }
            function onBlur() {
                keydown = null;
                keypress = null;
                checkTextarea = noop;
                clearTimeout(timeoutId);
                textarea.val('');
            }
            function onPaste(e) {
                if (e.target !== textarea[0])
                    return;
                // browsers are dumb.
                //
                // In Linux, middle-click pasting causes onPaste to be called,
                // when the textarea is not necessarily focused.  We focus it
                // here to ensure that the pasted text actually ends up in the
                // textarea.
                //
                // It's pretty nifty that by changing focus in this handler,
                // we can change the target of the default action.  (This works
                // on keydown too, FWIW).
                //
                // And by nifty, we mean dumb (but useful sometimes).
                if (document.activeElement !== textarea[0]) {
                    textarea[0].focus();
                }
                checkTextareaFor(pastedText);
            }
            function pastedText() {
                var text = textarea.val();
                textarea.val('');
                if (text)
                    controller.paste(text);
            }
            // -*- attach event handlers -*- //
            if (controller.options && controller.options.disableCopyPaste) {
                target.bind({
                    keydown: onKeydown,
                    keypress: onKeypress,
                    keyup: onKeyup,
                    focusout: onBlur,
                    copy: function (e) {
                        e.preventDefault();
                    },
                    cut: function (e) {
                        e.preventDefault();
                    },
                    paste: function (e) {
                        e.preventDefault();
                    },
                });
            }
            else {
                target.bind({
                    keydown: onKeydown,
                    keypress: onKeypress,
                    keyup: onKeyup,
                    focusout: onBlur,
                    cut: function () {
                        checkTextareaOnce(function () {
                            controller.cut();
                        });
                    },
                    copy: function () {
                        checkTextareaOnce(function () {
                            controller.copy();
                        });
                    },
                    paste: onPaste,
                });
            }
            // -*- export public methods -*- //
            return {
                select: select,
            };
        };
    })();
    /***********************************************
     * Export math in a human-readable text format
     * As you can see, only half-baked so far.
     **********************************************/
    var Controller_exportText = /** @class */ (function (_super) {
        __extends(Controller_exportText, _super);
        function Controller_exportText() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        Controller_exportText.prototype.exportText = function () {
            return this.root.foldChildren('', function (text, child) {
                return text + child.text();
            });
        };
        return Controller_exportText;
    }(ControllerBase));
    ControllerBase.onNotify(function (cursor, e) {
        // these try to cover all ways that mathquill can be modified
        if (e === 'edit' || e === 'replace' || e === undefined) {
            var controller = cursor.controller;
            if (!controller)
                return;
            if (!controller.options.enableDigitGrouping)
                return;
            // TODO - maybe reconsider these 3 states and drop down to only 2
            //
            // blurred === false means we are focused. blurred === true or
            // blurred === undefined means we are not focused.
            if (controller.blurred !== false)
                return;
            controller.disableGroupingForSeconds(1);
        }
    });
    var Controller_focusBlur = /** @class */ (function (_super) {
        __extends(Controller_focusBlur, _super);
        function Controller_focusBlur() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        Controller_focusBlur.prototype.disableGroupingForSeconds = function (seconds) {
            clearTimeout(this.__disableGroupingTimeout);
            var jQ = this.root.jQ;
            if (seconds === 0) {
                jQ.removeClass('mq-suppress-grouping');
            }
            else {
                jQ.addClass('mq-suppress-grouping');
                this.__disableGroupingTimeout = setTimeout(function () {
                    jQ.removeClass('mq-suppress-grouping');
                }, seconds * 1000);
            }
        };
        Controller_focusBlur.prototype.focusBlurEvents = function () {
            var ctrlr = this, root = ctrlr.root, cursor = ctrlr.cursor;
            var blurTimeout;
            var textarea = ctrlr.getTextareaOrThrow();
            textarea
                .focus(function () {
                ctrlr.updateMathspeak();
                ctrlr.blurred = false;
                clearTimeout(blurTimeout);
                ctrlr.container.addClass('mq-focused');
                if (!cursor.parent)
                    cursor.insAtRightEnd(root);
                if (cursor.selection) {
                    cursor.selection.jQ.removeClass('mq-blur');
                    ctrlr.selectionChanged(); //re-select textarea contents after tabbing away and back
                }
                else {
                    cursor.show();
                }
                ctrlr.setOverflowClasses();
            })
                .blur(function () {
                if (ctrlr.textareaSelectionTimeout) {
                    clearTimeout(ctrlr.textareaSelectionTimeout);
                    ctrlr.textareaSelectionTimeout = 0;
                }
                ctrlr.disableGroupingForSeconds(0);
                ctrlr.blurred = true;
                blurTimeout = setTimeout(function () {
                    // wait for blur on window; if
                    root.postOrder(function (node) {
                        node.intentionalBlur();
                    }); // none, intentional blur: #264
                    cursor.clearSelection().endSelection();
                    blur();
                    ctrlr.updateMathspeak();
                    ctrlr.scrollHoriz();
                });
                $(window).bind('blur', windowBlur);
            });
            function windowBlur() {
                // blur event also fired on window, just switching
                clearTimeout(blurTimeout); // tabs/windows, not intentional blur
                if (cursor.selection)
                    cursor.selection.jQ.addClass('mq-blur');
                blur();
                ctrlr.updateMathspeak();
            }
            function blur() {
                // not directly in the textarea blur handler so as to be
                cursor.hide().parent.blur(cursor); // synchronous with/in the same frame as
                ctrlr.container.removeClass('mq-focused'); // clearing/blurring selection
                $(window).unbind('blur', windowBlur);
                if (ctrlr.options && ctrlr.options.resetCursorOnBlur) {
                    cursor.resetToEnd(ctrlr);
                }
            }
            ctrlr.blurred = true;
            cursor.hide().parent.blur(cursor);
        };
        Controller_focusBlur.prototype.unbindFocusBlurEvents = function () {
            var textarea = this.getTextareaOrThrow();
            textarea.unbind('focus blur');
        };
        return Controller_focusBlur;
    }(Controller_exportText));
    /**
     * TODO: I wanted to move MathBlock::focus and blur here, it would clean
     * up lots of stuff like, TextBlock::focus is set to MathBlock::focus
     * and TextBlock::blur calls MathBlock::blur, when instead they could
     * use inheritance and super_.
     *
     * Problem is, there's lots of calls to .focus()/.blur() on nodes
     * outside Controller::focusBlurEvents(), such as .postOrder('blur') on
     * insertion, which if MathBlock::blur becomes MQNode::blur, would add the
     * 'blur' CSS class to all MQSymbol's (because .isEmpty() is true for all
     * of them).
     *
     * I'm not even sure there aren't other troublesome calls to .focus() or
     * .blur(), so this is TODO for now.
     */
    /*****************************************
     * Deals with the browser DOM events from
     * interaction with the typist.
     ****************************************/
    /**
     * Only one incremental selection may be open at a time. Track whether
     * an incremental selection is open to help enforce this invariant.
     */
    var INCREMENTAL_SELECTION_OPEN = false;
    var MQNode = /** @class */ (function (_super) {
        __extends(MQNode, _super);
        function MQNode() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        MQNode.prototype.keystroke = function (key, e, ctrlr) {
            var cursor = ctrlr.cursor;
            switch (key) {
                case 'Ctrl-Shift-Backspace':
                case 'Ctrl-Backspace':
                    ctrlr.ctrlDeleteDir(L);
                    break;
                case 'Shift-Backspace':
                case 'Backspace':
                    ctrlr.backspace();
                    break;
                // Tab or Esc -> go one block right if it exists, else escape right.
                case 'Esc':
                case 'Tab':
                    ctrlr.escapeDir(R, key, e);
                    return;
                // Shift-Tab -> go one block left if it exists, else escape left.
                case 'Shift-Tab':
                case 'Shift-Esc':
                    ctrlr.escapeDir(L, key, e);
                    return;
                // End -> move to the end of the current block.
                case 'End':
                    ctrlr.notify('move').cursor.insAtRightEnd(cursor.parent);
                    ctrlr.aria.queue('end of').queue(cursor.parent, true);
                    break;
                // Ctrl-End -> move all the way to the end of the root block.
                case 'Ctrl-End':
                    ctrlr.notify('move').cursor.insAtRightEnd(ctrlr.root);
                    ctrlr.aria
                        .queue('end of')
                        .queue(ctrlr.ariaLabel)
                        .queue(ctrlr.root)
                        .queue(ctrlr.ariaPostLabel);
                    break;
                // Shift-End -> select to the end of the current block.
                case 'Shift-End':
                    ctrlr.selectToBlockEndInDir(R);
                    break;
                // Ctrl-Shift-End -> select all the way to the end of the root block.
                case 'Ctrl-Shift-End':
                    ctrlr.selectToRootEndInDir(R);
                    break;
                // Home -> move to the start of the current block.
                case 'Home':
                    ctrlr.notify('move').cursor.insAtLeftEnd(cursor.parent);
                    ctrlr.aria.queue('beginning of').queue(cursor.parent, true);
                    break;
                // Ctrl-Home -> move all the way to the start of the root block.
                case 'Ctrl-Home':
                    ctrlr.notify('move').cursor.insAtLeftEnd(ctrlr.root);
                    ctrlr.aria
                        .queue('beginning of')
                        .queue(ctrlr.ariaLabel)
                        .queue(ctrlr.root)
                        .queue(ctrlr.ariaPostLabel);
                    break;
                // Shift-Home -> select to the start of the current block.
                case 'Shift-Home':
                    ctrlr.selectToBlockEndInDir(L);
                    break;
                // Ctrl-Shift-Home -> select all the way to the start of the root block.
                case 'Ctrl-Shift-Home':
                    ctrlr.selectToRootEndInDir(L);
                    break;
                case 'Left':
                    ctrlr.moveLeft();
                    break;
                case 'Shift-Left':
                    ctrlr.selectLeft();
                    break;
                case 'Ctrl-Left':
                    break;
                case 'Right':
                    ctrlr.moveRight();
                    break;
                case 'Shift-Right':
                    ctrlr.selectRight();
                    break;
                case 'Ctrl-Right':
                    break;
                case 'Up':
                    ctrlr.moveUp();
                    break;
                case 'Down':
                    ctrlr.moveDown();
                    break;
                case 'Shift-Up':
                    ctrlr.withIncrementalSelection(function (selectDir) {
                        if (cursor[L]) {
                            while (cursor[L])
                                selectDir(L);
                        }
                        else {
                            selectDir(L);
                        }
                    });
                    break;
                case 'Shift-Down':
                    ctrlr.withIncrementalSelection(function (selectDir) {
                        if (cursor[R]) {
                            while (cursor[R])
                                selectDir(R);
                        }
                        else {
                            selectDir(R);
                        }
                    });
                    break;
                case 'Ctrl-Up':
                    break;
                case 'Ctrl-Down':
                    break;
                case 'Ctrl-Shift-Del':
                case 'Ctrl-Del':
                    ctrlr.ctrlDeleteDir(R);
                    break;
                case 'Shift-Del':
                case 'Del':
                    ctrlr.deleteForward();
                    break;
                case 'Meta-A':
                case 'Ctrl-A':
                    ctrlr.selectAll();
                    break;
                // These remaining hotkeys are only of benefit to people running screen readers.
                case 'Ctrl-Alt-Up': // speak parent block that has focus
                    if (cursor.parent.parent && cursor.parent.parent instanceof MQNode)
                        ctrlr.aria.queue(cursor.parent.parent);
                    else
                        ctrlr.aria.queue('nothing above');
                    break;
                case 'Ctrl-Alt-Down': // speak current block that has focus
                    if (cursor.parent && cursor.parent instanceof MQNode)
                        ctrlr.aria.queue(cursor.parent);
                    else
                        ctrlr.aria.queue('block is empty');
                    break;
                case 'Ctrl-Alt-Left': // speak left-adjacent block
                    if (cursor.parent.parent &&
                        cursor.parent.parent.ends &&
                        cursor.parent.parent.ends[L] &&
                        cursor.parent.parent.ends[L] instanceof MQNode) {
                        ctrlr.aria.queue(cursor.parent.parent.ends[L]);
                    }
                    else {
                        ctrlr.aria.queue('nothing to the left');
                    }
                    break;
                case 'Ctrl-Alt-Right': // speak right-adjacent block
                    if (cursor.parent.parent &&
                        cursor.parent.parent.ends &&
                        cursor.parent.parent.ends[R] &&
                        cursor.parent.parent.ends[R] instanceof MQNode) {
                        ctrlr.aria.queue(cursor.parent.parent.ends[R]);
                    }
                    else {
                        ctrlr.aria.queue('nothing to the right');
                    }
                    break;
                case 'Ctrl-Alt-Shift-Down': // speak selection
                    if (cursor.selection)
                        ctrlr.aria.queue(cursor.selection.join('mathspeak', ' ').trim() + ' selected');
                    else
                        ctrlr.aria.queue('nothing selected');
                    break;
                case 'Ctrl-Alt-=':
                case 'Ctrl-Alt-Shift-Right': // speak ARIA post label (evaluation or error)
                    if (ctrlr.ariaPostLabel.length)
                        ctrlr.aria.queue(ctrlr.ariaPostLabel);
                    else
                        ctrlr.aria.queue('no answer');
                    break;
                default:
                    return;
            }
            ctrlr.aria.alert();
            e.preventDefault();
            ctrlr.scrollHoriz();
        };
        MQNode.prototype.moveOutOf = function (_dir, _cursor, _updown) {
            pray('overridden or never called on this node');
        }; // called by Controller::escapeDir, moveDir
        MQNode.prototype.moveTowards = function (_dir, _cursor, _updown) {
            pray('overridden or never called on this node');
        }; // called by Controller::moveDir
        MQNode.prototype.deleteOutOf = function (_dir, _cursor) {
            pray('overridden or never called on this node');
        }; // called by Controller::deleteDir
        MQNode.prototype.deleteTowards = function (_dir, _cursor) {
            pray('overridden or never called on this node');
        }; // called by Controller::deleteDir
        MQNode.prototype.unselectInto = function (_dir, _cursor) {
            pray('overridden or never called on this node');
        }; // called by Controller::selectDir
        MQNode.prototype.selectOutOf = function (_dir, _cursor) {
            pray('overridden or never called on this node');
        }; // called by Controller::selectDir
        MQNode.prototype.selectTowards = function (_dir, _cursor) {
            pray('overridden or never called on this node');
        }; // called by Controller::selectDir
        return MQNode;
    }(NodeBase));
    ControllerBase.onNotify(function (cursor, e) {
        if (e === 'move' || e === 'upDown')
            cursor.show().clearSelection();
    });
    optionProcessors.leftRightIntoCmdGoes = function (updown) {
        if (updown && updown !== 'up' && updown !== 'down') {
            throw ('"up" or "down" required for leftRightIntoCmdGoes option, ' +
                'got "' +
                updown +
                '"');
        }
        return updown;
    };
    ControllerBase.onNotify(function (cursor, e) {
        if (e !== 'upDown')
            cursor.upDownCache = {};
    });
    ControllerBase.onNotify(function (cursor, e) {
        if (e === 'edit')
            cursor.show().deleteSelection();
    });
    ControllerBase.onNotify(function (cursor, e) {
        if (e !== 'select')
            cursor.endSelection();
    });
    var Controller_keystroke = /** @class */ (function (_super) {
        __extends(Controller_keystroke, _super);
        function Controller_keystroke() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        Controller_keystroke.prototype.keystroke = function (key, evt) {
            this.cursor.parent.keystroke(key, evt, this.getControllerSelf());
        };
        Controller_keystroke.prototype.escapeDir = function (dir, _key, e) {
            prayDirection(dir);
            var cursor = this.cursor;
            // only prevent default of Tab if not in the root editable
            if (cursor.parent !== this.root)
                e.preventDefault();
            // want to be a noop if in the root editable (in fact, Tab has an unrelated
            // default browser action if so)
            if (cursor.parent === this.root)
                return;
            cursor.parent.moveOutOf(dir, cursor);
            cursor.controller.aria.alert();
            return this.notify('move');
        };
        Controller_keystroke.prototype.moveDir = function (dir) {
            prayDirection(dir);
            var cursor = this.cursor, updown = cursor.options.leftRightIntoCmdGoes;
            var cursorDir = cursor[dir];
            if (cursor.selection) {
                cursor.insDirOf(dir, cursor.selection.ends[dir]);
            }
            else if (cursorDir)
                cursorDir.moveTowards(dir, cursor, updown);
            else
                cursor.parent.moveOutOf(dir, cursor, updown);
            return this.notify('move');
        };
        Controller_keystroke.prototype.moveLeft = function () {
            return this.moveDir(L);
        };
        Controller_keystroke.prototype.moveRight = function () {
            return this.moveDir(R);
        };
        /**
         * moveUp and moveDown have almost identical algorithms:
         * - first check left and right, if so insAtLeft/RightEnd of them
         * - else check the parent's 'upOutOf'/'downOutOf' property:
         *   + if it's a function, call it with the cursor as the sole argument and
         *     use the return value as if it were the value of the property
         *   + if it's a Node, jump up or down into it:
         *     - if there is a cached Point in the block, insert there
         *     - else, seekHoriz within the block to the current x-coordinate (to be
         *       as close to directly above/below the current position as possible)
         *   + unless it's exactly `true`, stop bubbling
         */
        Controller_keystroke.prototype.moveUp = function () {
            return this.moveUpDown('up');
        };
        Controller_keystroke.prototype.moveDown = function () {
            return this.moveUpDown('down');
        };
        Controller_keystroke.prototype.moveUpDown = function (dir) {
            var self = this;
            var cursor = self.notify('upDown').cursor;
            var dirInto;
            var dirOutOf;
            if (dir === 'up') {
                dirInto = 'upInto';
                dirOutOf = 'upOutOf';
            }
            else {
                dirInto = 'downInto';
                dirOutOf = 'downOutOf';
            }
            var cursorL = cursor[L];
            var cursorR = cursor[R];
            var cursorR_dirInto = cursorR && cursorR[dirInto];
            var cursorL_dirInto = cursorL && cursorL[dirInto];
            if (cursorR_dirInto)
                cursor.insAtLeftEnd(cursorR_dirInto);
            else if (cursorL_dirInto)
                cursor.insAtRightEnd(cursorL_dirInto);
            else {
                cursor.parent.bubble(function (ancestor) {
                    // TODO - revist this
                    var prop = ancestor[dirOutOf];
                    if (prop) {
                        if (typeof prop === 'function')
                            prop = prop.call(ancestor, cursor); // TODO - figure out if we need to assign to prop
                        if (prop instanceof MQNode)
                            cursor.jumpUpDown(ancestor, prop);
                        if (prop !== true)
                            return false; // TODO - figure out how this can return true
                    }
                    return undefined;
                });
            }
            return self;
        };
        Controller_keystroke.prototype.deleteDir = function (dir) {
            prayDirection(dir);
            var cursor = this.cursor;
            var cursorEl = cursor[dir];
            var cursorElParent = cursor.parent.parent;
            var ctrlr = cursor.controller;
            if (cursorEl && cursorEl instanceof MQNode) {
                if (cursorEl.sides) {
                    ctrlr.aria.queue(cursorEl.parent
                        .chToCmd(cursorEl.sides[-dir].ch)
                        .mathspeak({ createdLeftOf: cursor }));
                    // generally, speak the current element if it has no blocks,
                    // but don't for text block commands as the deleteTowards method
                    // in the TextCommand class is responsible for speaking the new character under the cursor.
                }
                else if (!cursorEl.blocks && cursorEl.parent.ctrlSeq !== '\\text') {
                    ctrlr.aria.queue(cursorEl);
                }
            }
            else if (cursorElParent && cursorElParent instanceof MQNode) {
                if (cursorElParent.sides) {
                    ctrlr.aria.queue(cursorElParent.parent
                        .chToCmd(cursorElParent.sides[dir].ch)
                        .mathspeak({ createdLeftOf: cursor }));
                }
                else if (cursorElParent.blocks && cursorElParent.mathspeakTemplate) {
                    if (cursorElParent.upInto && cursorElParent.downInto) {
                        // likely a fraction, and we just backspaced over the slash
                        ctrlr.aria.queue(cursorElParent.mathspeakTemplate[1]);
                    }
                    else {
                        var mst = cursorElParent.mathspeakTemplate;
                        var textToQueue = dir === L ? mst[0] : mst[mst.length - 1];
                        ctrlr.aria.queue(textToQueue);
                    }
                }
                else {
                    ctrlr.aria.queue(cursorElParent);
                }
            }
            var hadSelection = cursor.selection;
            this.notify('edit'); // deletes selection if present
            if (!hadSelection) {
                var cursorDir = cursor[dir];
                if (cursorDir)
                    cursorDir.deleteTowards(dir, cursor);
                else
                    cursor.parent.deleteOutOf(dir, cursor);
            }
            var cursorL = cursor[L];
            var cursorR = cursor[R];
            if (cursorL.siblingDeleted)
                cursorL.siblingDeleted(cursor.options, R);
            if (cursorR.siblingDeleted)
                cursorR.siblingDeleted(cursor.options, L);
            cursor.parent.bubble(function (node) {
                node.reflow();
                return undefined;
            });
            return this;
        };
        Controller_keystroke.prototype.ctrlDeleteDir = function (dir) {
            prayDirection(dir);
            var cursor = this.cursor;
            if (!cursor[dir] || cursor.selection)
                return this.deleteDir(dir);
            this.notify('edit');
            var fragRemoved;
            if (dir === L) {
                fragRemoved = new Fragment(cursor.parent.ends[L], cursor[L]);
            }
            else {
                fragRemoved = new Fragment(cursor[R], cursor.parent.ends[R]);
            }
            cursor.controller.aria.queue(fragRemoved);
            fragRemoved.remove();
            cursor.insAtDirEnd(dir, cursor.parent);
            var cursorL = cursor[L];
            var cursorR = cursor[R];
            if (cursorL)
                cursorL.siblingDeleted(cursor.options, R);
            if (cursorR)
                cursorR.siblingDeleted(cursor.options, L);
            cursor.parent.bubble(function (node) {
                node.reflow();
                return undefined;
            });
            return this;
        };
        Controller_keystroke.prototype.backspace = function () {
            return this.deleteDir(L);
        };
        Controller_keystroke.prototype.deleteForward = function () {
            return this.deleteDir(R);
        };
        /**
         * startIncrementalSelection, selectDirIncremental, and finishIncrementalSelection
         * should only be called by withIncrementalSelection because they must
         * be called in sequence.
         */
        Controller_keystroke.prototype.startIncrementalSelection = function () {
            pray("Multiple selections can't be simultaneously open", !INCREMENTAL_SELECTION_OPEN);
            INCREMENTAL_SELECTION_OPEN = true;
            this.notify('select');
            var cursor = this.cursor;
            if (!cursor.anticursor)
                cursor.startSelection();
        };
        /**
         * Update the selection model, stored in cursor, without modifying
         * selection DOM.
         *
         * startIncrementalSelection, selectDirIncremental, and finishIncrementalSelection
         * should only be called by withIncrementalSelection because they must
         * be called in sequence.
         */
        Controller_keystroke.prototype.selectDirIncremental = function (dir) {
            pray('A selection is open', INCREMENTAL_SELECTION_OPEN);
            INCREMENTAL_SELECTION_OPEN = true;
            var cursor = this.cursor, seln = cursor.selection;
            prayDirection(dir);
            var node = cursor[dir];
            if (node) {
                // "if node we're selecting towards is inside selection (hence retracting)
                // and is on the *far side* of the selection (hence is only node selected)
                // and the anticursor is *inside* that node, not just on the other side"
                if (seln &&
                    seln.ends[dir] === node &&
                    cursor.anticursor[-dir] !== node) {
                    node.unselectInto(dir, cursor);
                }
                else
                    node.selectTowards(dir, cursor);
            }
            else
                cursor.parent.selectOutOf(dir, cursor);
        };
        /**
         * Update selection DOM to match cursor model
         *
         * startIncrementalSelection, selectDirIncremental, and finishIncrementalSelection
         * should only be called by withIncrementalSelection because they must
         * be called in sequence.
         */
        Controller_keystroke.prototype.finishIncrementalSelection = function () {
            pray('A selection is open', INCREMENTAL_SELECTION_OPEN);
            var cursor = this.cursor;
            cursor.clearSelection();
            cursor.select() || cursor.show();
            var selection = cursor.selection;
            if (selection) {
                cursor.controller.aria
                    .clear()
                    .queue(selection.join('mathspeak', ' ').trim() + ' selected'); // clearing first because selection fires several times, and we don't want repeated speech.
            }
            INCREMENTAL_SELECTION_OPEN = false;
        };
        /**
         * Used to build a selection incrementally in a loop. Calls the passed
         * callback with a selectDir function that may be called many times,
         * and defers updating the view until the incremental selection is
         * complete
         *
         * Wraps up calling
         *
         *     this.startSelection()
         *     this.selectDirIncremental(dir) // possibly many times
         *     this.finishSelection()
         *
         * with extra error handling and invariant enforcement
         */
        Controller_keystroke.prototype.withIncrementalSelection = function (cb) {
            var _this = this;
            try {
                this.startIncrementalSelection();
                try {
                    cb(function (dir) { return _this.selectDirIncremental(dir); });
                }
                finally {
                    // Since we have started a selection, attempt to finish it even
                    // if the callback throws an error
                    this.finishIncrementalSelection();
                }
            }
            finally {
                // Mark selection as closed even if finishSelection throws an
                // error. Makes a possible error in finishSelection more
                // recoverable
                INCREMENTAL_SELECTION_OPEN = false;
            }
        };
        /**
         * Grow selection one unit in the given direction
         *
         * Note, this should not be called in a loop. To incrementally grow a
         * selection, use withIncrementalSelection
         */
        Controller_keystroke.prototype.selectDir = function (dir) {
            this.withIncrementalSelection(function (selectDir) { return selectDir(dir); });
        };
        Controller_keystroke.prototype.selectLeft = function () {
            return this.selectDir(L);
        };
        Controller_keystroke.prototype.selectRight = function () {
            return this.selectDir(R);
        };
        Controller_keystroke.prototype.selectAll = function () {
            this.notify('move');
            var cursor = this.cursor;
            cursor.insAtRightEnd(this.root);
            this.withIncrementalSelection(function (selectDir) {
                while (cursor[L])
                    selectDir(L);
            });
        };
        Controller_keystroke.prototype.selectToBlockEndInDir = function (dir) {
            var cursor = this.cursor;
            this.withIncrementalSelection(function (selectDir) {
                while (cursor[dir])
                    selectDir(dir);
            });
        };
        Controller_keystroke.prototype.selectToRootEndInDir = function (dir) {
            var _this = this;
            var cursor = this.cursor;
            this.withIncrementalSelection(function (selectDir) {
                while (cursor[dir] || cursor.parent !== _this.root) {
                    selectDir(dir);
                }
            });
        };
        return Controller_keystroke;
    }(Controller_focusBlur));
    var TempSingleCharNode = /** @class */ (function (_super) {
        __extends(TempSingleCharNode, _super);
        function TempSingleCharNode(_char) {
            return _super.call(this) || this;
        }
        return TempSingleCharNode;
    }(MQNode));
    // Parser MathBlock
    var latexMathParser = (function () {
        function commandToBlock(cmd) {
            // can also take in a Fragment
            var block = new MathBlock();
            cmd.adopt(block, 0, 0);
            return block;
        }
        function joinBlocks(blocks) {
            var firstBlock = blocks[0] || new MathBlock();
            for (var i = 1; i < blocks.length; i += 1) {
                blocks[i].children().adopt(firstBlock, firstBlock.ends[R], 0);
            }
            return firstBlock;
        }
        var string = Parser.string;
        var regex = Parser.regex;
        var letter = Parser.letter;
        var digit = Parser.digit;
        var any = Parser.any;
        var optWhitespace = Parser.optWhitespace;
        var succeed = Parser.succeed;
        var fail = Parser.fail;
        // Parsers yielding either MathCommands, or Fragments of MathCommands
        //   (either way, something that can be adopted by a MathBlock)
        var variable = letter.map(function (c) {
            return new Letter(c);
        });
        var number = digit.map(function (c) {
            return new Digit(c);
        });
        var symbol = regex(/^[^${}\\_^]/).map(function (c) {
            return new VanillaSymbol(c);
        });
        var controlSequence = regex(/^[^\\a-eg-zA-Z]/) // hotfix #164; match MathBlock::write
            .or(string('\\').then(regex(/^[a-z]+/i)
            .or(regex(/^\s+/).result(' '))
            .or(any)))
            .then(function (ctrlSeq) {
            // TODO - is Parser<MQNode> correct?
            var cmdKlass = LatexCmds[ctrlSeq];
            if (cmdKlass) {
                if (cmdKlass.constructor) {
                    var actualClass = cmdKlass; // TODO - figure out how to know the difference
                    return new actualClass(ctrlSeq).parser();
                }
                else {
                    var builder = cmdKlass; // TODO - figure out how to know the difference
                    return builder(ctrlSeq).parser();
                }
            }
            else {
                return fail('unknown command: \\' + ctrlSeq);
            }
        });
        var command = controlSequence.or(variable).or(number).or(symbol);
        // Parsers yielding MathBlocks
        var mathGroup = string('{')
            .then(function () {
            return mathSequence;
        })
            .skip(string('}'));
        var mathBlock = optWhitespace.then(mathGroup.or(command.map(commandToBlock)));
        var mathSequence = mathBlock.many().map(joinBlocks).skip(optWhitespace);
        var optMathBlock = string('[')
            .then(mathBlock
            .then(function (block) {
            return block.join('latex') !== ']' ? succeed(block) : fail('');
        })
            .many()
            .map(joinBlocks)
            .skip(optWhitespace))
            .skip(string(']'));
        var latexMath = mathSequence;
        latexMath.block = mathBlock;
        latexMath.optBlock = optMathBlock;
        return latexMath;
    })();
    optionProcessors.maxDepth = function (depth) {
        return typeof depth === 'number' ? depth : undefined;
    };
    var Controller_latex = /** @class */ (function (_super) {
        __extends(Controller_latex, _super);
        function Controller_latex() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        Controller_latex.prototype.cleanLatex = function (latex) {
            //prune unnecessary spaces
            return latex.replace(/(\\[a-z]+) (?![a-z])/gi, '$1');
        };
        Controller_latex.prototype.exportLatex = function () {
            return this.cleanLatex(this.root.latex());
        };
        Controller_latex.prototype.writeLatex = function (latex) {
            var cursor = this.notify('edit').cursor;
            cursor.parent.writeLatex(cursor, latex);
            return this;
        };
        Controller_latex.prototype.classifyLatexForEfficientUpdate = function (latex) {
            if (typeof latex !== 'string')
                return;
            var matches = latex.match(/-?[0-9.]+$/g);
            if (matches && matches.length === 1) {
                return {
                    latex: latex,
                    prefix: latex.substr(0, latex.length - matches[0].length),
                    digits: matches[0],
                };
            }
            return;
        };
        Controller_latex.prototype.renderLatexMathEfficiently = function (latex) {
            var root = this.root;
            var oldLatex = this.exportLatex();
            if (root.ends[L] && root.ends[R] && oldLatex === latex) {
                return true;
            }
            var oldClassification;
            var classification = this.classifyLatexForEfficientUpdate(latex);
            if (classification) {
                oldClassification = this.classifyLatexForEfficientUpdate(oldLatex);
                if (!oldClassification ||
                    oldClassification.prefix !== classification.prefix) {
                    return false;
                }
            }
            else {
                return false;
            }
            // check if minus sign is changing
            var oldDigits = oldClassification.digits;
            var newDigits = classification.digits;
            var oldMinusSign = false;
            var newMinusSign = false;
            if (oldDigits[0] === '-') {
                oldMinusSign = true;
                oldDigits = oldDigits.substr(1);
            }
            if (newDigits[0] === '-') {
                newMinusSign = true;
                newDigits = newDigits.substr(1);
            }
            // start at the very end
            var charNode = this.root.ends[R];
            var oldCharNodes = [];
            for (var i = oldDigits.length - 1; i >= 0; i--) {
                // the tree does not match what we expect
                if (!charNode || charNode.ctrlSeq !== oldDigits[i]) {
                    return false;
                }
                // the trailing digits are not just under the root. We require the root
                // to be the parent so that we can be sure we do not need a reflow to
                // grow parens.
                if (charNode.parent !== root) {
                    return false;
                }
                // push to the start. We're traversing backwards
                oldCharNodes.unshift(charNode);
                // move left one character
                charNode = charNode[L];
            }
            // remove the minus sign
            if (oldMinusSign && !newMinusSign) {
                var oldMinusNode = charNode;
                if (!oldMinusNode)
                    return false;
                if (oldMinusNode.ctrlSeq !== '-')
                    return false;
                if (oldMinusNode[R] !== oldCharNodes[0])
                    return false;
                if (oldMinusNode.parent !== root)
                    return false;
                var oldMinusNodeL = oldMinusNode[L];
                if (oldMinusNodeL && oldMinusNodeL.parent !== root)
                    return false;
                oldCharNodes[0][L] = oldMinusNode[L];
                if (root.ends[L] === oldMinusNode)
                    root.ends[L] = oldCharNodes[0];
                if (oldMinusNodeL)
                    oldMinusNodeL[R] = oldCharNodes[0];
                oldMinusNode.jQ.remove();
            }
            // add a minus sign
            if (!oldMinusSign && newMinusSign) {
                var newMinusNode = new PlusMinus('-');
                var minusSpan = document.createElement('span');
                minusSpan.textContent = '-';
                newMinusNode.jQ = $(minusSpan);
                var oldCharNodes0L = oldCharNodes[0][L];
                if (oldCharNodes0L)
                    oldCharNodes0L[R] = newMinusNode;
                if (root.ends[L] === oldCharNodes[0])
                    root.ends[L] = newMinusNode;
                newMinusNode.parent = root;
                newMinusNode[L] = oldCharNodes[0][L];
                newMinusNode[R] = oldCharNodes[0];
                oldCharNodes[0][L] = newMinusNode;
                newMinusNode.contactWeld(this.cursor); // decide if binary operator
                newMinusNode.jQ.insertBefore(oldCharNodes[0].jQ);
            }
            // update the text of the current nodes
            var commonLength = Math.min(oldDigits.length, newDigits.length);
            for (i = 0; i < commonLength; i++) {
                var newText = newDigits[i];
                charNode = oldCharNodes[i];
                if (charNode.ctrlSeq !== newText) {
                    charNode.ctrlSeq = newText;
                    charNode.jQ[0].textContent = newText;
                    charNode.mathspeakName = newText;
                }
            }
            // remove the extra digits at the end
            if (oldDigits.length > newDigits.length) {
                charNode = oldCharNodes[newDigits.length - 1];
                root.ends[R] = charNode;
                charNode[R] = 0;
                for (i = oldDigits.length - 1; i >= commonLength; i--) {
                    oldCharNodes[i].jQ.remove();
                }
            }
            // add new digits after the existing ones
            if (newDigits.length > oldDigits.length) {
                var frag = document.createDocumentFragment();
                for (i = commonLength; i < newDigits.length; i++) {
                    var span = document.createElement('span');
                    span.className = 'mq-digit';
                    span.textContent = newDigits[i];
                    var newNode = new Digit(newDigits[i]);
                    newNode.parent = root;
                    newNode.jQ = $(span);
                    frag.appendChild(span);
                    // splice this node in
                    newNode[L] = root.ends[R];
                    newNode[R] = 0;
                    var newNodeL = newNode[L];
                    newNodeL[R] = newNode;
                    root.ends[R] = newNode;
                }
                root.jQ[0].appendChild(frag);
            }
            var currentLatex = this.exportLatex();
            if (currentLatex !== latex) {
                console.warn('tried updating latex efficiently but did not work. Attempted: ' +
                    latex +
                    ' but wrote: ' +
                    currentLatex);
                return false;
            }
            this.cursor.resetToEnd(this);
            var rightMost = root.ends[R];
            if (rightMost) {
                rightMost.fixDigitGrouping(this.cursor.options);
            }
            return true;
        };
        Controller_latex.prototype.renderLatexMathFromScratch = function (latex) {
            var root = this.root, cursor = this.cursor;
            var all = Parser.all;
            var eof = Parser.eof;
            var block = latexMathParser
                .skip(eof)
                .or(all.result(false))
                .parse(latex);
            root.ends[L] = root.ends[R] = 0;
            if (block) {
                block.children().adopt(root, 0, 0);
            }
            var jQ = root.jQ;
            if (block) {
                var html = block.join('html');
                jQ.html(html);
                root.jQize(jQ.children());
                root.finalizeInsert(cursor.options, cursor);
            }
            else {
                jQ.empty();
            }
            this.updateMathspeak();
            delete cursor.selection;
            cursor.insAtRightEnd(root);
        };
        Controller_latex.prototype.renderLatexMath = function (latex) {
            this.notify('replace');
            if (this.renderLatexMathEfficiently(latex))
                return;
            this.renderLatexMathFromScratch(latex);
        };
        Controller_latex.prototype.renderLatexText = function (latex) {
            var root = this.root, cursor = this.cursor;
            root.jQ.children().slice(1).remove();
            root.ends[L] = root.ends[R] = 0;
            delete cursor.selection;
            cursor.show().insAtRightEnd(root);
            var regex = Parser.regex;
            var string = Parser.string;
            var eof = Parser.eof;
            var all = Parser.all;
            // Parser RootMathCommand
            var mathMode = string('$')
                .then(latexMathParser)
                // because TeX is insane, math mode doesn't necessarily
                // have to end.  So we allow for the case that math mode
                // continues to the end of the stream.
                .skip(string('$').or(eof))
                .map(function (block) {
                // HACK FIXME: this shouldn't have to have access to cursor
                var rootMathCommand = new RootMathCommand(cursor);
                rootMathCommand.createBlocks();
                var rootMathBlock = rootMathCommand.ends[L];
                block.children().adopt(rootMathBlock, 0, 0);
                return rootMathCommand;
            });
            var escapedDollar = string('\\$').result('$');
            var textChar = escapedDollar
                .or(regex(/^[^$]/))
                .map(function (ch) { return new VanillaSymbol(ch); });
            var latexText = mathMode.or(textChar).many();
            var commands = latexText
                .skip(eof)
                .or(all.result(false))
                .parse(latex);
            if (commands) {
                for (var i = 0; i < commands.length; i += 1) {
                    commands[i].adopt(root, root.ends[R], 0);
                }
                root.jQize().appendTo(root.jQ);
                root.finalizeInsert(cursor.options, cursor);
            }
        };
        return Controller_latex;
    }(Controller_keystroke));
    /********************************************************
     * Deals with mouse events for clicking, drag-to-select
     *******************************************************/
    var ignoreNextMouseDownNoop = function (_el) {
        return false;
    };
    Options.prototype.ignoreNextMousedown = ignoreNextMouseDownNoop;
    // Whenever edits to the tree occur, in-progress selection events
    // must be invalidated and selection changes must not be applied to
    // the edited tree. cancelSelectionOnEdit takes care of this.
    var cancelSelectionOnEdit;
    (function () {
        ControllerBase.onNotify(function (cursor, e) {
            if (e === 'edit' || e === 'replace') {
                // this will be called any time ANY mathquill is edited. We only want
                // to cancel selection if the selection is happening within the mathquill
                // that dispatched the notify. Otherwise you won't be able to select any
                // mathquills while a slider is playing.
                if (cancelSelectionOnEdit && cancelSelectionOnEdit.cursor === cursor) {
                    cancelSelectionOnEdit.cb();
                }
            }
        });
    })();
    var Controller_mouse = /** @class */ (function (_super) {
        __extends(Controller_mouse, _super);
        function Controller_mouse() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        Controller_mouse.prototype.delegateMouseEvents = function () {
            var ultimateRootjQ = this.root.jQ;
            //drag-to-select event handling
            this.container.bind('mousedown.mathquill', function (_e) {
                var e = _e;
                var rootjQ = $(e.target).closest('.mq-root-block');
                var root = (NodeBase.getNodeOfElement(rootjQ[0]) ||
                    NodeBase.getNodeOfElement(ultimateRootjQ[0]));
                var ctrlr = root.controller, cursor = ctrlr.cursor, blink = cursor.blink;
                var textareaSpan = ctrlr.getTextareaSpanOrThrow();
                var textarea = ctrlr.getTextareaOrThrow();
                e.preventDefault(); // doesn't work in IE≤8, but it's a one-line fix:
                e.target.unselectable = true; // http://jsbin.com/yagekiji/1 // TODO - no idea what this unselectable property is
                if (cursor.options.ignoreNextMousedown(e))
                    return;
                else
                    cursor.options.ignoreNextMousedown = ignoreNextMouseDownNoop;
                var target;
                function mousemove(e) {
                    target = $(e.target);
                }
                function docmousemove(e) {
                    if (!cursor.anticursor)
                        cursor.startSelection();
                    ctrlr.seek(target, e.pageX, e.pageY).cursor.select();
                    if (cursor.selection)
                        cursor.controller.aria
                            .clear()
                            .queue(cursor.selection.join('mathspeak') + ' selected')
                            .alert();
                    target = undefined;
                }
                // outside rootjQ, the MathQuill node corresponding to the target (if any)
                // won't be inside this root, so don't mislead Controller::seek with it
                function unbindListeners(e) {
                    // delete the mouse handlers now that we're not dragging anymore
                    rootjQ.unbind('mousemove', mousemove);
                    var anyTarget = e.target; // TODO - why do we need to cast to any?
                    $(anyTarget.ownerDocument)
                        .unbind('mousemove', docmousemove)
                        .unbind('mouseup', mouseup);
                    cancelSelectionOnEdit = undefined;
                }
                function updateCursor() {
                    if (ctrlr.editable) {
                        cursor.show();
                        cursor.controller.aria.queue(cursor.parent).alert();
                    }
                    else {
                        textareaSpan.detach();
                    }
                }
                function mouseup(e) {
                    cursor.blink = blink;
                    if (!cursor.selection)
                        updateCursor();
                    unbindListeners(e);
                }
                var wasEdited;
                cancelSelectionOnEdit = {
                    cursor: cursor,
                    cb: function () {
                        // If an edit happens while the mouse is down, the existing
                        // selection is no longer valid. Clear it and unbind listeners,
                        // similar to what happens on mouseup.
                        wasEdited = true;
                        cursor.blink = blink;
                        cursor.clearSelection();
                        updateCursor();
                        unbindListeners(e);
                    },
                };
                if (ctrlr.blurred) {
                    if (!ctrlr.editable)
                        rootjQ.prepend(textareaSpan);
                    textarea[0].focus();
                    // focus call may bubble to clients, who may then write to
                    // mathquill, triggering cancelSelectionOnEdit. If that happens, we
                    // don't want to stop the cursor blink or bind listeners,
                    // so return early.
                    if (wasEdited)
                        return;
                }
                cursor.blink = noop;
                ctrlr.seek($(e.target), e.pageX, e.pageY).cursor.startSelection();
                rootjQ.mousemove(mousemove);
                var anyTarget = e.target; // TODO - why do we need to cast to any?
                $(anyTarget.ownerDocument).mousemove(docmousemove).mouseup(mouseup);
                // listen on document not just body to not only hear about mousemove and
                // mouseup on page outside field, but even outside page, except iframes: https://github.com/mathquill/mathquill/commit/8c50028afcffcace655d8ae2049f6e02482346c5#commitcomment-6175800
            });
        };
        Controller_mouse.prototype.seek = function ($target, pageX, _pageY) {
            var cursor = this.notify('select').cursor;
            var node;
            var targetElm = $target && $target[0];
            // we can click on an element that is deeply nested past the point
            // that mathquill knows about. We need to traverse up to the first
            // node that mathquill is aware of
            while (targetElm) {
                // try to find the MQ Node associated with the DOM Element
                node = NodeBase.getNodeOfElement(targetElm);
                if (node)
                    break;
                // must be too deep, traverse up to the parent DOM Element
                targetElm = targetElm.parentElement;
            }
            // Could not find any nodes, just use the root
            if (!node) {
                node = this.root;
            }
            // don't clear selection until after getting node from target, in case
            // target was selection span, otherwise target will have no parent and will
            // seek from root, which is less accurate (e.g. fraction)
            cursor.clearSelection().show();
            node.seek(pageX, cursor);
            this.scrollHoriz(); // before .selectFrom when mouse-selecting, so
            // always hits no-selection case in scrollHoriz and scrolls slower
            return this;
        };
        return Controller_mouse;
    }(Controller_latex));
    /***********************************************
     * Horizontal panning for editable fields that
     * overflow their width
     **********************************************/
    var Controller_scrollHoriz = /** @class */ (function (_super) {
        __extends(Controller_scrollHoriz, _super);
        function Controller_scrollHoriz() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        Controller_scrollHoriz.prototype.setOverflowClasses = function () {
            var root = this.root.jQ[0];
            var shouldHaveOverflowRight = false;
            var shouldHaveOverflowLeft = false;
            if (!this.blurred) {
                var width = root.getBoundingClientRect().width;
                var scrollWidth = root.scrollWidth;
                var scroll = root.scrollLeft;
                shouldHaveOverflowRight = scrollWidth > width + scroll;
                shouldHaveOverflowLeft = scroll > 0;
            }
            if (root.classList.contains('mq-editing-overflow-right') !==
                shouldHaveOverflowRight)
                root.classList.toggle('mq-editing-overflow-right');
            if (root.classList.contains('mq-editing-overflow-left') !==
                shouldHaveOverflowLeft)
                root.classList.toggle('mq-editing-overflow-left');
        };
        Controller_scrollHoriz.prototype.scrollHoriz = function () {
            var _this = this;
            var cursor = this.cursor, seln = cursor.selection;
            var rootRect = this.root.jQ[0].getBoundingClientRect();
            if (!cursor.jQ[0] && !seln) {
                this.root.jQ.stop().animate({ scrollLeft: 0 }, 100, function () {
                    _this.setOverflowClasses();
                });
                return;
            }
            else if (!seln) {
                var x = cursor.jQ[0].getBoundingClientRect().left;
                if (x > rootRect.right - 20)
                    var scrollBy = x - (rootRect.right - 20);
                else if (x < rootRect.left + 20)
                    var scrollBy = x - (rootRect.left + 20);
                else
                    return;
            }
            else {
                var rect = seln.jQ[0].getBoundingClientRect();
                var overLeft = rect.left - (rootRect.left + 20);
                var overRight = rect.right - (rootRect.right - 20);
                if (seln.ends[L] === cursor[R]) {
                    if (overLeft < 0)
                        var scrollBy = overLeft;
                    else if (overRight > 0) {
                        if (rect.left - overRight < rootRect.left + 20)
                            var scrollBy = overLeft;
                        else
                            var scrollBy = overRight;
                    }
                    else
                        return;
                }
                else {
                    if (overRight > 0)
                        var scrollBy = overRight;
                    else if (overLeft < 0) {
                        if (rect.right - overLeft > rootRect.right - 20)
                            var scrollBy = overRight;
                        else
                            var scrollBy = overLeft;
                    }
                    else
                        return;
                }
            }
            var root = this.root.jQ[0];
            if (scrollBy < 0 && root.scrollLeft === 0)
                return;
            if (scrollBy > 0 && root.scrollWidth <= root.scrollLeft + rootRect.width)
                return;
            this.root.jQ.stop().animate({ scrollLeft: '+=' + scrollBy }, 100, function () {
                _this.setOverflowClasses();
            });
        };
        return Controller_scrollHoriz;
    }(Controller_mouse));
    /*********************************************
     * Manage the MathQuill instance's textarea
     * (as owned by the Controller)
     ********************************************/
    Options.prototype.substituteTextarea = function () {
        return $('<textarea autocapitalize=off autocomplete=off autocorrect=off ' +
            'spellcheck=false x-palm-disable-ste-all=true/>')[0];
    };
    Options.prototype.substituteKeyboardEvents = saneKeyboardEvents;
    var Controller = /** @class */ (function (_super) {
        __extends(Controller, _super);
        function Controller() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        Controller.prototype.createTextarea = function () {
            var textareaSpan = (this.textareaSpan = $('<span class="mq-textarea"></span>')), textarea = this.options.substituteTextarea();
            if (!textarea.nodeType) {
                throw 'substituteTextarea() must return a DOM element, got ' + textarea;
            }
            this.textarea = $(textarea).appendTo(textareaSpan);
            this.aria.setContainer(this.textareaSpan);
            var ctrlr = this;
            ctrlr.cursor.selectionChanged = function () {
                ctrlr.selectionChanged();
            };
        };
        Controller.prototype.selectionChanged = function () {
            var ctrlr = this;
            // throttle calls to setTextareaSelection(), because setting textarea.value
            // and/or calling textarea.select() can have anomalously bad performance:
            // https://github.com/mathquill/mathquill/issues/43#issuecomment-1399080
            //
            // Note, this timeout may be cleared by the blur handler in focusBlur.js
            if (!ctrlr.textareaSelectionTimeout) {
                ctrlr.textareaSelectionTimeout = setTimeout(function () {
                    ctrlr.setTextareaSelection();
                });
            }
        };
        Controller.prototype.setTextareaSelection = function () {
            this.textareaSelectionTimeout = 0;
            var latex = '';
            if (this.cursor.selection) {
                //cleanLatex prunes unnecessary spaces. defined in latex.js
                latex = this.cleanLatex(this.cursor.selection.join('latex'));
                if (this.options.statelessClipboard) {
                    // FIXME: like paste, only this works for math fields; should ask parent
                    latex = '$' + latex + '$';
                }
            }
            this.selectFn(latex);
        };
        Controller.prototype.staticMathTextareaEvents = function () {
            var ctrlr = this;
            var cursor = ctrlr.cursor;
            var textarea = ctrlr.getTextareaOrThrow();
            var textareaSpan = ctrlr.getTextareaSpanOrThrow();
            this.container.prepend(jQuery('<span aria-hidden="true" class="mq-selectable">').text('$' + ctrlr.exportLatex() + '$'));
            this.mathspeakSpan = $('<span class="mq-mathspeak"></span>');
            this.container.prepend(this.mathspeakSpan);
            ctrlr.blurred = true;
            textarea.bind('cut paste', false);
            if (ctrlr.options.disableCopyPaste) {
                textarea.bind('copy', false);
            }
            else {
                textarea.bind('copy', function () {
                    ctrlr.setTextareaSelection();
                });
            }
            textarea
                .focus(function () {
                ctrlr.blurred = false;
            })
                .blur(function () {
                if (cursor.selection)
                    cursor.selection.clear();
                setTimeout(detach); //detaching during blur explodes in WebKit
            });
            function detach() {
                textareaSpan.detach();
                ctrlr.blurred = true;
            }
            ctrlr.selectFn = function (text) {
                textarea.val(text);
                if (text)
                    textarea.select();
            };
            this.updateMathspeak();
        };
        Controller.prototype.editablesTextareaEvents = function () {
            var ctrlr = this;
            var textarea = ctrlr.getTextareaOrThrow();
            var textareaSpan = ctrlr.getTextareaSpanOrThrow();
            var keyboardEventsShim = this.options.substituteKeyboardEvents(textarea, this);
            this.selectFn = function (text) {
                keyboardEventsShim.select(text);
            };
            this.container.prepend(textareaSpan);
            this.focusBlurEvents();
            this.updateMathspeak();
        };
        Controller.prototype.unbindEditablesEvents = function () {
            var ctrlr = this;
            var textarea = ctrlr.getTextareaOrThrow();
            var textareaSpan = ctrlr.getTextareaSpanOrThrow();
            this.selectFn = function (text) {
                textarea.val(text);
                if (text)
                    textarea.select();
            };
            textareaSpan.remove();
            this.unbindFocusBlurEvents();
            ctrlr.blurred = true;
            textarea.bind('cut paste', false);
        };
        Controller.prototype.typedText = function (ch) {
            if (ch === '\n')
                return this.handle('enter');
            var cursor = this.notify(undefined).cursor;
            cursor.parent.write(cursor, ch);
            this.scrollHoriz();
        };
        Controller.prototype.cut = function () {
            var ctrlr = this, cursor = ctrlr.cursor;
            if (cursor.selection) {
                setTimeout(function () {
                    ctrlr.notify('edit'); // deletes selection if present
                    cursor.parent.bubble(function (node) {
                        node.reflow();
                        return undefined;
                    });
                    if (ctrlr.options && ctrlr.options.onCut) {
                        ctrlr.options.onCut();
                    }
                });
            }
        };
        Controller.prototype.copy = function () {
            this.setTextareaSelection();
        };
        Controller.prototype.paste = function (text) {
            // TODO: document `statelessClipboard` config option in README, after
            // making it work like it should, that is, in both text and math mode
            // (currently only works in math fields, so worse than pointless, it
            //  only gets in the way by \text{}-ifying pasted stuff and $-ifying
            //  cut/copied LaTeX)
            if (this.options.statelessClipboard) {
                if (text.slice(0, 1) === '$' && text.slice(-1) === '$') {
                    text = text.slice(1, -1);
                }
                else {
                    text = '\\text{' + text + '}';
                }
            }
            // FIXME: this always inserts math or a TextBlock, even in a RootTextBlock
            this.writeLatex(text).cursor.show();
            this.scrollHoriz();
            if (this.options && this.options.onPaste) {
                this.options.onPaste();
            }
        };
        Controller.prototype.updateMathspeak = function () {
            var ctrlr = this;
            // If the controller's ARIA label doesn't end with a punctuation mark, add a colon by default to better separate it from mathspeak.
            var ariaLabel = ctrlr.getAriaLabel();
            var labelWithSuffix = /[A-Za-z0-9]$/.test(ariaLabel)
                ? ariaLabel + ':'
                : ariaLabel;
            var mathspeak = ctrlr.root.mathspeak().trim();
            this.aria.clear();
            var textarea = ctrlr.getTextareaOrThrow();
            // For static math, provide mathspeak in a visually hidden span to allow screen readers and other AT to traverse the content.
            // For editable math, assign the mathspeak to the textarea's ARIA label (AT can use text navigation to interrogate the content).
            // Be certain to include the mathspeak for only one of these, though, as we don't want to include outdated labels if a field's editable state changes.
            // By design, also take careful note that the ariaPostLabel is meant to exist only for editable math (e.g. to serve as an evaluation or error message)
            // so it is not included for static math mathspeak calculations.
            // The mathspeakSpan should exist only for static math, so we use its presence to decide which approach to take.
            if (!!ctrlr.mathspeakSpan) {
                textarea.attr('aria-label', '');
                ctrlr.mathspeakSpan.text((labelWithSuffix + ' ' + mathspeak).trim());
            }
            else {
                textarea.attr('aria-label', (labelWithSuffix + ' ' + mathspeak + ' ' + ctrlr.ariaPostLabel).trim());
            }
        };
        return Controller;
    }(Controller_scrollHoriz));
    /*************************************************
     * Abstract classes of math blocks and commands.
     ************************************************/
    /**
     * Math tree node base class.
     * Some math-tree-specific extensions to MQNode.
     * Both MathBlock's and MathCommand's descend from it.
     */
    var MathElement = /** @class */ (function (_super) {
        __extends(MathElement, _super);
        function MathElement() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        MathElement.prototype.finalizeInsert = function (options, cursor) {
            var self = this;
            self.postOrder(function (node) {
                node.finalizeTree(options);
            });
            self.postOrder(function (node) {
                node.contactWeld(cursor);
            });
            // note: this order is important.
            // empty elements need the empty box provided by blur to
            // be present in order for their dimensions to be measured
            // correctly by 'reflow' handlers.
            self.postOrder(function (node) {
                node.blur(cursor);
            });
            self.postOrder(function (node) {
                node.reflow();
            });
            var selfR = self[R];
            var selfL = self[L];
            if (selfR)
                selfR.siblingCreated(options, L);
            if (selfL)
                selfL.siblingCreated(options, R);
            self.bubble(function (node) {
                node.reflow();
                return undefined;
            });
        };
        // If the maxDepth option is set, make sure
        // deeply nested content is truncated. Just return
        // false if the cursor is already too deep.
        MathElement.prototype.prepareInsertionAt = function (cursor) {
            var maxDepth = cursor.options.maxDepth;
            if (maxDepth !== undefined) {
                var cursorDepth = cursor.depth();
                if (cursorDepth > maxDepth) {
                    return false;
                }
                this.removeNodesDeeperThan(maxDepth - cursorDepth);
            }
            return true;
        };
        // Remove nodes that are more than `cutoff`
        // blocks deep from this node.
        MathElement.prototype.removeNodesDeeperThan = function (cutoff) {
            var depth = 0;
            var queue = [[this, depth]];
            var current;
            // Do a breadth-first search of this node's descendants
            // down to cutoff, removing anything deeper.
            while ((current = queue.shift())) {
                var c = current;
                c[0].children().each(function (child) {
                    var i = child instanceof MathBlock ? 1 : 0;
                    depth = c[1] + i;
                    if (depth <= cutoff) {
                        queue.push([child, depth]);
                    }
                    else {
                        (i ? child.children() : child).remove();
                    }
                    return undefined;
                });
            }
        };
        return MathElement;
    }(MQNode));
    /**
     * Commands and operators, like subscripts, exponents, or fractions.
     * Descendant commands are organized into blocks.
     */
    var MathCommand = /** @class */ (function (_super) {
        __extends(MathCommand, _super);
        function MathCommand(ctrlSeq, htmlTemplate, textTemplate) {
            var _this = _super.call(this) || this;
            _this.textTemplate = [''];
            _this.mathspeakTemplate = [''];
            _this.setCtrlSeqHtmlAndText(ctrlSeq, htmlTemplate, textTemplate);
            return _this;
        }
        MathCommand.prototype.setCtrlSeqHtmlAndText = function (ctrlSeq, htmlTemplate, textTemplate) {
            if (!this.ctrlSeq)
                this.ctrlSeq = ctrlSeq;
            if (htmlTemplate)
                this.htmlTemplate = htmlTemplate;
            if (textTemplate)
                this.textTemplate = textTemplate;
        };
        // obvious methods
        MathCommand.prototype.replaces = function (replacedFragment) {
            replacedFragment.disown();
            this.replacedFragment = replacedFragment;
        };
        MathCommand.prototype.isEmpty = function () {
            return this.foldChildren(true, function (isEmpty, child) {
                return isEmpty && child.isEmpty();
            });
        };
        MathCommand.prototype.parser = function () {
            var _this = this;
            var block = latexMathParser.block;
            return block.times(this.numBlocks()).map(function (blocks) {
                _this.blocks = blocks;
                for (var i = 0; i < blocks.length; i += 1) {
                    blocks[i].adopt(_this, _this.ends[R], 0);
                }
                return _this;
            });
        };
        // createLeftOf(cursor) and the methods it calls
        MathCommand.prototype.createLeftOf = function (cursor) {
            var cmd = this;
            var replacedFragment = cmd.replacedFragment;
            cmd.createBlocks();
            _super.prototype.createLeftOf.call(this, cursor);
            if (replacedFragment) {
                var cmdEndsL = cmd.ends[L];
                replacedFragment.adopt(cmdEndsL, 0, 0);
                replacedFragment.jQ.appendTo(cmdEndsL.jQ);
                cmd.placeCursor(cursor);
                cmd.prepareInsertionAt(cursor);
            }
            cmd.finalizeInsert(cursor.options, cursor);
            cmd.placeCursor(cursor);
        };
        MathCommand.prototype.createBlocks = function () {
            var cmd = this, numBlocks = cmd.numBlocks(), blocks = (cmd.blocks = Array(numBlocks));
            for (var i = 0; i < numBlocks; i += 1) {
                var newBlock = (blocks[i] = new MathBlock());
                newBlock.adopt(cmd, cmd.ends[R], 0);
            }
        };
        MathCommand.prototype.placeCursor = function (cursor) {
            //insert the cursor at the right end of the first empty child, searching
            //left-to-right, or if none empty, the right end child
            cursor.insAtRightEnd(this.foldChildren(this.ends[L], function (leftward, child) {
                return leftward.isEmpty() ? leftward : child;
            }));
        };
        // editability methods: called by the cursor for editing, cursor movements,
        // and selection of the MathQuill tree, these all take in a direction and
        // the cursor
        MathCommand.prototype.moveTowards = function (dir, cursor, updown) {
            var updownInto;
            if (updown === 'up') {
                updownInto = this.upInto;
            }
            else if (updown === 'down') {
                updownInto = this.downInto;
            }
            var el = (updownInto || this.ends[-dir]);
            cursor.insAtDirEnd(-dir, el);
            cursor.controller.aria
                .queueDirEndOf(-dir)
                .queue(cursor.parent, true);
        };
        MathCommand.prototype.deleteTowards = function (dir, cursor) {
            if (this.isEmpty())
                cursor[dir] = this.remove()[dir];
            else
                this.moveTowards(dir, cursor);
        };
        MathCommand.prototype.selectTowards = function (dir, cursor) {
            cursor[-dir] = this;
            cursor[dir] = this[dir];
        };
        MathCommand.prototype.selectChildren = function () {
            return new MQSelection(this, this);
        };
        MathCommand.prototype.unselectInto = function (dir, cursor) {
            var antiCursor = cursor.anticursor;
            var ancestor = antiCursor.ancestors[this.id];
            cursor.insAtDirEnd(-dir, ancestor);
        };
        MathCommand.prototype.seek = function (pageX, cursor) {
            function getBounds(node) {
                var _c;
                var l = node.jQ.offset().left;
                var r = l + node.jQ.outerWidth();
                return _c = {},
                    _c[L] = l,
                    _c[R] = r,
                    _c;
            }
            var cmd = this;
            var cmdBounds = getBounds(cmd);
            if (pageX < cmdBounds[L])
                return cursor.insLeftOf(cmd);
            if (pageX > cmdBounds[R])
                return cursor.insRightOf(cmd);
            var leftLeftBound = cmdBounds[L];
            cmd.eachChild(function (block) {
                var blockBounds = getBounds(block);
                if (pageX < blockBounds[L]) {
                    // closer to this block's left bound, or the bound left of that?
                    if (pageX - leftLeftBound < blockBounds[L] - pageX) {
                        if (block[L])
                            cursor.insAtRightEnd(block[L]);
                        else
                            cursor.insLeftOf(cmd);
                    }
                    else
                        cursor.insAtLeftEnd(block);
                    return false;
                }
                else if (pageX > blockBounds[R]) {
                    if (block[R])
                        leftLeftBound = blockBounds[R];
                    // continue to next block
                    else {
                        // last (rightmost) block
                        // closer to this block's right bound, or the cmd's right bound?
                        if (cmdBounds[R] - pageX < pageX - blockBounds[R]) {
                            cursor.insRightOf(cmd);
                        }
                        else
                            cursor.insAtRightEnd(block);
                    }
                    return undefined;
                }
                else {
                    block.seek(pageX, cursor);
                    return false;
                }
            });
            return undefined;
        };
        // methods involved in creating and cross-linking with HTML DOM nodes
        /*
          They all expect an .htmlTemplate like
            '<span>&0</span>'
          or
            '<span><span>&0</span><span>&1</span></span>'
      
          See html.test.js for more examples.
      
          Requirements:
          - For each block of the command, there must be exactly one "block content
            marker" of the form '&<number>' where <number> is the 0-based index of the
            block. (Like the LaTeX \newcommand syntax, but with a 0-based rather than
            1-based index, because JavaScript because C because Dijkstra.)
          - The block content marker must be the sole contents of the containing
            element, there can't even be surrounding whitespace, or else we can't
            guarantee sticking to within the bounds of the block content marker when
            mucking with the HTML DOM.
          - The HTML not only must be well-formed HTML (of course), but also must
            conform to the XHTML requirements on tags, specifically all tags must
            either be self-closing (like '<br/>') or come in matching pairs.
            Close tags are never optional.
      
          Note that &<number> isn't well-formed HTML; if you wanted a literal '&123',
          your HTML template would have to have '&amp;123'.
        */
        MathCommand.prototype.numBlocks = function () {
            var matches = this.htmlTemplate.match(/&\d+/g);
            return matches ? matches.length : 0;
        };
        MathCommand.prototype.html = function () {
            // Render the entire math subtree rooted at this command, as HTML.
            // Expects .createBlocks() to have been called already, since it uses the
            // .blocks array of child blocks.
            //
            // See html.test.js for example templates and intended outputs.
            //
            // Given an .htmlTemplate as described above,
            // - insert the mathquill-command-id attribute into all top-level tags,
            //   which will be used to set this.jQ in .jQize().
            //   This is straightforward:
            //     * tokenize into tags and non-tags
            //     * loop through top-level tokens:
            //         * add #cmdId attribute macro to top-level self-closing tags
            //         * else add #cmdId attribute macro to top-level open tags
            //             * skip the matching top-level close tag and all tag pairs
            //               in between
            // - for each block content marker,
            //     + replace it with the contents of the corresponding block,
            //       rendered as HTML
            //     + insert the mathquill-block-id attribute into the containing tag
            //   This is even easier, a quick regex replace, since block tags cannot
            //   contain anything besides the block content marker.
            //
            // Two notes:
            // - The outermost loop through top-level tokens should never encounter any
            //   top-level close tags, because we should have first encountered a
            //   matching top-level open tag, all inner tags should have appeared in
            //   matching pairs and been skipped, and then we should have skipped the
            //   close tag in question.
            // - All open tags should have matching close tags, which means our inner
            //   loop should always encounter a close tag and drop nesting to 0. If
            //   a close tag is missing, the loop will continue until i >= tokens.length
            //   and token becomes undefined. This will not infinite loop, even in
            //   production without pray(), because it will then TypeError on .slice().
            var cmd = this;
            var blocks = cmd.blocks;
            var cmdId = ' mathquill-command-id=' + cmd.id;
            var tokens = cmd.htmlTemplate.match(/<[^<>]+>|[^<>]+/g);
            pray('no unmatched angle brackets', tokens.join('') === this.htmlTemplate);
            // add cmdId and aria-hidden (for screen reader users) to all top-level tags
            // Note: with the RegExp search/replace approach, it's possible that an element which is both a command and block may contain redundant aria-hidden attributes.
            // In practice this doesn't appear to cause problems for screen readers.
            for (var i = 0, token = tokens[0]; token; i += 1, token = tokens[i]) {
                // top-level self-closing tags
                if (token.slice(-2) === '/>') {
                    tokens[i] = token.slice(0, -2) + cmdId + ' aria-hidden="true"/>';
                }
                // top-level open tags
                else if (token.charAt(0) === '<') {
                    pray('not an unmatched top-level close tag', token.charAt(1) !== '/');
                    tokens[i] = token.slice(0, -1) + cmdId + ' aria-hidden="true">';
                    // skip matching top-level close tag and all tag pairs in between
                    var nesting = 1;
                    do {
                        (i += 1), (token = tokens[i]);
                        pray('no missing close tags', token);
                        // close tags
                        if (token.slice(0, 2) === '</') {
                            nesting -= 1;
                        }
                        // non-self-closing open tags
                        else if (token.charAt(0) === '<' && token.slice(-2) !== '/>') {
                            nesting += 1;
                        }
                    } while (nesting > 0);
                }
            }
            return tokens
                .join('')
                .replace(/>&(\d+)/g, function (_$0, $1) {
                var num1 = parseInt($1, 10);
                return (' mathquill-block-id=' +
                    blocks[num1].id +
                    ' aria-hidden="true">' +
                    blocks[num1].join('html'));
            });
        };
        // methods to export a string representation of the math tree
        MathCommand.prototype.latex = function () {
            return this.foldChildren(this.ctrlSeq || '', function (latex, child) {
                return latex + '{' + (child.latex() || ' ') + '}';
            });
        };
        MathCommand.prototype.text = function () {
            var cmd = this, i = 0;
            return cmd.foldChildren(cmd.textTemplate[i], function (text, child) {
                i += 1;
                var child_text = child.text();
                if (text &&
                    cmd.textTemplate[i] === '(' &&
                    child_text[0] === '(' &&
                    child_text.slice(-1) === ')')
                    return text + child_text.slice(1, -1) + cmd.textTemplate[i];
                return text + child_text + (cmd.textTemplate[i] || '');
            });
        };
        MathCommand.prototype.mathspeak = function () {
            var cmd = this, i = 0;
            return cmd.foldChildren(cmd.mathspeakTemplate[i] || 'Start' + cmd.ctrlSeq + ' ', function (speech, block) {
                i += 1;
                return (speech +
                    ' ' +
                    block.mathspeak() +
                    ' ' +
                    (cmd.mathspeakTemplate[i] + ' ' || 'End' + cmd.ctrlSeq + ' '));
            });
        };
        return MathCommand;
    }(MathElement));
    /**
     * Lightweight command without blocks or children.
     */
    var MQSymbol = /** @class */ (function (_super) {
        __extends(MQSymbol, _super);
        function MQSymbol(ctrlSeq, html, text, mathspeak) {
            var _this = _super.call(this) || this;
            _this.setCtrlSeqHtmlTextAndMathspeak(ctrlSeq, html, text, mathspeak);
            return _this;
        }
        MQSymbol.prototype.setCtrlSeqHtmlTextAndMathspeak = function (ctrlSeq, html, text, mathspeak) {
            if (!text && !!ctrlSeq) {
                text = ctrlSeq.replace(/^\\/, '');
            }
            this.mathspeakName = mathspeak || text;
            _super.prototype.setCtrlSeqHtmlAndText.call(this, ctrlSeq, html, [text || '']);
        };
        MQSymbol.prototype.parser = function () {
            return Parser.succeed(this);
        };
        MQSymbol.prototype.numBlocks = function () {
            return 0;
        };
        MQSymbol.prototype.replaces = function (replacedFragment) {
            replacedFragment.remove();
        };
        MQSymbol.prototype.createBlocks = function () { };
        MQSymbol.prototype.moveTowards = function (dir, cursor) {
            cursor.jQ.insDirOf(dir, this.jQ);
            cursor[-dir] = this;
            cursor[dir] = this[dir];
            cursor.controller.aria.queue(this);
        };
        MQSymbol.prototype.deleteTowards = function (dir, cursor) {
            cursor[dir] = this.remove()[dir];
        };
        MQSymbol.prototype.seek = function (pageX, cursor) {
            // insert at whichever side the click was closer to
            if (pageX - this.jQ.offset().left < this.jQ.outerWidth() / 2)
                cursor.insLeftOf(this);
            else
                cursor.insRightOf(this);
            return cursor;
        };
        MQSymbol.prototype.latex = function () {
            return this.ctrlSeq || '';
        };
        MQSymbol.prototype.text = function () {
            return this.textTemplate.join('');
        };
        MQSymbol.prototype.mathspeak = function (_opts) {
            return this.mathspeakName || '';
        };
        MQSymbol.prototype.placeCursor = function () { };
        MQSymbol.prototype.isEmpty = function () {
            return true;
        };
        return MQSymbol;
    }(MathCommand));
    var VanillaSymbol = /** @class */ (function (_super) {
        __extends(VanillaSymbol, _super);
        function VanillaSymbol(ch, html, mathspeak) {
            return _super.call(this, ch, '<span>' + (html || ch) + '</span>', undefined, mathspeak) || this;
        }
        return VanillaSymbol;
    }(MQSymbol));
    function bindVanillaSymbol(ch, html, mathspeak) {
        return function () { return new VanillaSymbol(ch, html, mathspeak); };
    }
    var BinaryOperator = /** @class */ (function (_super) {
        __extends(BinaryOperator, _super);
        function BinaryOperator(ctrlSeq, html, text, mathspeak, treatLikeSymbol) {
            var _this = this;
            if (treatLikeSymbol) {
                _this = _super.call(this, ctrlSeq, '<span>' + (html || ctrlSeq) + '</span>', undefined, mathspeak) || this;
            }
            else {
                _this = _super.call(this, ctrlSeq, '<span class="mq-binary-operator">' + html + '</span>', text, mathspeak) || this;
            }
            return _this;
        }
        return BinaryOperator;
    }(MQSymbol));
    function bindBinaryOperator(ctrlSeq, html, text, mathspeak) {
        return function () { return new BinaryOperator(ctrlSeq, html, text, mathspeak); };
    }
    /**
     * Children and parent of MathCommand's. Basically partitions all the
     * symbols and operators that descend (in the Math DOM tree) from
     * ancestor operators.
     */
    var MathBlock = /** @class */ (function (_super) {
        __extends(MathBlock, _super);
        function MathBlock() {
            var _this = _super !== null && _super.apply(this, arguments) || this;
            _this.ariaLabel = 'block';
            return _this;
        }
        MathBlock.prototype.join = function (methodName) {
            return this.foldChildren('', function (fold, child) {
                return fold + child[methodName]();
            });
        };
        MathBlock.prototype.html = function () {
            return this.join('html');
        };
        MathBlock.prototype.latex = function () {
            return this.join('latex');
        };
        MathBlock.prototype.text = function () {
            var endsL = this.ends[L];
            var endsR = this.ends[R];
            return endsL === endsR && endsL !== 0 ? endsL.text() : this.join('text');
        };
        MathBlock.prototype.mathspeak = function () {
            var tempOp = '';
            var autoOps = {};
            if (this.controller)
                autoOps = this.controller.options.autoOperatorNames;
            return (this.foldChildren([], function (speechArray, cmd) {
                if (cmd.isPartOfOperator) {
                    tempOp += cmd.mathspeak();
                }
                else {
                    if (tempOp !== '') {
                        if (autoOps._maxLength > 0) {
                            var x = autoOps[tempOp.toLowerCase()];
                            if (typeof x === 'string')
                                tempOp = x;
                        }
                        speechArray.push(tempOp + ' ');
                        tempOp = '';
                    }
                    var mathspeakText = cmd.mathspeak();
                    var cmdText = cmd.ctrlSeq;
                    if (isNaN(cmdText) && // TODO - revisit this to improve the isNumber() check
                        cmdText !== '.' &&
                        (!cmd.parent ||
                            !cmd.parent.parent ||
                            !cmd.parent.parent.isTextBlock())) {
                        mathspeakText = ' ' + mathspeakText + ' ';
                    }
                    speechArray.push(mathspeakText);
                }
                return speechArray;
            })
                .join('')
                .replace(/ +(?= )/g, '')
                // For Apple devices in particular, split out digits after a decimal point so they aren't read aloud as whole words.
                // Not doing so makes 123.456 potentially spoken as "one hundred twenty-three point four hundred fifty-six."
                // Instead, add spaces so it is spoken as "one hundred twenty-three point four five six."
                .replace(/(\.)([0-9]+)/g, function (_match, p1, p2) {
                return p1 + p2.split('').join(' ').trim();
            }));
        };
        MathBlock.prototype.keystroke = function (key, e, ctrlr) {
            if (ctrlr.options.spaceBehavesLikeTab &&
                (key === 'Spacebar' || key === 'Shift-Spacebar')) {
                e.preventDefault();
                ctrlr.escapeDir(key === 'Shift-Spacebar' ? L : R, key, e);
                return;
            }
            return _super.prototype.keystroke.call(this, key, e, ctrlr);
        };
        // editability methods: called by the cursor for editing, cursor movements,
        // and selection of the MathQuill tree, these all take in a direction and
        // the cursor
        MathBlock.prototype.moveOutOf = function (dir, cursor, updown) {
            var updownInto;
            if (updown === 'up') {
                updownInto = this.parent.upInto;
            }
            else if (updown === 'down') {
                updownInto = this.parent.downInto;
            }
            if (!updownInto && this[dir]) {
                var otherDir = -dir;
                cursor.insAtDirEnd(otherDir, this[dir]);
                cursor.controller.aria.queueDirEndOf(otherDir).queue(cursor.parent, true);
            }
            else {
                cursor.insDirOf(dir, this.parent);
                cursor.controller.aria.queueDirOf(dir).queue(this.parent);
            }
        };
        MathBlock.prototype.selectOutOf = function (dir, cursor) {
            cursor.insDirOf(dir, this.parent);
        };
        MathBlock.prototype.deleteOutOf = function (_dir, cursor) {
            cursor.unwrapGramp();
        };
        MathBlock.prototype.seek = function (pageX, cursor) {
            var node = this.ends[R];
            if (!node || node.jQ.offset().left + node.jQ.outerWidth() < pageX) {
                return cursor.insAtRightEnd(this);
            }
            var endsL = this.ends[L];
            if (pageX < endsL.jQ.offset().left)
                return cursor.insAtLeftEnd(this);
            while (pageX < node.jQ.offset().left)
                node = node[L];
            return node.seek(pageX, cursor);
        };
        MathBlock.prototype.chToCmd = function (ch, options) {
            var cons;
            // exclude f because it gets a dedicated command with more spacing
            if (ch.match(/^[a-eg-zA-Z]$/))
                return new Letter(ch);
            else if (/^\d$/.test(ch))
                return new Digit(ch);
            else if (options && options.typingSlashWritesDivisionSymbol && ch === '/')
                return LatexCmds['÷'](ch);
            else if (options && options.typingAsteriskWritesTimesSymbol && ch === '*')
                return LatexCmds['×'](ch);
            else if (options && options.typingPercentWritesPercentOf && ch === '%')
                return LatexCmds.percentof(ch);
            else if ((cons = CharCmds[ch] || LatexCmds[ch])) {
                if (cons.constructor) {
                    return new cons(ch);
                }
                else {
                    return cons(ch);
                }
            }
            else
                return new VanillaSymbol(ch);
        };
        MathBlock.prototype.write = function (cursor, ch) {
            var cmd = this.chToCmd(ch, cursor.options);
            if (cursor.selection)
                cmd.replaces(cursor.replaceSelection());
            if (!cursor.isTooDeep()) {
                cmd.createLeftOf(cursor.show());
                // special-case the slash so that fractions are voiced while typing
                if (ch === '/') {
                    cursor.controller.aria.alert('over');
                }
                else {
                    cursor.controller.aria.alert(cmd.mathspeak({ createdLeftOf: cursor }));
                }
            }
        };
        MathBlock.prototype.writeLatex = function (cursor, latex) {
            var all = Parser.all;
            var eof = Parser.eof;
            var block = latexMathParser
                .skip(eof)
                .or(all.result(false))
                .parse(latex);
            if (block && !block.isEmpty() && block.prepareInsertionAt(cursor)) {
                block
                    .children()
                    .adopt(cursor.parent, cursor[L], cursor[R]); // TODO - masking undefined. should be 0
                var jQ = block.jQize();
                jQ.insertBefore(cursor.jQ);
                cursor[L] = block.ends[R];
                block.finalizeInsert(cursor.options, cursor);
                var blockEndsR = block.ends[R];
                var blockEndsL = block.ends[L];
                var blockEndsRR = blockEndsR[R];
                var blockEndsLL = blockEndsL[L];
                if (blockEndsRR)
                    blockEndsRR.siblingCreated(cursor.options, L);
                if (blockEndsLL)
                    blockEndsLL.siblingCreated(cursor.options, R);
                cursor.parent.bubble(function (node) {
                    node.reflow();
                    return undefined;
                });
            }
        };
        MathBlock.prototype.focus = function () {
            this.jQ.addClass('mq-hasCursor');
            this.jQ.removeClass('mq-empty');
            return this;
        };
        MathBlock.prototype.blur = function (cursor) {
            this.jQ.removeClass('mq-hasCursor');
            if (this.isEmpty()) {
                this.jQ.addClass('mq-empty');
                if (cursor &&
                    this.isQuietEmptyDelimiter(cursor.options.quietEmptyDelimiters)) {
                    this.jQ.addClass('mq-quiet-delimiter');
                }
            }
            return this;
        };
        return MathBlock;
    }(MathElement));
    Options.prototype.mouseEvents = true;
    API.StaticMath = function (APIClasses) {
        var _c;
        return _c = /** @class */ (function (_super) {
                __extends(StaticMath, _super);
                function StaticMath(el) {
                    var _this = _super.call(this, el) || this;
                    var innerFields = (_this.innerFields = []);
                    _this.__controller.root.postOrder(function (node) {
                        node.registerInnerField(innerFields, APIClasses.InnerMathField);
                    });
                    return _this;
                }
                StaticMath.prototype.__mathquillify = function (opts, _interfaceVersion) {
                    this.config(opts);
                    _super.prototype.__mathquillify.call(this, 'mq-math-mode');
                    if (this.__options.mouseEvents) {
                        this.__controller.delegateMouseEvents();
                        this.__controller.staticMathTextareaEvents();
                    }
                    return this;
                };
                StaticMath.prototype.latex = function () {
                    var returned = _super.prototype.latex.apply(this, arguments);
                    if (arguments.length > 0) {
                        var innerFields = (this.innerFields = []);
                        this.__controller.root.postOrder(function (node) {
                            node.registerInnerField(innerFields, APIClasses.InnerMathField);
                        });
                        // Force an ARIA label update to remain in sync with the new LaTeX value.
                        this.__controller.updateMathspeak();
                    }
                    return returned;
                };
                StaticMath.prototype.setAriaLabel = function (ariaLabel) {
                    this.__controller.setAriaLabel(ariaLabel);
                    return this;
                };
                StaticMath.prototype.getAriaLabel = function () {
                    return this.__controller.getAriaLabel();
                };
                return StaticMath;
            }(APIClasses.AbstractMathQuill)),
            _c.RootBlock = MathBlock,
            _c;
    };
    var RootMathBlock = /** @class */ (function (_super) {
        __extends(RootMathBlock, _super);
        function RootMathBlock() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        return RootMathBlock;
    }(MathBlock));
    RootBlockMixin(RootMathBlock.prototype); // adds methods to RootMathBlock
    API.MathField = function (APIClasses) {
        var _c;
        return _c = /** @class */ (function (_super) {
                __extends(MathField, _super);
                function MathField() {
                    return _super !== null && _super.apply(this, arguments) || this;
                }
                MathField.prototype.__mathquillify = function (opts, interfaceVersion) {
                    this.config(opts);
                    if (interfaceVersion > 1)
                        this.__controller.root.reflow = noop;
                    _super.prototype.__mathquillify.call(this, 'mq-editable-field mq-math-mode');
                    delete this.__controller.root.reflow;
                    return this;
                };
                return MathField;
            }(APIClasses.EditableField)),
            _c.RootBlock = RootMathBlock,
            _c;
    };
    API.InnerMathField = function (APIClasses) {
        return /** @class */ (function (_super) {
            __extends(class_1, _super);
            function class_1() {
                return _super !== null && _super.apply(this, arguments) || this;
            }
            class_1.prototype.makeStatic = function () {
                this.__controller.editable = false;
                this.__controller.root.blur();
                this.__controller.unbindEditablesEvents();
                this.__controller.container.removeClass('mq-editable-field');
            };
            class_1.prototype.makeEditable = function () {
                this.__controller.editable = true;
                this.__controller.editablesTextareaEvents();
                this.__controller.cursor.insAtRightEnd(this.__controller.root);
                this.__controller.container.addClass('mq-editable-field');
            };
            return class_1;
        }(APIClasses.MathField));
    };
    /*************************************************
     * Abstract classes of text blocks
     ************************************************/
    /**
     * Blocks of plain text, with one or two TextPiece's as children.
     * Represents flat strings of typically serif-font Roman characters, as
     * opposed to hierchical, nested, tree-structured math.
     * Wraps a single HTMLSpanElement.
     */
    var TextBlock = /** @class */ (function (_super) {
        __extends(TextBlock, _super);
        function TextBlock() {
            var _this = _super !== null && _super.apply(this, arguments) || this;
            _this.ctrlSeq = '\\text';
            _this.ariaLabel = 'Text';
            _this.mathspeakTemplate = ['StartText', 'EndText'];
            return _this;
        }
        TextBlock.prototype.replaces = function (replacedText) {
            if (replacedText instanceof Fragment)
                this.replacedText = replacedText.remove().jQ.text();
            else if (typeof replacedText === 'string')
                this.replacedText = replacedText;
        };
        TextBlock.prototype.jQadd = function (jQ) {
            _super.prototype.jQadd.call(this, jQ);
            var endsL = this.ends[L];
            if (endsL) {
                var child = this.jQ[0].firstChild;
                if (child) {
                    endsL.jQadd(child);
                }
            }
            return this.jQ;
        };
        TextBlock.prototype.createLeftOf = function (cursor) {
            var textBlock = this;
            _super.prototype.createLeftOf.call(this, cursor);
            cursor.insAtRightEnd(textBlock);
            if (textBlock.replacedText)
                for (var i = 0; i < textBlock.replacedText.length; i += 1)
                    textBlock.write(cursor, textBlock.replacedText.charAt(i));
            var textBlockR = textBlock[R];
            if (textBlockR)
                textBlockR.siblingCreated(cursor.options, L);
            var textBlockL = textBlock[L];
            if (textBlockL)
                textBlockL.siblingCreated(cursor.options, R);
            textBlock.bubble(function (node) {
                node.reflow();
                return undefined;
            });
        };
        TextBlock.prototype.parser = function () {
            var textBlock = this;
            // TODO: correctly parse text mode
            var string = Parser.string;
            var regex = Parser.regex;
            var optWhitespace = Parser.optWhitespace;
            return optWhitespace
                .then(string('{'))
                .then(regex(/^[^}]*/))
                .skip(string('}'))
                .map(function (text) {
                if (text.length === 0)
                    return new Fragment();
                new TextPiece(text).adopt(textBlock, 0, 0);
                return textBlock;
            });
        };
        TextBlock.prototype.textContents = function () {
            return this.foldChildren('', function (text, child) {
                return text + child.textStr;
            });
        };
        TextBlock.prototype.text = function () {
            return '"' + this.textContents() + '"';
        };
        TextBlock.prototype.latex = function () {
            var contents = this.textContents();
            if (contents.length === 0)
                return '';
            return (this.ctrlSeq +
                '{' +
                contents.replace(/\\/g, '\\backslash ').replace(/[{}]/g, '\\$&') +
                '}');
        };
        TextBlock.prototype.html = function () {
            return ('<span class="mq-text-mode" mathquill-command-id=' +
                this.id +
                '>' +
                this.textContents() +
                '</span>');
        };
        TextBlock.prototype.mathspeak = function (opts) {
            if (opts && opts.ignoreShorthand) {
                return (this.mathspeakTemplate[0] +
                    ', ' +
                    this.textContents() +
                    ', ' +
                    this.mathspeakTemplate[1]);
            }
            else {
                return this.textContents();
            }
        };
        TextBlock.prototype.isTextBlock = function () {
            return true;
        };
        // editability methods: called by the cursor for editing, cursor movements,
        // and selection of the MathQuill tree, these all take in a direction and
        // the cursor
        TextBlock.prototype.moveTowards = function (dir, cursor) {
            cursor.insAtDirEnd(-dir, this);
            cursor.controller.aria
                .queueDirEndOf(-dir)
                .queue(cursor.parent, true);
        };
        TextBlock.prototype.moveOutOf = function (dir, cursor) {
            cursor.insDirOf(dir, this);
            cursor.controller.aria.queueDirOf(dir).queue(this);
        };
        TextBlock.prototype.unselectInto = function (dir, cursor) {
            this.moveTowards(dir, cursor);
        };
        // TODO: make these methods part of a shared mixin or something.
        TextBlock.prototype.selectTowards = function (dir, cursor) {
            MathCommand.prototype.selectTowards.call(this, dir, cursor);
        };
        TextBlock.prototype.deleteTowards = function (dir, cursor) {
            MathCommand.prototype.deleteTowards.call(this, dir, cursor);
        };
        TextBlock.prototype.selectOutOf = function (dir, cursor) {
            cursor.insDirOf(dir, this);
        };
        TextBlock.prototype.deleteOutOf = function (_dir, cursor) {
            // backspace and delete at ends of block don't unwrap
            if (this.isEmpty())
                cursor.insRightOf(this);
        };
        TextBlock.prototype.write = function (cursor, ch) {
            cursor.show().deleteSelection();
            if (ch !== '$') {
                var cursorL = cursor[L];
                if (!cursorL)
                    new TextPiece(ch).createLeftOf(cursor);
                else if (cursorL instanceof TextPiece)
                    cursorL.appendText(ch);
            }
            else if (this.isEmpty()) {
                cursor.insRightOf(this);
                new VanillaSymbol('\\$', '$').createLeftOf(cursor);
            }
            else if (!cursor[R])
                cursor.insRightOf(this);
            else if (!cursor[L])
                cursor.insLeftOf(this);
            else {
                // split apart
                var leftBlock = new TextBlock();
                var leftPc = this.ends[L];
                if (leftPc) {
                    leftPc.disown().jQ.detach();
                    leftPc.adopt(leftBlock, 0, 0);
                }
                cursor.insLeftOf(this);
                _super.prototype.createLeftOf.call(leftBlock, cursor); // micro-optimization, not for correctness
            }
            this.bubble(function (node) {
                node.reflow();
                return undefined;
            });
            // TODO needs tests
            cursor.controller.aria.alert(ch);
        };
        TextBlock.prototype.writeLatex = function (cursor, latex) {
            var cursorL = cursor[L];
            if (!cursorL)
                new TextPiece(latex).createLeftOf(cursor);
            else if (cursorL instanceof TextPiece)
                cursorL.appendText(latex);
            this.bubble(function (node) {
                node.reflow();
                return undefined;
            });
        };
        TextBlock.prototype.seek = function (pageX, cursor) {
            cursor.hide();
            var textPc = TextBlockFuseChildren(this);
            if (!textPc)
                return;
            // insert cursor at approx position in DOMTextNode
            var avgChWidth = this.jQ.width() / this.text.length;
            var approxPosition = Math.round((pageX - this.jQ.offset().left) / avgChWidth);
            if (approxPosition <= 0)
                cursor.insAtLeftEnd(this);
            else if (approxPosition >= textPc.textStr.length)
                cursor.insAtRightEnd(this);
            else
                cursor.insLeftOf(textPc.splitRight(approxPosition));
            // move towards mousedown (pageX)
            var displ = pageX - cursor.show().offset().left; // displacement
            var dir = displ && displ < 0 ? L : R;
            var prevDispl = dir;
            // displ * prevDispl > 0 iff displacement direction === previous direction
            while (cursor[dir] && displ * prevDispl > 0) {
                cursor[dir].moveTowards(dir, cursor);
                prevDispl = displ;
                displ = pageX - cursor.offset().left;
            }
            if (dir * displ < -dir * prevDispl)
                cursor[-dir].moveTowards(-dir, cursor);
            if (!cursor.anticursor) {
                // about to start mouse-selecting, the anticursor is gonna get put here
                var cursorL = cursor[L];
                this.anticursorPosition =
                    cursorL && cursorL.textStr.length;
                // ^ get it? 'cos if there's no cursor[L], it's 0... I'm a terrible person.
            }
            else if (cursor.anticursor.parent === this) {
                // mouse-selecting within this TextBlock, re-insert the anticursor
                var cursorL = cursor[L];
                var cursorPosition = cursorL && cursorL.textStr.length;
                if (this.anticursorPosition === cursorPosition) {
                    cursor.anticursor = Anticursor.fromCursor(cursor);
                }
                else {
                    if (this.anticursorPosition < cursorPosition) {
                        var newTextPc = cursorL.splitRight(this.anticursorPosition);
                        cursor[L] = newTextPc;
                    }
                    else {
                        var cursorR = cursor[R];
                        var newTextPc = cursorR.splitRight(this.anticursorPosition - cursorPosition);
                    }
                    cursor.anticursor = new Anticursor(this, newTextPc[L], newTextPc);
                }
            }
        };
        TextBlock.prototype.blur = function (cursor) {
            MathBlock.prototype.blur.call(this, cursor);
            if (!cursor)
                return;
            if (this.textContents() === '') {
                this.remove();
                if (cursor[L] === this)
                    cursor[L] = this[L];
                else if (cursor[R] === this)
                    cursor[R] = this[R];
            }
            else
                TextBlockFuseChildren(this);
        };
        TextBlock.prototype.focus = function () {
            MathBlock.prototype.focus.call(this);
        };
        return TextBlock;
    }(MQNode));
    function TextBlockFuseChildren(self) {
        self.jQ[0].normalize();
        var textPcDom = self.jQ[0].firstChild;
        if (!textPcDom)
            return;
        pray('only node in TextBlock span is Text node', textPcDom.nodeType === 3);
        // nodeType === 3 has meant a Text node since ancient times:
        //   http://reference.sitepoint.com/javascript/Node/nodeType
        var textPc = new TextPiece(textPcDom.data);
        textPc.jQadd(textPcDom);
        self.children().disown();
        textPc.adopt(self, 0, 0);
        return textPc;
    }
    /**
     * Piece of plain text, with a TextBlock as a parent and no children.
     * Wraps a single DOMTextNode.
     * For convenience, has a .textStr property that's just a JavaScript string
     * mirroring the text contents of the DOMTextNode.
     * Text contents must always be nonempty.
     */
    var TextPiece = /** @class */ (function (_super) {
        __extends(TextPiece, _super);
        function TextPiece(text) {
            var _this = _super.call(this) || this;
            _this.textStr = text;
            return _this;
        }
        TextPiece.prototype.jQadd = function (dom) {
            this.dom = dom;
            this.jQ = $(dom);
            return this.jQ;
        };
        TextPiece.prototype.jQize = function () {
            return this.jQadd(document.createTextNode(this.textStr));
        };
        TextPiece.prototype.appendText = function (text) {
            this.textStr += text;
            this.dom.appendData(text);
        };
        TextPiece.prototype.prependText = function (text) {
            this.textStr = text + this.textStr;
            this.dom.insertData(0, text);
        };
        TextPiece.prototype.insTextAtDirEnd = function (text, dir) {
            prayDirection(dir);
            if (dir === R)
                this.appendText(text);
            else
                this.prependText(text);
        };
        TextPiece.prototype.splitRight = function (i) {
            var newPc = new TextPiece(this.textStr.slice(i)).adopt(this.parent, this, this[R]);
            newPc.jQadd(this.dom.splitText(i));
            this.textStr = this.textStr.slice(0, i);
            return newPc;
        };
        TextPiece.prototype.endChar = function (dir, text) {
            return text.charAt(dir === L ? 0 : -1 + text.length);
        };
        TextPiece.prototype.moveTowards = function (dir, cursor) {
            prayDirection(dir);
            var ch = this.endChar(-dir, this.textStr);
            var from = this[-dir];
            if (from instanceof TextPiece)
                from.insTextAtDirEnd(ch, dir);
            else
                new TextPiece(ch).createDir(-dir, cursor);
            return this.deleteTowards(dir, cursor);
        };
        TextPiece.prototype.mathspeak = function () {
            return this.textStr;
        };
        TextPiece.prototype.latex = function () {
            return this.textStr;
        };
        TextPiece.prototype.deleteTowards = function (dir, cursor) {
            if (this.textStr.length > 1) {
                var deletedChar;
                if (dir === R) {
                    this.dom.deleteData(0, 1);
                    deletedChar = this.textStr[0];
                    this.textStr = this.textStr.slice(1);
                }
                else {
                    // note that the order of these 2 lines is annoyingly important
                    // (the second line mutates this.textStr.length)
                    this.dom.deleteData(-1 + this.textStr.length, 1);
                    deletedChar = this.textStr[this.textStr.length - 1];
                    this.textStr = this.textStr.slice(0, -1);
                }
                cursor.controller.aria.queue(deletedChar);
            }
            else {
                this.remove();
                this.jQ.remove();
                cursor[dir] = this[dir];
                cursor.controller.aria.queue(this.textStr);
            }
        };
        TextPiece.prototype.selectTowards = function (dir, cursor) {
            prayDirection(dir);
            var anticursor = cursor.anticursor;
            if (!anticursor)
                return;
            var ch = this.endChar(-dir, this.textStr);
            if (anticursor[dir] === this) {
                var newPc = new TextPiece(ch).createDir(dir, cursor);
                anticursor[dir] = newPc;
                cursor.insDirOf(dir, newPc);
            }
            else {
                var from = this[-dir];
                if (from instanceof TextPiece)
                    from.insTextAtDirEnd(ch, dir);
                else {
                    var newPc = new TextPiece(ch).createDir(-dir, cursor);
                    var selection = cursor.selection;
                    if (selection) {
                        newPc.jQ.insDirOf(-dir, selection.jQ);
                    }
                }
                if (this.textStr.length === 1 && anticursor[-dir] === this) {
                    anticursor[-dir] = this[-dir]; // `this` will be removed in deleteTowards
                }
            }
            return this.deleteTowards(dir, cursor);
        };
        return TextPiece;
    }(MQNode));
    LatexCmds.text =
        LatexCmds.textnormal =
            LatexCmds.textrm =
                LatexCmds.textup =
                    LatexCmds.textmd =
                        TextBlock;
    function makeTextBlock(latex, ariaLabel, tagName, attrs) {
        return /** @class */ (function (_super) {
            __extends(class_2, _super);
            function class_2() {
                var _this = _super !== null && _super.apply(this, arguments) || this;
                _this.ctrlSeq = latex;
                _this.mathspeakTemplate = ['Start' + ariaLabel, 'End' + ariaLabel];
                _this.ariaLabel = ariaLabel;
                return _this;
            }
            class_2.prototype.html = function () {
                var cmdId = 'mathquill-command-id=' + this.id;
                return ('<' +
                    tagName +
                    ' ' +
                    attrs +
                    ' ' +
                    cmdId +
                    '>' +
                    this.textContents() +
                    '</' +
                    tagName +
                    '>');
            };
            return class_2;
        }(TextBlock));
    }
    LatexCmds.em =
        LatexCmds.italic =
            LatexCmds.italics =
                LatexCmds.emph =
                    LatexCmds.textit =
                        LatexCmds.textsl =
                            makeTextBlock('\\textit', 'Italic', 'i', 'class="mq-text-mode"');
    LatexCmds.strong =
        LatexCmds.bold =
            LatexCmds.textbf =
                makeTextBlock('\\textbf', 'Bold', 'b', 'class="mq-text-mode"');
    LatexCmds.sf = LatexCmds.textsf = makeTextBlock('\\textsf', 'Sans serif font', 'span', 'class="mq-sans-serif mq-text-mode"');
    LatexCmds.tt = LatexCmds.texttt = makeTextBlock('\\texttt', 'Mono space font', 'span', 'class="mq-monospace mq-text-mode"');
    LatexCmds.textsc = makeTextBlock('\\textsc', 'Variable font', 'span', 'style="font-variant:small-caps" class="mq-text-mode"');
    LatexCmds.uppercase = makeTextBlock('\\uppercase', 'Uppercase', 'span', 'style="text-transform:uppercase" class="mq-text-mode"');
    LatexCmds.lowercase = makeTextBlock('\\lowercase', 'Lowercase', 'span', 'style="text-transform:lowercase" class="mq-text-mode"');
    var RootMathCommand = /** @class */ (function (_super) {
        __extends(RootMathCommand, _super);
        function RootMathCommand(cursor) {
            var _this = _super.call(this, '$') || this;
            _this.htmlTemplate = '<span class="mq-math-mode">&0</span>';
            _this.cursor = cursor;
            return _this;
        }
        RootMathCommand.prototype.createBlocks = function () {
            _super.prototype.createBlocks.call(this);
            var endsL = this.ends[L]; // TODO - how do we know this is a RootMathCommand?
            endsL.cursor = this.cursor;
            endsL.write = function (cursor, ch) {
                if (ch !== '$')
                    MathBlock.prototype.write.call(this, cursor, ch);
                else if (this.isEmpty()) {
                    cursor.insRightOf(this.parent);
                    this.parent.deleteTowards(undefined, cursor);
                    new VanillaSymbol('\\$', '$').createLeftOf(cursor.show());
                }
                else if (!cursor[R])
                    cursor.insRightOf(this.parent);
                else if (!cursor[L])
                    cursor.insLeftOf(this.parent);
                else
                    MathBlock.prototype.write.call(this, cursor, ch);
            };
        };
        RootMathCommand.prototype.latex = function () {
            return '$' + this.ends[L].latex() + '$';
        };
        return RootMathCommand;
    }(MathCommand));
    var RootTextBlock = /** @class */ (function (_super) {
        __extends(RootTextBlock, _super);
        function RootTextBlock() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        RootTextBlock.prototype.keystroke = function (key, e, ctrlr) {
            if (key === 'Spacebar' || key === 'Shift-Spacebar')
                return;
            return _super.prototype.keystroke.call(this, key, e, ctrlr);
        };
        RootTextBlock.prototype.write = function (cursor, ch) {
            cursor.show().deleteSelection();
            if (ch === '$')
                new RootMathCommand(cursor).createLeftOf(cursor);
            else {
                var html;
                if (ch === '<')
                    html = '&lt;';
                else if (ch === '>')
                    html = '&gt;';
                new VanillaSymbol(ch, html).createLeftOf(cursor);
            }
        };
        return RootTextBlock;
    }(RootMathBlock));
    API.TextField = function (APIClasses) {
        var _c;
        return _c = /** @class */ (function (_super) {
                __extends(class_3, _super);
                function class_3() {
                    return _super !== null && _super.apply(this, arguments) || this;
                }
                class_3.prototype.__mathquillify = function () {
                    return _super.prototype.__mathquillify.call(this, 'mq-editable-field mq-text-mode');
                };
                class_3.prototype.latex = function (latex) {
                    if (arguments.length > 0) {
                        this.__controller.renderLatexText(latex);
                        if (this.__controller.blurred)
                            this.__controller.cursor.hide().parent.blur();
                        return this;
                    }
                    return this.__controller.exportLatex();
                };
                return class_3;
            }(APIClasses.EditableField)),
            _c.RootBlock = RootTextBlock,
            _c;
    };
    /************************************
     * Symbols for Advanced Mathematics
     ***********************************/
    LatexCmds.notin =
        LatexCmds.cong =
            LatexCmds.equiv =
                LatexCmds.oplus =
                    LatexCmds.otimes =
                        function (latex) {
                            return new BinaryOperator('\\' + latex + ' ', '&' + latex + ';');
                        };
    LatexCmds['∗'] =
        LatexCmds.ast =
            LatexCmds.star =
                LatexCmds.loast =
                    LatexCmds.lowast =
                        bindBinaryOperator('\\ast ', '&lowast;', 'low asterisk');
    LatexCmds.therefor = LatexCmds.therefore = bindBinaryOperator('\\therefore ', '&there4;', 'therefore');
    LatexCmds.cuz = LatexCmds.because = bindBinaryOperator(
    // l33t
    '\\because ', '&#8757;', 'because');
    LatexCmds.prop = LatexCmds.propto = bindBinaryOperator('\\propto ', '&prop;', 'proportional to');
    LatexCmds['≈'] =
        LatexCmds.asymp =
            LatexCmds.approx =
                bindBinaryOperator('\\approx ', '&asymp;', 'approximately equal to');
    LatexCmds.isin = LatexCmds['in'] = bindBinaryOperator('\\in ', '&isin;', 'is in');
    LatexCmds.ni = LatexCmds.contains = bindBinaryOperator('\\ni ', '&ni;', 'is not in');
    LatexCmds.notni =
        LatexCmds.niton =
            LatexCmds.notcontains =
                LatexCmds.doesnotcontain =
                    bindBinaryOperator('\\not\\ni ', '&#8716;', 'does not contain');
    LatexCmds.sub = LatexCmds.subset = bindBinaryOperator('\\subset ', '&sub;', 'subset');
    LatexCmds.sup =
        LatexCmds.supset =
            LatexCmds.superset =
                bindBinaryOperator('\\supset ', '&sup;', 'superset');
    LatexCmds.nsub =
        LatexCmds.notsub =
            LatexCmds.nsubset =
                LatexCmds.notsubset =
                    bindBinaryOperator('\\not\\subset ', '&#8836;', 'not a subset');
    LatexCmds.nsup =
        LatexCmds.notsup =
            LatexCmds.nsupset =
                LatexCmds.notsupset =
                    LatexCmds.nsuperset =
                        LatexCmds.notsuperset =
                            bindBinaryOperator('\\not\\supset ', '&#8837;', 'not a superset');
    LatexCmds.sube =
        LatexCmds.subeq =
            LatexCmds.subsete =
                LatexCmds.subseteq =
                    bindBinaryOperator('\\subseteq ', '&sube;', 'subset or equal to');
    LatexCmds.supe =
        LatexCmds.supeq =
            LatexCmds.supsete =
                LatexCmds.supseteq =
                    LatexCmds.supersete =
                        LatexCmds.superseteq =
                            bindBinaryOperator('\\supseteq ', '&supe;', 'superset or equal to');
    LatexCmds.nsube =
        LatexCmds.nsubeq =
            LatexCmds.notsube =
                LatexCmds.notsubeq =
                    LatexCmds.nsubsete =
                        LatexCmds.nsubseteq =
                            LatexCmds.notsubsete =
                                LatexCmds.notsubseteq =
                                    bindBinaryOperator('\\not\\subseteq ', '&#8840;', 'not subset or equal to');
    LatexCmds.nsupe =
        LatexCmds.nsupeq =
            LatexCmds.notsupe =
                LatexCmds.notsupeq =
                    LatexCmds.nsupsete =
                        LatexCmds.nsupseteq =
                            LatexCmds.notsupsete =
                                LatexCmds.notsupseteq =
                                    LatexCmds.nsupersete =
                                        LatexCmds.nsuperseteq =
                                            LatexCmds.notsupersete =
                                                LatexCmds.notsuperseteq =
                                                    bindBinaryOperator('\\not\\supseteq ', '&#8841;', 'not superset or equal to');
    //the canonical sets of numbers
    LatexCmds.mathbb = /** @class */ (function (_super) {
        __extends(class_4, _super);
        function class_4() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        class_4.prototype.createLeftOf = function (_cursor) { };
        class_4.prototype.numBlocks = function () {
            return 1;
        };
        class_4.prototype.parser = function () {
            var string = Parser.string;
            var regex = Parser.regex;
            var optWhitespace = Parser.optWhitespace;
            return optWhitespace
                .then(string('{'))
                .then(optWhitespace)
                .then(regex(/^[NPZQRCH]/))
                .skip(optWhitespace)
                .skip(string('}'))
                .map(function (c) {
                // instantiate the class for the matching char
                var cmd = LatexCmds[c];
                if (isMQNodeClass(cmd)) {
                    return new cmd();
                }
                else {
                    return cmd();
                }
            });
        };
        return class_4;
    }(MathCommand));
    LatexCmds.N =
        LatexCmds.naturals =
            LatexCmds.Naturals =
                bindVanillaSymbol('\\mathbb{N}', '&#8469;', 'naturals');
    LatexCmds.P =
        LatexCmds.primes =
            LatexCmds.Primes =
                LatexCmds.projective =
                    LatexCmds.Projective =
                        LatexCmds.probability =
                            LatexCmds.Probability =
                                bindVanillaSymbol('\\mathbb{P}', '&#8473;', 'P');
    LatexCmds.Z =
        LatexCmds.integers =
            LatexCmds.Integers =
                bindVanillaSymbol('\\mathbb{Z}', '&#8484;', 'integers');
    LatexCmds.Q =
        LatexCmds.rationals =
            LatexCmds.Rationals =
                bindVanillaSymbol('\\mathbb{Q}', '&#8474;', 'rationals');
    LatexCmds.R =
        LatexCmds.reals =
            LatexCmds.Reals =
                bindVanillaSymbol('\\mathbb{R}', '&#8477;', 'reals');
    LatexCmds.C =
        LatexCmds.complex =
            LatexCmds.Complex =
                LatexCmds.complexes =
                    LatexCmds.Complexes =
                        LatexCmds.complexplane =
                            LatexCmds.Complexplane =
                                LatexCmds.ComplexPlane =
                                    bindVanillaSymbol('\\mathbb{C}', '&#8450;', 'complexes');
    LatexCmds.H =
        LatexCmds.Hamiltonian =
            LatexCmds.quaternions =
                LatexCmds.Quaternions =
                    bindVanillaSymbol('\\mathbb{H}', '&#8461;', 'quaternions');
    //spacing
    LatexCmds.quad = LatexCmds.emsp = bindVanillaSymbol('\\quad ', '    ', '4 spaces');
    LatexCmds.qquad = bindVanillaSymbol('\\qquad ', '        ', '8 spaces');
    /* spacing special characters, gonna have to implement this in LatexCommandInput::onText somehow
    case ',':
      return VanillaSymbol('\\, ',' ', 'comma');
    case ':':
      return VanillaSymbol('\\: ','  ', 'colon');
    case ';':
      return VanillaSymbol('\\; ','   ', 'semicolon');
    case '!':
      return MQSymbol('\\! ','<span style="margin-right:-.2em"></span>', 'exclamation point');
    */
    //binary operators
    LatexCmds['⟌'] = LatexCmds.longdiv = /** @class */ (function (_super) {
        __extends(LongDivision, _super);
        function LongDivision() {
            var _this = _super !== null && _super.apply(this, arguments) || this;
            _this.ctrlSeq = '\\longdiv';
            _this.htmlTemplate = '<span class="mq-non-leaf mq-longdiv-container">' +
                '<span class="mq-longdiv-stem">&0</span>' +
                '</span>';
            _this.textTemplate = ['longdiv(', ')'];
            _this.mathspeakTemplate = ['Long division,', ', end long division'];
            _this.ariaLabel = 'long division';
            return _this;
        }
        LongDivision.prototype.parser = function () {
            return _super.prototype.parser.call(this).or(Parser.succeed(this).map(function (command) {
                command.createBlocks();
                return command;
            }));
        };
        return LongDivision;
    }(MathCommand));
    LatexCmds.diamond = bindVanillaSymbol('\\diamond ', '&#9671;', 'diamond');
    LatexCmds.bigtriangleup = bindVanillaSymbol('\\bigtriangleup ', '&#9651;', 'triangle up');
    LatexCmds.ominus = bindVanillaSymbol('\\ominus ', '&#8854;', 'o minus');
    LatexCmds.uplus = bindVanillaSymbol('\\uplus ', '&#8846;', 'disjoint union');
    LatexCmds.bigtriangledown = bindVanillaSymbol('\\bigtriangledown ', '&#9661;', 'triangle down');
    LatexCmds.sqcap = bindVanillaSymbol('\\sqcap ', '&#8851;', 'greatest lower bound');
    LatexCmds.triangleleft = bindVanillaSymbol('\\triangleleft ', '&#8882;', 'triangle left');
    LatexCmds.sqcup = bindVanillaSymbol('\\sqcup ', '&#8852;', 'least upper bound');
    LatexCmds.triangleright = bindVanillaSymbol('\\triangleright ', '&#8883;', 'triangle right');
    //circledot is not a not real LaTex command see https://github.com/mathquill/mathquill/pull/552 for more details
    LatexCmds.odot = LatexCmds.circledot = bindVanillaSymbol('\\odot ', '&#8857;', 'circle dot');
    LatexCmds.bigcirc = bindVanillaSymbol('\\bigcirc ', '&#9711;', 'circle');
    LatexCmds.dagger = bindVanillaSymbol('\\dagger ', '&#0134;', 'dagger');
    LatexCmds.ddagger = bindVanillaSymbol('\\ddagger ', '&#135;', 'big dagger');
    LatexCmds.wr = bindVanillaSymbol('\\wr ', '&#8768;', 'wreath');
    LatexCmds.amalg = bindVanillaSymbol('\\amalg ', '&#8720;', 'amalgam');
    //relationship symbols
    LatexCmds.models = bindVanillaSymbol('\\models ', '&#8872;', 'models');
    LatexCmds.prec = bindVanillaSymbol('\\prec ', '&#8826;', 'precedes');
    LatexCmds.succ = bindVanillaSymbol('\\succ ', '&#8827;', 'succeeds');
    LatexCmds.preceq = bindVanillaSymbol('\\preceq ', '&#8828;', 'precedes or equals');
    LatexCmds.succeq = bindVanillaSymbol('\\succeq ', '&#8829;', 'succeeds or equals');
    LatexCmds.simeq = bindVanillaSymbol('\\simeq ', '&#8771;', 'similar or equal to');
    LatexCmds.mid = bindVanillaSymbol('\\mid ', '&#8739;', 'divides');
    LatexCmds.ll = bindVanillaSymbol('\\ll ', '&#8810;', 'll');
    LatexCmds.gg = bindVanillaSymbol('\\gg ', '&#8811;', 'gg');
    LatexCmds.parallel = bindVanillaSymbol('\\parallel ', '&#8741;', 'parallel with');
    LatexCmds.nparallel = bindVanillaSymbol('\\nparallel ', '&#8742;', 'not parallel with');
    LatexCmds.bowtie = bindVanillaSymbol('\\bowtie ', '&#8904;', 'bowtie');
    LatexCmds.sqsubset = bindVanillaSymbol('\\sqsubset ', '&#8847;', 'square subset');
    LatexCmds.sqsupset = bindVanillaSymbol('\\sqsupset ', '&#8848;', 'square superset');
    LatexCmds.smile = bindVanillaSymbol('\\smile ', '&#8995;', 'smile');
    LatexCmds.sqsubseteq = bindVanillaSymbol('\\sqsubseteq ', '&#8849;', 'square subset or equal to');
    LatexCmds.sqsupseteq = bindVanillaSymbol('\\sqsupseteq ', '&#8850;', 'square superset or equal to');
    LatexCmds.doteq = bindVanillaSymbol('\\doteq ', '&#8784;', 'dotted equals');
    LatexCmds.frown = bindVanillaSymbol('\\frown ', '&#8994;', 'frown');
    LatexCmds.vdash = bindVanillaSymbol('\\vdash ', '&#8870;', 'v dash');
    LatexCmds.dashv = bindVanillaSymbol('\\dashv ', '&#8867;', 'dash v');
    LatexCmds.nless = bindVanillaSymbol('\\nless ', '&#8814;', 'not less than');
    LatexCmds.ngtr = bindVanillaSymbol('\\ngtr ', '&#8815;', 'not greater than');
    //arrows
    LatexCmds.longleftarrow = bindVanillaSymbol('\\longleftarrow ', '&#8592;', 'left arrow');
    LatexCmds.longrightarrow = bindVanillaSymbol('\\longrightarrow ', '&#8594;', 'right arrow');
    LatexCmds.Longleftarrow = bindVanillaSymbol('\\Longleftarrow ', '&#8656;', 'left arrow');
    LatexCmds.Longrightarrow = bindVanillaSymbol('\\Longrightarrow ', '&#8658;', 'right arrow');
    LatexCmds.longleftrightarrow = bindVanillaSymbol('\\longleftrightarrow ', '&#8596;', 'left and right arrow');
    LatexCmds.updownarrow = bindVanillaSymbol('\\updownarrow ', '&#8597;', 'up and down arrow');
    LatexCmds.Longleftrightarrow = bindVanillaSymbol('\\Longleftrightarrow ', '&#8660;', 'left and right arrow');
    LatexCmds.Updownarrow = bindVanillaSymbol('\\Updownarrow ', '&#8661;', 'up and down arrow');
    LatexCmds.mapsto = bindVanillaSymbol('\\mapsto ', '&#8614;', 'maps to');
    LatexCmds.nearrow = bindVanillaSymbol('\\nearrow ', '&#8599;', 'northeast arrow');
    LatexCmds.hookleftarrow = bindVanillaSymbol('\\hookleftarrow ', '&#8617;', 'hook left arrow');
    LatexCmds.hookrightarrow = bindVanillaSymbol('\\hookrightarrow ', '&#8618;', 'hook right arrow');
    LatexCmds.searrow = bindVanillaSymbol('\\searrow ', '&#8600;', 'southeast arrow');
    LatexCmds.leftharpoonup = bindVanillaSymbol('\\leftharpoonup ', '&#8636;', 'left harpoon up');
    LatexCmds.rightharpoonup = bindVanillaSymbol('\\rightharpoonup ', '&#8640;', 'right harpoon up');
    LatexCmds.swarrow = bindVanillaSymbol('\\swarrow ', '&#8601;', 'southwest arrow');
    LatexCmds.leftharpoondown = bindVanillaSymbol('\\leftharpoondown ', '&#8637;', 'left harpoon down');
    LatexCmds.rightharpoondown = bindVanillaSymbol('\\rightharpoondown ', '&#8641;', 'right harpoon down');
    LatexCmds.nwarrow = bindVanillaSymbol('\\nwarrow ', '&#8598;', 'northwest arrow');
    //Misc
    LatexCmds.ldots = bindVanillaSymbol('\\ldots ', '&#8230;', 'l dots');
    LatexCmds.cdots = bindVanillaSymbol('\\cdots ', '&#8943;', 'c dots');
    LatexCmds.vdots = bindVanillaSymbol('\\vdots ', '&#8942;', 'v dots');
    LatexCmds.ddots = bindVanillaSymbol('\\ddots ', '&#8945;', 'd dots');
    LatexCmds.surd = bindVanillaSymbol('\\surd ', '&#8730;', 'unresolved root');
    LatexCmds.triangle = bindVanillaSymbol('\\triangle ', '&#9651;', 'triangle');
    LatexCmds.ell = bindVanillaSymbol('\\ell ', '&#8467;', 'ell');
    LatexCmds.top = bindVanillaSymbol('\\top ', '&#8868;', 'top');
    LatexCmds.flat = bindVanillaSymbol('\\flat ', '&#9837;', 'flat');
    LatexCmds.natural = bindVanillaSymbol('\\natural ', '&#9838;', 'natural');
    LatexCmds.sharp = bindVanillaSymbol('\\sharp ', '&#9839;', 'sharp');
    LatexCmds.wp = bindVanillaSymbol('\\wp ', '&#8472;', 'wp');
    LatexCmds.bot = bindVanillaSymbol('\\bot ', '&#8869;', 'bot');
    LatexCmds.clubsuit = bindVanillaSymbol('\\clubsuit ', '&#9827;', 'club suit');
    LatexCmds.diamondsuit = bindVanillaSymbol('\\diamondsuit ', '&#9826;', 'diamond suit');
    LatexCmds.heartsuit = bindVanillaSymbol('\\heartsuit ', '&#9825;', 'heart suit');
    LatexCmds.spadesuit = bindVanillaSymbol('\\spadesuit ', '&#9824;', 'spade suit');
    //not real LaTex command see https://github.com/mathquill/mathquill/pull/552 for more details
    LatexCmds.parallelogram = bindVanillaSymbol('\\parallelogram ', '&#9649;', 'parallelogram');
    LatexCmds.square = bindVanillaSymbol('\\square ', '&#11036;', 'square');
    //variable-sized
    LatexCmds.oint = bindVanillaSymbol('\\oint ', '&#8750;', 'o int');
    LatexCmds.bigcap = bindVanillaSymbol('\\bigcap ', '&#8745;', 'big cap');
    LatexCmds.bigcup = bindVanillaSymbol('\\bigcup ', '&#8746;', 'big cup');
    LatexCmds.bigsqcup = bindVanillaSymbol('\\bigsqcup ', '&#8852;', 'big square cup');
    LatexCmds.bigvee = bindVanillaSymbol('\\bigvee ', '&#8744;', 'big vee');
    LatexCmds.bigwedge = bindVanillaSymbol('\\bigwedge ', '&#8743;', 'big wedge');
    LatexCmds.bigodot = bindVanillaSymbol('\\bigodot ', '&#8857;', 'big o dot');
    LatexCmds.bigotimes = bindVanillaSymbol('\\bigotimes ', '&#8855;', 'big o times');
    LatexCmds.bigoplus = bindVanillaSymbol('\\bigoplus ', '&#8853;', 'big o plus');
    LatexCmds.biguplus = bindVanillaSymbol('\\biguplus ', '&#8846;', 'big u plus');
    //delimiters
    LatexCmds.lfloor = bindVanillaSymbol('\\lfloor ', '&#8970;', 'left floor');
    LatexCmds.rfloor = bindVanillaSymbol('\\rfloor ', '&#8971;', 'right floor');
    LatexCmds.lceil = bindVanillaSymbol('\\lceil ', '&#8968;', 'left ceiling');
    LatexCmds.rceil = bindVanillaSymbol('\\rceil ', '&#8969;', 'right ceiling');
    LatexCmds.opencurlybrace = LatexCmds.lbrace = bindVanillaSymbol('\\lbrace ', '{', 'left brace');
    LatexCmds.closecurlybrace = LatexCmds.rbrace = bindVanillaSymbol('\\rbrace ', '}', 'right brace');
    LatexCmds.lbrack = bindVanillaSymbol('[', 'left bracket');
    LatexCmds.rbrack = bindVanillaSymbol(']', 'right bracket');
    //various symbols
    LatexCmds.slash = bindVanillaSymbol('/', 'slash');
    LatexCmds.vert = bindVanillaSymbol('|', 'vertical bar');
    LatexCmds.perp = LatexCmds.perpendicular = bindVanillaSymbol('\\perp ', '&perp;', 'perpendicular');
    LatexCmds.nabla = LatexCmds.del = bindVanillaSymbol('\\nabla ', '&nabla;');
    LatexCmds.hbar = bindVanillaSymbol('\\hbar ', '&#8463;', 'horizontal bar');
    LatexCmds.AA =
        LatexCmds.Angstrom =
            LatexCmds.angstrom =
                bindVanillaSymbol('\\text\\AA ', '&#8491;', 'AA');
    LatexCmds.ring =
        LatexCmds.circ =
            LatexCmds.circle =
                bindVanillaSymbol('\\circ ', '&#8728;', 'circle');
    LatexCmds.bull = LatexCmds.bullet = bindVanillaSymbol('\\bullet ', '&bull;', 'bullet');
    LatexCmds.setminus = LatexCmds.smallsetminus = bindVanillaSymbol('\\setminus ', '&#8726;', 'set minus');
    LatexCmds.not = //bind(MQSymbol,'\\not ','<span class="not">/</span>', 'not');
        LatexCmds['¬'] =
            LatexCmds.neg =
                bindVanillaSymbol('\\neg ', '&not;', 'not');
    LatexCmds['…'] =
        LatexCmds.dots =
            LatexCmds.ellip =
                LatexCmds.hellip =
                    LatexCmds.ellipsis =
                        LatexCmds.hellipsis =
                            bindVanillaSymbol('\\dots ', '&hellip;', 'ellipsis');
    LatexCmds.converges =
        LatexCmds.darr =
            LatexCmds.dnarr =
                LatexCmds.dnarrow =
                    LatexCmds.downarrow =
                        bindVanillaSymbol('\\downarrow ', '&darr;', 'converges with');
    LatexCmds.dArr =
        LatexCmds.dnArr =
            LatexCmds.dnArrow =
                LatexCmds.Downarrow =
                    bindVanillaSymbol('\\Downarrow ', '&dArr;', 'down arrow');
    LatexCmds.diverges =
        LatexCmds.uarr =
            LatexCmds.uparrow =
                bindVanillaSymbol('\\uparrow ', '&uarr;', 'diverges from');
    LatexCmds.uArr = LatexCmds.Uparrow = bindVanillaSymbol('\\Uparrow ', '&uArr;', 'up arrow');
    LatexCmds.rarr = LatexCmds.rightarrow = bindVanillaSymbol('\\rightarrow ', '&rarr;', 'right arrow');
    LatexCmds.implies = bindBinaryOperator('\\Rightarrow ', '&rArr;', 'implies');
    LatexCmds.rArr = LatexCmds.Rightarrow = bindVanillaSymbol('\\Rightarrow ', '&rArr;', 'right arrow');
    LatexCmds.gets = bindBinaryOperator('\\gets ', '&larr;', 'gets');
    LatexCmds.larr = LatexCmds.leftarrow = bindVanillaSymbol('\\leftarrow ', '&larr;', 'left arrow');
    LatexCmds.impliedby = bindBinaryOperator('\\Leftarrow ', '&lArr;', 'implied by');
    LatexCmds.lArr = LatexCmds.Leftarrow = bindVanillaSymbol('\\Leftarrow ', '&lArr;', 'left arrow');
    LatexCmds.harr =
        LatexCmds.lrarr =
            LatexCmds.leftrightarrow =
                bindVanillaSymbol('\\leftrightarrow ', '&harr;', 'left and right arrow');
    LatexCmds.iff = bindBinaryOperator('\\Leftrightarrow ', '&hArr;', 'if and only if');
    LatexCmds.hArr =
        LatexCmds.lrArr =
            LatexCmds.Leftrightarrow =
                bindVanillaSymbol('\\Leftrightarrow ', '&hArr;', 'left and right arrow');
    LatexCmds.Re =
        LatexCmds.Real =
            LatexCmds.real =
                bindVanillaSymbol('\\Re ', '&real;', 'real');
    LatexCmds.Im =
        LatexCmds.imag =
            LatexCmds.image =
                LatexCmds.imagin =
                    LatexCmds.imaginary =
                        LatexCmds.Imaginary =
                            bindVanillaSymbol('\\Im ', '&image;', 'imaginary');
    LatexCmds.part = LatexCmds.partial = bindVanillaSymbol('\\partial ', '&part;', 'partial');
    LatexCmds.pounds = bindVanillaSymbol('\\pounds ', '&pound;');
    LatexCmds.alef =
        LatexCmds.alefsym =
            LatexCmds.aleph =
                LatexCmds.alephsym =
                    bindVanillaSymbol('\\aleph ', '&alefsym;', 'alef sym');
    LatexCmds.xist = //LOL
        LatexCmds.xists =
            LatexCmds.exist =
                LatexCmds.exists =
                    bindVanillaSymbol('\\exists ', '&exist;', 'there exists at least 1');
    LatexCmds.nexists = LatexCmds.nexist = bindVanillaSymbol('\\nexists ', '&#8708;', 'there is no');
    LatexCmds.and =
        LatexCmds.land =
            LatexCmds.wedge =
                bindBinaryOperator('\\wedge ', '&and;', 'and');
    LatexCmds.or =
        LatexCmds.lor =
            LatexCmds.vee =
                bindBinaryOperator('\\vee ', '&or;', 'or');
    LatexCmds.o =
        LatexCmds.O =
            LatexCmds.empty =
                LatexCmds.emptyset =
                    LatexCmds.oslash =
                        LatexCmds.Oslash =
                            LatexCmds.nothing =
                                LatexCmds.varnothing =
                                    bindBinaryOperator('\\varnothing ', '&empty;', 'nothing');
    LatexCmds.cup = LatexCmds.union = bindBinaryOperator('\\cup ', '&cup;', 'union');
    LatexCmds.cap =
        LatexCmds.intersect =
            LatexCmds.intersection =
                bindBinaryOperator('\\cap ', '&cap;', 'intersection');
    // FIXME: the correct LaTeX would be ^\circ but we can't parse that
    LatexCmds.deg = LatexCmds.degree = bindVanillaSymbol('\\degree ', '&deg;', 'degrees');
    LatexCmds.ang = LatexCmds.angle = bindVanillaSymbol('\\angle ', '&ang;', 'angle');
    LatexCmds.measuredangle = bindVanillaSymbol('\\measuredangle ', '&#8737;', 'measured angle');
    /*********************************
     * Symbols for Basic Mathematics
     ********************************/
    var DigitGroupingChar = /** @class */ (function (_super) {
        __extends(DigitGroupingChar, _super);
        function DigitGroupingChar() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        DigitGroupingChar.prototype.finalizeTree = function (opts, dir) {
            this.sharedSiblingMethod(opts, dir);
        };
        DigitGroupingChar.prototype.siblingDeleted = function (opts, dir) {
            this.sharedSiblingMethod(opts, dir);
        };
        DigitGroupingChar.prototype.siblingCreated = function (opts, dir) {
            this.sharedSiblingMethod(opts, dir);
        };
        DigitGroupingChar.prototype.sharedSiblingMethod = function (opts, dir) {
            // don't try to fix digit grouping if the sibling to my right changed (dir === R or
            // undefined) and it's now a DigitGroupingChar, it will try to fix grouping
            if (dir !== L && this[R] instanceof DigitGroupingChar)
                return;
            this.fixDigitGrouping(opts);
        };
        DigitGroupingChar.prototype.fixDigitGrouping = function (opts) {
            if (!opts.enableDigitGrouping)
                return;
            var left = this;
            var right = this;
            var spacesFound = 0;
            var dots = [];
            var SPACE = '\\ ';
            var DOT = '.';
            // traverse left as far as possible (starting at this char)
            var node = left;
            do {
                if (/^[0-9]$/.test(node.ctrlSeq)) {
                    left = node;
                }
                else if (node.ctrlSeq === SPACE) {
                    left = node;
                    spacesFound += 1;
                }
                else if (node.ctrlSeq === DOT) {
                    left = node;
                    dots.push(node);
                }
                else {
                    break;
                }
            } while ((node = left[L]));
            // traverse right as far as possible (starting to right of this char)
            while ((node = right[R])) {
                if (/^[0-9]$/.test(node.ctrlSeq)) {
                    right = node;
                }
                else if (node.ctrlSeq === SPACE) {
                    right = node;
                    spacesFound += 1;
                }
                else if (node.ctrlSeq === DOT) {
                    right = node;
                    dots.push(node);
                }
                else {
                    break;
                }
            }
            // trim the leading spaces
            while (right !== left && left && left.ctrlSeq === SPACE) {
                left = left[R];
                spacesFound -= 1;
            }
            // trim the trailing spaces
            while (right !== left && right && right.ctrlSeq === SPACE) {
                right = right[L];
                spacesFound -= 1;
            }
            // happens when you only have a space
            if (left === right && left && left.ctrlSeq === SPACE)
                return;
            var disableFormatting = spacesFound > 0 || dots.length > 1;
            if (disableFormatting) {
                this.removeGroupingBetween(left, right);
            }
            else if (dots[0]) {
                if (dots[0] !== left) {
                    this.addGroupingBetween(dots[0][L], left);
                }
                if (dots[0] !== right) {
                    // we do not show grouping to the right of a decimal place #yet
                    this.removeGroupingBetween(dots[0][R], right);
                }
            }
            else {
                this.addGroupingBetween(right, left);
            }
        };
        DigitGroupingChar.prototype.removeGroupingBetween = function (left, right) {
            var node = left;
            do {
                if (node instanceof DigitGroupingChar) {
                    node.setGroupingClass(undefined);
                }
                if (!node || node === right)
                    break;
            } while ((node = node[R]));
        };
        DigitGroupingChar.prototype.addGroupingBetween = function (start, end) {
            var node = start;
            var count = 0;
            var totalDigits = 0;
            var node = start;
            while (node) {
                totalDigits += 1;
                if (node === end)
                    break;
                node = node[L];
            }
            var numDigitsInFirstGroup = totalDigits % 3;
            if (numDigitsInFirstGroup === 0)
                numDigitsInFirstGroup = 3;
            var node = start;
            while (node) {
                count += 1;
                var cls = undefined;
                // only do grouping if we have at least 4 numbers
                if (totalDigits >= 4) {
                    if (count === totalDigits) {
                        cls = 'mq-group-leading-' + numDigitsInFirstGroup;
                    }
                    else if (count % 3 === 0) {
                        if (count !== totalDigits) {
                            cls = 'mq-group-start';
                        }
                    }
                    if (!cls) {
                        cls = 'mq-group-other';
                    }
                }
                if (node instanceof DigitGroupingChar) {
                    node.setGroupingClass(cls);
                }
                if (node === end)
                    break;
                node = node[L];
            }
        };
        DigitGroupingChar.prototype.setGroupingClass = function (cls) {
            // nothing changed (either class is the same or it's still undefined)
            if (this._groupingClass === cls)
                return;
            // remove existing class
            if (this._groupingClass)
                this.jQ.removeClass(this._groupingClass);
            // add new class
            if (cls)
                this.jQ.addClass(cls);
            // cache the groupingClass
            this._groupingClass = cls;
        };
        return DigitGroupingChar;
    }(MQSymbol));
    var Digit = /** @class */ (function (_super) {
        __extends(Digit, _super);
        function Digit(ch, html, mathspeak) {
            return _super.call(this, ch, '<span class="mq-digit">' + (html || ch) + '</span>', undefined, mathspeak) || this;
        }
        Digit.prototype.createLeftOf = function (cursor) {
            var cursorL = cursor[L];
            var cursorLL = cursorL && cursorL[L];
            var cursorParentParentSub = cursor.parent.parent instanceof SupSub
                ? cursor.parent.parent.sub
                : undefined;
            if (cursor.options.autoSubscriptNumerals &&
                cursor.parent !== cursorParentParentSub &&
                ((cursorL instanceof Variable && cursorL.isItalic !== false) ||
                    (cursorL instanceof SupSub &&
                        cursorLL instanceof Variable &&
                        cursorLL.isItalic !== false))) {
                new SubscriptCommand().createLeftOf(cursor);
                _super.prototype.createLeftOf.call(this, cursor);
                cursor.insRightOf(cursor.parent.parent);
            }
            else
                _super.prototype.createLeftOf.call(this, cursor);
        };
        Digit.prototype.mathspeak = function (opts) {
            if (opts && opts.createdLeftOf) {
                var cursor = opts.createdLeftOf;
                var cursorL = cursor[L];
                var cursorLL = cursorL && cursorL[L];
                var cursorParentParentSub = cursor.parent.parent instanceof SupSub
                    ? cursor.parent.parent.sub
                    : undefined;
                if (cursor.options.autoSubscriptNumerals &&
                    cursor.parent !== cursorParentParentSub &&
                    ((cursorL instanceof Variable && cursorL.isItalic !== false) ||
                        (cursor[L] instanceof SupSub &&
                            cursorLL instanceof Variable &&
                            cursorLL.isItalic !== false))) {
                    return 'Subscript ' + _super.prototype.mathspeak.call(this) + ' Baseline';
                }
            }
            return _super.prototype.mathspeak.call(this);
        };
        return Digit;
    }(DigitGroupingChar));
    var Variable = /** @class */ (function (_super) {
        __extends(Variable, _super);
        function Variable(ch, html) {
            return _super.call(this, ch, '<var>' + (html || ch) + '</var>') || this;
        }
        Variable.prototype.text = function () {
            var text = this.ctrlSeq || '';
            if (this.isPartOfOperator) {
                if (text[0] == '\\') {
                    text = text.slice(1, text.length);
                }
                else if (text[text.length - 1] == ' ') {
                    text = text.slice(0, -1);
                }
            }
            else {
                if (this[L] &&
                    !(this[L] instanceof Variable) &&
                    !(this[L] instanceof BinaryOperator) &&
                    this[L].ctrlSeq !== '\\ ')
                    text = '*' + text;
                if (this[R] &&
                    !(this[R] instanceof BinaryOperator) &&
                    !(this[R] instanceof SupSub))
                    text += '*';
            }
            return text;
        };
        Variable.prototype.mathspeak = function () {
            var text = this.ctrlSeq || '';
            if (this.isPartOfOperator ||
                text.length > 1 ||
                (this.parent && this.parent.parent && this.parent.parent.isTextBlock())) {
                return _super.prototype.mathspeak.call(this);
            }
            else {
                // Apple voices in VoiceOver (such as Alex, Bruce, and Victoria) do
                // some strange pronunciation given certain expressions,
                // e.g. "y-2" is spoken as "ee minus 2" (as if the y is short).
                // Not an ideal solution, but surrounding non-numeric text blocks with quotation marks works.
                // This bug has been acknowledged by Apple.
                return '"' + text + '"';
            }
        };
        return Variable;
    }(MQSymbol));
    function bindVariable(ch, html, _unusedMathspeak) {
        return function () { return new Variable(ch, html); };
    }
    Options.prototype.autoCommands = { _maxLength: 0 };
    optionProcessors.autoCommands = function (cmds) {
        if (!/^[a-z]+(?: [a-z]+)*$/i.test(cmds)) {
            throw '"' + cmds + '" not a space-delimited list of only letters';
        }
        var list = cmds.split(' ');
        var dict = {};
        var maxLength = 0;
        for (var i = 0; i < list.length; i += 1) {
            var cmd = list[i];
            if (cmd.length < 2) {
                throw 'autocommand "' + cmd + '" not minimum length of 2';
            }
            if (LatexCmds[cmd] === OperatorName) {
                throw '"' + cmd + '" is a built-in operator name';
            }
            dict[cmd] = 1;
            maxLength = max(maxLength, cmd.length);
        }
        dict._maxLength = maxLength;
        return dict;
    };
    Options.prototype.quietEmptyDelimiters = {};
    optionProcessors.quietEmptyDelimiters = function (dlms) {
        var list = dlms.split(' ');
        var dict = {};
        for (var i = 0; i < list.length; i += 1) {
            var dlm = list[i];
            dict[dlm] = 1;
        }
        return dict;
    };
    Options.prototype.autoParenthesizedFunctions = { _maxLength: 0 };
    optionProcessors.autoParenthesizedFunctions = function (cmds) {
        if (!/^[a-z]+(?: [a-z]+)*$/i.test(cmds)) {
            throw '"' + cmds + '" not a space-delimited list of only letters';
        }
        var list = cmds.split(' ');
        var dict = {};
        var maxLength = 0;
        for (var i = 0; i < list.length; i += 1) {
            var cmd = list[i];
            if (cmd.length < 2) {
                throw 'autocommand "' + cmd + '" not minimum length of 2';
            }
            dict[cmd] = 1;
            maxLength = max(maxLength, cmd.length);
        }
        dict._maxLength = maxLength;
        return dict;
    };
    var Letter = /** @class */ (function (_super) {
        __extends(Letter, _super);
        function Letter(ch) {
            var _this = _super.call(this, ch) || this;
            _this.letter = ch;
            return _this;
        }
        Letter.prototype.checkAutoCmds = function (cursor) {
            //exit early if in simple subscript and disableAutoSubstitutionInSubscripts is set.
            if (this.shouldIgnoreSubstitutionInSimpleSubscript(cursor.options)) {
                return;
            }
            //handle autoCommands
            var autoCmds = cursor.options.autoCommands;
            var maxLength = autoCmds._maxLength || 0;
            if (maxLength > 0) {
                // want longest possible autocommand, so join together longest
                // sequence of letters
                var str = '';
                var l = this;
                var i = 0;
                // FIXME: l.ctrlSeq === l.letter checks if first or last in an operator name
                while (l instanceof Letter && l.ctrlSeq === l.letter && i < maxLength) {
                    str = l.letter + str;
                    l = l[L];
                    i += 1;
                }
                // check for an autocommand, going thru substrings longest to shortest
                while (str.length) {
                    if (autoCmds.hasOwnProperty(str)) {
                        l = this;
                        for (i = 1; l && i < str.length; i += 1, l = l[L])
                            ;
                        new Fragment(l, this).remove();
                        cursor[L] = l[L];
                        var cmd = LatexCmds[str];
                        var node;
                        if (isMQNodeClass(cmd)) {
                            node = new cmd(str); // TODO - How do we know that this class expects a single str input?
                        }
                        else {
                            node = cmd(str);
                        }
                        return node.createLeftOf(cursor);
                    }
                    str = str.slice(1);
                }
            }
        };
        Letter.prototype.autoParenthesize = function (cursor) {
            //exit early if already parenthesized
            var right = cursor.parent.ends[R];
            if (right && right instanceof Bracket && right.ctrlSeq === '\\left(') {
                return;
            }
            //exit early if in simple subscript and disableAutoSubstitutionInSubscripts is set.
            if (this.shouldIgnoreSubstitutionInSimpleSubscript(cursor.options)) {
                return;
            }
            //handle autoParenthesized functions
            var str = '';
            var l = this;
            var i = 0;
            var autoParenthesizedFunctions = cursor.options.autoParenthesizedFunctions;
            var maxLength = autoParenthesizedFunctions._maxLength || 0;
            var autoOperatorNames = cursor.options.autoOperatorNames;
            while (l instanceof Letter && i < maxLength) {
                (str = l.letter + str), (l = l[L]), (i += 1);
            }
            // check for an autoParenthesized functions, going thru substrings longest to shortest
            // only allow autoParenthesized functions that are also autoOperatorNames
            while (str.length) {
                if (autoParenthesizedFunctions.hasOwnProperty(str) &&
                    autoOperatorNames.hasOwnProperty(str)) {
                    return cursor.parent.write(cursor, '(');
                }
                str = str.slice(1);
            }
        };
        Letter.prototype.createLeftOf = function (cursor) {
            _super.prototype.createLeftOf.call(this, cursor);
            this.checkAutoCmds(cursor);
            this.autoParenthesize(cursor);
        };
        Letter.prototype.italicize = function (bool) {
            this.isItalic = bool;
            this.isPartOfOperator = !bool;
            this.jQ.toggleClass('mq-operator-name', !bool);
            return this;
        };
        Letter.prototype.finalizeTree = function (opts, dir) {
            this.sharedSiblingMethod(opts, dir);
        };
        Letter.prototype.siblingDeleted = function (opts, dir) {
            this.sharedSiblingMethod(opts, dir);
        };
        Letter.prototype.siblingCreated = function (opts, dir) {
            this.sharedSiblingMethod(opts, dir);
        };
        Letter.prototype.sharedSiblingMethod = function (opts, dir) {
            // don't auto-un-italicize if the sibling to my right changed (dir === R or
            // undefined) and it's now a Letter, it will un-italicize everyone
            if (dir !== L && this[R] instanceof Letter)
                return;
            this.autoUnItalicize(opts);
        };
        Letter.prototype.autoUnItalicize = function (opts) {
            var autoOps = opts.autoOperatorNames;
            if (autoOps._maxLength === 0)
                return;
            //exit early if in simple subscript and disableAutoSubstitutionInSubscripts is set.
            if (this.shouldIgnoreSubstitutionInSimpleSubscript(opts)) {
                return;
            }
            // want longest possible operator names, so join together entire contiguous
            // sequence of letters
            var str = this.letter;
            for (var l = this[L]; l instanceof Letter; l = l[L])
                str = l.letter + str;
            for (var r = this[R]; r instanceof Letter; r = r[R])
                str += r.letter;
            // removeClass and delete flags from all letters before figuring out
            // which, if any, are part of an operator name
            var lR = l && l[R];
            var rL = r && r[L];
            new Fragment(lR || this.parent.ends[L], rL || this.parent.ends[R]).each(function (el) {
                if (el instanceof Letter) {
                    el.italicize(true).jQ.removeClass('mq-first mq-last mq-followed-by-supsub');
                    el.ctrlSeq = el.letter;
                }
                return undefined;
            });
            var autoOpsLength = autoOps._maxLength || 0;
            // check for operator names: at each position from left to right, check
            // substrings from longest to shortest
            outer: for (var i = 0, first = l[R] || this.parent.ends[L]; first && i < str.length; i += 1, first = first[R]) {
                for (var len = min(autoOpsLength, str.length - i); len > 0; len -= 1) {
                    var word = str.slice(i, i + len);
                    var last = undefined; // TODO - TS complaining that we use last before assigning to it
                    if (autoOps.hasOwnProperty(word)) {
                        for (var j = 0, letter = first; j < len; j += 1, letter = letter[R]) {
                            if (letter instanceof Letter) {
                                letter.italicize(false);
                                last = letter;
                            }
                        }
                        var isBuiltIn = BuiltInOpNames.hasOwnProperty(word);
                        first.ctrlSeq =
                            (isBuiltIn ? '\\' : '\\operatorname{') + first.ctrlSeq;
                        last.ctrlSeq += isBuiltIn ? ' ' : '}';
                        if (TwoWordOpNames.hasOwnProperty(word)) {
                            var lastL = last[L];
                            var lastLL = lastL && lastL[L];
                            var lastLLL = (lastLL && lastLL[L]);
                            lastLLL.jQ.addClass('mq-last');
                        }
                        if (!this.shouldOmitPadding(first[L]))
                            first.jQ.addClass('mq-first');
                        if (!this.shouldOmitPadding(last[R])) {
                            if (last[R] instanceof SupSub) {
                                var supsub = last[R]; // XXX monkey-patching, but what's the right thing here?
                                // Have operatorname-specific code in SupSub? A CSS-like language to style the
                                // math tree, but which ignores cursor and selection (which CSS can't)?
                                var respace = (supsub.siblingCreated =
                                    supsub.siblingDeleted =
                                        function () {
                                            supsub.jQ.toggleClass('mq-after-operator-name', !(supsub[R] instanceof Bracket));
                                        });
                                respace();
                            }
                            else {
                                last.jQ.toggleClass('mq-last', !(last[R] instanceof Bracket));
                            }
                        }
                        i += len - 1;
                        first = last;
                        continue outer;
                    }
                }
            }
        };
        Letter.prototype.shouldOmitPadding = function (node) {
            // omit padding if no node
            if (!node)
                return true;
            // do not add padding between letter and '.'
            if (node.ctrlSeq === '.')
                return true;
            // do not add padding between letter and binary operator. The
            // binary operator already has padding
            if (node instanceof BinaryOperator)
                return true;
            if (node instanceof SummationNotation)
                return true;
            return false;
        };
        return Letter;
    }(Variable));
    var BuiltInOpNames = {}; // the set of operator names like \sin, \cos, etc that
    // are built-into LaTeX, see Section 3.17 of the Short Math Guide: http://tinyurl.com/jm9okjc
    // MathQuill auto-unitalicizes some operator names not in that set, like 'hcf'
    // and 'arsinh', which must be exported as \operatorname{hcf} and
    // \operatorname{arsinh}. Note: over/under line/arrow \lim variants like
    // \varlimsup are not supported
    var AutoOpNames = (Options.prototype.autoOperatorNames = {
        _maxLength: 9,
    }); // the set
    // of operator names that MathQuill auto-unitalicizes by default; overridable
    var TwoWordOpNames = { limsup: 1, liminf: 1, projlim: 1, injlim: 1 };
    (function () {
        var mostOps = ('arg deg det dim exp gcd hom inf ker lg lim ln log max min sup' +
            ' limsup liminf injlim projlim Pr').split(' ');
        for (var i = 0; i < mostOps.length; i += 1) {
            BuiltInOpNames[mostOps[i]] = AutoOpNames[mostOps[i]] = 1;
        }
        var builtInTrigs = 'sin cos tan arcsin arccos arctan sinh cosh tanh sec csc cot coth'.split(
        // why coth but not sech and csch, LaTeX?
        ' ');
        for (var i = 0; i < builtInTrigs.length; i += 1) {
            BuiltInOpNames[builtInTrigs[i]] = 1;
        }
        var autoTrigs = 'sin cos tan sec cosec csc cotan cot ctg'.split(' ');
        for (var i = 0; i < autoTrigs.length; i += 1) {
            AutoOpNames[autoTrigs[i]] =
                AutoOpNames['arc' + autoTrigs[i]] =
                    AutoOpNames[autoTrigs[i] + 'h'] =
                        AutoOpNames['ar' + autoTrigs[i] + 'h'] =
                            AutoOpNames['arc' + autoTrigs[i] + 'h'] =
                                1;
        }
        // compat with some of the nonstandard LaTeX exported by MathQuill
        // before #247. None of these are real LaTeX commands so, seems safe
        var moreNonstandardOps = 'gcf hcf lcm proj span'.split(' ');
        for (var i = 0; i < moreNonstandardOps.length; i += 1) {
            AutoOpNames[moreNonstandardOps[i]] = 1;
        }
    })();
    optionProcessors.autoOperatorNames = function (cmds) {
        if (typeof cmds !== 'string') {
            throw '"' + cmds + '" not a space-delimited list';
        }
        if (!/^[a-z\|\-]+(?: [a-z\|\-]+)*$/i.test(cmds)) {
            throw '"' + cmds + '" not a space-delimited list of letters or "|"';
        }
        var list = cmds.split(' ');
        var dict = {};
        var maxLength = 0;
        for (var i = 0; i < list.length; i += 1) {
            var cmd = list[i];
            if (cmd.length < 2) {
                throw '"' + cmd + '" not minimum length of 2';
            }
            if (cmd.indexOf('|') < 0) {
                // normal auto operator
                dict[cmd] = cmd;
                maxLength = max(maxLength, cmd.length);
            }
            else {
                // this item has a speech-friendly alternative
                var cmdArray = cmd.split('|');
                if (cmdArray.length > 2) {
                    throw '"' + cmd + '" has more than 1 mathspeak delimiter';
                }
                if (cmdArray[0].length < 2) {
                    throw '"' + cmd[0] + '" not minimum length of 2';
                }
                dict[cmdArray[0]] = cmdArray[1].replace(/-/g, ' '); // convert dashes to spaces for the sake of speech
                maxLength = max(maxLength, cmdArray[0].length);
            }
        }
        dict._maxLength = maxLength;
        return dict;
    };
    var OperatorName = /** @class */ (function (_super) {
        __extends(OperatorName, _super);
        function OperatorName(fn) {
            return _super.call(this, fn || '') || this;
        }
        OperatorName.prototype.createLeftOf = function (cursor) {
            var fn = this.ctrlSeq;
            for (var i = 0; i < fn.length; i += 1) {
                new Letter(fn.charAt(i)).createLeftOf(cursor);
            }
        };
        OperatorName.prototype.parser = function () {
            var fn = this.ctrlSeq;
            var block = new MathBlock();
            for (var i = 0; i < fn.length; i += 1) {
                new Letter(fn.charAt(i)).adopt(block, block.ends[R], 0);
            }
            return Parser.succeed(block.children());
        };
        return OperatorName;
    }(MQSymbol));
    for (var fn in AutoOpNames)
        if (AutoOpNames.hasOwnProperty(fn)) {
            LatexCmds[fn] = OperatorName;
        }
    LatexCmds.operatorname = /** @class */ (function (_super) {
        __extends(class_5, _super);
        function class_5() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        class_5.prototype.createLeftOf = function () { };
        class_5.prototype.numBlocks = function () {
            return 1;
        };
        class_5.prototype.parser = function () {
            return latexMathParser.block.map(function (b) {
                // Check for the special case of \operatorname{ans}, which has
                // a special html representation
                var isAllLetters = true;
                var str = '';
                var children = b.children();
                children.each(function (child) {
                    if (child instanceof Letter) {
                        str += child.letter;
                    }
                    else {
                        isAllLetters = false;
                    }
                    return undefined;
                });
                if (isAllLetters && str === 'ans') {
                    return AnsBuilder();
                }
                // In cases other than `ans`, just return the children directly
                return children;
            });
        };
        return class_5;
    }(MathCommand));
    LatexCmds.f = /** @class */ (function (_super) {
        __extends(class_6, _super);
        function class_6() {
            var _this = this;
            var letter = 'f';
            _this = _super.call(this, letter) || this;
            _this.letter = letter;
            _this.htmlTemplate = '<var class="mq-f">f</var>';
            return _this;
        }
        class_6.prototype.italicize = function (bool) {
            this.jQ.html('f').toggleClass('mq-f', bool);
            return _super.prototype.italicize.call(this, bool);
        };
        return class_6;
    }(Letter));
    // VanillaSymbol's
    LatexCmds[' '] = LatexCmds.space = function () {
        return new DigitGroupingChar('\\ ', '<span>&nbsp;</span>', ' ');
    };
    LatexCmds['.'] = function () {
        return new DigitGroupingChar('.', '<span class="mq-digit">.</span>', '.');
    };
    LatexCmds["'"] = LatexCmds.prime = bindVanillaSymbol("'", '&prime;', 'prime');
    LatexCmds['″'] = LatexCmds.dprime = bindVanillaSymbol('″', '&Prime;', 'double prime');
    LatexCmds.backslash = bindVanillaSymbol('\\backslash ', '\\', 'backslash');
    if (!CharCmds['\\'])
        CharCmds['\\'] = LatexCmds.backslash;
    LatexCmds.$ = bindVanillaSymbol('\\$', '$', 'dollar');
    LatexCmds.square = bindVanillaSymbol('\\square ', '\u25A1', 'square');
    LatexCmds.mid = bindVanillaSymbol('\\mid ', '\u2223', 'mid');
    // does not use Symbola font
    var NonSymbolaSymbol = /** @class */ (function (_super) {
        __extends(NonSymbolaSymbol, _super);
        function NonSymbolaSymbol(ch, html, _unusedMathspeak) {
            return _super.call(this, ch, '<span class="mq-nonSymbola">' + (html || ch) + '</span>') || this;
        }
        return NonSymbolaSymbol;
    }(MQSymbol));
    LatexCmds['@'] = function () { return new NonSymbolaSymbol('@'); };
    LatexCmds['&'] = function () { return new NonSymbolaSymbol('\\&', '&amp;', 'and'); };
    LatexCmds['%'] = /** @class */ (function (_super) {
        __extends(class_7, _super);
        function class_7() {
            return _super.call(this, '\\%', '%', 'percent') || this;
        }
        class_7.prototype.parser = function () {
            var optWhitespace = Parser.optWhitespace;
            var string = Parser.string;
            // Parse `\%\operatorname{of}` as special `percentof` node so that
            // it will be serialized properly and deleted as a unit.
            return optWhitespace
                .then(string('\\operatorname{of}').map(function () {
                return PercentOfBuilder();
            }))
                .or(_super.prototype.parser.call(this));
        };
        return class_7;
    }(NonSymbolaSymbol));
    LatexCmds['∥'] = LatexCmds.parallel = bindVanillaSymbol('\\parallel ', '&#x2225;', 'parallel');
    LatexCmds['∦'] = LatexCmds.nparallel = bindVanillaSymbol('\\nparallel ', '&#x2226;', 'not parallel');
    LatexCmds['⟂'] = LatexCmds.perp = bindVanillaSymbol('\\perp ', '&#x27C2;', 'perpendicular');
    //the following are all Greek to me, but this helped a lot: http://www.ams.org/STIX/ion/stixsig03.html
    //lowercase Greek letter variables
    LatexCmds.alpha =
        LatexCmds.beta =
            LatexCmds.gamma =
                LatexCmds.delta =
                    LatexCmds.zeta =
                        LatexCmds.eta =
                            LatexCmds.theta =
                                LatexCmds.iota =
                                    LatexCmds.kappa =
                                        LatexCmds.mu =
                                            LatexCmds.nu =
                                                LatexCmds.xi =
                                                    LatexCmds.rho =
                                                        LatexCmds.sigma =
                                                            LatexCmds.tau =
                                                                LatexCmds.chi =
                                                                    LatexCmds.psi =
                                                                        LatexCmds.omega =
                                                                            function (latex) { return new Variable('\\' + latex + ' ', '&' + latex + ';'); };
    //why can't anybody FUCKING agree on these
    LatexCmds.phi = bindVariable('\\phi ', '&#981;', 'phi'); //W3C or Unicode?
    LatexCmds.phiv = LatexCmds.varphi = bindVariable('\\varphi ', '&phi;', 'phi'); //Elsevier and 9573-13 //AMS and LaTeX
    LatexCmds.epsilon = bindVariable('\\epsilon ', '&#1013;', 'epsilon'); //W3C or Unicode?
    LatexCmds.epsiv = LatexCmds.varepsilon = bindVariable(
    //Elsevier and 9573-13 //AMS and LaTeX
    '\\varepsilon ', '&epsilon;', 'epsilon');
    LatexCmds.piv = LatexCmds.varpi = bindVariable('\\varpi ', '&piv;', 'piv'); //W3C/Unicode and Elsevier and 9573-13 //AMS and LaTeX
    LatexCmds.sigmaf = //W3C/Unicode
        LatexCmds.sigmav = //Elsevier
            LatexCmds.varsigma = //LaTeX
                bindVariable('\\varsigma ', '&sigmaf;', 'sigma');
    LatexCmds.thetav = //Elsevier and 9573-13
        LatexCmds.vartheta = //AMS and LaTeX
            LatexCmds.thetasym = //W3C/Unicode
                bindVariable('\\vartheta ', '&thetasym;', 'theta');
    LatexCmds.upsilon = LatexCmds.upsi = bindVariable(
    //AMS and LaTeX and W3C/Unicode //Elsevier and 9573-13
    '\\upsilon ', '&upsilon;', 'upsilon');
    //these aren't even mentioned in the HTML character entity references
    LatexCmds.gammad = //Elsevier
        LatexCmds.Gammad = //9573-13 -- WTF, right? I dunno if this was a typo in the reference (see above)
            LatexCmds.digamma = //LaTeX
                bindVariable('\\digamma ', '&#989;', 'gamma');
    LatexCmds.kappav = LatexCmds.varkappa = bindVariable(
    //Elsevier //AMS and LaTeX
    '\\varkappa ', '&#1008;', 'kappa');
    LatexCmds.rhov = LatexCmds.varrho = bindVariable('\\varrho ', '&#1009;', 'rho'); //Elsevier and 9573-13 //AMS and LaTeX
    //Greek constants, look best in non-italicized Times New Roman
    LatexCmds.pi = LatexCmds['π'] = function () {
        return new NonSymbolaSymbol('\\pi ', '&pi;', 'pi');
    };
    LatexCmds.lambda = function () {
        return new NonSymbolaSymbol('\\lambda ', '&lambda;', 'lambda');
    };
    //uppercase greek letters
    LatexCmds.Upsilon = //LaTeX
        LatexCmds.Upsi = //Elsevier and 9573-13
            LatexCmds.upsih = //W3C/Unicode "upsilon with hook"
                LatexCmds.Upsih = //'cos it makes sense to me
                    function () {
                        return new MQSymbol('\\Upsilon ', '<var style="font-family: serif">&upsih;</var>', 'capital upsilon');
                    }; //Symbola's 'upsilon with a hook' is a capital Y without hooks :(
    //other symbols with the same LaTeX command and HTML character entity reference
    LatexCmds.Gamma =
        LatexCmds.Delta =
            LatexCmds.Theta =
                LatexCmds.Lambda =
                    LatexCmds.Xi =
                        LatexCmds.Pi =
                            LatexCmds.Sigma =
                                LatexCmds.Phi =
                                    LatexCmds.Psi =
                                        LatexCmds.Omega =
                                            LatexCmds.forall =
                                                function (latex) { return new VanillaSymbol('\\' + latex + ' ', '&' + latex + ';'); };
    // symbols that aren't a single MathCommand, but are instead a whole
    // Fragment. Creates the Fragment from a LaTeX string
    var LatexFragment = /** @class */ (function (_super) {
        __extends(LatexFragment, _super);
        function LatexFragment(latex) {
            var _this = _super.call(this) || this;
            _this.latexStr = latex;
            return _this;
        }
        LatexFragment.prototype.createLeftOf = function (cursor) {
            var block = latexMathParser.parse(this.latexStr);
            block
                .children()
                .adopt(cursor.parent, cursor[L], cursor[R]);
            cursor[L] = block.ends[R];
            block.jQize().insertBefore(cursor.jQ);
            block.finalizeInsert(cursor.options, cursor);
            var blockEndsR = block.ends[R];
            var blockEndsRR = blockEndsR && blockEndsR[R];
            if (blockEndsRR)
                blockEndsRR.siblingCreated(cursor.options, L);
            var blockEndsL = block.ends[L];
            var blockEndsLL = blockEndsL && blockEndsL[L];
            if (blockEndsLL)
                blockEndsLL.siblingCreated(cursor.options, R);
            cursor.parent.bubble(function (node) {
                node.reflow();
                return undefined;
            });
        };
        LatexFragment.prototype.mathspeak = function () {
            return latexMathParser.parse(this.latexStr).mathspeak();
        };
        LatexFragment.prototype.parser = function () {
            var frag = latexMathParser.parse(this.latexStr).children();
            return Parser.succeed(frag);
        };
        return LatexFragment;
    }(MathCommand));
    // for what seems to me like [stupid reasons][1], Unicode provides
    // subscripted and superscripted versions of all ten Arabic numerals,
    // as well as [so-called "vulgar fractions"][2].
    // Nobody really cares about most of them, but some of them actually
    // predate Unicode, dating back to [ISO-8859-1][3], apparently also
    // known as "Latin-1", which among other things [Windows-1252][4]
    // largely coincides with, so Microsoft Word sometimes inserts them
    // and they get copy-pasted into MathQuill.
    //
    // (Irrelevant but funny story: though not a superset of Latin-1 aka
    // ISO-8859-1, Windows-1252 **is** a strict superset of the "closely
    // related but distinct"[3] "ISO 8859-1" -- see the lack of a dash
    // after "ISO"? Completely different character set, like elephants vs
    // elephant seals, or "Zombies" vs "Zombie Redneck Torture Family".
    // What kind of idiot would get them confused.
    // People in fact got them confused so much, it was so common to
    // mislabel Windows-1252 text as ISO-8859-1, that most modern web
    // browsers and email clients treat the MIME charset of ISO-8859-1
    // as actually Windows-1252, behavior now standard in the HTML5 spec.)
    //
    // [1]: http://en.wikipedia.org/wiki/Unicode_subscripts_andsuper_scripts
    // [2]: http://en.wikipedia.org/wiki/Number_Forms
    // [3]: http://en.wikipedia.org/wiki/ISO/IEC_8859-1
    // [4]: http://en.wikipedia.org/wiki/Windows-1252
    LatexCmds['⁰'] = function () { return new LatexFragment('^0'); };
    LatexCmds['¹'] = function () { return new LatexFragment('^1'); };
    LatexCmds['²'] = function () { return new LatexFragment('^2'); };
    LatexCmds['³'] = function () { return new LatexFragment('^3'); };
    LatexCmds['⁴'] = function () { return new LatexFragment('^4'); };
    LatexCmds['⁵'] = function () { return new LatexFragment('^5'); };
    LatexCmds['⁶'] = function () { return new LatexFragment('^6'); };
    LatexCmds['⁷'] = function () { return new LatexFragment('^7'); };
    LatexCmds['⁸'] = function () { return new LatexFragment('^8'); };
    LatexCmds['⁹'] = function () { return new LatexFragment('^9'); };
    LatexCmds['¼'] = function () { return new LatexFragment('\\frac14'); };
    LatexCmds['½'] = function () { return new LatexFragment('\\frac12'); };
    LatexCmds['¾'] = function () { return new LatexFragment('\\frac34'); };
    // this is a hack to make pasting the √ symbol
    // actually insert a sqrt command. This isn't ideal,
    // but it's way better than what we have now. I think
    // before we invest any more time into this single character
    // we should consider how to make the pipe (|) automatically
    // insert absolute value. We also will want the percent (%)
    // to expand to '% of'. I've always just thought mathquill's
    // ability to handle pasted latex magical until I started actually
    // testing it. It's a lot more buggy that I previously thought.
    //
    // KNOWN ISSUES:
    // 1) pasting √ does not put focus in side the sqrt symbol
    // 2) pasting √2 puts the 2 outside of the sqrt symbol.
    //
    // The first issue seems like we could invest more time into this to
    // fix it, but doesn't feel worth special casing. I think we'd want
    // to address it by addressing ALL pasting issues.
    //
    // The second issue seems like it might go away too if you fix paste to
    // act more like simply typing the characters out. I'd be scared to try
    // to make that change because I'm fairly confident I'd break something
    // around handling valid latex as latex rather than treating it as keystrokes.
    LatexCmds['√'] = function () { return new LatexFragment('\\sqrt{}'); };
    // Binary operator determination is used in several contexts for PlusMinus nodes and their descendants.
    // For instance, we set the item's class name based on this factor, and also assign different mathspeak values (plus vs positive, negative vs minus).
    function isBinaryOperator(node) {
        if (!node)
            return false;
        var nodeL = node[L];
        if (nodeL) {
            // If the left sibling is a binary operator or a separator (comma, semicolon, colon, space)
            // or an open bracket (open parenthesis, open square bracket)
            // consider the operator to be unary
            if (nodeL instanceof BinaryOperator ||
                /^(\\ )|[,;:\(\[]$/.test(nodeL.ctrlSeq)) {
                return false;
            }
        }
        else if (node.parent &&
            node.parent.parent &&
            node.parent.parent.isStyleBlock()) {
            //if we are in a style block at the leftmost edge, determine unary/binary based on
            //the style block
            //this allows style blocks to be transparent for unary/binary purposes
            return isBinaryOperator(node.parent.parent);
        }
        else {
            return false;
        }
        return true;
    }
    var PlusMinus = /** @class */ (function (_super) {
        __extends(class_8, _super);
        function class_8(ch, html, mathspeak) {
            return _super.call(this, ch, html, undefined, mathspeak, true) || this;
        }
        class_8.prototype.contactWeld = function (cursor, dir) {
            this.sharedSiblingMethod(cursor.options, dir);
        };
        class_8.prototype.siblingCreated = function (opts, dir) {
            this.sharedSiblingMethod(opts, dir);
        };
        class_8.prototype.siblingDeleted = function (opts, dir) {
            this.sharedSiblingMethod(opts, dir);
        };
        class_8.prototype.sharedSiblingMethod = function (_opts, dir) {
            if (dir === R)
                return; // ignore if sibling only changed on the right
            this.jQ[0].className = isBinaryOperator(this) ? 'mq-binary-operator' : '';
            return this;
        };
        return class_8;
    }(BinaryOperator));
    LatexCmds['+'] = /** @class */ (function (_super) {
        __extends(class_9, _super);
        function class_9() {
            return _super.call(this, '+', '+') || this;
        }
        class_9.prototype.mathspeak = function () {
            return isBinaryOperator(this) ? 'plus' : 'positive';
        };
        return class_9;
    }(PlusMinus));
    //yes, these are different dashes, en-dash, em-dash, unicode minus, actual dash
    var MinusNode = /** @class */ (function (_super) {
        __extends(MinusNode, _super);
        function MinusNode() {
            return _super.call(this, '-', '&minus;') || this;
        }
        MinusNode.prototype.mathspeak = function () {
            return isBinaryOperator(this) ? 'minus' : 'negative';
        };
        return MinusNode;
    }(PlusMinus));
    LatexCmds['−'] = LatexCmds['—'] = LatexCmds['–'] = LatexCmds['-'] = MinusNode;
    LatexCmds['±'] =
        LatexCmds.pm =
            LatexCmds.plusmn =
                LatexCmds.plusminus =
                    function () { return new PlusMinus('\\pm ', '&plusmn;', 'plus-or-minus'); };
    LatexCmds.mp =
        LatexCmds.mnplus =
            LatexCmds.minusplus =
                function () { return new PlusMinus('\\mp ', '&#8723;', 'minus-or-plus'); };
    CharCmds['*'] =
        LatexCmds.sdot =
            LatexCmds.cdot =
                bindBinaryOperator('\\cdot ', '&middot;', '*', 'times'); //semantically should be &sdot;, but &middot; looks better
    var To = /** @class */ (function (_super) {
        __extends(To, _super);
        function To() {
            return _super.call(this, '\\to ', '&rarr;', 'to') || this;
        }
        To.prototype.deleteTowards = function (dir, cursor) {
            if (dir === L) {
                var l = cursor[L];
                new Fragment(l, this).remove();
                cursor[L] = l[L];
                new MinusNode().createLeftOf(cursor);
                cursor[L].bubble(function (node) {
                    node.reflow();
                    return undefined;
                });
                return;
            }
            _super.prototype.deleteTowards.call(this, dir, cursor);
        };
        return To;
    }(BinaryOperator));
    LatexCmds['→'] = LatexCmds.to = To;
    var Inequality = /** @class */ (function (_super) {
        __extends(Inequality, _super);
        function Inequality(data, strict) {
            var _this = this;
            var strictness = strict ? 'Strict' : '';
            _this = _super.call(this, data["ctrlSeq".concat(strictness)], data["html".concat(strictness)], data["text".concat(strictness)], data["mathspeak".concat(strictness)]) || this;
            _this.data = data;
            _this.strict = strict;
            return _this;
        }
        Inequality.prototype.swap = function (strict) {
            this.strict = strict;
            var strictness = strict ? 'Strict' : '';
            this.ctrlSeq = this.data["ctrlSeq".concat(strictness)];
            this.jQ.html(this.data["html".concat(strictness)]);
            this.textTemplate = [this.data["text".concat(strictness)]];
            this.mathspeakName = this.data["mathspeak".concat(strictness)];
        };
        Inequality.prototype.deleteTowards = function (dir, cursor) {
            if (dir === L && !this.strict) {
                this.swap(true);
                this.bubble(function (node) {
                    node.reflow();
                    return undefined;
                });
                return;
            }
            _super.prototype.deleteTowards.call(this, dir, cursor);
        };
        return Inequality;
    }(BinaryOperator));
    var less = {
        ctrlSeq: '\\le ',
        html: '&le;',
        text: '≤',
        mathspeak: 'less than or equal to',
        ctrlSeqStrict: '<',
        htmlStrict: '&lt;',
        textStrict: '<',
        mathspeakStrict: 'less than',
    };
    var greater = {
        ctrlSeq: '\\ge ',
        html: '&ge;',
        text: '≥',
        mathspeak: 'greater than or equal to',
        ctrlSeqStrict: '>',
        htmlStrict: '&gt;',
        textStrict: '>',
        mathspeakStrict: 'greater than',
    };
    var Greater = /** @class */ (function (_super) {
        __extends(Greater, _super);
        function Greater() {
            return _super.call(this, greater, true) || this;
        }
        Greater.prototype.createLeftOf = function (cursor) {
            var cursorL = cursor[L];
            if (cursorL instanceof BinaryOperator && cursorL.ctrlSeq === '-') {
                var l = cursorL;
                cursor[L] = l[L];
                l.remove();
                new To().createLeftOf(cursor);
                cursor[L].bubble(function (node) {
                    node.reflow();
                    return undefined;
                });
                return;
            }
            _super.prototype.createLeftOf.call(this, cursor);
        };
        return Greater;
    }(Inequality));
    LatexCmds['<'] = LatexCmds.lt = function () { return new Inequality(less, true); };
    LatexCmds['>'] = LatexCmds.gt = Greater;
    LatexCmds['≤'] =
        LatexCmds.le =
            LatexCmds.leq =
                function () { return new Inequality(less, false); };
    LatexCmds['≥'] =
        LatexCmds.ge =
            LatexCmds.geq =
                function () { return new Inequality(greater, false); };
    LatexCmds.infty =
        LatexCmds.infin =
            LatexCmds.infinity =
                bindVanillaSymbol('\\infty ', '&infin;', 'infinity');
    LatexCmds['≠'] =
        LatexCmds.ne =
            LatexCmds.neq =
                bindBinaryOperator('\\ne ', '&ne;', 'not equal');
    var Equality = /** @class */ (function (_super) {
        __extends(Equality, _super);
        function Equality() {
            return _super.call(this, '=', '=', '=', 'equals') || this;
        }
        Equality.prototype.createLeftOf = function (cursor) {
            var cursorL = cursor[L];
            if (cursorL instanceof Inequality && cursorL.strict) {
                cursorL.swap(false);
                cursorL.bubble(function (node) {
                    node.reflow();
                    return undefined;
                });
                return;
            }
            _super.prototype.createLeftOf.call(this, cursor);
        };
        return Equality;
    }(BinaryOperator));
    LatexCmds['='] = Equality;
    LatexCmds['×'] = LatexCmds.times = bindBinaryOperator('\\times ', '&times;', '[x]', 'times');
    LatexCmds['÷'] =
        LatexCmds.div =
            LatexCmds.divide =
                LatexCmds.divides =
                    bindBinaryOperator('\\div ', '&divide;', '[/]', 'over');
    var Sim = /** @class */ (function (_super) {
        __extends(Sim, _super);
        function Sim() {
            return _super.call(this, '\\sim ', '~', '~', 'tilde') || this;
        }
        Sim.prototype.createLeftOf = function (cursor) {
            if (cursor[L] instanceof Sim) {
                var l = cursor[L];
                cursor[L] = l[L];
                l.remove();
                new Approx().createLeftOf(cursor);
                cursor[L].bubble(function (node) {
                    node.reflow();
                    return undefined;
                });
                return;
            }
            _super.prototype.createLeftOf.call(this, cursor);
        };
        return Sim;
    }(BinaryOperator));
    var Approx = /** @class */ (function (_super) {
        __extends(Approx, _super);
        function Approx() {
            return _super.call(this, '\\approx ', '&approx;', '≈', 'approximately equal') || this;
        }
        Approx.prototype.deleteTowards = function (dir, cursor) {
            if (dir === L) {
                var l = cursor[L];
                new Fragment(l, this).remove();
                cursor[L] = l[L];
                new Sim().createLeftOf(cursor);
                cursor[L].bubble(function (node) {
                    node.reflow();
                    return undefined;
                });
                return;
            }
            _super.prototype.deleteTowards.call(this, dir, cursor);
        };
        return Approx;
    }(BinaryOperator));
    CharCmds['~'] = LatexCmds.sim = Sim;
    LatexCmds['≈'] = LatexCmds.approx = Approx;
    /***************************
     * Commands and Operators.
     **************************/
    var SVG_SYMBOLS = {
        sqrt: {
            width: '',
            html: '<svg preserveAspectRatio="none" viewBox="0 0 32 54">' +
                '<path d="M0 33 L7 27 L12.5 47 L13 47 L30 0 L32 0 L13 54 L11 54 L4.5 31 L0 33" />' +
                '</svg>',
        },
        '|': {
            width: '.4em',
            html: '<svg preserveAspectRatio="none" viewBox="0 0 10 54">' +
                '<path d="M4.4 0 L4.4 54 L5.6 54 L5.6 0" />' +
                '</svg>',
        },
        '[': {
            width: '.55em',
            html: '<svg preserveAspectRatio="none" viewBox="0 0 11 24">' +
                '<path d="M8 0 L3 0 L3 24 L8 24 L8 23 L4 23 L4 1 L8 1" />' +
                '</svg>',
        },
        ']': {
            width: '.55em',
            html: '<svg preserveAspectRatio="none" viewBox="0 0 11 24">' +
                '<path d="M3 0 L8 0 L8 24 L3 24 L3 23 L7 23 L7 1 L3 1" />' +
                '</svg>',
        },
        '(': {
            width: '.55em',
            html: '<svg preserveAspectRatio="none" viewBox="3 0 106 186">' +
                '<path d="M85 0 A61 101 0 0 0 85 186 L75 186 A75 101 0 0 1 75 0" />' +
                '</svg>',
        },
        ')': {
            width: '.55em',
            html: '<svg preserveAspectRatio="none" viewBox="3 0 106 186">' +
                '<path d="M24 0 A61 101 0 0 1 24 186 L34 186 A75 101 0 0 0 34 0" />' +
                '</svg>',
        },
        '{': {
            width: '.7em',
            html: '<svg preserveAspectRatio="none" viewBox="10 0 210 350">' +
                '<path d="M170 0 L170 6 A47 52 0 0 0 123 60 L123 127 A35 48 0 0 1 88 175 A35 48 0 0 1 123 223 L123 290 A47 52 0 0 0 170 344 L170 350 L160 350 A58 49 0 0 1 102 301 L103 220 A45 40 0 0 0 58 180 L58 170 A45 40 0 0 0 103 130 L103 49 A58 49 0 0 1 161 0" />' +
                '</svg>',
        },
        '}': {
            width: '.7em',
            html: '<svg preserveAspectRatio="none" viewBox="10 0 210 350">' +
                '<path d="M60 0 L60 6 A47 52 0 0 1 107 60 L107 127 A35 48 0 0 0 142 175 A35 48 0 0 0 107 223 L107 290 A47 52 0 0 1 60 344 L60 350 L70 350 A58 49 0 0 0 128 301 L127 220 A45 40 0 0 1 172 180 L172 170 A45 40 0 0 1 127 130 L127 49 A58 49 0 0 0 70 0" />' +
                '</svg>',
        },
        '&#8741;': {
            width: '.7em',
            html: '<svg preserveAspectRatio="none" viewBox="0 0 10 54">' +
                '<path d="M3.2 0 L3.2 54 L4 54 L4 0 M6.8 0 L6.8 54 L6 54 L6 0" />' +
                '</svg>',
        },
        '&lang;': {
            width: '.55em',
            html: '<svg preserveAspectRatio="none" viewBox="0 0 10 54">' +
                '<path d="M6.8 0 L3.2 27 L6.8 54 L7.8 54 L4.2 27 L7.8 0" />' +
                '</svg>',
        },
        '&rang;': {
            width: '.55em',
            html: '<svg preserveAspectRatio="none" viewBox="0 0 10 54">' +
                '<path d="M3.2 0 L6.8 27 L3.2 54 L2.2 54 L5.8 27 L2.2 0" />' +
                '</svg>',
        },
    };
    var Style = /** @class */ (function (_super) {
        __extends(Style, _super);
        function Style(ctrlSeq, tagName, attrs, ariaLabel, opts) {
            var _this = _super.call(this, ctrlSeq, '<' + tagName + ' ' + attrs + '>&0</' + tagName + '>') || this;
            _this.ariaLabel = ariaLabel || ctrlSeq.replace(/^\\/, '');
            _this.mathspeakTemplate = [
                'Start' + _this.ariaLabel + ',',
                'End' + _this.ariaLabel,
            ];
            // In most cases, mathspeak should announce the start and end of style blocks.
            // There is one exception currently (mathrm).
            _this.shouldNotSpeakDelimiters = opts && opts.shouldNotSpeakDelimiters;
            return _this;
        }
        Style.prototype.mathspeak = function (opts) {
            if (!this.shouldNotSpeakDelimiters || (opts && opts.ignoreShorthand)) {
                return _super.prototype.mathspeak.call(this);
            }
            return this.foldChildren('', function (speech, block) {
                return speech + ' ' + block.mathspeak(opts);
            }).trim();
        };
        return Style;
    }(MathCommand));
    //fonts
    LatexCmds.mathrm = /** @class */ (function (_super) {
        __extends(mathrm, _super);
        function mathrm() {
            return _super.call(this, '\\mathrm', 'span', 'class="mq-roman mq-font"', 'Roman Font', {
                shouldNotSpeakDelimiters: true,
            }) || this;
        }
        mathrm.prototype.isTextBlock = function () {
            return true;
        };
        return mathrm;
    }(Style));
    LatexCmds.mathit = function () {
        return new Style('\\mathit', 'i', 'class="mq-font"', 'Italic Font');
    };
    LatexCmds.mathbf = function () {
        return new Style('\\mathbf', 'b', 'class="mq-font"', 'Bold Font');
    };
    LatexCmds.mathsf = function () {
        return new Style('\\mathsf', 'span', 'class="mq-sans-serif mq-font"', 'Serif Font');
    };
    LatexCmds.mathtt = function () {
        return new Style('\\mathtt', 'span', 'class="mq-monospace mq-font"', 'Math Text');
    };
    //text-decoration
    LatexCmds.underline = function () {
        return new Style('\\underline', 'span', 'class="mq-non-leaf mq-underline"', 'Underline');
    };
    LatexCmds.overline = LatexCmds.bar = function () {
        return new Style('\\overline', 'span', 'class="mq-non-leaf mq-overline"', 'Overline');
    };
    LatexCmds.overrightarrow = function () {
        return new Style('\\overrightarrow', 'span', 'class="mq-non-leaf mq-overarrow mq-arrow-right"', 'Over Right Arrow');
    };
    LatexCmds.overleftarrow = function () {
        return new Style('\\overleftarrow', 'span', 'class="mq-non-leaf mq-overarrow mq-arrow-left"', 'Over Left Arrow');
    };
    LatexCmds.overleftrightarrow = function () {
        return new Style('\\overleftrightarrow ', 'span', 'class="mq-non-leaf mq-overarrow mq-arrow-leftright"', 'Over Left and Right Arrow');
    };
    LatexCmds.overarc = function () {
        return new Style('\\overarc', 'span', 'class="mq-non-leaf mq-overarc"', 'Over Arc');
    };
    LatexCmds.dot = function () {
        return new MathCommand('\\dot', '<span class="mq-non-leaf"><span class="mq-dot-recurring-inner">' +
            '<span class="mq-dot-recurring">&#x2d9;</span>' +
            '<span class="mq-empty-box">&0</span>' +
            '</span></span>');
    };
    // `\textcolor{color}{math}` will apply a color to the given math content, where
    // `color` is any valid CSS Color Value (see [SitePoint docs][] (recommended),
    // [Mozilla docs][], or [W3C spec][]).
    //
    // [SitePoint docs]: http://reference.sitepoint.com/css/colorvalues
    // [Mozilla docs]: https://developer.mozilla.org/en-US/docs/CSS/color_value#Values
    // [W3C spec]: http://dev.w3.org/csswg/css3-color/#colorunits
    LatexCmds.textcolor = /** @class */ (function (_super) {
        __extends(class_10, _super);
        function class_10() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        class_10.prototype.setColor = function (color) {
            this.color = color;
            this.htmlTemplate =
                '<span class="mq-textcolor" style="color:' + color + '">&0</span>';
            this.ariaLabel = color.replace(/^\\/, '');
            this.mathspeakTemplate = [
                'Start ' + this.ariaLabel + ',',
                'End ' + this.ariaLabel,
            ];
        };
        class_10.prototype.latex = function () {
            var blocks0 = this.blocks[0];
            return '\\textcolor{' + this.color + '}{' + blocks0.latex() + '}';
        };
        class_10.prototype.parser = function () {
            var _this = this;
            var optWhitespace = Parser.optWhitespace;
            var string = Parser.string;
            var regex = Parser.regex;
            return optWhitespace
                .then(string('{'))
                .then(regex(/^[#\w\s.,()%-]*/))
                .skip(string('}'))
                .then(function (color) {
                _this.setColor(color);
                return _super.prototype.parser.call(_this);
            });
        };
        class_10.prototype.isStyleBlock = function () {
            return true;
        };
        return class_10;
    }(MathCommand));
    // Very similar to the \textcolor command, but will add the given CSS class.
    // Usage: \class{classname}{math}
    // Note regex that whitelists valid CSS classname characters:
    // https://github.com/mathquill/mathquill/pull/191#discussion_r4327442
    var Class = (LatexCmds['class'] = /** @class */ (function (_super) {
        __extends(class_11, _super);
        function class_11() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        class_11.prototype.parser = function () {
            var _this = this;
            var string = Parser.string, regex = Parser.regex;
            return Parser.optWhitespace
                .then(string('{'))
                .then(regex(/^[-\w\s\\\xA0-\xFF]*/))
                .skip(string('}'))
                .then(function (cls) {
                _this.cls = cls || '';
                _this.htmlTemplate = '<span class="mq-class ' + cls + '">&0</span>';
                _this.ariaLabel = cls + ' class';
                _this.mathspeakTemplate = [
                    'Start ' + _this.ariaLabel + ',',
                    'End ' + _this.ariaLabel,
                ];
                return _super.prototype.parser.call(_this);
            });
        };
        class_11.prototype.latex = function () {
            var blocks0 = this.blocks[0];
            return '\\class{' + this.cls + '}{' + blocks0.latex() + '}';
        };
        class_11.prototype.isStyleBlock = function () {
            return true;
        };
        return class_11;
    }(MathCommand)));
    // This test is used to determine whether an item may be treated as a whole number
    // for shortening the verbalized (mathspeak) forms of some fractions and superscripts.
    var intRgx = /^[\+\-]?[\d]+$/;
    // Traverses the top level of the passed block's children and returns the concatenation of their ctrlSeq properties.
    // Used in shortened mathspeak computations as a block's .text() method can be potentially expensive.
    //
    function getCtrlSeqsFromBlock(block) {
        if (!block)
            return '';
        var children = block.children();
        if (!children || !children.ends[L])
            return '';
        var chars = '';
        for (var sibling = children.ends[L]; sibling && sibling[R] !== undefined; sibling = sibling[R]) {
            if (sibling.ctrlSeq !== undefined)
                chars += sibling.ctrlSeq;
        }
        return chars;
    }
    Options.prototype.charsThatBreakOutOfSupSub = '';
    var SupSub = /** @class */ (function (_super) {
        __extends(SupSub, _super);
        function SupSub() {
            var _this = _super !== null && _super.apply(this, arguments) || this;
            _this.ctrlSeq = '_{...}^{...}';
            return _this;
        }
        SupSub.prototype.createLeftOf = function (cursor) {
            if (!this.replacedFragment &&
                !cursor[L] &&
                cursor.options.supSubsRequireOperand)
                return;
            return _super.prototype.createLeftOf.call(this, cursor);
        };
        SupSub.prototype.contactWeld = function (cursor) {
            // Look on either side for a SupSub, if one is found compare my
            // .sub, .sup with its .sub, .sup. If I have one that it doesn't,
            // then call .addBlock() on it with my block; if I have one that
            // it also has, then insert my block's children into its block,
            // unless my block has none, in which case insert the cursor into
            // its block (and not mine, I'm about to remove myself) in the case
            // I was just typed.
            // TODO: simplify
            // equiv. to [L, R].forEach(function(dir) { ... });
            for (var dir = L; dir; dir = dir === L ? R : false) {
                var thisDir = this[dir];
                var pt = void 0;
                if (thisDir instanceof SupSub) {
                    // equiv. to 'sub sup'.split(' ').forEach(function(supsub) { ... });
                    for (var supsub = 'sub'; supsub; supsub = supsub === 'sub' ? 'sup' : false) {
                        var src = this[supsub], dest = thisDir[supsub];
                        if (!src)
                            continue;
                        if (!dest)
                            thisDir.addBlock(src.disown());
                        else if (!src.isEmpty()) {
                            // ins src children at -dir end of dest
                            src.jQ.children().insAtDirEnd(-dir, dest.jQ);
                            var children = src.children().disown();
                            pt = new Point(dest, children.ends[R], dest.ends[L]);
                            if (dir === L)
                                children.adopt(dest, dest.ends[R], 0);
                            else
                                children.adopt(dest, 0, dest.ends[L]);
                        }
                        else {
                            pt = new Point(dest, 0, dest.ends[L]);
                        }
                        this.placeCursor = (function (dest, src) {
                            // TODO: don't monkey-patch
                            return function (cursor) {
                                cursor.insAtDirEnd(-dir, dest || src);
                            };
                        })(dest, src);
                    }
                    this.remove();
                    if (cursor && cursor[L] === this) {
                        if (dir === R && pt) {
                            if (pt[L]) {
                                cursor.insRightOf(pt[L]);
                            }
                            else {
                                cursor.insAtLeftEnd(pt.parent);
                            }
                        }
                        else
                            cursor.insRightOf(thisDir);
                    }
                    break;
                }
            }
        };
        SupSub.prototype.finalizeTree = function () {
            var endsL = this.ends[L];
            endsL.write = function (cursor, ch) {
                if (cursor.options.autoSubscriptNumerals &&
                    this === this.parent.sub) {
                    if (ch === '_')
                        return;
                    var cmd = this.chToCmd(ch, cursor.options);
                    if (cmd instanceof MQSymbol)
                        cursor.deleteSelection();
                    else
                        cursor.clearSelection().insRightOf(this.parent);
                    cmd.createLeftOf(cursor.show());
                    cursor.controller.aria
                        .queue('Baseline')
                        .alert(cmd.mathspeak({ createdLeftOf: cursor }));
                    return;
                }
                if (cursor[L] &&
                    !cursor[R] &&
                    !cursor.selection &&
                    cursor.options.charsThatBreakOutOfSupSub.indexOf(ch) > -1) {
                    cursor.insRightOf(this.parent);
                    cursor.controller.aria.queue('Baseline');
                }
                MathBlock.prototype.write.call(this, cursor, ch);
            };
        };
        SupSub.prototype.moveTowards = function (dir, cursor, updown) {
            if (cursor.options.autoSubscriptNumerals && !this.sup) {
                cursor.insDirOf(dir, this);
            }
            else
                _super.prototype.moveTowards.call(this, dir, cursor, updown);
        };
        SupSub.prototype.deleteTowards = function (dir, cursor) {
            if (cursor.options.autoSubscriptNumerals && this.sub) {
                var cmd = this.sub.ends[-dir];
                if (cmd instanceof MQSymbol)
                    cmd.remove();
                else if (cmd)
                    cmd.deleteTowards(dir, cursor.insAtDirEnd(-dir, this.sub));
                // TODO: factor out a .removeBlock() or something
                if (this.sub.isEmpty()) {
                    this.sub.deleteOutOf(L, cursor.insAtLeftEnd(this.sub));
                    if (this.sup)
                        cursor.insDirOf(-dir, this);
                    // Note `-dir` because in e.g. x_1^2| want backspacing (leftward)
                    // to delete the 1 but to end up rightward of x^2; with non-negated
                    // `dir` (try it), the cursor appears to have gone "through" the ^2.
                }
            }
            else
                _super.prototype.deleteTowards.call(this, dir, cursor);
        };
        SupSub.prototype.latex = function () {
            function latex(prefix, block) {
                var l = block && block.latex();
                return block ? prefix + '{' + (l || ' ') + '}' : '';
            }
            return latex('_', this.sub) + latex('^', this.sup);
        };
        SupSub.prototype.text = function () {
            function text(prefix, block) {
                var l = (block && block.text()) || '';
                return block
                    ? prefix + (l.length === 1 ? l : '(' + (l || ' ') + ')')
                    : '';
            }
            return text('_', this.sub) + text('^', this.sup);
        };
        SupSub.prototype.addBlock = function (block) {
            if (this.supsub === 'sub') {
                this.sup = this.upInto = this.sub.upOutOf = block;
                block.adopt(this, this.sub, 0).downOutOf = this.sub;
                block.jQ = $('<span class="mq-sup"/>')
                    .append(block.jQ.children())
                    .prependTo(this.jQ);
                NodeBase.linkElementByBlockNode(block.jQ[0], block);
            }
            else {
                this.sub = this.downInto = this.sup.downOutOf = block;
                block.adopt(this, 0, this.sup).upOutOf = this.sup;
                block.jQ = $('<span class="mq-sub"></span>')
                    .append(block.jQ.children())
                    .appendTo(this.jQ.removeClass('mq-sup-only'));
                NodeBase.linkElementByBlockNode(block.jQ[0], block);
                this.jQ.append('<span style="display:inline-block;width:0">&#8203;</span>');
            }
            // like 'sub sup'.split(' ').forEach(function(supsub) { ... });
            for (var i = 0; i < 2; i += 1)
                (function (cmd, supsub, oppositeSupsub, updown) {
                    var cmdSubSub = cmd[supsub];
                    cmdSubSub.deleteOutOf = function (dir, cursor) {
                        cursor.insDirOf(this[dir] ? -dir : dir, this.parent);
                        if (!this.isEmpty()) {
                            var end = this.ends[dir];
                            this.children()
                                .disown()
                                .withDirAdopt(dir, cursor.parent, cursor[dir], cursor[-dir])
                                .jQ.insDirOf(-dir, cursor.jQ);
                            cursor[-dir] = end;
                        }
                        cmd.supsub = oppositeSupsub;
                        delete cmd[supsub];
                        delete cmd["".concat(updown, "Into")];
                        var cmdOppositeSupsub = cmd[oppositeSupsub];
                        cmdOppositeSupsub["".concat(updown, "OutOf")] = insLeftOfMeUnlessAtEnd;
                        delete cmdOppositeSupsub.deleteOutOf; // TODO - refactor so this method can be optional
                        if (supsub === 'sub')
                            $(cmd.jQ.addClass('mq-sup-only')[0].lastChild).remove();
                        this.remove();
                    };
                })(this, 'sub sup'.split(' ')[i], 'sup sub'.split(' ')[i], 'down up'.split(' ')[i]);
        };
        return SupSub;
    }(MathCommand));
    function insLeftOfMeUnlessAtEnd(cursor) {
        // cursor.insLeftOf(cmd), unless cursor at the end of block, and every
        // ancestor cmd is at the end of every ancestor block
        var cmd = this.parent;
        var ancestorCmd = cursor;
        do {
            if (ancestorCmd[R])
                return cursor.insLeftOf(cmd);
            ancestorCmd = ancestorCmd.parent.parent;
        } while (ancestorCmd !== cmd);
        cursor.insRightOf(cmd);
        return undefined;
    }
    var SubscriptCommand = /** @class */ (function (_super) {
        __extends(SubscriptCommand, _super);
        function SubscriptCommand() {
            var _this = _super !== null && _super.apply(this, arguments) || this;
            _this.supsub = 'sub';
            _this.htmlTemplate = '<span class="mq-supsub mq-non-leaf">' +
                '<span class="mq-sub">&0</span>' +
                '<span style="display:inline-block;width:0">&#8203;</span>' +
                '</span>';
            _this.textTemplate = ['_'];
            _this.mathspeakTemplate = ['Subscript,', ', Baseline'];
            _this.ariaLabel = 'subscript';
            return _this;
        }
        SubscriptCommand.prototype.finalizeTree = function () {
            this.downInto = this.sub = this.ends[L];
            this.sub.upOutOf = insLeftOfMeUnlessAtEnd;
            _super.prototype.finalizeTree.call(this);
        };
        return SubscriptCommand;
    }(SupSub));
    LatexCmds.subscript = LatexCmds._ = SubscriptCommand;
    LatexCmds.superscript =
        LatexCmds.supscript =
            LatexCmds['^'] = /** @class */ (function (_super) {
                __extends(SuperscriptCommand, _super);
                function SuperscriptCommand() {
                    var _this = _super !== null && _super.apply(this, arguments) || this;
                    _this.supsub = 'sup';
                    _this.htmlTemplate = '<span class="mq-supsub mq-non-leaf mq-sup-only">' +
                        '<span class="mq-sup">&0</span>' +
                        '</span>';
                    _this.textTemplate = ['^(', ')'];
                    _this.ariaLabel = 'superscript';
                    _this.mathspeakTemplate = ['Superscript,', ', Baseline'];
                    return _this;
                }
                SuperscriptCommand.prototype.mathspeak = function (opts) {
                    // Simplify basic exponent speech for common whole numbers.
                    var child = this.upInto;
                    if (child !== undefined) {
                        // Calculate this item's inner text to determine whether to shorten the returned speech.
                        // Do not calculate its inner mathspeak now until we know that the speech is to be truncated.
                        // Since the mathspeak computation is recursive, we want to call it only once in this function to avoid performance bottlenecks.
                        var innerText = getCtrlSeqsFromBlock(child);
                        // If the superscript is a whole number, shorten the speech that is returned.
                        if ((!opts || !opts.ignoreShorthand) && intRgx.test(innerText)) {
                            // Simple cases
                            if (innerText === '0') {
                                return 'to the 0 power';
                            }
                            else if (innerText === '2') {
                                return 'squared';
                            }
                            else if (innerText === '3') {
                                return 'cubed';
                            }
                            // More complex cases.
                            var suffix = '';
                            // Limit suffix addition to exponents < 1000.
                            if (/^[+-]?\d{1,3}$/.test(innerText)) {
                                if (/(11|12|13|4|5|6|7|8|9|0)$/.test(innerText)) {
                                    suffix = 'th';
                                }
                                else if (/1$/.test(innerText)) {
                                    suffix = 'st';
                                }
                                else if (/2$/.test(innerText)) {
                                    suffix = 'nd';
                                }
                                else if (/3$/.test(innerText)) {
                                    suffix = 'rd';
                                }
                            }
                            var innerMathspeak = typeof child === 'object' ? child.mathspeak() : innerText;
                            return 'to the ' + innerMathspeak + suffix + ' power';
                        }
                    }
                    return _super.prototype.mathspeak.call(this);
                };
                SuperscriptCommand.prototype.finalizeTree = function () {
                    this.upInto = this.sup = this.ends[R];
                    this.sup.downOutOf = insLeftOfMeUnlessAtEnd;
                    _super.prototype.finalizeTree.call(this);
                };
                return SuperscriptCommand;
            }(SupSub));
    var SummationNotation = /** @class */ (function (_super) {
        __extends(SummationNotation, _super);
        function SummationNotation(ch, html, ariaLabel) {
            var _this = _super.call(this) || this;
            _this.ariaLabel = ariaLabel || ch.replace(/^\\/, '');
            var htmlTemplate = '<span class="mq-large-operator mq-non-leaf">' +
                '<span class="mq-to"><span>&1</span></span>' +
                '<big>' +
                html +
                '</big>' +
                '<span class="mq-from"><span>&0</span></span>' +
                '</span>';
            MQSymbol.prototype.setCtrlSeqHtmlTextAndMathspeak.call(_this, ch, htmlTemplate);
            return _this;
        }
        SummationNotation.prototype.createLeftOf = function (cursor) {
            _super.prototype.createLeftOf.call(this, cursor);
            if (cursor.options.sumStartsWithNEquals) {
                new Letter('n').createLeftOf(cursor);
                new Equality().createLeftOf(cursor);
            }
        };
        SummationNotation.prototype.latex = function () {
            function simplify(latex) {
                return '{' + (latex || ' ') + '}';
            }
            return (this.ctrlSeq +
                '_' +
                simplify(this.ends[L].latex()) +
                '^' +
                simplify(this.ends[R].latex()));
        };
        SummationNotation.prototype.mathspeak = function () {
            return ('Start ' +
                this.ariaLabel +
                ' from ' +
                this.ends[L].mathspeak() +
                ' to ' +
                this.ends[R].mathspeak() +
                ', end ' +
                this.ariaLabel +
                ', ');
        };
        SummationNotation.prototype.parser = function () {
            var string = Parser.string;
            var optWhitespace = Parser.optWhitespace;
            var succeed = Parser.succeed;
            var block = latexMathParser.block;
            var self = this;
            var blocks = (self.blocks = [new MathBlock(), new MathBlock()]);
            for (var i = 0; i < blocks.length; i += 1) {
                blocks[i].adopt(self, self.ends[R], 0);
            }
            return optWhitespace
                .then(string('_').or(string('^')))
                .then(function (supOrSub) {
                var child = blocks[supOrSub === '_' ? 0 : 1];
                return block.then(function (block) {
                    block.children().adopt(child, child.ends[R], 0);
                    return succeed(self);
                });
            })
                .many()
                .result(self);
        };
        SummationNotation.prototype.finalizeTree = function () {
            var endsL = this.ends[L];
            var endsR = this.ends[R];
            endsL.ariaLabel = 'lower bound';
            endsR.ariaLabel = 'upper bound';
            this.downInto = endsL;
            this.upInto = endsR;
            endsL.upOutOf = endsR;
            endsR.downOutOf = endsL;
        };
        return SummationNotation;
    }(MathCommand));
    LatexCmds['∑'] =
        LatexCmds.sum =
            LatexCmds.summation =
                function () { return new SummationNotation('\\sum ', '&sum;', 'sum'); };
    LatexCmds['∏'] =
        LatexCmds.prod =
            LatexCmds.product =
                function () { return new SummationNotation('\\prod ', '&prod;', 'product'); };
    LatexCmds.coprod = LatexCmds.coproduct = function () {
        return new SummationNotation('\\coprod ', '&#8720;', 'co product');
    };
    LatexCmds['∫'] =
        LatexCmds['int'] =
            LatexCmds.integral = /** @class */ (function (_super) {
                __extends(class_12, _super);
                function class_12() {
                    var _this = this;
                    var htmlTemplate = '<span class="mq-int mq-non-leaf">' +
                        '<big>&int;</big>' +
                        '<span class="mq-supsub mq-non-leaf">' +
                        '<span class="mq-sup"><span class="mq-sup-inner">&1</span></span>' +
                        '<span class="mq-sub">&0</span>' +
                        '<span style="display:inline-block;width:0">&#8203</span>' +
                        '</span>' +
                        '</span>';
                    _this = _super.call(this, '\\int ', '', 'integral') || this;
                    _this.ariaLabel = 'integral';
                    _this.htmlTemplate = htmlTemplate;
                    return _this;
                }
                class_12.prototype.createLeftOf = function (cursor) {
                    // FIXME: refactor rather than overriding
                    MathCommand.prototype.createLeftOf.call(this, cursor);
                };
                return class_12;
            }(SummationNotation));
    var Fraction = (LatexCmds.frac =
        LatexCmds.dfrac =
            LatexCmds.cfrac =
                LatexCmds.fraction = /** @class */ (function (_super) {
                    __extends(FracNode, _super);
                    function FracNode() {
                        var _this = _super !== null && _super.apply(this, arguments) || this;
                        _this.ctrlSeq = '\\frac';
                        _this.htmlTemplate = '<span class="mq-fraction mq-non-leaf">' +
                            '<span class="mq-numerator">&0</span>' +
                            '<span class="mq-denominator">&1</span>' +
                            '<span style="display:inline-block;width:0">&#8203;</span>' +
                            '</span>';
                        _this.textTemplate = ['(', ')/(', ')'];
                        return _this;
                    }
                    FracNode.prototype.finalizeTree = function () {
                        var endsL = this.ends[L];
                        var endsR = this.ends[R];
                        this.upInto = endsR.upOutOf = endsL;
                        this.downInto = endsL.downOutOf = endsR;
                        endsL.ariaLabel = 'numerator';
                        endsR.ariaLabel = 'denominator';
                        if (this.getFracDepth() > 1) {
                            this.mathspeakTemplate = [
                                'StartNestedFraction,',
                                'NestedOver',
                                ', EndNestedFraction',
                            ];
                        }
                        else {
                            this.mathspeakTemplate = ['StartFraction,', 'Over', ', EndFraction'];
                        }
                    };
                    FracNode.prototype.mathspeak = function (opts) {
                        if (opts && opts.createdLeftOf) {
                            var cursor = opts.createdLeftOf;
                            return cursor.parent.mathspeak();
                        }
                        var numText = getCtrlSeqsFromBlock(this.ends[L]);
                        var denText = getCtrlSeqsFromBlock(this.ends[R]);
                        // Shorten mathspeak value for whole number fractions whose denominator is less than 10.
                        if ((!opts || !opts.ignoreShorthand) &&
                            intRgx.test(numText) &&
                            intRgx.test(denText)) {
                            var isSingular = numText === '1' || numText === '-1';
                            var newDenSpeech = '';
                            if (denText === '2') {
                                newDenSpeech = isSingular ? 'half' : 'halves';
                            }
                            else if (denText === '3') {
                                newDenSpeech = isSingular ? 'third' : 'thirds';
                            }
                            else if (denText === '4') {
                                newDenSpeech = isSingular ? 'quarter' : 'quarters';
                            }
                            else if (denText === '5') {
                                newDenSpeech = isSingular ? 'fifth' : 'fifths';
                            }
                            else if (denText === '6') {
                                newDenSpeech = isSingular ? 'sixth' : 'sixths';
                            }
                            else if (denText === '7') {
                                newDenSpeech = isSingular ? 'seventh' : 'sevenths';
                            }
                            else if (denText === '8') {
                                newDenSpeech = isSingular ? 'eighth' : 'eighths';
                            }
                            else if (denText === '9') {
                                newDenSpeech = isSingular ? 'ninth' : 'ninths';
                            }
                            if (newDenSpeech !== '') {
                                var output = '';
                                // Handle the case of an integer followed by a simplified fraction such as 1\frac{1}{2}.
                                // Such combinations should be spoken aloud as "1 and 1 half."
                                // Start at the left sibling of the fraction and continue leftward until something other than a digit or whitespace is found.
                                var precededByInteger = false;
                                for (var sibling = this[L]; sibling && sibling[L] !== undefined; sibling = sibling[L]) {
                                    // Ignore whitespace
                                    if (sibling.ctrlSeq === '\\ ') {
                                        continue;
                                    }
                                    else if (intRgx.test(sibling.ctrlSeq || '')) {
                                        precededByInteger = true;
                                    }
                                    else {
                                        precededByInteger = false;
                                        break;
                                    }
                                }
                                if (precededByInteger) {
                                    output += 'and ';
                                }
                                output += this.ends[L].mathspeak() + ' ' + newDenSpeech;
                                return output;
                            }
                        }
                        return _super.prototype.mathspeak.call(this);
                    };
                    FracNode.prototype.getFracDepth = function () {
                        var level = 0;
                        var walkUp = function (item, level) {
                            if (item instanceof MQNode &&
                                item.ctrlSeq &&
                                item.ctrlSeq.toLowerCase().search('frac') >= 0)
                                level += 1;
                            if (item && item.parent)
                                return walkUp(item.parent, level);
                            else
                                return level;
                        };
                        return walkUp(this, level);
                    };
                    return FracNode;
                }(MathCommand)));
    var LiveFraction = (LatexCmds.over =
        CharCmds['/'] = /** @class */ (function (_super) {
            __extends(class_13, _super);
            function class_13() {
                return _super !== null && _super.apply(this, arguments) || this;
            }
            class_13.prototype.createLeftOf = function (cursor) {
                if (!this.replacedFragment) {
                    var leftward = cursor[L];
                    if (!cursor.options.typingSlashCreatesNewFraction) {
                        while (leftward &&
                            !(leftward instanceof BinaryOperator ||
                                leftward instanceof (LatexCmds.text || noop) ||
                                leftward instanceof SummationNotation ||
                                leftward.ctrlSeq === '\\ ' ||
                                /^[,;:]$/.test(leftward.ctrlSeq)) //lookbehind for operator
                        )
                            leftward = leftward[L];
                    }
                    if (leftward instanceof SummationNotation &&
                        leftward[R] instanceof SupSub) {
                        leftward = leftward[R];
                        var leftwardR = leftward[R];
                        if (leftwardR instanceof SupSub &&
                            leftwardR.ctrlSeq != leftward.ctrlSeq)
                            leftward = leftward[R];
                    }
                    if (leftward !== cursor[L] && !cursor.isTooDeep(1)) {
                        var leftwardR = leftward[R];
                        var cursorL = cursor[L];
                        this.replaces(new Fragment(leftwardR || cursor.parent.ends[L], cursorL));
                        cursor[L] = leftward;
                    }
                }
                _super.prototype.createLeftOf.call(this, cursor);
            };
            return class_13;
        }(Fraction)));
    var AnsBuilder = function () {
        return new MQSymbol('\\operatorname{ans}', '<span class="mq-ans">ans</span>', 'ans');
    };
    LatexCmds.ans = AnsBuilder;
    var PercentOfBuilder = function () {
        return new MQSymbol('\\%\\operatorname{of}', '<span class="mq-nonSymbola mq-operator-name">% of </span>', 'percent of');
    };
    LatexCmds.percent = LatexCmds.percentof = PercentOfBuilder;
    var SquareRoot = /** @class */ (function (_super) {
        __extends(SquareRoot, _super);
        function SquareRoot() {
            var _this = _super !== null && _super.apply(this, arguments) || this;
            _this.ctrlSeq = '\\sqrt';
            _this.htmlTemplate = '<span class="mq-non-leaf mq-sqrt-container">' +
                '<span class="mq-scaled mq-sqrt-prefix">' +
                SVG_SYMBOLS.sqrt.html +
                '</span>' +
                '<span class="mq-non-leaf mq-sqrt-stem">&0</span>' +
                '</span>';
            _this.textTemplate = ['sqrt(', ')'];
            _this.mathspeakTemplate = ['StartRoot,', ', EndRoot'];
            _this.ariaLabel = 'root';
            return _this;
        }
        SquareRoot.prototype.parser = function () {
            return latexMathParser.optBlock
                .then(function (optBlock) {
                return latexMathParser.block.map(function (block) {
                    var nthroot = new NthRoot();
                    nthroot.blocks = [optBlock, block];
                    optBlock.adopt(nthroot, 0, 0);
                    block.adopt(nthroot, optBlock, 0);
                    return nthroot;
                });
            })
                .or(_super.prototype.parser.call(this));
        };
        return SquareRoot;
    }(MathCommand));
    LatexCmds.sqrt = SquareRoot;
    LatexCmds.hat = /** @class */ (function (_super) {
        __extends(Hat, _super);
        function Hat() {
            var _this = _super !== null && _super.apply(this, arguments) || this;
            _this.ctrlSeq = '\\hat';
            _this.htmlTemplate = '<span class="mq-non-leaf">' +
                '<span class="mq-hat-prefix">^</span>' +
                '<span class="mq-hat-stem">&0</span>' +
                '</span>';
            _this.textTemplate = ['hat(', ')'];
            return _this;
        }
        return Hat;
    }(MathCommand));
    var NthRoot = /** @class */ (function (_super) {
        __extends(NthRoot, _super);
        function NthRoot() {
            var _this = _super !== null && _super.apply(this, arguments) || this;
            _this.htmlTemplate = '<span class="mq-nthroot-container mq-non-leaf">' +
                '<sup class="mq-nthroot mq-non-leaf">&0</sup>' +
                '<span class="mq-scaled mq-sqrt-container">' +
                '<span class="mq-sqrt-prefix mq-scaled">' +
                SVG_SYMBOLS.sqrt.html +
                '</span>' +
                '<span class="mq-sqrt-stem mq-non-leaf">&1</span>' +
                '</span>' +
                '</span>';
            _this.textTemplate = ['sqrt[', '](', ')'];
            return _this;
        }
        NthRoot.prototype.latex = function () {
            return ('\\sqrt[' +
                this.ends[L].latex() +
                ']{' +
                this.ends[R].latex() +
                '}');
        };
        NthRoot.prototype.mathspeak = function () {
            var indexMathspeak = this.ends[L].mathspeak();
            var radicandMathspeak = this.ends[R].mathspeak();
            this.ends[L].ariaLabel = 'Index';
            this.ends[R].ariaLabel = 'Radicand';
            if (indexMathspeak === '3') {
                // cube root
                return 'Start Cube Root, ' + radicandMathspeak + ', End Cube Root';
            }
            else {
                return ('Root Index ' +
                    indexMathspeak +
                    ', Start Root, ' +
                    radicandMathspeak +
                    ', End Root');
            }
        };
        return NthRoot;
    }(SquareRoot));
    LatexCmds.nthroot = NthRoot;
    LatexCmds.cbrt = /** @class */ (function (_super) {
        __extends(class_14, _super);
        function class_14() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        class_14.prototype.createLeftOf = function (cursor) {
            _super.prototype.createLeftOf.call(this, cursor);
            new Digit('3').createLeftOf(cursor);
            cursor.controller.moveRight();
        };
        return class_14;
    }(NthRoot));
    var DiacriticAbove = /** @class */ (function (_super) {
        __extends(DiacriticAbove, _super);
        function DiacriticAbove(ctrlSeq, symbol, textTemplate) {
            var htmlTemplate = '<span class="mq-non-leaf">' +
                '<span class="mq-diacritic-above">' +
                symbol +
                '</span>' +
                '<span class="mq-diacritic-stem">&0</span>' +
                '</span>';
            return _super.call(this, ctrlSeq, htmlTemplate, textTemplate) || this;
        }
        return DiacriticAbove;
    }(MathCommand));
    LatexCmds.vec = function () { return new DiacriticAbove('\\vec', '&rarr;', ['vec(', ')']); };
    LatexCmds.tilde = function () { return new DiacriticAbove('\\tilde', '~', ['tilde(', ')']); };
    var DelimsNode = /** @class */ (function (_super) {
        __extends(DelimsNode, _super);
        function DelimsNode() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        DelimsNode.prototype.jQadd = function (el) {
            _super.prototype.jQadd.call(this, el);
            this.delimjQs = this.jQ.children(':first').add(this.jQ.children(':last'));
            this.contentjQ = this.jQ.children(':eq(1)');
            return this.jQ;
        };
        return DelimsNode;
    }(MathCommand));
    // Round/Square/Curly/Angle Brackets (aka Parens/Brackets/Braces)
    //   first typed as one-sided bracket with matching "ghost" bracket at
    //   far end of current block, until you type an opposing one
    var Bracket = /** @class */ (function (_super) {
        __extends(Bracket, _super);
        function Bracket(side, open, close, ctrlSeq, end) {
            var _c;
            var _this = _super.call(this, '\\left' + ctrlSeq, undefined, [open, close]) || this;
            _this.side = side;
            _this.sides = (_c = {},
                _c[L] = { ch: open, ctrlSeq: ctrlSeq },
                _c[R] = { ch: close, ctrlSeq: end },
                _c);
            return _this;
        }
        Bracket.prototype.numBlocks = function () {
            return 1;
        };
        Bracket.prototype.html = function () {
            var leftSymbol = this.getSymbol(L);
            var rightSymbol = this.getSymbol(R);
            // wait until now so that .side may
            this.htmlTemplate = // be set by createLeftOf or parser
                '<span class="mq-non-leaf mq-bracket-container">' +
                    '<span style="width:' +
                    leftSymbol.width +
                    '" class="mq-scaled mq-bracket-l mq-paren' +
                    (this.side === R ? ' mq-ghost' : '') +
                    '">' +
                    leftSymbol.html +
                    '</span>' +
                    '<span style="margin-left:' +
                    leftSymbol.width +
                    ';margin-right:' +
                    rightSymbol.width +
                    '" class="mq-bracket-middle mq-non-leaf">&0</span>' +
                    '<span style="width:' +
                    rightSymbol.width +
                    '" class="mq-scaled mq-bracket-r mq-paren' +
                    (this.side === L ? ' mq-ghost' : '') +
                    '">' +
                    rightSymbol.html +
                    '</span>' +
                    '</span>';
            return _super.prototype.html.call(this);
        };
        Bracket.prototype.getSymbol = function (side) {
            var ch = this.sides[side || R].ch;
            return SVG_SYMBOLS[ch] || { width: '0', html: '' };
        };
        Bracket.prototype.latex = function () {
            return ('\\left' +
                this.sides[L].ctrlSeq +
                this.ends[L].latex() +
                '\\right' +
                this.sides[R].ctrlSeq);
        };
        Bracket.prototype.mathspeak = function (opts) {
            var open = this.sides[L].ch, close = this.sides[R].ch;
            if (open === '|' && close === '|') {
                this.mathspeakTemplate = ['StartAbsoluteValue,', ', EndAbsoluteValue'];
                this.ariaLabel = 'absolute value';
            }
            else if (opts && opts.createdLeftOf && this.side) {
                var ch = '';
                if (this.side === L)
                    ch = this.textTemplate[0];
                else if (this.side === R)
                    ch = this.textTemplate[1];
                return ((this.side === L ? 'left ' : 'right ') +
                    BRACKET_NAMES[ch]);
            }
            else {
                this.mathspeakTemplate = [
                    'left ' + BRACKET_NAMES[open] + ',',
                    ', right ' + BRACKET_NAMES[close],
                ];
                this.ariaLabel =
                    BRACKET_NAMES[open] + ' block';
            }
            return _super.prototype.mathspeak.call(this);
        };
        Bracket.prototype.matchBrack = function (opts, expectedSide, node) {
            // return node iff it's a matching 1-sided bracket of expected side (if any)
            return (node instanceof Bracket &&
                node.side &&
                node.side !== -expectedSide &&
                (!opts.restrictMismatchedBrackets ||
                    OPP_BRACKS[this.sides[this.side].ch] === node.sides[node.side].ch ||
                    { '(': ']', '[': ')' }[this.sides[L].ch] === node.sides[R].ch) &&
                node);
        };
        Bracket.prototype.closeOpposing = function (brack) {
            brack.side = 0;
            brack.sides[this.side] = this.sides[this.side]; // copy over my info (may be
            var $brack = brack.delimjQs
                .eq(this.side === L ? 0 : 1) // mismatched, like [a, b))
                .removeClass('mq-ghost');
            this.replaceBracket($brack, this.side);
        };
        Bracket.prototype.createLeftOf = function (cursor) {
            var brack;
            if (!this.replacedFragment) {
                // unless wrapping seln in brackets,
                // check if next to or inside an opposing one-sided bracket
                var opts = cursor.options;
                if (this.sides[L].ch === '|') {
                    // check both sides if I'm a pipe
                    brack =
                        this.matchBrack(opts, R, cursor[R]) ||
                            this.matchBrack(opts, L, cursor[L]) ||
                            this.matchBrack(opts, 0, cursor.parent.parent);
                }
                else {
                    brack =
                        this.matchBrack(opts, -this.side, cursor[-this.side]) ||
                            this.matchBrack(opts, -this.side, cursor.parent.parent);
                }
            }
            if (brack) {
                var side = (this.side = -brack.side); // may be pipe with .side not yet set
                this.closeOpposing(brack);
                if (brack === cursor.parent.parent && cursor[side]) {
                    // move the stuff between
                    new Fragment(cursor[side], cursor.parent.ends[side], -side) // me and ghost outside
                        .disown()
                        .withDirAdopt(-side, brack.parent, brack, brack[side])
                        .jQ.insDirOf(side, brack.jQ);
                }
                brack.bubble(function (node) {
                    node.reflow();
                    return undefined;
                });
            }
            else {
                (brack = this), (side = brack.side);
                if (brack.replacedFragment)
                    brack.side = 0;
                // wrapping seln, don't be one-sided
                else if (cursor[-side]) {
                    // elsewise, auto-expand so ghost is at far end
                    brack.replaces(new Fragment(cursor[-side], cursor.parent.ends[-side], side));
                    cursor[-side] = 0;
                }
                _super.prototype.createLeftOf.call(this, cursor);
            }
            if (side === L)
                cursor.insAtLeftEnd(brack.ends[L]);
            else
                cursor.insRightOf(brack);
        };
        Bracket.prototype.placeCursor = function () { };
        Bracket.prototype.unwrap = function () {
            this.ends[L]
                .children()
                .disown()
                .adopt(this.parent, this, this[R])
                .jQ.insertAfter(this.jQ);
            this.remove();
        };
        Bracket.prototype.deleteSide = function (side, outward, cursor) {
            var parent = this.parent, sib = this[side], farEnd = parent.ends[side];
            if (side === this.side) {
                // deleting non-ghost of one-sided bracket, unwrap
                this.unwrap();
                sib
                    ? cursor.insDirOf(-side, sib)
                    : cursor.insAtDirEnd(side, parent);
                return;
            }
            var opts = cursor.options, wasSolid = !this.side;
            this.side = -side;
            // if deleting like, outer close-brace of [(1+2)+3} where inner open-paren
            if (this.matchBrack(opts, side, this.ends[L].ends[this.side])) {
                // is ghost,
                this.closeOpposing(this.ends[L].ends[this.side]); // then become [1+2)+3
                var origEnd = this.ends[L].ends[side];
                this.unwrap();
                if (origEnd)
                    origEnd.siblingCreated(cursor.options, side);
                if (sib) {
                    cursor.insDirOf(-side, sib);
                }
                else {
                    cursor.insAtDirEnd(side, parent);
                }
            }
            else {
                // if deleting like, inner close-brace of ([1+2}+3) where outer
                if (this.matchBrack(opts, side, this.parent.parent)) {
                    // open-paren is
                    this.parent.parent.closeOpposing(this); // ghost, then become [1+2+3)
                    this.parent.parent.unwrap();
                } // else if deleting outward from a solid pair, unwrap
                else if (outward && wasSolid) {
                    this.unwrap();
                    sib
                        ? cursor.insDirOf(-side, sib)
                        : cursor.insAtDirEnd(side, parent);
                    return;
                }
                else {
                    // else deleting just one of a pair of brackets, become one-sided
                    this.sides[side] = getOppBracketSide(this);
                    var $brack = this.delimjQs
                        .removeClass('mq-ghost')
                        .eq(side === L ? 0 : 1)
                        .addClass('mq-ghost');
                    this.replaceBracket($brack, side);
                }
                if (sib) {
                    // auto-expand so ghost is at far end
                    var origEnd = this.ends[L].ends[side];
                    new Fragment(sib, farEnd, -side)
                        .disown()
                        .withDirAdopt(-side, this.ends[L], origEnd, 0)
                        .jQ.insAtDirEnd(side, this.ends[L].jQ.removeClass('mq-empty'));
                    if (origEnd)
                        origEnd.siblingCreated(cursor.options, side);
                    cursor.insDirOf(-side, sib);
                } // didn't auto-expand, cursor goes just outside or just inside parens
                else
                    outward
                        ? cursor.insDirOf(side, this)
                        : cursor.insAtDirEnd(side, this.ends[L]);
            }
        };
        Bracket.prototype.replaceBracket = function ($brack, side) {
            var symbol = this.getSymbol(side);
            $brack.html(symbol.html).css('width', symbol.width);
            if (side === L) {
                $brack.next().css('margin-left', symbol.width);
            }
            else {
                $brack.prev().css('margin-right', symbol.width);
            }
        };
        Bracket.prototype.deleteTowards = function (dir, cursor) {
            this.deleteSide(-dir, false, cursor);
        };
        Bracket.prototype.finalizeTree = function () {
            this.ends[L].deleteOutOf = function (dir, cursor) {
                this.parent.deleteSide(dir, true, cursor);
            };
            // FIXME HACK: after initial creation/insertion, finalizeTree would only be
            // called if the paren is selected and replaced, e.g. by LiveFraction
            this.finalizeTree = this.intentionalBlur = function () {
                this.delimjQs.eq(this.side === L ? 1 : 0).removeClass('mq-ghost');
                this.side = 0;
            };
        };
        Bracket.prototype.siblingCreated = function (_opts, dir) {
            // if something typed between ghost and far
            if (dir === -this.side)
                this.finalizeTree(); // end of its block, solidify
        };
        return Bracket;
    }(DelimsNode));
    function getOppBracketSide(bracket) {
        var side = bracket.side;
        var data = bracket.sides[side];
        return {
            ch: OPP_BRACKS[data.ch],
            ctrlSeq: OPP_BRACKS[data.ctrlSeq],
        };
    }
    var OPP_BRACKS = {
        '(': ')',
        ')': '(',
        '[': ']',
        ']': '[',
        '{': '}',
        '}': '{',
        '\\{': '\\}',
        '\\}': '\\{',
        '&lang;': '&rang;',
        '&rang;': '&lang;',
        '\\langle ': '\\rangle ',
        '\\rangle ': '\\langle ',
        '|': '|',
        '\\lVert ': '\\rVert ',
        '\\rVert ': '\\lVert ',
    };
    var BRACKET_NAMES = {
        '&lang;': 'angle-bracket',
        '&rang;': 'angle-bracket',
        '|': 'pipe',
    };
    function bindCharBracketPair(open, ctrlSeq, name) {
        var ctrlSeq = ctrlSeq || open;
        var close = OPP_BRACKS[open];
        var end = OPP_BRACKS[ctrlSeq];
        CharCmds[open] = function () { return new Bracket(L, open, close, ctrlSeq, end); };
        CharCmds[close] = function () { return new Bracket(R, open, close, ctrlSeq, end); };
        BRACKET_NAMES[open] = BRACKET_NAMES[close] = name;
    }
    bindCharBracketPair('(', '', 'parenthesis');
    bindCharBracketPair('[', '', 'bracket');
    bindCharBracketPair('{', '\\{', 'brace');
    LatexCmds.langle = function () {
        return new Bracket(L, '&lang;', '&rang;', '\\langle ', '\\rangle ');
    };
    LatexCmds.rangle = function () {
        return new Bracket(R, '&lang;', '&rang;', '\\langle ', '\\rangle ');
    };
    CharCmds['|'] = function () { return new Bracket(L, '|', '|', '|', '|'); };
    LatexCmds.lVert = function () {
        return new Bracket(L, '&#8741;', '&#8741;', '\\lVert ', '\\rVert ');
    };
    LatexCmds.rVert = function () {
        return new Bracket(R, '&#8741;', '&#8741;', '\\lVert ', '\\rVert ');
    };
    LatexCmds.left = /** @class */ (function (_super) {
        __extends(left, _super);
        function left() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        left.prototype.parser = function () {
            var regex = Parser.regex;
            var string = Parser.string;
            var optWhitespace = Parser.optWhitespace;
            return optWhitespace
                .then(regex(/^(?:[([|]|\\\{|\\langle(?![a-zA-Z])|\\lVert(?![a-zA-Z]))/))
                .then(function (ctrlSeq) {
                var open = ctrlSeq.replace(/^\\/, '');
                if (ctrlSeq == '\\langle') {
                    open = '&lang;';
                    ctrlSeq = ctrlSeq + ' ';
                }
                if (ctrlSeq == '\\lVert') {
                    open = '&#8741;';
                    ctrlSeq = ctrlSeq + ' ';
                }
                return latexMathParser.then(function (block) {
                    return string('\\right')
                        .skip(optWhitespace)
                        .then(regex(/^(?:[\])|]|\\\}|\\rangle(?![a-zA-Z])|\\rVert(?![a-zA-Z]))/))
                        .map(function (end) {
                        var close = end.replace(/^\\/, '');
                        if (end == '\\rangle') {
                            close = '&rang;';
                            end = end + ' ';
                        }
                        if (end == '\\rVert') {
                            close = '&#8741;';
                            end = end + ' ';
                        }
                        var cmd = new Bracket(0, open, close, ctrlSeq, end);
                        cmd.blocks = [block];
                        block.adopt(cmd, 0, 0);
                        return cmd;
                    });
                });
            });
        };
        return left;
    }(MathCommand));
    LatexCmds.right = /** @class */ (function (_super) {
        __extends(right, _super);
        function right() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        right.prototype.parser = function () {
            return Parser.fail('unmatched \\right');
        };
        return right;
    }(MathCommand));
    var leftBinomialSymbol = SVG_SYMBOLS['('];
    var rightBinomialSymbol = SVG_SYMBOLS[')'];
    var Binomial = /** @class */ (function (_super) {
        __extends(Binomial, _super);
        function Binomial() {
            var _this = _super !== null && _super.apply(this, arguments) || this;
            _this.ctrlSeq = '\\binom';
            _this.htmlTemplate = '<span class="mq-non-leaf mq-bracket-container">' +
                '<span style="width:' +
                leftBinomialSymbol.width +
                '" class="mq-paren mq-bracket-l mq-scaled">' +
                leftBinomialSymbol.html +
                '</span>' +
                '<span style="margin-left:' +
                leftBinomialSymbol.width +
                '; margin-right:' +
                rightBinomialSymbol.width +
                ';" class="mq-non-leaf mq-bracket-middle">' +
                '<span class="mq-array mq-non-leaf">' +
                '<span>&0</span>' +
                '<span>&1</span>' +
                '</span>' +
                '</span>' +
                '<span style="width:' +
                rightBinomialSymbol.width +
                '" class="mq-paren mq-bracket-r mq-scaled">' +
                rightBinomialSymbol.html +
                '</span>' +
                '</span>';
            _this.textTemplate = ['choose(', ',', ')'];
            _this.mathspeakTemplate = ['StartBinomial,', 'Choose', ', EndBinomial'];
            _this.ariaLabel = 'binomial';
            return _this;
        }
        return Binomial;
    }(DelimsNode));
    LatexCmds.binom = LatexCmds.binomial = Binomial;
    LatexCmds.choose = /** @class */ (function (_super) {
        __extends(class_15, _super);
        function class_15() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        class_15.prototype.createLeftOf = function (cursor) {
            LiveFraction.prototype.createLeftOf(cursor);
        };
        return class_15;
    }(Binomial));
    var MathFieldNode = /** @class */ (function (_super) {
        __extends(MathFieldNode, _super);
        function MathFieldNode() {
            var _this = _super !== null && _super.apply(this, arguments) || this;
            _this.ctrlSeq = '\\MathQuillMathField';
            _this.htmlTemplate = '<span class="mq-editable-field">' +
                '<span class="mq-root-block">&0</span>' +
                '</span>';
            return _this;
        }
        MathFieldNode.prototype.parser = function () {
            var self = this, string = Parser.string, regex = Parser.regex, succeed = Parser.succeed;
            return string('[')
                .then(regex(/^[a-z][a-z0-9]*/i))
                .skip(string(']'))
                .map(function (name) {
                self.name = name;
            })
                .or(succeed(undefined))
                .then(_super.prototype.parser.call(this));
        };
        MathFieldNode.prototype.finalizeTree = function (options) {
            var ctrlr = new Controller(this.ends[L], this.jQ, options);
            ctrlr.KIND_OF_MQ = 'MathField';
            ctrlr.editable = true;
            ctrlr.createTextarea();
            ctrlr.editablesTextareaEvents();
            ctrlr.cursor.insAtRightEnd(ctrlr.root);
            RootBlockMixin(ctrlr.root);
        };
        MathFieldNode.prototype.registerInnerField = function (innerFields, MathField) {
            var controller = this.ends[L].controller;
            var newField = new MathField(controller);
            innerFields[this.name] = newField;
            innerFields.push(newField);
        };
        MathFieldNode.prototype.latex = function () {
            return this.ends[L].latex();
        };
        MathFieldNode.prototype.text = function () {
            return this.ends[L].text();
        };
        return MathFieldNode;
    }(MathCommand));
    LatexCmds.editable = LatexCmds.MathQuillMathField = MathFieldNode; // backcompat with before cfd3620 on #233
    // Embed arbitrary things
    // Probably the closest DOM analogue would be an iframe?
    // From MathQuill's perspective, it's a MQSymbol, it can be
    // anywhere and the cursor can go around it but never in it.
    // Create by calling public API method .dropEmbedded(),
    // or by calling the global public API method .registerEmbed()
    // and rendering LaTeX like \embed{registeredName} (see test).
    var EmbedNode = /** @class */ (function (_super) {
        __extends(EmbedNode, _super);
        function EmbedNode() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        EmbedNode.prototype.setOptions = function (options) {
            function noop() {
                return '';
            }
            this.text = options.text || noop;
            this.htmlTemplate = options.htmlString || '';
            this.latex = options.latex || noop;
            return this;
        };
        EmbedNode.prototype.parser = function () {
            var self = this, string = Parser.string, regex = Parser.regex, succeed = Parser.succeed;
            return string('{')
                .then(regex(/^[a-z][a-z0-9]*/i))
                .skip(string('}'))
                .then(function (name) {
                // the chars allowed in the optional data block are arbitrary other than
                // excluding curly braces and square brackets (which'd be too confusing)
                return string('[')
                    .then(regex(/^[-\w\s]*/))
                    .skip(string(']'))
                    .or(succeed(undefined))
                    .map(function (data) {
                    return self.setOptions(EMBEDS[name](data));
                });
            });
        };
        return EmbedNode;
    }(MQSymbol));
    LatexCmds.embed = EmbedNode;
    /****************************************
     * Input box to type backslash commands
     ***************************************/
    CharCmds['\\'] = /** @class */ (function (_super) {
        __extends(LatexCommandInput, _super);
        function LatexCommandInput() {
            var _this = _super !== null && _super.apply(this, arguments) || this;
            _this.ctrlSeq = '\\';
            _this.htmlTemplate = '<span class="mq-latex-command-input mq-non-leaf">\\<span>&0</span></span>';
            _this.textTemplate = ['\\'];
            return _this;
        }
        LatexCommandInput.prototype.replaces = function (replacedFragment) {
            this._replacedFragment = replacedFragment.disown();
            this.isEmpty = function () {
                return false;
            };
        };
        LatexCommandInput.prototype.createBlocks = function () {
            _super.prototype.createBlocks.call(this);
            var endsL = this.ends[L];
            endsL.focus = function () {
                this.parent.jQ.addClass('mq-hasCursor');
                if (this.isEmpty())
                    this.parent.jQ.removeClass('mq-empty');
                return this;
            };
            endsL.blur = function () {
                this.parent.jQ.removeClass('mq-hasCursor');
                if (this.isEmpty())
                    this.parent.jQ.addClass('mq-empty');
                return this;
            };
            endsL.write = function (cursor, ch) {
                cursor.show().deleteSelection();
                if (ch.match(/[a-z]/i)) {
                    new VanillaSymbol(ch).createLeftOf(cursor);
                    // TODO needs tests
                    cursor.controller.aria.alert(ch);
                }
                else {
                    var cmd = this.parent.renderCommand(cursor);
                    // TODO needs tests
                    cursor.controller.aria.queue(cmd.mathspeak({ createdLeftOf: cursor }));
                    if (ch !== '\\' || !this.isEmpty())
                        cursor.parent.write(cursor, ch);
                    else
                        cursor.controller.aria.alert();
                }
            };
            var originalKeystroke = endsL.keystroke;
            endsL.keystroke = function (key, e, ctrlr) {
                if (key === 'Tab' || key === 'Enter' || key === 'Spacebar') {
                    var cmd = this.parent.renderCommand(ctrlr.cursor);
                    // TODO needs tests
                    ctrlr.aria.alert(cmd.mathspeak({ createdLeftOf: ctrlr.cursor }));
                    e.preventDefault();
                    return;
                }
                return originalKeystroke.call(this, key, e, ctrlr);
            };
        };
        LatexCommandInput.prototype.createLeftOf = function (cursor) {
            _super.prototype.createLeftOf.call(this, cursor);
            if (this._replacedFragment) {
                var el = this.jQ[0];
                this.jQ = this._replacedFragment.jQ
                    .addClass('mq-blur')
                    .bind('mousedown mousemove', //FIXME: is monkey-patching the mousedown and mousemove handlers the right way to do this?
                function (e) {
                    // TODO - overwritting e.target
                    e.target = el;
                    $(el).trigger(e);
                    return false;
                })
                    .insertBefore(this.jQ)
                    .add(this.jQ);
            }
        };
        LatexCommandInput.prototype.latex = function () {
            return '\\' + this.ends[L].latex() + ' ';
        };
        LatexCommandInput.prototype.renderCommand = function (cursor) {
            this.jQ = this.jQ.last();
            this.remove();
            if (this[R]) {
                cursor.insLeftOf(this[R]);
            }
            else {
                cursor.insAtRightEnd(this.parent);
            }
            var latex = this.ends[L].latex();
            if (!latex)
                latex = ' ';
            var cmd = LatexCmds[latex];
            if (cmd) {
                var node = void 0;
                if (isMQNodeClass(cmd)) {
                    node = new cmd(latex);
                }
                else {
                    node = cmd(latex);
                }
                if (this._replacedFragment)
                    node.replaces(this._replacedFragment);
                node.createLeftOf(cursor);
                return node;
            }
            else {
                var node = new TextBlock();
                node.replaces(latex);
                node.createLeftOf(cursor);
                cursor.insRightOf(node);
                if (this._replacedFragment) {
                    this._replacedFragment.remove();
                }
                return node;
            }
        };
        return LatexCommandInput;
    }(MathCommand));
    suite('ans command', function () {
        var mq;
        setup(function () {
            MQ.config({ autoCommands: 'ans' });
            mq = MQ.MathField($('<span></span>').appendTo('#mock')[0]);
        });
        teardown(function () {
            $(mq.el()).remove();
        });
        test('Typing and backspacing', function () {
            mq.typedText('2+ans');
            assert.equal(mq.latex(), '2+\\operatorname{ans}');
            mq.keystroke('Backspace');
            assert.equal(mq.latex(), '2+');
        });
        test('Parsing', function () {
            mq.latex('\\operatorname{ans}');
            assert.equal(mq.latex(), '\\operatorname{ans}');
        });
    });
    suite('aria', function () {
        var mathField;
        setup(function () {
            mathField = MQ.MathField($('<span></span>').appendTo('#mock')[0]);
        });
        function assertAriaEqual(alertText) {
            assert.equal(alertText, mathField.__controller.aria.msg);
        }
        test('typing and backspacing over simple expression', function () {
            mathField.typedText('1');
            assertAriaEqual('1');
            mathField.typedText('+');
            assertAriaEqual('plus');
            mathField.typedText('1');
            assertAriaEqual('1');
            mathField.typedText('=');
            assertAriaEqual('equals');
            mathField.typedText('2');
            assertAriaEqual('2');
            mathField.keystroke('Backspace');
            assertAriaEqual('2');
            mathField.keystroke('Backspace');
            assertAriaEqual('equals');
            mathField.keystroke('Backspace');
            assertAriaEqual('1');
            mathField.keystroke('Backspace');
            assertAriaEqual('plus');
            mathField.keystroke('Backspace');
            assertAriaEqual('1');
        });
        test('typing and backspacing a fraction', function () {
            mathField.typedText('1');
            assertAriaEqual('1');
            mathField.typedText('/');
            assertAriaEqual('over');
            mathField.typedText('2');
            assertAriaEqual('2');
            // We have logic to shorten the speak we return for common numeric fractions and superscripts.
            // While editing, however, the slightly longer form (but unambiguous) form of the item should be spoken.
            // In this case, we would shorten the fraction 1/2 to "1 half" when reading,
            // but navigating around the equation should result in "StartFraction, 1 Over 2, EndFraction."
            mathField.keystroke('Tab');
            assertAriaEqual('after StartFraction, 1 Over 2 , EndFraction');
            mathField.keystroke('Backspace');
            assertAriaEqual('end of denominator 2');
            mathField.keystroke('Backspace');
            assertAriaEqual('2');
            mathField.keystroke('Backspace');
            assertAriaEqual('Over');
            mathField.keystroke('Backspace');
            assertAriaEqual('1');
        });
        test('navigating a fraction', function () {
            mathField.typedText('1');
            assertAriaEqual('1');
            mathField.typedText('/');
            assertAriaEqual('over');
            mathField.typedText('2');
            assertAriaEqual('2');
            mathField.keystroke('Up');
            assertAriaEqual('numerator 1');
            mathField.keystroke('Down');
            assertAriaEqual('denominator 2');
            mathField.latex('');
        });
        test('typing and backspacing through parenthesies', function () {
            mathField.typedText('(');
            assertAriaEqual('left parenthesis');
            mathField.typedText('1');
            assertAriaEqual('1');
            mathField.typedText('*');
            assertAriaEqual('times');
            mathField.typedText('2');
            assertAriaEqual('2');
            mathField.typedText(')');
            assertAriaEqual('right parenthesis');
            mathField.keystroke('Backspace');
            assertAriaEqual('right parenthesis');
            mathField.keystroke('Backspace');
            assertAriaEqual('2');
            mathField.keystroke('Backspace');
            assertAriaEqual('times');
            mathField.keystroke('Backspace');
            assertAriaEqual('1');
            mathField.keystroke('Backspace');
            assertAriaEqual('left parenthesis');
        });
        test('testing beginning and end alerts', function () {
            mathField.typedText('sqrt(x)');
            mathField.keystroke('Home');
            assertAriaEqual('beginning of block "s" "q" "r" "t" left parenthesis, "x" , right parenthesis');
            mathField.keystroke('End');
            assertAriaEqual('end of block "s" "q" "r" "t" left parenthesis, "x" , right parenthesis');
            mathField.keystroke('Ctrl-Home');
            assertAriaEqual('beginning of Math Input "s" "q" "r" "t" left parenthesis, "x" , right parenthesis');
            mathField.keystroke('Ctrl-End');
            assertAriaEqual('end of Math Input "s" "q" "r" "t" left parenthesis, "x" , right parenthesis');
        });
        test('testing aria-label for interactive and static math', function (done) {
            mathField.typedText('sqrt(x)');
            mathField.blur();
            setTimeout(function () {
                assert.equal(mathField.__controller.textarea.attr('aria-label'), 'Math Input: "s" "q" "r" "t" left parenthesis, "x" , right parenthesis');
                done();
            });
            var staticMath = MQ.StaticMath($('<span class="mathquill-static-math">y=\\frac{2x}{3y}</span>').appendTo('#mock')[0]);
            assert.equal('"y" equals StartFraction, 2 "x" Over 3 "y" , EndFraction', staticMath.__controller.mathspeakSpan.text());
            assert.equal('', staticMath.getAriaLabel());
            staticMath.setAriaLabel('Static Label');
            assert.equal('Static Label: "y" equals StartFraction, 2 "x" Over 3 "y" , EndFraction', staticMath.__controller.mathspeakSpan.text());
            assert.equal('Static Label', staticMath.getAriaLabel());
            staticMath.latex('2+2');
            assert.equal('Static Label: 2 plus 2', staticMath.__controller.mathspeakSpan.text());
        });
    });
    suite('autoOperatorNames', function () {
        var mq;
        var normalConfig = {
            autoCommands: 'sum int',
        };
        var subscriptConfig = {
            autoCommands: 'sum int',
            disableAutoSubstitutionInSubscripts: true,
        };
        setup(function () {
            mq = MQ.MathField($('<span></span>').appendTo('#mock')[0]);
            mq.config(normalConfig);
        });
        function assertLatex(input, expected) {
            var result = mq.latex();
            assert.equal(result, expected, input + ", got '" + result + "', expected '" + expected + "'");
        }
        function assertText(input, expected) {
            var result = mq.text();
            assert.equal(result, expected, input + ", got '" + result + "', expected '" + expected + "'");
        }
        test('simple LaTeX parsing, typing', function () {
            function assertAutoOperatorNamesWork(str, latex) {
                var count = 0;
                var _autoUnItalicize = Letter.prototype.autoUnItalicize;
                Letter.prototype.autoUnItalicize = function () {
                    count += 1;
                    return _autoUnItalicize.apply(this, arguments);
                };
                mq.latex(str);
                assertLatex("parsing '" + str + "'", latex);
                assert.equal(count, 1);
                // Since Latex doesn't change, count should remain at 1.
                mq.latex(latex);
                assertLatex("parsing '" + latex + "'", latex);
                assert.equal(count, 1);
                mq.latex('');
                for (var i = 0; i < str.length; i += 1)
                    mq.typedText(str.charAt(i));
                assertLatex("typing '" + str + "'", latex);
                assert.equal(count, 1 + str.length);
            }
            assertAutoOperatorNamesWork('sin', '\\sin');
            assertAutoOperatorNamesWork('inf', '\\inf');
            assertAutoOperatorNamesWork('arcosh', '\\operatorname{arcosh}');
            assertAutoOperatorNamesWork('acosh', 'a\\cosh');
            assertAutoOperatorNamesWork('cosine', '\\cos ine');
            assertAutoOperatorNamesWork('arcosecant', 'ar\\operatorname{cosec}ant');
            assertAutoOperatorNamesWork('cscscscscscsc', '\\csc s\\csc s\\csc sc');
            assertAutoOperatorNamesWork('scscscscscsc', 's\\csc s\\csc s\\csc');
        });
        test('works in \\sum', function () {
            mq.typedText('sum');
            mq.typedText('sin');
            assertLatex('sum allows operatorname', '\\sum_{\\sin}^{ }');
        });
        test('works in \\int', function () {
            mq.typedText('int');
            mq.typedText('sin');
            assertLatex('int allows operatorname', '\\int_{\\sin}^{ }');
        });
        test('no auto operator names in simple subscripts when typing', function () {
            mq.config(normalConfig);
            mq.typedText('x_');
            mq.typedText('sin');
            assertLatex('subscripts turn to operatorname', 'x_{\\sin}');
            mq.latex('');
            mq.config(subscriptConfig);
            mq.typedText('x_');
            mq.typedText('sin');
            assertLatex('subscripts do not turn to operatorname', 'x_{sin}');
            mq.config(normalConfig);
        });
        test('no auto operator names in simple subscripts when pasting', function () {
            var textarea = $(mq.el()).find('textarea');
            mq.config(normalConfig);
            textarea.trigger('paste').val('x_{sin}').trigger('input');
            assertLatex('subscripts turn to operatorname', 'x_{\\sin}');
            mq.latex('');
            mq.config(subscriptConfig);
            textarea.trigger('paste').val('x_{sin}').trigger('input');
            assertLatex('subscripts do not turn to operatorname', 'x_{sin}');
            mq.config(normalConfig);
        });
        test('text() output', function () {
            function assertTranslatedCorrectly(latexStr, text) {
                mq.latex(latexStr);
                assertText('outputting ' + latexStr, text);
            }
            assertTranslatedCorrectly('\\sin', 'sin');
            assertTranslatedCorrectly('\\sin\\left(xy\\right)', 'sin(x*y)');
        });
        test('deleting', function () {
            var count = 0;
            var _autoUnItalicize = Letter.prototype.autoUnItalicize;
            Letter.prototype.autoUnItalicize = function () {
                count += 1;
                return _autoUnItalicize.apply(this, arguments);
            };
            var str = 'cscscscscscsc';
            for (var i = 0; i < str.length; i += 1)
                mq.typedText(str.charAt(i));
            assertLatex("typing '" + str + "'", '\\csc s\\csc s\\csc sc');
            assert.equal(count, str.length);
            mq.moveToLeftEnd().keystroke('Del');
            assertLatex('deleted first char', 's\\csc s\\csc s\\csc');
            assert.equal(count, str.length + 1);
            mq.typedText('c');
            assertLatex('typed back first char', '\\csc s\\csc s\\csc sc');
            assert.equal(count, str.length + 2);
            mq.typedText('+');
            assertLatex('typed plus to interrupt sequence of letters', 'c+s\\csc s\\csc s\\csc');
            assert.equal(count, str.length + 4);
            mq.keystroke('Backspace');
            assertLatex('deleted plus', '\\csc s\\csc s\\csc sc');
            assert.equal(count, str.length + 5);
        });
        suite('override autoOperatorNames', function () {
            test('basic', function () {
                mq.config({ autoOperatorNames: 'sin lol' });
                mq.typedText('arcsintrololol');
                assert.equal(mq.latex(), 'arc\\sin tro\\operatorname{lol}ol');
            });
            test('command contains non-letters', function () {
                assert.throws(function () {
                    MQ.config({ autoOperatorNames: 'e1' });
                });
            });
            test('command length less than 2', function () {
                assert.throws(function () {
                    MQ.config({ autoOperatorNames: 'e' });
                });
            });
            suite('command list not perfectly space-delimited', function () {
                test('double space', function () {
                    assert.throws(function () {
                        MQ.config({ autoOperatorNames: 'pi  theta' });
                    });
                });
                test('leading space', function () {
                    assert.throws(function () {
                        MQ.config({ autoOperatorNames: ' pi' });
                    });
                });
                test('trailing space', function () {
                    assert.throws(function () {
                        MQ.config({ autoOperatorNames: 'pi ' });
                    });
                });
            });
        });
    });
    suite('autoSubscript', function () {
        var mq;
        setup(function () {
            mq = MQ.MathField($('<span></span>').appendTo('#mock')[0], {
                autoSubscriptNumerals: true,
            });
            rootBlock = mq.__controller.root;
            controller = mq.__controller;
            cursor = controller.cursor;
        });
        test('auto subscripting variables', function () {
            mq.latex('x');
            mq.typedText('2');
            assert.equal(mq.latex(), 'x_{2}');
            mq.typedText('3');
            assert.equal(mq.latex(), 'x_{23}');
        });
        test('do not autosubscript functions', function () {
            mq.latex('sin');
            mq.typedText('2');
            assert.equal(mq.latex(), '\\sin2');
            mq.typedText('3');
            assert.equal(mq.latex(), '\\sin23');
        });
        test('autosubscript exponentiated variables', function () {
            mq.latex('x^2');
            mq.typedText('2');
            assert.equal(mq.latex(), 'x_{2}^{2}');
            mq.typedText('3');
            assert.equal(mq.latex(), 'x_{23}^{2}');
        });
        test('do not autosubscript exponentiated functions', function () {
            mq.latex('sin^{2}');
            mq.typedText('2');
            assert.equal(mq.latex(), '\\sin^{2}2');
            mq.typedText('3');
            assert.equal(mq.latex(), '\\sin^{2}23');
        });
        test('do not autosubscript subscripted functions', function () {
            mq.latex('sin_{10}');
            mq.typedText('2');
            assert.equal(mq.latex(), '\\sin_{10}2');
        });
        test('backspace through compound subscript', function () {
            mq.latex('x_{2_2}');
            //first backspace moves to cursor in subscript and peels it off
            mq.keystroke('Backspace');
            assert.equal(mq.latex(), 'x_{2}');
            //second backspace clears out remaining subscript
            mq.keystroke('Backspace');
            assert.equal(mq.latex(), 'x_{ }');
            //unpeel subscript
            mq.keystroke('Backspace');
            assert.equal(mq.latex(), 'x');
        });
        test('backspace through simple subscript', function () {
            mq.latex('x_{2+3}');
            assert.equal(cursor.parent, rootBlock, 'start in the root block');
            //backspace peels off subscripts but stays at the root block level
            mq.keystroke('Backspace');
            assert.equal(mq.latex(), 'x_{2+}');
            assert.equal(cursor.parent, rootBlock, 'backspace keeps us in the root block');
            mq.keystroke('Backspace');
            assert.equal(mq.latex(), 'x_{2}');
            assert.equal(cursor.parent, rootBlock, 'backspace keeps us in the root block');
            //second backspace clears out remaining subscript and unpeels
            mq.keystroke('Backspace');
            assert.equal(mq.latex(), 'x');
        });
        test('backspace through subscript & superscript with autosubscripting on', function () {
            mq.latex('x_2^{32}');
            //first backspace peels off the subscript
            mq.keystroke('Backspace');
            assert.equal(mq.latex(), 'x^{32}');
            //second backspace goes into the exponent
            mq.keystroke('Backspace');
            assert.equal(mq.latex(), 'x^{32}');
            //clear out exponent
            mq.keystroke('Backspace');
            mq.keystroke('Backspace');
            assert.equal(mq.latex(), 'x^{ }');
            //unpeel exponent
            mq.keystroke('Backspace');
            assert.equal(mq.latex(), 'x');
        });
    });
    suite('backspace', function () {
        var mq, rootBlock, controller, cursor;
        setup(function () {
            mq = MQ.MathField($('<span></span>').appendTo('#mock')[0]);
            rootBlock = mq.__controller.root;
            controller = mq.__controller;
            cursor = controller.cursor;
        });
        function prayWellFormedPoint(pt) {
            prayWellFormed(pt.parent, pt[L], pt[R]);
        }
        function assertLatex(latex) {
            prayWellFormedPoint(mq.__controller.cursor);
            assert.equal(mq.latex(), latex);
        }
        test('backspace through exponent', function () {
            controller.renderLatexMath('x^{nm}');
            var exp = rootBlock.ends[R], expBlock = exp.ends[L];
            assert.equal(exp.latex(), '^{nm}', 'right end el is exponent');
            assert.equal(cursor.parent, rootBlock, 'cursor is in root block');
            assert.equal(cursor[L], exp, 'cursor is at the end of root block');
            mq.keystroke('Backspace');
            assert.equal(cursor.parent, expBlock, 'cursor up goes into exponent on backspace');
            assertLatex('x^{nm}');
            mq.keystroke('Backspace');
            assert.equal(cursor.parent, expBlock, 'cursor still in exponent');
            assertLatex('x^{n}');
            mq.keystroke('Backspace');
            assert.equal(cursor.parent, expBlock, 'still in exponent, but it is empty');
            assertLatex('x^{ }');
            mq.keystroke('Backspace');
            assert.equal(cursor.parent, rootBlock, 'backspace tears down exponent');
            assertLatex('x');
        });
        test('backspace through complex fraction', function () {
            controller.renderLatexMath('1+\\frac{1}{\\frac{1}{2}+\\frac{2}{3}}');
            //first backspace moves to denominator
            mq.keystroke('Backspace');
            assertLatex('1+\\frac{1}{\\frac{1}{2}+\\frac{2}{3}}');
            //first backspace moves to denominator in denominator
            mq.keystroke('Backspace');
            assertLatex('1+\\frac{1}{\\frac{1}{2}+\\frac{2}{3}}');
            //finally delete a character
            mq.keystroke('Backspace');
            assertLatex('1+\\frac{1}{\\frac{1}{2}+\\frac{2}{ }}');
            //destroy fraction
            mq.keystroke('Backspace');
            assertLatex('1+\\frac{1}{\\frac{1}{2}+2}');
            mq.keystroke('Backspace');
            mq.keystroke('Backspace');
            assertLatex('1+\\frac{1}{\\frac{1}{2}}');
            mq.keystroke('Backspace');
            mq.keystroke('Backspace');
            assertLatex('1+\\frac{1}{\\frac{1}{ }}');
            mq.keystroke('Backspace');
            assertLatex('1+\\frac{1}{1}');
            mq.keystroke('Backspace');
            assertLatex('1+\\frac{1}{ }');
            mq.keystroke('Backspace');
            assertLatex('1+1');
        });
        test('backspace through compound subscript', function () {
            mq.latex('x_{2_2}');
            //first backspace goes into the subscript
            mq.keystroke('Backspace');
            assert.equal(mq.latex(), 'x_{2_{2}}');
            //second one goes into the subscripts' subscript
            mq.keystroke('Backspace');
            assert.equal(mq.latex(), 'x_{2_{2}}');
            mq.keystroke('Backspace');
            assert.equal(mq.latex(), 'x_{2_{ }}');
            mq.keystroke('Backspace');
            assert.equal(mq.latex(), 'x_{2}');
            mq.keystroke('Backspace');
            assert.equal(mq.latex(), 'x_{ }');
            mq.keystroke('Backspace');
            assert.equal(mq.latex(), 'x');
        });
        test('backspace through simple subscript', function () {
            mq.latex('x_{2+3}');
            assert.equal(cursor.parent, rootBlock, 'start in the root block');
            //backspace goes down
            mq.keystroke('Backspace');
            assert.equal(mq.latex(), 'x_{2+3}');
            mq.keystroke('Backspace');
            assert.equal(mq.latex(), 'x_{2+}');
            mq.keystroke('Backspace');
            assert.equal(mq.latex(), 'x_{2}');
            mq.keystroke('Backspace');
            assert.equal(mq.latex(), 'x_{ }');
            mq.keystroke('Backspace');
            assert.equal(mq.latex(), 'x');
        });
        test('backspace through subscript & superscript', function () {
            mq.latex('x_2^{32}');
            //first backspace takes us into the exponent
            mq.keystroke('Backspace');
            assert.equal(mq.latex(), 'x_{2}^{32}');
            //second backspace is within the exponent
            mq.keystroke('Backspace');
            assert.equal(mq.latex(), 'x_{2}^{3}');
            //clear out exponent
            mq.keystroke('Backspace');
            assert.equal(mq.latex(), 'x_{2}^{ }');
            //unpeel exponent
            mq.keystroke('Backspace');
            assert.equal(mq.latex(), 'x_{2}');
            //into subscript
            mq.keystroke('Backspace');
            assert.equal(mq.latex(), 'x_{2}');
            //clear out subscript
            mq.keystroke('Backspace');
            assert.equal(mq.latex(), 'x_{ }');
            //unpeel exponent
            mq.keystroke('Backspace');
            assert.equal(mq.latex(), 'x');
            //clear out math field
            mq.keystroke('Backspace');
            assert.equal(mq.latex(), '');
        });
        test('backspace through nthroot', function () {
            mq.latex('\\sqrt[3]{x}');
            //first backspace takes us inside the nthroot
            mq.keystroke('Backspace');
            assert.equal(mq.latex(), '\\sqrt[3]{x}');
            //second backspace removes the x
            mq.keystroke('Backspace');
            assert.equal(mq.latex(), '\\sqrt[3]{}');
            //third one destroys the cube root, but leaves behind the 3
            mq.keystroke('Backspace');
            assert.equal(mq.latex(), '3');
            mq.keystroke('Backspace');
            assert.equal(mq.latex(), '');
        });
        test('backspace through large operator', function () {
            mq.latex('\\sum_{n=1}^3x');
            //first backspace takes out the argument
            mq.keystroke('Backspace');
            assert.equal(mq.latex(), '\\sum_{n=1}^{3}');
            //up into the superscript
            mq.keystroke('Backspace');
            assert.equal(mq.latex(), '\\sum_{n=1}^{3}');
            //up into the superscript
            mq.keystroke('Backspace');
            assert.equal(mq.latex(), '\\sum_{n=1}^{ }');
            //destroy the sum, preserve the subscript (a little surprising)
            mq.keystroke('Backspace');
            assert.equal(mq.latex(), 'n=1');
        });
        test('backspace through text block', function () {
            mq.latex('\\text{x}');
            mq.keystroke('Backspace');
            var textBlock = rootBlock.ends[R];
            assert.equal(cursor.parent, textBlock, 'cursor is in text block');
            assert.equal(cursor[R], 0, 'cursor is at the end of text block');
            assert.equal(cursor[L].textStr, 'x', 'cursor is rightward of the x');
            assert.equal(mq.latex(), '\\text{x}', 'the x has been deleted');
            mq.keystroke('Backspace');
            assert.equal(cursor.parent, textBlock, 'cursor is still in text block');
            assert.equal(cursor[R], 0, 'cursor is at the right end of the text block');
            assert.equal(cursor[L], 0, 'cursor is at the left end of the text block');
            assert.equal(mq.latex(), '', 'the x has been deleted');
            mq.keystroke('Backspace');
            assert.equal(cursor[R], 0, 'cursor is at the right end of the root block');
            assert.equal(cursor[L], 0, 'cursor is at the left end of the root block');
            assert.equal(mq.latex(), '');
        });
        suite('empties', function () {
            test('backspace empty exponent', function () {
                mq.latex('x^{}');
                mq.keystroke('Backspace');
                assert.equal(mq.latex(), 'x');
            });
            test('backspace empty sqrt', function () {
                mq.latex('1+\\sqrt{}');
                mq.keystroke('Backspace');
                assert.equal(mq.latex(), '1+');
            });
            test('backspace empty fraction', function () {
                mq.latex('1+\\frac{}{}');
                mq.keystroke('Backspace');
                assert.equal(mq.latex(), '1+');
            });
        });
    });
    suite('CSS', function () {
        test("math field doesn't fuck up ancestor's .scrollWidth", function () {
            var container = $('<div>')
                .css({
                fontSize: '16px',
                height: '25px',
                width: '25px',
            })
                .appendTo('#mock')[0];
            assert.equal(container.scrollHeight, 25);
            assert.equal(container.scrollWidth, 25);
            var mq = MQ.MathField($('<span style="box-sizing:border-box;height:100%;width:100%"></span>').appendTo(container)[0]);
            assert.equal(container.scrollHeight, 25);
            assert.equal(container.scrollWidth, 25);
        });
        test('empty root block does not collapse', function () {
            var testEl = $('<span></span>').appendTo('#mock');
            var mq = MQ.MathField(testEl[0]);
            var rootEl = testEl.find('.mq-root-block');
            assert.ok(rootEl.hasClass('mq-empty'), 'Empty root block should have the mq-empty class name.');
            assert.ok(rootEl.height() > 0, 'Empty root block height should be above 0.');
        });
        test('empty block does not collapse', function () {
            var testEl = $('<span>\\frac{}{}</span>').appendTo('#mock');
            var mq = MQ.MathField(testEl[0]);
            var numeratorEl = testEl.find('.mq-numerator');
            assert.ok(numeratorEl.hasClass('mq-empty'), 'Empty numerator should have the mq-empty class name.');
            assert.ok(numeratorEl.height() > 0, 'Empty numerator height should be above 0.');
        });
        test('test florin spacing', function () {
            var mq, mock = $('#mock');
            mq = MathQuill.MathField($('<span></span>').appendTo(mock)[0]);
            mq.typedText("f'");
            var mqF = $(mq.el()).find('.mq-f');
            var testVal = parseFloat(mqF.css('margin-right')) - parseFloat(mqF.css('margin-left'));
            assert.ok(testVal > 0, 'this should be truthy');
        });
        test('unary PlusMinus before separator', function () {
            var mq = MQ.MathField($('<span></span>').appendTo('#mock')[0]);
            mq.latex('(-1,-1-1)-1,(+1;+1+1)+1,(\\pm1,\\pm1\\pm1)\\pm1');
            var spans = $(mq.el()).find('.mq-root-block').find('span');
            assert.equal(spans.length, 35, 'PlusMinus expression parsed incorrectly');
            function isBinaryOperator(i) {
                return $(spans[i]).hasClass('mq-binary-operator');
            }
            function assertBinaryOperator(i, s) {
                assert.ok(isBinaryOperator(i), '"' + s + '" should be binary');
            }
            function assertUnaryOperator(i, s) {
                assert.ok(!isBinaryOperator(i), '"' + s + '" should be unary');
            }
            assertUnaryOperator(1, '(-');
            assertUnaryOperator(4, '(-1,-');
            assertBinaryOperator(6, '(-1,-1-');
            assertBinaryOperator(9, '(-1,-1-1)-');
            assertUnaryOperator(13, '(-1,-1-1)-1,(+');
            assertUnaryOperator(16, '(-1,-1-1)-1,(+1;+');
            assertBinaryOperator(18, '(-1,-1-1)-1,(+1;+1+');
            assertBinaryOperator(21, '(-1,-1-1)-1,(+1;+1+1)+');
            assertUnaryOperator(25, '(-1,-1-1)-1,(+1;+1+1)+1,(pm');
            assertUnaryOperator(28, '(-1,-1-1)-1,(+1;+1+1)+1,(pm1,pm');
            assertBinaryOperator(30, '(-1,-1-1)-1,(+1;+1+1)+1,(pm1,pm1pm');
            assertBinaryOperator(33, '(-1,-1-1)-1,(+1;+1+1)+1,(pm1,pm1pm1)pm');
        });
        test('proper unary/binary within style block', function () {
            var mq = MQ.MathField($('<span></span>').appendTo('#mock')[0]);
            mq.latex('\\class{dummy}{-}2\\class{dummy}{+}4');
            var spans = $(mq.el()).find('.mq-root-block').find('span');
            assert.equal(spans.length, 6, 'PlusMinus expression parsed incorrectly');
            function isBinaryOperator(i) {
                return $(spans[i]).hasClass('mq-binary-operator');
            }
            function assertBinaryOperator(i, s) {
                assert.ok(isBinaryOperator(i), '"' + s + '" should be binary');
            }
            function assertUnaryOperator(i, s) {
                assert.ok(!isBinaryOperator(i), '"' + s + '" should be unary');
            }
            assertUnaryOperator(1, '\\class{dummy}{-}');
            assertBinaryOperator(4, '\\class{dummy}{-}2\\class{dummy}{+}');
            mq.latex('\\textcolor{red}{-}2\\textcolor{green}{+}4');
            spans = $(mq.el()).find('.mq-root-block').find('span');
            assert.equal(spans.length, 6, 'PlusMinus expression parsed incorrectly');
            assertUnaryOperator(1, '\\textcolor{red}{-}');
            assertBinaryOperator(4, '\\textcolor{red}{-}2\\textcolor{green}{+}');
            //test recursive depths
            mq.latex('\\textcolor{red}{\\class{dummy}{-}}2\\textcolor{green}{\\class{dummy}{+}}4');
            spans = $(mq.el()).find('.mq-root-block').find('span');
            assert.equal(spans.length, 8, 'PlusMinus expression parsed incorrectly');
            assertUnaryOperator(2, '\\textcolor{red}{\\class{dummy}{-}}');
            assertBinaryOperator(6, '\\textcolor{red}{\\class{dummy}{-}}2\\textcolor{green}{\\class{dummy}{+}}');
        });
        test('operator name spacing e.g. sin x', function () {
            var mq = MathQuill.MathField($('<span></span>').appendTo(mock)[0]);
            mq.typedText('sin');
            var n = jQuery('#mock var.mq-operator-name:last');
            assert.equal(n.text(), 'n');
            assert.ok(!n.is('.mq-last'));
            mq.typedText('x');
            assert.ok(n.is('.mq-last'));
            mq.keystroke('Left').typedText('(');
            assert.ok(!n.is('.mq-last'));
            mq.keystroke('Backspace').typedText('^');
            assert.ok(!n.is('.mq-last'));
            var supsub = jQuery('#mock .mq-supsub');
            assert.ok(supsub.is('.mq-after-operator-name'));
            mq.typedText('2').keystroke('Tab').typedText('(');
            assert.ok(!supsub.is('.mq-after-operator-name'));
            $(mq.el()).empty();
        });
    });
    suite('Digit Grouping', function () {
        function buildTreeRecursively($el) {
            var tree = {};
            if ($el[0].className) {
                tree.classes = $el[0].className;
            }
            if ($el[0].className.indexOf('mq-cursor') !== -1) {
                tree.classes = 'mq-cursor';
            }
            else {
                var children = $el.children();
                if (children.length) {
                    tree.content = [];
                    for (var i = 0; i < children.length; i++) {
                        tree.content.push(buildTreeRecursively($(children[i])));
                    }
                }
                else {
                    tree.content = $el[0].innerHTML;
                }
            }
            return tree;
        }
        function assertClasses(mq, expected) {
            var $el = $(mq.el());
            var actual = {
                latex: mq.latex(),
                tree: buildTreeRecursively($el.find('.mq-root-block')),
            };
            window.actual = actual;
            assert.equal(JSON.stringify(actual, null, 2), JSON.stringify(expected, null, 2));
        }
        test('edge cases', function () {
            var mq = MQ.MathField($('<span></span>').appendTo('#mock')[0], {
                enableDigitGrouping: true,
            });
            assertClasses(mq, {
                latex: '',
                tree: {
                    classes: 'mq-root-block mq-empty',
                    content: '',
                },
            });
            mq.latex('1\\ ');
            assertClasses(mq, {
                latex: '1\\ ',
                tree: {
                    classes: 'mq-root-block',
                    content: [
                        {
                            classes: 'mq-digit',
                            content: '1',
                        },
                        {
                            content: '&nbsp;',
                        },
                    ],
                },
            });
            mq.latex('\\ 1');
            assertClasses(mq, {
                latex: '\\ 1',
                tree: {
                    classes: 'mq-root-block',
                    content: [
                        {
                            content: '&nbsp;',
                        },
                        {
                            classes: 'mq-digit',
                            content: '1',
                        },
                    ],
                },
            });
            mq.latex('\\ 1\\ ');
            assertClasses(mq, {
                latex: '\\ 1\\ ',
                tree: {
                    classes: 'mq-root-block',
                    content: [
                        {
                            content: '&nbsp;',
                        },
                        {
                            classes: 'mq-digit',
                            content: '1',
                        },
                        {
                            content: '&nbsp;',
                        },
                    ],
                },
            });
            mq.latex('a');
            assertClasses(mq, {
                latex: 'a',
                tree: {
                    classes: 'mq-root-block',
                    content: [
                        {
                            content: 'a',
                        },
                    ],
                },
            });
            mq.latex('a\\ ');
            assertClasses(mq, {
                latex: 'a\\ ',
                tree: {
                    classes: 'mq-root-block',
                    content: [
                        {
                            content: 'a',
                        },
                        {
                            content: '&nbsp;',
                        },
                    ],
                },
            });
            mq.latex('\\ a');
            assertClasses(mq, {
                latex: '\\ a',
                tree: {
                    classes: 'mq-root-block',
                    content: [
                        {
                            content: '&nbsp;',
                        },
                        {
                            content: 'a',
                        },
                    ],
                },
            });
            mq.latex('a\\ a');
            assertClasses(mq, {
                latex: 'a\\ a',
                tree: {
                    classes: 'mq-root-block',
                    content: [
                        {
                            content: 'a',
                        },
                        {
                            content: '&nbsp;',
                        },
                        {
                            content: 'a',
                        },
                    ],
                },
            });
            mq.latex('\\ a\\ ');
            assertClasses(mq, {
                latex: '\\ a\\ ',
                tree: {
                    classes: 'mq-root-block',
                    content: [
                        {
                            content: '&nbsp;',
                        },
                        {
                            content: 'a',
                        },
                        {
                            content: '&nbsp;',
                        },
                    ],
                },
            });
            mq.latex('.');
            assertClasses(mq, {
                latex: '.',
                tree: {
                    classes: 'mq-root-block',
                    content: [
                        {
                            classes: 'mq-digit',
                            content: '.',
                        },
                    ],
                },
            });
            mq.latex('.\\ .');
            assertClasses(mq, {
                latex: '.\\ .',
                tree: {
                    classes: 'mq-root-block',
                    content: [
                        {
                            classes: 'mq-digit',
                            content: '.',
                        },
                        {
                            content: '&nbsp;',
                        },
                        {
                            classes: 'mq-digit',
                            content: '.',
                        },
                    ],
                },
            });
            mq.latex('..');
            assertClasses(mq, {
                latex: '..',
                tree: {
                    classes: 'mq-root-block',
                    content: [
                        {
                            classes: 'mq-digit',
                            content: '.',
                        },
                        {
                            classes: 'mq-digit',
                            content: '.',
                        },
                    ],
                },
            });
            mq.latex('2..');
            assertClasses(mq, {
                latex: '2..',
                tree: {
                    classes: 'mq-root-block',
                    content: [
                        {
                            classes: 'mq-digit',
                            content: '2',
                        },
                        {
                            classes: 'mq-digit',
                            content: '.',
                        },
                        {
                            classes: 'mq-digit',
                            content: '.',
                        },
                    ],
                },
            });
            mq.latex('..2');
            assertClasses(mq, {
                latex: '..2',
                tree: {
                    classes: 'mq-root-block',
                    content: [
                        {
                            classes: 'mq-digit',
                            content: '.',
                        },
                        {
                            classes: 'mq-digit',
                            content: '.',
                        },
                        {
                            classes: 'mq-digit',
                            content: '2',
                        },
                    ],
                },
            });
            mq.latex('\\ \\ ');
            assertClasses(mq, {
                latex: '\\ \\ ',
                tree: {
                    classes: 'mq-root-block',
                    content: [
                        {
                            content: '&nbsp;',
                        },
                        {
                            content: '&nbsp;',
                        },
                    ],
                },
            });
            mq.latex('\\ \\ \\ ');
            assertClasses(mq, {
                latex: '\\ \\ \\ ',
                tree: {
                    classes: 'mq-root-block',
                    content: [
                        {
                            content: '&nbsp;',
                        },
                        {
                            content: '&nbsp;',
                        },
                        {
                            content: '&nbsp;',
                        },
                    ],
                },
            });
            mq.latex('1234');
            assertClasses(mq, {
                latex: '1234',
                tree: {
                    classes: 'mq-root-block',
                    content: [
                        {
                            classes: 'mq-digit mq-group-leading-1',
                            content: '1',
                        },
                        {
                            classes: 'mq-digit mq-group-start',
                            content: '2',
                        },
                        {
                            classes: 'mq-digit mq-group-other',
                            content: '3',
                        },
                        {
                            classes: 'mq-digit mq-group-other',
                            content: '4',
                        },
                    ],
                },
            });
        });
        test('efficient latex updates - grouping enabled', function () {
            var mq = MQ.MathField($('<span></span>').appendTo('#mock')[0], {
                enableDigitGrouping: true,
            });
            assertClasses(mq, {
                latex: '',
                tree: {
                    classes: 'mq-root-block mq-empty',
                    content: '',
                },
            });
            mq.latex('1.2322');
            assertClasses(mq, {
                latex: '1.2322',
                tree: {
                    classes: 'mq-root-block',
                    content: [
                        {
                            classes: 'mq-digit',
                            content: '1',
                        },
                        {
                            classes: 'mq-digit',
                            content: '.',
                        },
                        {
                            classes: 'mq-digit',
                            content: '2',
                        },
                        {
                            classes: 'mq-digit',
                            content: '3',
                        },
                        {
                            classes: 'mq-digit',
                            content: '2',
                        },
                        {
                            classes: 'mq-digit',
                            content: '2',
                        },
                    ],
                },
            });
            mq.latex('1231.123');
            assertClasses(mq, {
                latex: '1231.123',
                tree: {
                    classes: 'mq-root-block',
                    content: [
                        {
                            classes: 'mq-digit mq-group-leading-1',
                            content: '1',
                        },
                        {
                            classes: 'mq-digit mq-group-start',
                            content: '2',
                        },
                        {
                            classes: 'mq-digit mq-group-other',
                            content: '3',
                        },
                        {
                            classes: 'mq-digit mq-group-other',
                            content: '1',
                        },
                        {
                            classes: 'mq-digit',
                            content: '.',
                        },
                        {
                            classes: 'mq-digit',
                            content: '1',
                        },
                        {
                            classes: 'mq-digit',
                            content: '2',
                        },
                        {
                            classes: 'mq-digit',
                            content: '3',
                        },
                    ],
                },
            });
            mq.latex('1231.432');
            assertClasses(mq, {
                latex: '1231.432',
                tree: {
                    classes: 'mq-root-block',
                    content: [
                        {
                            classes: 'mq-digit mq-group-leading-1',
                            content: '1',
                        },
                        {
                            classes: 'mq-digit mq-group-start',
                            content: '2',
                        },
                        {
                            classes: 'mq-digit mq-group-other',
                            content: '3',
                        },
                        {
                            classes: 'mq-digit mq-group-other',
                            content: '1',
                        },
                        {
                            classes: 'mq-digit',
                            content: '.',
                        },
                        {
                            classes: 'mq-digit',
                            content: '4',
                        },
                        {
                            classes: 'mq-digit',
                            content: '3',
                        },
                        {
                            classes: 'mq-digit',
                            content: '2',
                        },
                    ],
                },
            });
            mq.latex('1231232.432');
            assertClasses(mq, {
                latex: '1231232.432',
                tree: {
                    classes: 'mq-root-block',
                    content: [
                        {
                            classes: 'mq-digit mq-group-leading-1',
                            content: '1',
                        },
                        {
                            classes: 'mq-digit mq-group-start',
                            content: '2',
                        },
                        {
                            classes: 'mq-digit mq-group-other',
                            content: '3',
                        },
                        {
                            classes: 'mq-digit mq-group-other',
                            content: '1',
                        },
                        {
                            classes: 'mq-digit mq-group-start',
                            content: '2',
                        },
                        {
                            classes: 'mq-digit mq-group-other',
                            content: '3',
                        },
                        {
                            classes: 'mq-digit mq-group-other',
                            content: '2',
                        },
                        {
                            classes: 'mq-digit',
                            content: '.',
                        },
                        {
                            classes: 'mq-digit',
                            content: '4',
                        },
                        {
                            classes: 'mq-digit',
                            content: '3',
                        },
                        {
                            classes: 'mq-digit',
                            content: '2',
                        },
                    ],
                },
            });
        });
        test('efficient latex updates - grouping disabled', function () {
            var mq = MQ.MathField($('<span></span>').appendTo('#mock')[0]);
            assertClasses(mq, {
                latex: '',
                tree: {
                    classes: 'mq-root-block mq-empty',
                    content: '',
                },
            });
            mq.latex('1.2322');
            assertClasses(mq, {
                latex: '1.2322',
                tree: {
                    classes: 'mq-root-block',
                    content: [
                        {
                            classes: 'mq-digit',
                            content: '1',
                        },
                        {
                            classes: 'mq-digit',
                            content: '.',
                        },
                        {
                            classes: 'mq-digit',
                            content: '2',
                        },
                        {
                            classes: 'mq-digit',
                            content: '3',
                        },
                        {
                            classes: 'mq-digit',
                            content: '2',
                        },
                        {
                            classes: 'mq-digit',
                            content: '2',
                        },
                    ],
                },
            });
            mq.latex('1231.123');
            assertClasses(mq, {
                latex: '1231.123',
                tree: {
                    classes: 'mq-root-block',
                    content: [
                        {
                            classes: 'mq-digit',
                            content: '1',
                        },
                        {
                            classes: 'mq-digit',
                            content: '2',
                        },
                        {
                            classes: 'mq-digit',
                            content: '3',
                        },
                        {
                            classes: 'mq-digit',
                            content: '1',
                        },
                        {
                            classes: 'mq-digit',
                            content: '.',
                        },
                        {
                            classes: 'mq-digit',
                            content: '1',
                        },
                        {
                            classes: 'mq-digit',
                            content: '2',
                        },
                        {
                            classes: 'mq-digit',
                            content: '3',
                        },
                    ],
                },
            });
            mq.latex('1231.432');
            assertClasses(mq, {
                latex: '1231.432',
                tree: {
                    classes: 'mq-root-block',
                    content: [
                        {
                            classes: 'mq-digit',
                            content: '1',
                        },
                        {
                            classes: 'mq-digit',
                            content: '2',
                        },
                        {
                            classes: 'mq-digit',
                            content: '3',
                        },
                        {
                            classes: 'mq-digit',
                            content: '1',
                        },
                        {
                            classes: 'mq-digit',
                            content: '.',
                        },
                        {
                            classes: 'mq-digit',
                            content: '4',
                        },
                        {
                            classes: 'mq-digit',
                            content: '3',
                        },
                        {
                            classes: 'mq-digit',
                            content: '2',
                        },
                    ],
                },
            });
            mq.latex('1231232.432');
            assertClasses(mq, {
                latex: '1231232.432',
                tree: {
                    classes: 'mq-root-block',
                    content: [
                        {
                            classes: 'mq-digit',
                            content: '1',
                        },
                        {
                            classes: 'mq-digit',
                            content: '2',
                        },
                        {
                            classes: 'mq-digit',
                            content: '3',
                        },
                        {
                            classes: 'mq-digit',
                            content: '1',
                        },
                        {
                            classes: 'mq-digit',
                            content: '2',
                        },
                        {
                            classes: 'mq-digit',
                            content: '3',
                        },
                        {
                            classes: 'mq-digit',
                            content: '2',
                        },
                        {
                            classes: 'mq-digit',
                            content: '.',
                        },
                        {
                            classes: 'mq-digit',
                            content: '4',
                        },
                        {
                            classes: 'mq-digit',
                            content: '3',
                        },
                        {
                            classes: 'mq-digit',
                            content: '2',
                        },
                    ],
                },
            });
        });
        test('edits ignored if digit grouping disabled', function (done) {
            var mq = MQ.MathField($('<span style="width: 400px; display:inline-block"></span>').appendTo('#mock')[0]);
            assertClasses(mq, {
                latex: '',
                tree: {
                    classes: 'mq-root-block mq-empty',
                    content: '',
                },
            });
            $(mq.el()).find('textarea').focus();
            assertClasses(mq, {
                latex: '',
                tree: {
                    classes: 'mq-root-block mq-hasCursor',
                    content: [
                        {
                            classes: 'mq-cursor',
                        },
                    ],
                },
            });
            mq.typedText('1');
            assertClasses(mq, {
                latex: '1',
                tree: {
                    classes: 'mq-root-block mq-hasCursor',
                    content: [
                        {
                            classes: 'mq-digit',
                            content: '1',
                        },
                        {
                            classes: 'mq-cursor',
                        },
                    ],
                },
            });
            mq.typedText('2');
            mq.typedText('3');
            mq.typedText('4');
            assertClasses(mq, {
                latex: '1234',
                tree: {
                    classes: 'mq-root-block mq-hasCursor',
                    content: [
                        {
                            classes: 'mq-digit',
                            content: '1',
                        },
                        {
                            classes: 'mq-digit',
                            content: '2',
                        },
                        {
                            classes: 'mq-digit',
                            content: '3',
                        },
                        {
                            classes: 'mq-digit',
                            content: '4',
                        },
                        {
                            classes: 'mq-cursor',
                        },
                    ],
                },
            });
            mq.typedText('5');
            assertClasses(mq, {
                latex: '12345',
                tree: {
                    classes: 'mq-root-block mq-hasCursor',
                    content: [
                        {
                            classes: 'mq-digit',
                            content: '1',
                        },
                        {
                            classes: 'mq-digit',
                            content: '2',
                        },
                        {
                            classes: 'mq-digit',
                            content: '3',
                        },
                        {
                            classes: 'mq-digit',
                            content: '4',
                        },
                        {
                            classes: 'mq-digit',
                            content: '5',
                        },
                        {
                            classes: 'mq-cursor',
                        },
                    ],
                },
            });
            setTimeout(function () {
                assertClasses(mq, {
                    latex: '12345',
                    tree: {
                        classes: 'mq-root-block mq-hasCursor',
                        content: [
                            {
                                classes: 'mq-digit',
                                content: '1',
                            },
                            {
                                classes: 'mq-digit',
                                content: '2',
                            },
                            {
                                classes: 'mq-digit',
                                content: '3',
                            },
                            {
                                classes: 'mq-digit',
                                content: '4',
                            },
                            {
                                classes: 'mq-digit',
                                content: '5',
                            },
                            {
                                classes: 'mq-cursor',
                            },
                        ],
                    },
                });
                mq.keystroke('Left');
                assertClasses(mq, {
                    latex: '12345',
                    tree: {
                        classes: 'mq-root-block mq-hasCursor',
                        content: [
                            {
                                classes: 'mq-digit',
                                content: '1',
                            },
                            {
                                classes: 'mq-digit',
                                content: '2',
                            },
                            {
                                classes: 'mq-digit',
                                content: '3',
                            },
                            {
                                classes: 'mq-digit',
                                content: '4',
                            },
                            {
                                classes: 'mq-cursor',
                            },
                            {
                                classes: 'mq-digit',
                                content: '5',
                            },
                        ],
                    },
                });
                mq.keystroke('Backspace');
                assertClasses(mq, {
                    latex: '1235',
                    tree: {
                        classes: 'mq-root-block mq-hasCursor',
                        content: [
                            {
                                classes: 'mq-digit',
                                content: '1',
                            },
                            {
                                classes: 'mq-digit',
                                content: '2',
                            },
                            {
                                classes: 'mq-digit',
                                content: '3',
                            },
                            {
                                classes: 'mq-cursor',
                            },
                            {
                                classes: 'mq-digit',
                                content: '5',
                            },
                        ],
                    },
                });
                $(mq.el()).find('textarea').blur();
                setTimeout(function () {
                    assertClasses(mq, {
                        latex: '1235',
                        tree: {
                            classes: 'mq-root-block',
                            content: [
                                {
                                    classes: 'mq-digit',
                                    content: '1',
                                },
                                {
                                    classes: 'mq-digit',
                                    content: '2',
                                },
                                {
                                    classes: 'mq-digit',
                                    content: '3',
                                },
                                {
                                    classes: 'mq-digit',
                                    content: '5',
                                },
                            ],
                        },
                    });
                    done();
                }, 1);
            }, 1100); // should stop suppressing grouping after 1000ms
        });
        test('edits suppress digit grouping', function (done) {
            var mq = MQ.MathField($('<span style="width: 400px; display:inline-block"></span>').appendTo('#mock')[0], { enableDigitGrouping: true });
            assertClasses(mq, {
                latex: '',
                tree: {
                    classes: 'mq-root-block mq-empty',
                    content: '',
                },
            });
            $(mq.el()).find('textarea').focus();
            assertClasses(mq, {
                latex: '',
                tree: {
                    classes: 'mq-root-block mq-hasCursor',
                    content: [
                        {
                            classes: 'mq-cursor',
                        },
                    ],
                },
            });
            mq.typedText('1');
            assertClasses(mq, {
                latex: '1',
                tree: {
                    classes: 'mq-root-block mq-hasCursor mq-suppress-grouping',
                    content: [
                        {
                            classes: 'mq-digit',
                            content: '1',
                        },
                        {
                            classes: 'mq-cursor',
                        },
                    ],
                },
            });
            mq.typedText('2');
            mq.typedText('3');
            mq.typedText('4');
            assertClasses(mq, {
                latex: '1234',
                tree: {
                    classes: 'mq-root-block mq-hasCursor mq-suppress-grouping',
                    content: [
                        {
                            classes: 'mq-digit mq-group-leading-1',
                            content: '1',
                        },
                        {
                            classes: 'mq-digit mq-group-start',
                            content: '2',
                        },
                        {
                            classes: 'mq-digit mq-group-other',
                            content: '3',
                        },
                        {
                            classes: 'mq-digit mq-group-other',
                            content: '4',
                        },
                        {
                            classes: 'mq-cursor',
                        },
                    ],
                },
            });
            mq.typedText('5');
            assertClasses(mq, {
                latex: '12345',
                tree: {
                    classes: 'mq-root-block mq-hasCursor mq-suppress-grouping',
                    content: [
                        {
                            classes: 'mq-digit mq-group-leading-2',
                            content: '1',
                        },
                        {
                            classes: 'mq-digit mq-group-other',
                            content: '2',
                        },
                        {
                            classes: 'mq-digit mq-group-start',
                            content: '3',
                        },
                        {
                            classes: 'mq-digit mq-group-other',
                            content: '4',
                        },
                        {
                            classes: 'mq-digit mq-group-other',
                            content: '5',
                        },
                        {
                            classes: 'mq-cursor',
                        },
                    ],
                },
            });
            setTimeout(function () {
                assertClasses(mq, {
                    latex: '12345',
                    tree: {
                        classes: 'mq-root-block mq-hasCursor',
                        content: [
                            {
                                classes: 'mq-digit mq-group-leading-2',
                                content: '1',
                            },
                            {
                                classes: 'mq-digit mq-group-other',
                                content: '2',
                            },
                            {
                                classes: 'mq-digit mq-group-start',
                                content: '3',
                            },
                            {
                                classes: 'mq-digit mq-group-other',
                                content: '4',
                            },
                            {
                                classes: 'mq-digit mq-group-other',
                                content: '5',
                            },
                            {
                                classes: 'mq-cursor',
                            },
                        ],
                    },
                });
                mq.keystroke('Left');
                assertClasses(mq, {
                    latex: '12345',
                    tree: {
                        classes: 'mq-root-block mq-hasCursor',
                        content: [
                            {
                                classes: 'mq-digit mq-group-leading-2',
                                content: '1',
                            },
                            {
                                classes: 'mq-digit mq-group-other',
                                content: '2',
                            },
                            {
                                classes: 'mq-digit mq-group-start',
                                content: '3',
                            },
                            {
                                classes: 'mq-digit mq-group-other',
                                content: '4',
                            },
                            {
                                classes: 'mq-cursor',
                            },
                            {
                                classes: 'mq-digit mq-group-other',
                                content: '5',
                            },
                        ],
                    },
                });
                mq.keystroke('Backspace');
                assertClasses(mq, {
                    latex: '1235',
                    tree: {
                        classes: 'mq-root-block mq-hasCursor mq-suppress-grouping',
                        content: [
                            {
                                classes: 'mq-digit mq-group-leading-1',
                                content: '1',
                            },
                            {
                                classes: 'mq-digit mq-group-start',
                                content: '2',
                            },
                            {
                                classes: 'mq-digit mq-group-other',
                                content: '3',
                            },
                            {
                                classes: 'mq-cursor',
                            },
                            {
                                classes: 'mq-digit mq-group-other',
                                content: '5',
                            },
                        ],
                    },
                });
                $(mq.el()).find('textarea').blur();
                setTimeout(function () {
                    assertClasses(mq, {
                        latex: '1235',
                        tree: {
                            classes: 'mq-root-block',
                            content: [
                                {
                                    classes: 'mq-digit mq-group-leading-1',
                                    content: '1',
                                },
                                {
                                    classes: 'mq-digit mq-group-start',
                                    content: '2',
                                },
                                {
                                    classes: 'mq-digit mq-group-other',
                                    content: '3',
                                },
                                {
                                    classes: 'mq-digit mq-group-other',
                                    content: '5',
                                },
                            ],
                        },
                    });
                    done();
                }, 1);
            }, 1100); // should stop suppressing grouping after 1000ms
        });
    });
    suite('focusBlur', function () {
        function assertHasFocus(mq, name, invert) {
            assert.ok(!!invert ^ ($(mq.el()).find('textarea')[0] === document.activeElement), name + (invert ? ' does not have focus' : ' has focus'));
        }
        suite('handlers can shift focus away', function () {
            var mq, mq2, wasUpOutOfCalled;
            setup(function () {
                mq = MQ.MathField($('<span></span>').appendTo('#mock')[0], {
                    handlers: {
                        upOutOf: function () {
                            wasUpOutOfCalled = true;
                            mq2.focus();
                        },
                    },
                });
                mq2 = MQ.MathField($('<span></span>').appendTo('#mock')[0]);
                wasUpOutOfCalled = false;
            });
            function triggerUpOutOf(mq) {
                $(mq.el())
                    .find('textarea')
                    .trigger(jQuery.extend(jQuery.Event('keydown'), { which: 38 }));
                assert.ok(wasUpOutOfCalled);
            }
            test('normally', function () {
                mq.focus();
                assertHasFocus(mq, 'mq');
                triggerUpOutOf(mq);
                assertHasFocus(mq2, 'mq2');
            });
            test("even if there's a selection", function (done) {
                mq.focus();
                assertHasFocus(mq, 'mq');
                mq.typedText('asdf');
                assert.equal(mq.latex(), 'asdf');
                mq.keystroke('Shift-Left');
                setTimeout(function () {
                    assert.equal($(mq.el()).find('textarea').val(), 'f');
                    triggerUpOutOf(mq);
                    assertHasFocus(mq2, 'mq2');
                    done();
                });
            });
        });
        test('select behaves normally after blurring and re-focusing', function (done) {
            var mq = MQ.MathField($('<span></span>').appendTo('#mock')[0]);
            mq.focus();
            assertHasFocus(mq, 'mq');
            mq.typedText('asdf');
            assert.equal(mq.latex(), 'asdf');
            mq.keystroke('Shift-Left');
            setTimeout(function () {
                assert.equal($(mq.el()).find('textarea').val(), 'f');
                mq.blur();
                assertHasFocus(mq, 'mq', 'not');
                setTimeout(function () {
                    assert.equal($(mq.el()).find('textarea').val(), '');
                    mq.focus();
                    assertHasFocus(mq, 'mq');
                    mq.keystroke('Shift-Left');
                    setTimeout(function () {
                        assert.equal($(mq.el()).find('textarea').val(), 'd');
                        done();
                    });
                }, 100);
            });
        });
        test('blur event fired when math field loses focus', function (done) {
            var mq = MQ.MathField($('<span></span>').appendTo('#mock')[0]);
            mq.focus();
            assertHasFocus(mq, 'math field');
            var textarea = $('<textarea>').appendTo('#mock').focus();
            assert.ok(textarea[0] === document.activeElement, 'textarea has focus');
            setTimeout(function () {
                assert.ok(!$(mq.el()).hasClass('mq-focused'), 'math field is visibly blurred');
                $('#mock').empty();
                done();
            });
        });
    });
    suite('HTML', function () {
        function renderHtml(numBlocks, htmlTemplate) {
            var cmd = {
                id: 1,
                blocks: Array(numBlocks),
                htmlTemplate: htmlTemplate,
            };
            for (var i = 0; i < numBlocks; i += 1) {
                cmd.blocks[i] = {
                    i: i,
                    id: 2 + i,
                    join: function () {
                        return 'Block:' + this.i;
                    },
                };
            }
            return MathCommand.prototype.html.call(cmd);
        }
        test('simple HTML templates', function () {
            var htmlTemplate = '<span>A Symbol</span>';
            var html = '<span mathquill-command-id=1 aria-hidden="true">A Symbol</span>';
            assert.equal(html, renderHtml(0, htmlTemplate), 'a symbol');
            htmlTemplate = '<span>&0</span>';
            html =
                '<span mathquill-command-id=1 aria-hidden="true" mathquill-block-id=2 aria-hidden="true">Block:0</span>';
            assert.equal(html, renderHtml(1, htmlTemplate), 'same span is cmd and block');
            htmlTemplate = '<span>' + '<span>&0</span>' + '<span>&1</span>' + '</span>';
            html =
                '<span mathquill-command-id=1 aria-hidden="true">' +
                    '<span mathquill-block-id=2 aria-hidden="true">Block:0</span>' +
                    '<span mathquill-block-id=3 aria-hidden="true">Block:1</span>' +
                    '</span>';
            assert.equal(html, renderHtml(2, htmlTemplate), 'container span with two block spans');
        });
        test('context-free HTML templates', function () {
            var htmlTemplate = '<br/>';
            var html = '<br mathquill-command-id=1 aria-hidden="true"/>';
            assert.equal(html, renderHtml(0, htmlTemplate), 'self-closing tag');
            htmlTemplate =
                '<span>' +
                    '<span>&0</span>' +
                    '</span>' +
                    '<span>' +
                    '<span>&1</span>' +
                    '</span>';
            html =
                '<span mathquill-command-id=1 aria-hidden="true">' +
                    '<span mathquill-block-id=2 aria-hidden="true">Block:0</span>' +
                    '</span>' +
                    '<span mathquill-command-id=1 aria-hidden="true">' +
                    '<span mathquill-block-id=3 aria-hidden="true">Block:1</span>' +
                    '</span>';
            assert.equal(html, renderHtml(2, htmlTemplate), 'two cmd spans');
            htmlTemplate =
                '<span></span>' +
                    '<span/>' +
                    '<span>' +
                    '<span>' +
                    '<span/>' +
                    '</span>' +
                    '<span>&1</span>' +
                    '<span/>' +
                    '<span></span>' +
                    '</span>' +
                    '<span>&0</span>';
            html =
                '<span mathquill-command-id=1 aria-hidden="true"></span>' +
                    '<span mathquill-command-id=1 aria-hidden="true"/>' +
                    '<span mathquill-command-id=1 aria-hidden="true">' +
                    '<span>' +
                    '<span/>' +
                    '</span>' +
                    '<span mathquill-block-id=3 aria-hidden="true">Block:1</span>' +
                    '<span/>' +
                    '<span></span>' +
                    '</span>' +
                    '<span mathquill-command-id=1 aria-hidden="true" mathquill-block-id=2 aria-hidden="true">Block:0</span>';
            assert.equal(html, renderHtml(2, htmlTemplate), 'multiple nested cmd and block spans');
        });
    });
    suite('latex', function () {
        function assertParsesLatex(str, latex) {
            if (arguments.length < 2)
                latex = str;
            var result = latexMathParser
                .parse(str)
                .postOrder(function (node) {
                node.finalizeTree(Options.prototype);
            })
                .join('latex');
            assert.equal(result, latex, "parsing '" + str + "', got '" + result + "', expected '" + latex + "'");
        }
        test('empty LaTeX', function () {
            assertParsesLatex('');
            assertParsesLatex(' ', '');
            assertParsesLatex('{}', '');
            assertParsesLatex('   {}{} {{{}}  }', '');
        });
        test('variables', function () {
            assertParsesLatex('xyz');
        });
        test('variables that can be mathbb', function () {
            assertParsesLatex('PNZQRCH');
        });
        test('can parse mathbb symbols', function () {
            assertParsesLatex('\\P\\N\\Z\\Q\\R\\C\\H', '\\mathbb{P}\\mathbb{N}\\mathbb{Z}\\mathbb{Q}\\mathbb{R}\\mathbb{C}\\mathbb{H}');
            assertParsesLatex('\\mathbb{P}\\mathbb{N}\\mathbb{Z}\\mathbb{Q}\\mathbb{R}\\mathbb{C}\\mathbb{H}');
        });
        test('can parse mathbb error case', function () {
            assert.throws(function () {
                assertParsesLatex('\\mathbb + 2');
            });
            assert.throws(function () {
                assertParsesLatex('\\mathbb{A}');
            });
        });
        test('simple exponent', function () {
            assertParsesLatex('x^{n}');
        });
        test('block exponent', function () {
            assertParsesLatex('x^{n}', 'x^{n}');
            assertParsesLatex('x^{nm}');
            assertParsesLatex('x^{}', 'x^{ }');
        });
        test('nested exponents', function () {
            assertParsesLatex('x^{n^{m}}');
        });
        test('exponents with spaces', function () {
            assertParsesLatex('x^ 2', 'x^{2}');
            assertParsesLatex('x ^2', 'x^{2}');
        });
        test('inner groups', function () {
            assertParsesLatex('a{bc}d', 'abcd');
            assertParsesLatex('{bc}d', 'bcd');
            assertParsesLatex('a{bc}', 'abc');
            assertParsesLatex('{bc}', 'bc');
            assertParsesLatex('x^{a{bc}d}', 'x^{abcd}');
            assertParsesLatex('x^{a{bc}}', 'x^{abc}');
            assertParsesLatex('x^{{bc}}', 'x^{bc}');
            assertParsesLatex('x^{{bc}d}', 'x^{bcd}');
            assertParsesLatex('{asdf{asdf{asdf}asdf}asdf}', 'asdfasdfasdfasdfasdf');
        });
        test('commands without braces', function () {
            assertParsesLatex('\\frac12', '\\frac{1}{2}');
            assertParsesLatex('\\frac1a', '\\frac{1}{a}');
            assertParsesLatex('\\frac ab', '\\frac{a}{b}');
            assertParsesLatex('\\frac a b', '\\frac{a}{b}');
            assertParsesLatex(' \\frac a b ', '\\frac{a}{b}');
            assertParsesLatex('\\frac{1} 2', '\\frac{1}{2}');
            assertParsesLatex('\\frac{ 1 } 2', '\\frac{1}{2}');
            assert.throws(function () {
                latexMathParser.parse('\\frac');
            });
        });
        test('whitespace', function () {
            assertParsesLatex('  a + b ', 'a+b');
            assertParsesLatex('       ', '');
            assertParsesLatex('', '');
        });
        test('parens', function () {
            var tree = latexMathParser.parse('\\left(123\\right)');
            assert.ok(tree.ends[L] instanceof Bracket);
            var contents = tree.ends[L].ends[L].join('latex');
            assert.equal(contents, '123');
            assert.equal(tree.join('latex'), '\\left(123\\right)');
        });
        test('\\langle/\\rangle (issue #508)', function () {
            var tree = latexMathParser.parse('\\left\\langle 123\\right\\rangle)');
            assert.ok(tree.ends[L] instanceof Bracket);
            var contents = tree.ends[L].ends[L].join('latex');
            assert.equal(contents, '123');
            assert.equal(tree.join('latex'), '\\left\\langle 123\\right\\rangle )');
        });
        test('\\langle/\\rangle (without whitespace)', function () {
            var tree = latexMathParser.parse('\\left\\langle123\\right\\rangle)');
            assert.ok(tree.ends[L] instanceof Bracket);
            var contents = tree.ends[L].ends[L].join('latex');
            assert.equal(contents, '123');
            assert.equal(tree.join('latex'), '\\left\\langle 123\\right\\rangle )');
        });
        test('\\lVert/\\rVert', function () {
            var tree = latexMathParser.parse('\\left\\lVert 123\\right\\rVert)');
            assert.ok(tree.ends[L] instanceof Bracket);
            var contents = tree.ends[L].ends[L].join('latex');
            assert.equal(contents, '123');
            assert.equal(tree.join('latex'), '\\left\\lVert 123\\right\\rVert )');
        });
        test('\\lVert/\\rVert (without whitespace)', function () {
            var tree = latexMathParser.parse('\\left\\lVert123\\right\\rVert)');
            assert.ok(tree.ends[L] instanceof Bracket);
            var contents = tree.ends[L].ends[L].join('latex');
            assert.equal(contents, '123');
            assert.equal(tree.join('latex'), '\\left\\lVert 123\\right\\rVert )');
        });
        test('\\langler should not parse', function () {
            assert.throws(function () {
                latexMathParser.parse('\\left\\langler123\\right\\rangler');
            });
        });
        test('\\lVerte should not parse', function () {
            assert.throws(function () {
                latexMathParser.parse('\\left\\lVerte123\\right\\rVerte');
            });
        });
        test('parens with whitespace', function () {
            assertParsesLatex('\\left ( 123 \\right ) ', '\\left(123\\right)');
        });
        test('escaped whitespace', function () {
            assertParsesLatex('\\ ', '\\ ');
            assertParsesLatex('\\      ', '\\ ');
            assertParsesLatex('  \\   \\\t\t\t\\   \\\n\n\n', '\\ \\ \\ \\ ');
            assertParsesLatex('\\space\\   \\   space  ', '\\ \\ \\ space');
        });
        test('\\text', function () {
            assertParsesLatex('\\text { lol! } ', '\\text{ lol! }');
            assertParsesLatex('\\text{apples} \\ne \\text{oranges}', '\\text{apples}\\ne \\text{oranges}');
            assertParsesLatex('\\text{}', '');
        });
        test('\\textcolor', function () {
            assertParsesLatex('\\textcolor{blue}{8}', '\\textcolor{blue}{8}');
        });
        test('\\class', function () {
            assertParsesLatex('\\class{name}{8}', '\\class{name}{8}');
            assertParsesLatex('\\class{name}{8-4}', '\\class{name}{8-4}');
        });
        test('not real LaTex commands, but valid symbols', function () {
            assertParsesLatex('\\parallelogram ');
            assertParsesLatex('\\circledot ', '\\odot ');
            assertParsesLatex('\\degree ');
            assertParsesLatex('\\square ');
            assertParsesLatex('\\longdiv{1234}');
            assertParsesLatex('\\longdiv', '\\longdiv{ }');
            assertParsesLatex('⟌', '\\longdiv{ }');
            assertParsesLatex('⟌{1234}', '\\longdiv{1234}');
        });
        suite('public API', function () {
            var mq;
            setup(function () {
                mq = MQ.MathField($('<span></span>').appendTo('#mock')[0]);
            });
            suite('.latex(...)', function () {
                function assertParsesLatex(str, latex) {
                    if (arguments.length < 2)
                        latex = str;
                    mq.latex(str);
                    assert.equal(mq.latex(), latex);
                }
                test('basic rendering', function () {
                    assertParsesLatex('x = \\frac{ -b \\pm \\sqrt{ b^2 - 4ac } }{ 2a }', 'x=\\frac{-b\\pm\\sqrt{b^{2}-4ac}}{2a}');
                });
                test('re-rendering', function () {
                    assertParsesLatex('a x^2 + b x + c = 0', 'ax^{2}+bx+c=0');
                    assertParsesLatex('x = \\frac{ -b \\pm \\sqrt{ b^2 - 4ac } }{ 2a }', 'x=\\frac{-b\\pm\\sqrt{b^{2}-4ac}}{2a}');
                });
                test('empty LaTeX', function () {
                    assertParsesLatex('');
                    assertParsesLatex(' ', '');
                    assertParsesLatex('{}', '');
                    assertParsesLatex('   {}{} {{{}}  }', '');
                });
                test('coerces to a string', function () {
                    assertParsesLatex(undefined, 'undefined');
                    assertParsesLatex(null, 'null');
                    assertParsesLatex(0, '0');
                    assertParsesLatex(Infinity, 'Infinity');
                    assertParsesLatex(NaN, 'NaN');
                    assertParsesLatex(true, 'true');
                    assertParsesLatex(false, 'false');
                    assertParsesLatex({}, '[objectObject]'); // lol, the space gets ignored
                    assertParsesLatex({
                        toString: function () {
                            return 'thing';
                        },
                    }, 'thing');
                });
            });
            suite('.write(...)', function () {
                test('empty LaTeX', function () {
                    function assertParsesLatex(str, latex) {
                        if (arguments.length < 2)
                            latex = str;
                        mq.write(str);
                        assert.equal(mq.latex(), latex);
                    }
                    assertParsesLatex('');
                    assertParsesLatex(' ', '');
                    assertParsesLatex('{}', '');
                    assertParsesLatex('   {}{} {{{}}  }', '');
                });
                test('overflow triggers automatic horizontal scroll', function (done) {
                    var mqEl = mq.el();
                    var rootEl = mq.__controller.root.jQ[0];
                    var cursor = mq.__controller.cursor;
                    $(mqEl).width(10);
                    var previousScrollLeft = rootEl.scrollLeft;
                    mq.write('abc');
                    setTimeout(afterScroll, 150);
                    function afterScroll() {
                        cursor.show();
                        try {
                            assert.ok(rootEl.scrollLeft > previousScrollLeft, 'scrolls on write');
                            assert.ok(mqEl.getBoundingClientRect().right >
                                cursor.jQ[0].getBoundingClientRect().right, 'cursor right end is inside the field');
                        }
                        catch (error) {
                            done(error);
                            return;
                        }
                        done();
                    }
                });
                suite('\\sum', function () {
                    test('basic', function () {
                        mq.write('\\sum_{n=0}^5');
                        assert.equal(mq.latex(), '\\sum_{n=0}^{5}');
                        mq.write('x^n');
                        assert.equal(mq.latex(), '\\sum_{n=0}^{5}x^{n}');
                    });
                    test('only lower bound', function () {
                        mq.write('\\sum_{n=0}');
                        assert.equal(mq.latex(), '\\sum_{n=0}^{ }');
                        mq.write('x^n');
                        assert.equal(mq.latex(), '\\sum_{n=0}^{ }x^{n}');
                    });
                    test('only upper bound', function () {
                        mq.write('\\sum^5');
                        assert.equal(mq.latex(), '\\sum_{ }^{5}');
                        mq.write('x^n');
                        assert.equal(mq.latex(), '\\sum_{ }^{5}x^{n}');
                    });
                });
            });
        });
        suite('\\MathQuillMathField', function () {
            var outer, inner1, inner2;
            setup(function () {
                outer = MQ.StaticMath($('<span>\\frac{\\MathQuillMathField{x_0 + x_1 + x_2}}{\\MathQuillMathField{3}}</span>').appendTo('#mock')[0]);
                inner1 = outer.innerFields[0];
                inner2 = outer.innerFields[1];
            });
            test('initial latex', function () {
                assert.equal(inner1.latex(), 'x_{0}+x_{1}+x_{2}');
                assert.equal(inner2.latex(), '3');
                assert.equal(outer.latex(), '\\frac{x_{0}+x_{1}+x_{2}}{3}');
            });
            test('setting latex', function () {
                inner1.latex('\\sum_{i=0}^N x_i');
                inner2.latex('N');
                assert.equal(inner1.latex(), '\\sum_{i=0}^{N}x_{i}');
                assert.equal(inner2.latex(), 'N');
                assert.equal(outer.latex(), '\\frac{\\sum_{i=0}^{N}x_{i}}{N}');
            });
            test('writing latex', function () {
                inner1.write('+ x_3');
                inner2.write('+ 1');
                assert.equal(inner1.latex(), 'x_{0}+x_{1}+x_{2}+x_{3}');
                assert.equal(inner2.latex(), '3+1');
                assert.equal(outer.latex(), '\\frac{x_{0}+x_{1}+x_{2}+x_{3}}{3+1}');
            });
            test('optional inner field name', function () {
                outer.latex('\\MathQuillMathField[mantissa]{}\\cdot\\MathQuillMathField[base]{}^{\\MathQuillMathField[exp]{}}');
                assert.equal(outer.innerFields.length, 3);
                var mantissa = outer.innerFields.mantissa;
                var base = outer.innerFields.base;
                var exp = outer.innerFields.exp;
                assert.equal(mantissa, outer.innerFields[0]);
                assert.equal(base, outer.innerFields[1]);
                assert.equal(exp, outer.innerFields[2]);
                mantissa.latex('1.2345');
                base.latex('10');
                exp.latex('8');
                assert.equal(outer.latex(), '1.2345\\cdot10^{8}');
            });
            test('make inner field static and then editable', function () {
                outer.latex('y=\\MathQuillMathField[m]{\\textcolor{blue}{m}}x+\\MathQuillMathField[b]{b}');
                assert.equal(outer.innerFields.length, 2);
                // assert.equal(outer.innerFields.m.__controller.container, false);
                outer.innerFields.m.makeStatic();
                assert.equal(outer.innerFields.m.__controller.editable, false);
                assert.equal(outer.innerFields.m.__controller.container.hasClass('mq-editable-field'), false);
                assert.equal(outer.innerFields.b.__controller.editable, true);
                //ensure no errors in making static field static
                outer.innerFields.m.makeStatic();
                assert.equal(outer.innerFields.m.__controller.editable, false);
                assert.equal(outer.innerFields.m.__controller.container.hasClass('mq-editable-field'), false);
                assert.equal(outer.innerFields.b.__controller.editable, true);
                outer.innerFields.m.makeEditable();
                assert.equal(outer.innerFields.m.__controller.editable, true);
                assert.equal(outer.innerFields.m.__controller.container.hasClass('mq-editable-field'), true);
                assert.equal(outer.innerFields.b.__controller.editable, true);
                //ensure no errors with making editable field editable
                outer.innerFields.m.makeEditable();
                assert.equal(outer.innerFields.m.__controller.editable, true);
                assert.equal(outer.innerFields.m.__controller.container.hasClass('mq-editable-field'), true);
                assert.equal(outer.innerFields.b.__controller.editable, true);
            });
            test('separate API object', function () {
                var outer2 = MQ(outer.el());
                assert.equal(outer2.innerFields.length, 2);
                assert.equal(outer2.innerFields[0].id, inner1.id);
                assert.equal(outer2.innerFields[1].id, inner2.id);
            });
        });
        suite('error handling', function () {
            var mq;
            setup(function () {
                mq = MQ.MathField($('<span></span>').appendTo('#mock')[0]);
            });
            function testCantParse(title /*, latex...*/) {
                var latex = [].slice.call(arguments, 1);
                test(title, function () {
                    for (var i = 0; i < latex.length; i += 1) {
                        mq.latex(latex[i]);
                        assert.equal(mq.latex(), '', "shouldn't parse '" + latex[i] + "'");
                    }
                });
            }
            testCantParse('missing blocks', '\\frac', '\\sqrt', '^', '_');
            testCantParse('unmatched close brace', '}', ' 1 + 2 } ', '1 - {2 + 3} }', '\\sqrt{ x }} + \\sqrt{y}');
            testCantParse('unmatched open brace', '{', '1 * { 2 + 3', '\\frac{ \\sqrt x }{{ \\sqrt y}');
            testCantParse('unmatched \\left/\\right', '\\left ( 1 + 2 )', ' [ 1, 2 \\right ]');
            testCantParse('langlerfish/ranglerfish (checking for confusion with langle/rangle)', '\\left\\langlerfish 123\\right\\ranglerfish)');
        });
        suite('selectable span', function () {
            setup(function () {
                MQ.StaticMath($('<span>2&lt;x</span>').appendTo('#mock')[0]);
            });
            function selectableContent() {
                return document.querySelector('#mock .mq-selectable').textContent;
            }
            test('escapes < in textContent', function () {
                assert.equal(selectableContent(), '$2<x$');
            });
        });
    });
    suite('parser', function () {
        var string = Parser.string;
        var regex = Parser.regex;
        var letter = Parser.letter;
        var digit = Parser.digit;
        var any = Parser.any;
        var optWhitespace = Parser.optWhitespace;
        var eof = Parser.eof;
        var succeed = Parser.succeed;
        var all = Parser.all;
        test('Parser.string', function () {
            var parser = string('x');
            assert.equal(parser.parse('x'), 'x');
            assert.throws(function () {
                parser.parse('y');
            });
        });
        test('Parser.regex', function () {
            var parser = regex(/^[0-9]/);
            assert.equal(parser.parse('1'), '1');
            assert.equal(parser.parse('4'), '4');
            assert.throws(function () {
                parser.parse('x');
            });
            assert.throws(function () {
                regex(/./);
            }, 'must be anchored');
        });
        suite('then', function () {
            test('with a parser, uses the last return value', function () {
                var parser = string('x').then(string('y'));
                assert.equal(parser.parse('xy'), 'y');
                assert.throws(function () {
                    parser.parse('y');
                });
                assert.throws(function () {
                    parser.parse('xz');
                });
            });
            test('asserts that a parser is returned', function () {
                var parser1 = letter.then(function () {
                    return 'not a parser';
                });
                assert.throws(function () {
                    parser1.parse('x');
                });
                var parser2 = letter.then('x');
                assert.throws(function () {
                    letter.parse('xx');
                });
            });
            test('with a function that returns a parser, continues with that parser', function () {
                var piped;
                var parser = string('x').then(function (x) {
                    piped = x;
                    return string('y');
                });
                assert.equal(parser.parse('xy'), 'y');
                assert.equal(piped, 'x');
                assert.throws(function () {
                    parser.parse('x');
                });
            });
        });
        suite('map', function () {
            test('with a function, pipes the value in and uses that return value', function () {
                var piped;
                var parser = string('x').map(function (x) {
                    piped = x;
                    return 'y';
                });
                assert.equal(parser.parse('x'), 'y');
                assert.equal(piped, 'x');
            });
        });
        suite('result', function () {
            test('returns a constant result', function () {
                var myResult = 1;
                var oneParser = string('x').result(1);
                assert.equal(oneParser.parse('x'), 1);
                var myFn = function () { };
                var fnParser = string('x').result(myFn);
                assert.equal(fnParser.parse('x'), myFn);
            });
        });
        suite('skip', function () {
            test('uses the previous return value', function () {
                var parser = string('x').skip(string('y'));
                assert.equal(parser.parse('xy'), 'x');
                assert.throws(function () {
                    parser.parse('x');
                });
            });
        });
        suite('or', function () {
            test('two parsers', function () {
                var parser = string('x').or(string('y'));
                assert.equal(parser.parse('x'), 'x');
                assert.equal(parser.parse('y'), 'y');
                assert.throws(function () {
                    parser.parse('z');
                });
            });
            test('with then', function () {
                var parser = string('\\')
                    .then(function () {
                    return string('y');
                })
                    .or(string('z'));
                assert.equal(parser.parse('\\y'), 'y');
                assert.equal(parser.parse('z'), 'z');
                assert.throws(function () {
                    parser.parse('\\z');
                });
            });
        });
        function assertEqualArray(arr1, arr2) {
            assert.equal(arr1.join(), arr2.join());
        }
        suite('many', function () {
            test('simple case', function () {
                var letters = letter.many();
                assertEqualArray(letters.parse('x'), ['x']);
                assertEqualArray(letters.parse('xyz'), ['x', 'y', 'z']);
                assertEqualArray(letters.parse(''), []);
                assert.throws(function () {
                    letters.parse('1');
                });
                assert.throws(function () {
                    letters.parse('xyz1');
                });
            });
            test('followed by then', function () {
                var parser = string('x').many().then(string('y'));
                assert.equal(parser.parse('y'), 'y');
                assert.equal(parser.parse('xy'), 'y');
                assert.equal(parser.parse('xxxxxy'), 'y');
            });
        });
        suite('times', function () {
            test('zero case', function () {
                var zeroLetters = letter.times(0);
                assertEqualArray(zeroLetters.parse(''), []);
                assert.throws(function () {
                    zeroLetters.parse('x');
                });
            });
            test('nonzero case', function () {
                var threeLetters = letter.times(3);
                assertEqualArray(threeLetters.parse('xyz'), ['x', 'y', 'z']);
                assert.throws(function () {
                    threeLetters.parse('xy');
                });
                assert.throws(function () {
                    threeLetters.parse('xyzw');
                });
                var thenDigit = threeLetters.then(digit);
                assert.equal(thenDigit.parse('xyz1'), '1');
                assert.throws(function () {
                    thenDigit.parse('xy1');
                });
                assert.throws(function () {
                    thenDigit.parse('xyz');
                });
                assert.throws(function () {
                    thenDigit.parse('xyzw');
                });
            });
            test('with a min and max', function () {
                var someLetters = letter.times(2, 4);
                assertEqualArray(someLetters.parse('xy'), ['x', 'y']);
                assertEqualArray(someLetters.parse('xyz'), ['x', 'y', 'z']);
                assertEqualArray(someLetters.parse('xyzw'), ['x', 'y', 'z', 'w']);
                assert.throws(function () {
                    someLetters.parse('xyzwv');
                });
                assert.throws(function () {
                    someLetters.parse('x');
                });
                var thenDigit = someLetters.then(digit);
                assert.equal(thenDigit.parse('xy1'), '1');
                assert.equal(thenDigit.parse('xyz1'), '1');
                assert.equal(thenDigit.parse('xyzw1'), '1');
                assert.throws(function () {
                    thenDigit.parse('xy');
                });
                assert.throws(function () {
                    thenDigit.parse('xyzw');
                });
                assert.throws(function () {
                    thenDigit.parse('xyzwv1');
                });
                assert.throws(function () {
                    thenDigit.parse('x1');
                });
            });
            test('atLeast', function () {
                var atLeastTwo = letter.atLeast(2);
                assertEqualArray(atLeastTwo.parse('xy'), ['x', 'y']);
                assertEqualArray(atLeastTwo.parse('xyzw'), ['x', 'y', 'z', 'w']);
                assert.throws(function () {
                    atLeastTwo.parse('x');
                });
            });
        });
        suite('fail', function () {
            var fail = Parser.fail;
            var succeed = Parser.succeed;
            test('use Parser.fail to fail dynamically', function () {
                var parser = any
                    .then(function (ch) {
                    return fail('character ' + ch + ' not allowed');
                })
                    .or(string('x'));
                assert.throws(function () {
                    parser.parse('y');
                });
                assert.equal(parser.parse('x'), 'x');
            });
            test('use Parser.succeed or Parser.fail to branch conditionally', function () {
                var allowedOperator;
                var parser = string('x')
                    .then(string('+').or(string('*')))
                    .then(function (operator) {
                    if (operator === allowedOperator)
                        return succeed(operator);
                    else
                        return fail('expected ' + allowedOperator);
                })
                    .skip(string('y'));
                allowedOperator = '+';
                assert.equal(parser.parse('x+y'), '+');
                assert.throws(function () {
                    parser.parse('x*y');
                });
                allowedOperator = '*';
                assert.equal(parser.parse('x*y'), '*');
                assert.throws(function () {
                    parser.parse('x+y');
                });
            });
        });
        test('eof', function () {
            var parser = optWhitespace.skip(eof).or(all.result('default'));
            assert.equal(parser.parse('  '), '  ');
            assert.equal(parser.parse('x'), 'default');
        });
    });
    suite('paste', function () {
        var mq;
        setup(function () {
            mq = MQ.MathField($('<span></span>').appendTo('#mock')[0]);
        });
        function prayWellFormedPoint(pt) {
            prayWellFormed(pt.parent, pt[L], pt[R]);
        }
        function assertLatex(latex) {
            prayWellFormedPoint(mq.__controller.cursor);
            assert.equal(mq.latex(), latex);
        }
        suite('√', function () {
            test('sqrt symbol in empty latex', function () {
                $(mq.el()).find('textarea').trigger('paste').val('√').trigger('input');
                assertLatex('\\sqrt{ }');
            });
            test('sqrt symbol in non-empty latex', function () {
                mq.latex('1+');
                $(mq.el()).find('textarea').trigger('paste').val('√').trigger('input');
                assertLatex('1+\\sqrt{ }');
            });
            test('sqrt symbol at start of non-empty latex', function () {
                mq.latex('1+');
                mq.moveToLeftEnd();
                $(mq.el()).find('textarea').trigger('paste').val('√').trigger('input');
                assertLatex('\\sqrt{ }1+');
            });
        });
        suite('√2', function () {
            test('sqrt symbol in empty latex', function () {
                $(mq.el()).find('textarea').trigger('paste').val('√2').trigger('input');
                assertLatex('\\sqrt{ }2');
            });
            test('sqrt symbol in non-empty latex', function () {
                mq.latex('1+');
                $(mq.el()).find('textarea').trigger('paste').val('√2').trigger('input');
                assertLatex('1+\\sqrt{ }2');
            });
            test('sqrt symbol at start of non-empty latex', function () {
                mq.latex('1+');
                mq.moveToLeftEnd();
                $(mq.el()).find('textarea').trigger('paste').val('√2').trigger('input');
                assertLatex('\\sqrt{ }21+');
            });
        });
        suite('sqrt text', function () {
            test('sqrt symbol in empty latex', function () {
                $(mq.el()).find('textarea').trigger('paste').val('sqrt').trigger('input');
                assertLatex('sqrt');
            });
            test('sqrt symbol in non-empty latex', function () {
                mq.latex('1+');
                $(mq.el()).find('textarea').trigger('paste').val('sqrt').trigger('input');
                assertLatex('1+sqrt');
            });
            test('sqrt symbol at start of non-empty latex', function () {
                mq.latex('1+');
                mq.moveToLeftEnd();
                $(mq.el()).find('textarea').trigger('paste').val('sqrt').trigger('input');
                assertLatex('sqrt1+');
            });
        });
    });
    suite('Public API', function () {
        suite('global functions', function () {
            test('null', function () {
                assert.equal(MQ(), null);
                assert.equal(MQ(0), null);
                assert.equal(MQ('<span/>'), null);
                assert.equal(MQ($('<span/>')[0]), null);
                assert.equal(MQ.MathField(), null);
                assert.equal(MQ.MathField(0), null);
                assert.equal(MQ.MathField('<span/>'), null);
            });
            test('MQ.MathField()', function () {
                var el = $('<span>x^2</span>');
                var mathField = MQ.MathField(el[0]);
                assert.ok(mathField instanceof MQ.MathField);
                assert.ok(mathField instanceof MQ.EditableField);
                assert.ok(mathField instanceof MQ);
                assert.ok(mathField instanceof MathQuill);
            });
            test('interface versioning isolates prototype chain', function () {
                var mathFieldSpan = $('<span/>')[0];
                var mathField = MQ.MathField(mathFieldSpan);
                var MQ1 = MathQuill.getInterface(1);
                assert.ok(!(mathField instanceof MQ1.MathField));
                assert.ok(!(mathField instanceof MQ1.EditableField));
                assert.ok(!(mathField instanceof MQ1));
            });
            test('identity of API object returned by MQ()', function () {
                var mathFieldSpan = $('<span/>')[0];
                var mathField = MQ.MathField(mathFieldSpan);
                assert.ok(MQ(mathFieldSpan) !== mathField);
                assert.equal(MQ(mathFieldSpan).id, mathField.id);
                assert.equal(MQ(mathFieldSpan).id, MQ(mathFieldSpan).id);
                assert.equal(MQ(mathFieldSpan).data, mathField.data);
                assert.equal(MQ(mathFieldSpan).data, MQ(mathFieldSpan).data);
            });
            test('blurred when created', function () {
                var el = $('<span/>');
                MQ.MathField(el[0]);
                var rootBlock = el.find('.mq-root-block');
                assert.ok(rootBlock.hasClass('mq-empty'));
                assert.ok(!rootBlock.hasClass('mq-hasCursor'));
            });
        });
        suite('mathquill-basic', function () {
            var mq;
            setup(function () {
                mq = MQBasic.MathField($('<span></span>').appendTo('#mock')[0]);
            });
            test('typing \\', function () {
                mq.typedText('\\');
                assert.equal(mq.latex(), '\\backslash');
            });
            test('typing $', function () {
                mq.typedText('$');
                assert.equal(mq.latex(), '\\$');
            });
            test('parsing of advanced symbols', function () {
                mq.latex('\\oplus');
                assert.equal(mq.latex(), ''); // TODO: better LaTeX parse error behavior
            });
        });
        suite('basic API methods', function () {
            var mq;
            setup(function () {
                mq = MQ.MathField($('<span></span>').appendTo('#mock')[0]);
            });
            test('.revert()', function () {
                var mq = MQ.MathField($('<span>some <code>HTML</code></span>')[0]);
                assert.equal(mq.revert().html(), 'some <code>HTML</code>');
            });
            test('select, clearSelection', function () {
                mq.latex('n+\\frac{n}{2}');
                assert.ok(!mq.__controller.cursor.selection);
                mq.select();
                assert.ok(mq.hasSelection());
                assert.equal(mq.__controller.cursor.selection.join('latex'), 'n+\\frac{n}{2}');
                mq.clearSelection();
                assert.ok(!mq.hasSelection());
                assert.ok(!mq.__controller.cursor.selection);
            });
            test('selectionIsUnderlined', function () {
                mq.latex('\\underline{abc}');
                mq.select();
                assert.ok(mq.selectionIsUnderlined());
                mq.latex('abc');
                mq.select();
                assert.ok(!mq.selectionIsUnderlined());
            });
            test('select an empty mq', function () {
                assert.ok(!mq.__controller.cursor.selection);
                mq.select();
                // select on an empty mq is a noop
                assert.ok(!mq.__controller.cursor.selection);
            });
            test("latex while there's a selection", function () {
                mq.latex('a');
                assert.equal(mq.latex(), 'a');
                mq.select();
                assert.equal(mq.__controller.cursor.selection.join('latex'), 'a');
                mq.latex('b');
                assert.equal(mq.latex(), 'b');
                mq.typedText('c');
                assert.equal(mq.latex(), 'bc');
            });
            test('.html() trivial case', function () {
                mq.latex('x+y');
                assert.equal(mq.html(), '<var aria-hidden="true">x</var><span aria-hidden="true" class="mq-binary-operator">+</span><var aria-hidden="true">y</var>');
            });
            test('.text() with incomplete commands', function () {
                assert.equal(mq.text(), '');
                mq.typedText('\\');
                assert.equal(mq.text(), '\\');
                mq.typedText('s');
                assert.equal(mq.text(), '\\s');
                mq.typedText('qrt');
                assert.equal(mq.text(), '\\sqrt');
            });
            test('.text() with complete commands', function () {
                mq.latex('\\sqrt{}');
                assert.equal(mq.text(), 'sqrt()');
                mq.latex('\\nthroot[]{}');
                assert.equal(mq.text(), 'sqrt[]()');
                mq.latex('\\frac{}{}');
                assert.equal(mq.text(), '()/()');
                mq.latex('\\frac{3}{5}');
                assert.equal(mq.text(), '(3)/(5)');
                mq.latex('\\frac{3+2}{5-1}');
                assert.equal(mq.text(), '(3+2)/(5-1)');
                mq.latex('\\div');
                assert.equal(mq.text(), '[/]');
                mq.latex('^{}');
                assert.equal(mq.text(), '^( )');
                mq.latex('3^{4}');
                assert.equal(mq.text(), '3^4');
                mq.latex('3x+\\ 4');
                assert.equal(mq.text(), '3*x+ 4');
                mq.latex('x^2');
                assert.equal(mq.text(), 'x^2');
                mq.latex('');
                mq.typedText('*2*3***4');
                assert.equal(mq.text(), '*2*3***4');
            });
            test('.moveToDirEnd(dir)', function () {
                mq.latex('a x^2 + b x + c = 0');
                assert.equal(mq.__controller.cursor[L].ctrlSeq, '0');
                assert.equal(mq.__controller.cursor[R], 0);
                mq.moveToLeftEnd();
                assert.equal(mq.__controller.cursor[L], 0);
                assert.equal(mq.__controller.cursor[R].ctrlSeq, 'a');
                mq.moveToRightEnd();
                assert.equal(mq.__controller.cursor[L].ctrlSeq, '0');
                assert.equal(mq.__controller.cursor[R], 0);
            });
            test('.empty()', function () {
                mq.latex('xyz');
                mq.empty();
                assert.equal(mq.latex(), '');
            });
            test('ARIA labels', function () {
                mq.setAriaLabel('ARIA label');
                mq.setAriaPostLabel('ARIA post-label');
                assert.equal(mq.getAriaLabel(), 'ARIA label');
                assert.equal(mq.getAriaPostLabel(), 'ARIA post-label');
                mq.setAriaLabel('');
                mq.setAriaPostLabel('');
                assert.equal(mq.getAriaLabel(), 'Math Input');
                assert.equal(mq.getAriaPostLabel(), '');
            });
            test('.mathspeak()', function () {
                function assertMathSpeakEqual(a, b) {
                    assert.equal(normalize(a), normalize(b));
                    function normalize(str) {
                        return str
                            .replace(/\d(?!\d)/g, '$& ')
                            .split(/[ ,]+/)
                            .join(' ')
                            .trim();
                    }
                }
                mq.latex('123.456');
                assertMathSpeakEqual(mq.mathspeak(), '123.4 5 6');
                mq.latex('\\frac{d}{dx}\\sqrt{x}');
                assertMathSpeakEqual(mq.mathspeak(), 'StartFraction "d" Over "d" "x" EndFraction StartRoot "x" EndRoot');
                mq.latex('1+2-3\\cdot\\frac{5}{6^7}=\\left(8+9\\right)');
                assertMathSpeakEqual(mq.mathspeak(), '1 plus 2 minus 3 times StartFraction 5 Over 6 to the 7th power EndFraction equals left parenthesis 8 plus 9 right parenthesis');
                // Example 13 from http://www.gh-mathspeak.com/examples/quick-tutorial/index.php?verbosity=v&explicitness=2&interp=0
                mq.latex('d=\\sqrt{ \\left( x_2 - x_1 \\right)^2 - \\left( y_2 - y_1 \\right)^2 }');
                assertMathSpeakEqual(mq.mathspeak(), '"d" equals StartRoot left parenthesis "x" Subscript 2 Baseline minus "x" Subscript 1 Baseline right parenthesis squared minus left parenthesis "y" Subscript 2 Baseline minus "y" Subscript 1 Baseline right parenthesis squared EndRoot');
                mq.latex('').typedText('\\langle').keystroke('Spacebar').typedText('u,v'); // .latex() doesn't work yet for angle brackets :(
                assertMathSpeakEqual(mq.mathspeak(), 'left angle-bracket "u" "v" right angle-bracket');
                mq.latex('\\left| x \\right| + \\left( y \\right|');
                assertMathSpeakEqual(mq.mathspeak(), 'StartAbsoluteValue "x" EndAbsoluteValue plus left parenthesis "y" right pipe');
            });
        });
        test('edit handler interface versioning', function () {
            var count = 0;
            // interface version 2 (latest)
            var mq2 = MQ.MathField($('<span></span>').appendTo('#mock')[0], {
                handlers: {
                    edit: function (_mq) {
                        assert.equal(mq2.id, _mq.id);
                        count += 1;
                    },
                },
            });
            assert.equal(count, 0);
            mq2.latex('x^2');
            assert.equal(count, 2); // sigh, once for postOrder and once for bubble
            count = 0;
            // interface version 1
            var MQ1 = MathQuill.getInterface(1);
            var mq1 = MQ1.MathField($('<span></span>').appendTo('#mock')[0], {
                handlers: {
                    edit: function (_mq) {
                        if (count <= 2)
                            assert.equal(mq1, undefined);
                        else
                            assert.equal(mq1.id, _mq.id);
                        count += 1;
                    },
                },
            });
            assert.equal(count, 2);
        });
        suite('*OutOf handlers', function () {
            testHandlers('MQ.MathField() constructor', function (options) {
                return MQ.MathField($('<span></span>').appendTo('#mock')[0], options);
            });
            testHandlers('MQ.StaticMath() constructor', function (options) {
                return MQ.StaticMath($('<span>\\MathQuillMathField{}</span>').appendTo('#mock')[0], options).innerFields[0];
            });
            testHandlers('MQ.MathField::config()', function (options) {
                return MQ.MathField($('<span></span>').appendTo('#mock')[0]).config(options);
            });
            testHandlers('MQ.StaticMath::config() propagates down to \\MathQuillMathField{}', function (options) {
                return MQ.StaticMath($('<span>\\MathQuillMathField{}</span>').appendTo('#mock')[0]).config(options).innerFields[0];
            });
            testHandlers('.config() directly on a \\MathQuillMathField{} in a MQ.StaticMath using .innerFields', function (options) {
                return MQ.StaticMath($('<span>\\MathQuillMathField{}</span>').appendTo('#mock')[0]).innerFields[0].config(options);
            });
            suite('global MQ.config()', function () {
                testHandlers('a MQ.MathField', function (options) {
                    MQ.config(options);
                    return MQ.MathField($('<span></span>').appendTo('#mock')[0]);
                });
                testHandlers('\\MathQuillMathField{} in a MQ.StaticMath', function (options) {
                    MQ.config(options);
                    return MQ.StaticMath($('<span>\\MathQuillMathField{}</span>').appendTo('#mock')[0]).innerFields[0];
                });
                teardown(function () {
                    MQ.config({ handlers: undefined });
                });
            });
            function testHandlers(title, mathFieldMaker) {
                test(title, function () {
                    var enterCounter = 0, upCounter = 0, moveCounter = 0, deleteCounter = 0, dir = null;
                    var mq = mathFieldMaker({
                        handlers: {
                            enter: function (_mq) {
                                assert.equal(arguments.length, 1);
                                assert.equal(_mq.id, mq.id);
                                enterCounter += 1;
                            },
                            upOutOf: function (_mq) {
                                assert.equal(arguments.length, 1);
                                assert.equal(_mq.id, mq.id);
                                upCounter += 1;
                            },
                            moveOutOf: function (_dir, _mq) {
                                assert.equal(arguments.length, 2);
                                assert.equal(_mq.id, mq.id);
                                dir = _dir;
                                moveCounter += 1;
                            },
                            deleteOutOf: function (_dir, _mq) {
                                assert.equal(arguments.length, 2);
                                assert.equal(_mq.id, mq.id);
                                dir = _dir;
                                deleteCounter += 1;
                            },
                        },
                    });
                    mq.latex('n+\\frac{n}{2}'); // starts at right edge
                    assert.equal(moveCounter, 0);
                    mq.typedText('\n'); // nothing happens
                    assert.equal(enterCounter, 1);
                    mq.keystroke('Right'); // stay at right edge
                    assert.equal(moveCounter, 1);
                    assert.equal(dir, R);
                    mq.keystroke('Right'); // stay at right edge
                    assert.equal(moveCounter, 2);
                    assert.equal(dir, R);
                    mq.keystroke('Left'); // right edge of denominator
                    assert.equal(moveCounter, 2);
                    assert.equal(upCounter, 0);
                    mq.keystroke('Up'); // right edge of numerator
                    assert.equal(moveCounter, 2);
                    assert.equal(upCounter, 0);
                    mq.keystroke('Up'); // stays at right edge of numerator
                    assert.equal(upCounter, 1);
                    mq.keystroke('Up'); // stays at right edge of numerator
                    assert.equal(upCounter, 2);
                    // go to left edge
                    mq.keystroke('Left')
                        .keystroke('Left')
                        .keystroke('Left')
                        .keystroke('Left');
                    assert.equal(moveCounter, 2);
                    mq.keystroke('Left'); // stays at left edge
                    assert.equal(moveCounter, 3);
                    assert.equal(dir, L);
                    assert.equal(deleteCounter, 0);
                    mq.keystroke('Backspace'); // stays at left edge
                    assert.equal(deleteCounter, 1);
                    assert.equal(dir, L);
                    mq.keystroke('Backspace'); // stays at left edge
                    assert.equal(deleteCounter, 2);
                    assert.equal(dir, L);
                    mq.keystroke('Left'); // stays at left edge
                    assert.equal(moveCounter, 4);
                    assert.equal(dir, L);
                    $('#mock').empty();
                });
            }
        });
        suite('edit handler', function () {
            test('fires when closing a bracket expression', function () {
                var count = 0;
                var mq = MQ.MathField($('<span>').appendTo('#mock')[0], {
                    handlers: {
                        edit: function () {
                            count += 1;
                        },
                    },
                });
                mq.typedText('(3, 4');
                var countBeforeClosingBracket = count;
                mq.typedText(']');
                assert.equal(count, countBeforeClosingBracket + 1);
            });
        });
        suite('.cmd(...)', function () {
            var mq;
            setup(function () {
                mq = MQ.MathField($('<span></span>').appendTo('#mock')[0]);
            });
            test('basic', function () {
                mq.cmd('x');
                assert.equal(mq.latex(), 'x');
                mq.cmd('y');
                assert.equal(mq.latex(), 'xy');
                mq.cmd('^');
                assert.equal(mq.latex(), 'xy^{ }');
                mq.cmd('2');
                assert.equal(mq.latex(), 'xy^{2}');
                mq.keystroke('Right Shift-Left Shift-Left Shift-Left').cmd('\\sqrt');
                assert.equal(mq.latex(), '\\sqrt{xy^{2}}');
                mq.typedText('*2**');
                assert.equal(mq.latex(), '\\sqrt{xy^{2}\\cdot2\\cdot\\cdot}');
            });
            test('backslash commands are passed their name', function () {
                mq.cmd('\\alpha');
                assert.equal(mq.latex(), '\\alpha');
            });
            test('replaces selection', function () {
                mq.typedText('49').select().cmd('\\sqrt');
                assert.equal(mq.latex(), '\\sqrt{49}');
            });
            test('operator name', function () {
                mq.cmd('\\sin');
                assert.equal(mq.latex(), '\\sin');
            });
            test('nonexistent LaTeX command is noop', function () {
                mq.typedText('49').select().cmd('\\asdf').cmd('\\sqrt');
                assert.equal(mq.latex(), '\\sqrt{49}');
            });
            test('overflow triggers automatic horizontal scroll', function (done) {
                var mqEl = mq.el();
                var rootEl = mq.__controller.root.jQ[0];
                var cursor = mq.__controller.cursor;
                $(mqEl).width(10);
                var previousScrollLeft = rootEl.scrollLeft;
                mq.cmd('\\alpha');
                setTimeout(afterScroll, 150);
                function afterScroll() {
                    cursor.show();
                    try {
                        assert.ok(rootEl.scrollLeft > previousScrollLeft, 'scrolls on cmd');
                        assert.ok(mqEl.getBoundingClientRect().right >
                            cursor.jQ[0].getBoundingClientRect().right, 'cursor right end is inside the field');
                    }
                    catch (error) {
                        done(error);
                        return;
                    }
                    done();
                }
            });
        });
        suite('spaceBehavesLikeTab', function () {
            var mq, rootBlock, cursor;
            test('space behaves like tab with default opts', function () {
                mq = MQ.MathField($('<span></span>').appendTo('#mock')[0]);
                rootBlock = mq.__controller.root;
                cursor = mq.__controller.cursor;
                mq.latex('\\sqrt{x}');
                mq.keystroke('Left');
                mq.keystroke('Spacebar');
                mq.typedText(' ');
                assert.equal(cursor[L].ctrlSeq, '\\ ', 'left of the cursor is ' + cursor[L].ctrlSeq);
                assert.equal(cursor[R], 0, 'right of the cursor is ' + cursor[R]);
                mq.keystroke('Backspace');
                mq.keystroke('Shift-Spacebar');
                mq.typedText(' ');
                assert.equal(cursor[L].ctrlSeq, '\\ ', 'left of the cursor is ' + cursor[L].ctrlSeq);
                assert.equal(cursor[R], 0, 'right of the cursor is ' + cursor[R]);
            });
            test('space behaves like tab when spaceBehavesLikeTab is true', function () {
                var opts = { spaceBehavesLikeTab: true };
                mq = MQ.MathField($('<span></span>').appendTo('#mock')[0], opts);
                rootBlock = mq.__controller.root;
                cursor = mq.__controller.cursor;
                mq.latex('\\sqrt{x}');
                mq.keystroke('Left');
                mq.keystroke('Spacebar');
                assert.equal(cursor[L].parent, rootBlock, 'parent of the cursor is  ' + cursor[L].ctrlSeq);
                assert.equal(cursor[R], 0, 'right cursor is ' + cursor[R]);
                mq.keystroke('Left');
                mq.keystroke('Shift-Spacebar');
                assert.equal(cursor[L], 0, 'left cursor is ' + cursor[L]);
                assert.equal(cursor[R], rootBlock.ends[L], 'parent of rootBlock is ' + cursor[R]);
            });
            test('space behaves like tab when globally set to true', function () {
                MQ.config({ spaceBehavesLikeTab: true });
                mq = MQ.MathField($('<span></span>').appendTo('#mock')[0]);
                rootBlock = mq.__controller.root;
                cursor = mq.__controller.cursor;
                mq.latex('\\sqrt{x}');
                mq.keystroke('Left');
                mq.keystroke('Spacebar');
                assert.equal(cursor.parent, rootBlock, 'cursor in root block');
                assert.equal(cursor[R], 0, 'cursor at end of block');
            });
        });
        suite('maxDepth option', function () {
            setup(function () {
                mq = MQ.MathField($('<span></span>').appendTo('#mock')[0], {
                    maxDepth: 1,
                });
            });
            teardown(function () {
                $(mq.el()).remove();
            });
            test('prevents nested math input via .write() method', function () {
                mq.write('1\\frac{\\frac{3}{3}}{2}');
                assert.equal(mq.latex(), '1\\frac{ }{ }');
            });
            test('prevents nested math input via keyboard input', function () {
                mq.cmd('/').write('x');
                assert.equal(mq.latex(), '\\frac{ }{ }');
            });
            test('stops new fraction moving content into numerator', function () {
                mq.write('x').cmd('/');
                assert.equal(mq.latex(), 'x\\frac{ }{ }');
            });
            test('prevents nested math input via replacedFragment', function () {
                mq.cmd('(').keystroke('Left').cmd('(');
                assert.equal(mq.latex(), '\\left(\\right)');
            });
        });
        suite('statelessClipboard option', function () {
            suite('default', function () {
                var mq, textarea;
                setup(function () {
                    mq = MQ.MathField($('<span></span>').appendTo('#mock')[0]);
                    textarea = $(mq.el()).find('textarea');
                });
                function assertPaste(paste, latex) {
                    if (arguments.length < 2)
                        latex = paste;
                    mq.latex('');
                    textarea.trigger('paste').val(paste).trigger('input');
                    assert.equal(mq.latex(), latex);
                }
                test('numbers and letters', function () {
                    assertPaste('123xyz');
                });
                test('a sentence', function () {
                    assertPaste('Lorem ipsum is a placeholder text commonly used to ' +
                        'demonstrate the graphical elements of a document or ' +
                        'visual presentation.', 'Loremipsumisaplaceholdertextcommonlyusedtodemonstrate' +
                        'thegraphicalelementsofadocumentorvisualpresentation.');
                });
                test('actual LaTeX', function () {
                    assertPaste('a_{n}x^{n}+a_{n+1}x^{n+1}');
                    assertPaste('\\frac{1}{2\\sqrt{x}}');
                });
                test('\\text{...}', function () {
                    assertPaste('\\text{lol}');
                    assertPaste('1+\\text{lol}+2');
                    assertPaste('\\frac{\\text{apples}}{\\text{oranges}}');
                });
                test('selection', function (done) {
                    mq.latex('x^2').select();
                    setTimeout(function () {
                        assert.equal(textarea.val(), 'x^{2}');
                        done();
                    });
                });
            });
            suite('statelessClipboard set to true', function () {
                var mq, textarea;
                setup(function () {
                    mq = MQ.MathField($('<span></span>').appendTo('#mock')[0], {
                        statelessClipboard: true,
                    });
                    textarea = $(mq.el()).find('textarea');
                });
                function assertPaste(paste, latex) {
                    if (arguments.length < 2)
                        latex = paste;
                    mq.latex('');
                    textarea.trigger('paste').val(paste).trigger('input');
                    assert.equal(mq.latex(), latex);
                }
                test('numbers and letters', function () {
                    assertPaste('123xyz', '\\text{123xyz}');
                });
                test('a sentence', function () {
                    assertPaste('Lorem ipsum is a placeholder text commonly used to ' +
                        'demonstrate the graphical elements of a document or ' +
                        'visual presentation.', '\\text{Lorem ipsum is a placeholder text commonly used to ' +
                        'demonstrate the graphical elements of a document or ' +
                        'visual presentation.}');
                });
                test('backslashes', function () {
                    assertPaste('something \\pi something \\asdf', '\\text{something \\backslash pi something \\backslash asdf}');
                });
                // TODO: braces (currently broken)
                test('actual math LaTeX wrapped in dollar signs', function () {
                    assertPaste('$a_nx^n+a_{n+1}x^{n+1}$', 'a_{n}x^{n}+a_{n+1}x^{n+1}');
                    assertPaste('$\\frac{1}{2\\sqrt{x}}$', '\\frac{1}{2\\sqrt{x}}');
                });
                test('selection', function (done) {
                    mq.latex('x^2').select();
                    setTimeout(function () {
                        assert.equal(textarea.val(), '$x^{2}$');
                        done();
                    });
                });
            });
        });
        suite('leftRightIntoCmdGoes: "up"/"down"', function () {
            test('"up" or "down" required', function () {
                assert.throws(function () {
                    MQ.MathField($('<span></span>')[0], { leftRightIntoCmdGoes: 1 });
                });
            });
            suite('default', function () {
                var mq;
                setup(function () {
                    mq = MQ.MathField($('<span></span>').appendTo('#mock')[0]);
                });
                test('fractions', function () {
                    mq.latex('\\frac{1}{x}+\\frac{\\frac{1}{2}}{\\frac{3}{4}}');
                    assert.equal(mq.latex(), '\\frac{1}{x}+\\frac{\\frac{1}{2}}{\\frac{3}{4}}');
                    mq.moveToLeftEnd().typedText('a');
                    assert.equal(mq.latex(), 'a\\frac{1}{x}+\\frac{\\frac{1}{2}}{\\frac{3}{4}}');
                    mq.keystroke('Right').typedText('b');
                    assert.equal(mq.latex(), 'a\\frac{b1}{x}+\\frac{\\frac{1}{2}}{\\frac{3}{4}}');
                    mq.keystroke('Right Right').typedText('c');
                    assert.equal(mq.latex(), 'a\\frac{b1}{cx}+\\frac{\\frac{1}{2}}{\\frac{3}{4}}');
                    mq.keystroke('Right Right').typedText('d');
                    assert.equal(mq.latex(), 'a\\frac{b1}{cx}d+\\frac{\\frac{1}{2}}{\\frac{3}{4}}');
                    mq.keystroke('Right Right').typedText('e');
                    assert.equal(mq.latex(), 'a\\frac{b1}{cx}d+\\frac{e\\frac{1}{2}}{\\frac{3}{4}}');
                    mq.keystroke('Right').typedText('f');
                    assert.equal(mq.latex(), 'a\\frac{b1}{cx}d+\\frac{e\\frac{f1}{2}}{\\frac{3}{4}}');
                    mq.keystroke('Right Right').typedText('g');
                    assert.equal(mq.latex(), 'a\\frac{b1}{cx}d+\\frac{e\\frac{f1}{g2}}{\\frac{3}{4}}');
                    mq.keystroke('Right Right').typedText('h');
                    assert.equal(mq.latex(), 'a\\frac{b1}{cx}d+\\frac{e\\frac{f1}{g2}h}{\\frac{3}{4}}');
                    mq.keystroke('Right').typedText('i');
                    assert.equal(mq.latex(), 'a\\frac{b1}{cx}d+\\frac{e\\frac{f1}{g2}h}{i\\frac{3}{4}}');
                    mq.keystroke('Right').typedText('j');
                    assert.equal(mq.latex(), 'a\\frac{b1}{cx}d+\\frac{e\\frac{f1}{g2}h}{i\\frac{j3}{4}}');
                    mq.keystroke('Right Right').typedText('k');
                    assert.equal(mq.latex(), 'a\\frac{b1}{cx}d+\\frac{e\\frac{f1}{g2}h}{i\\frac{j3}{k4}}');
                    mq.keystroke('Right Right').typedText('l');
                    assert.equal(mq.latex(), 'a\\frac{b1}{cx}d+\\frac{e\\frac{f1}{g2}h}{i\\frac{j3}{k4}l}');
                    mq.keystroke('Right').typedText('m');
                    assert.equal(mq.latex(), 'a\\frac{b1}{cx}d+\\frac{e\\frac{f1}{g2}h}{i\\frac{j3}{k4}l}m');
                });
                test('supsub', function () {
                    mq.latex('x_a+y^b+z_a^b+w');
                    assert.equal(mq.latex(), 'x_{a}+y^{b}+z_{a}^{b}+w');
                    mq.moveToLeftEnd().typedText('1');
                    assert.equal(mq.latex(), '1x_{a}+y^{b}+z_{a}^{b}+w');
                    mq.keystroke('Right Right').typedText('2');
                    assert.equal(mq.latex(), '1x_{2a}+y^{b}+z_{a}^{b}+w');
                    mq.keystroke('Right Right').typedText('3');
                    assert.equal(mq.latex(), '1x_{2a}3+y^{b}+z_{a}^{b}+w');
                    mq.keystroke('Right Right Right').typedText('4');
                    assert.equal(mq.latex(), '1x_{2a}3+y^{4b}+z_{a}^{b}+w');
                    mq.keystroke('Right Right').typedText('5');
                    assert.equal(mq.latex(), '1x_{2a}3+y^{4b}5+z_{a}^{b}+w');
                    mq.keystroke('Right Right Right').typedText('6');
                    assert.equal(mq.latex(), '1x_{2a}3+y^{4b}5+z_{6a}^{b}+w');
                    mq.keystroke('Right Right').typedText('7');
                    assert.equal(mq.latex(), '1x_{2a}3+y^{4b}5+z_{6a}^{7b}+w');
                    mq.keystroke('Right Right').typedText('8');
                    assert.equal(mq.latex(), '1x_{2a}3+y^{4b}5+z_{6a}^{7b}8+w');
                });
                test('nthroot', function () {
                    mq.latex('\\sqrt[n]{x}');
                    assert.equal(mq.latex(), '\\sqrt[n]{x}');
                    mq.moveToLeftEnd().typedText('1');
                    assert.equal(mq.latex(), '1\\sqrt[n]{x}');
                    mq.keystroke('Right').typedText('2');
                    assert.equal(mq.latex(), '1\\sqrt[2n]{x}');
                    mq.keystroke('Right Right').typedText('3');
                    assert.equal(mq.latex(), '1\\sqrt[2n]{3x}');
                    mq.keystroke('Right Right').typedText('4');
                    assert.equal(mq.latex(), '1\\sqrt[2n]{3x}4');
                });
            });
            suite('"up"', function () {
                var mq;
                setup(function () {
                    mq = MQ.MathField($('<span></span>').appendTo('#mock')[0], {
                        leftRightIntoCmdGoes: 'up',
                    });
                });
                test('fractions', function () {
                    mq.latex('\\frac{1}{x}+\\frac{\\frac{1}{2}}{\\frac{3}{4}}');
                    assert.equal(mq.latex(), '\\frac{1}{x}+\\frac{\\frac{1}{2}}{\\frac{3}{4}}');
                    mq.moveToLeftEnd().typedText('a');
                    assert.equal(mq.latex(), 'a\\frac{1}{x}+\\frac{\\frac{1}{2}}{\\frac{3}{4}}');
                    mq.keystroke('Right').typedText('b');
                    assert.equal(mq.latex(), 'a\\frac{b1}{x}+\\frac{\\frac{1}{2}}{\\frac{3}{4}}');
                    mq.keystroke('Right Right').typedText('c');
                    assert.equal(mq.latex(), 'a\\frac{b1}{x}c+\\frac{\\frac{1}{2}}{\\frac{3}{4}}');
                    mq.keystroke('Right Right').typedText('d');
                    assert.equal(mq.latex(), 'a\\frac{b1}{x}c+\\frac{d\\frac{1}{2}}{\\frac{3}{4}}');
                    mq.keystroke('Right').typedText('e');
                    assert.equal(mq.latex(), 'a\\frac{b1}{x}c+\\frac{d\\frac{e1}{2}}{\\frac{3}{4}}');
                    mq.keystroke('Right Right').typedText('f');
                    assert.equal(mq.latex(), 'a\\frac{b1}{x}c+\\frac{d\\frac{e1}{2}f}{\\frac{3}{4}}');
                    mq.keystroke('Right').typedText('g');
                    assert.equal(mq.latex(), 'a\\frac{b1}{x}c+\\frac{d\\frac{e1}{2}f}{\\frac{3}{4}}g');
                });
                test('supsub', function () {
                    mq.latex('x_a+y^b+z_a^b+w');
                    assert.equal(mq.latex(), 'x_{a}+y^{b}+z_{a}^{b}+w');
                    mq.moveToLeftEnd().typedText('1');
                    assert.equal(mq.latex(), '1x_{a}+y^{b}+z_{a}^{b}+w');
                    mq.keystroke('Right Right').typedText('2');
                    assert.equal(mq.latex(), '1x_{2a}+y^{b}+z_{a}^{b}+w');
                    mq.keystroke('Right Right').typedText('3');
                    assert.equal(mq.latex(), '1x_{2a}3+y^{b}+z_{a}^{b}+w');
                    mq.keystroke('Right Right Right').typedText('4');
                    assert.equal(mq.latex(), '1x_{2a}3+y^{4b}+z_{a}^{b}+w');
                    mq.keystroke('Right Right').typedText('5');
                    assert.equal(mq.latex(), '1x_{2a}3+y^{4b}5+z_{a}^{b}+w');
                    mq.keystroke('Right Right Right').typedText('6');
                    assert.equal(mq.latex(), '1x_{2a}3+y^{4b}5+z_{a}^{6b}+w');
                    mq.keystroke('Right Right').typedText('7');
                    assert.equal(mq.latex(), '1x_{2a}3+y^{4b}5+z_{a}^{6b}7+w');
                });
                test('nthroot', function () {
                    mq.latex('\\sqrt[n]{x}');
                    assert.equal(mq.latex(), '\\sqrt[n]{x}');
                    mq.moveToLeftEnd().typedText('1');
                    assert.equal(mq.latex(), '1\\sqrt[n]{x}');
                    mq.keystroke('Right').typedText('2');
                    assert.equal(mq.latex(), '1\\sqrt[2n]{x}');
                    mq.keystroke('Right Right').typedText('3');
                    assert.equal(mq.latex(), '1\\sqrt[2n]{3x}');
                    mq.keystroke('Right Right').typedText('4');
                    assert.equal(mq.latex(), '1\\sqrt[2n]{3x}4');
                });
            });
        });
        suite('sumStartsWithNEquals', function () {
            test('sum defaults to empty limits', function () {
                var mq = MQ.MathField($('<span>').appendTo('#mock')[0]);
                assert.equal(mq.latex(), '');
                mq.cmd('\\sum');
                assert.equal(mq.latex(), '\\sum_{ }^{ }');
                mq.cmd('n');
                assert.equal(mq.latex(), '\\sum_{n}^{ }', 'cursor in lower limit');
            });
            test('sum starts with `n=`', function () {
                var mq = MQ.MathField($('<span>').appendTo('#mock')[0], {
                    sumStartsWithNEquals: true,
                });
                assert.equal(mq.latex(), '');
                mq.cmd('\\sum');
                assert.equal(mq.latex(), '\\sum_{n=}^{ }');
                mq.cmd('0');
                assert.equal(mq.latex(), '\\sum_{n=0}^{ }', 'cursor after the `n=`');
            });
            test('integral still has empty limits', function () {
                var mq = MQ.MathField($('<span>').appendTo('#mock')[0], {
                    sumStartsWithNEquals: true,
                });
                assert.equal(mq.latex(), '');
                mq.cmd('\\int');
                assert.equal(mq.latex(), '\\int_{ }^{ }');
                mq.cmd('0');
                assert.equal(mq.latex(), '\\int_{0}^{ }', 'cursor in the from block');
            });
        });
        suite('substituteTextarea', function () {
            test("doesn't blow up on selection", function () {
                var mq = MQ.MathField($('<span>').appendTo('#mock')[0], {
                    substituteTextarea: function () {
                        return $('<span tabindex=0 style="display:inline-block;width:1px;height:1px" />')[0];
                    },
                });
                assert.equal(mq.latex(), '');
                mq.write('asdf');
                mq.select();
            });
        });
        suite('overrideKeystroke', function () {
            test('can intercept key events', function () {
                var mq = MQ.MathField($('<span>').appendTo('#mock')[0], {
                    overrideKeystroke: function (_key, evt) {
                        key = _key;
                        return mq.keystroke.apply(mq, arguments);
                    },
                });
                var key;
                $(mq.el()).find('textarea').trigger({ type: 'keydown', which: '37' });
                assert.equal(key, 'Left');
            });
            test('cut is async', function (done) {
                var mq = MQ.MathField($('<span>').appendTo('#mock')[0], {
                    onCut: function () {
                        count += 1;
                    },
                });
                var count = 0;
                mq.latex('a=2');
                mq.select();
                $(mq.el()).find('textarea').trigger('cut');
                assert.equal(count, 0);
                $(mq.el()).find('textarea').trigger('input');
                assert.equal(count, 0);
                $(mq.el()).find('textarea').trigger('keyup');
                assert.equal(count, 0);
                setTimeout(function () {
                    assert.equal(count, 1);
                    done();
                }, 100);
            });
        });
        suite('substituteKeyboardEvents', function () {
            test('can intercept key events', function () {
                var mq = MQ.MathField($('<span>').appendTo('#mock')[0], {
                    substituteKeyboardEvents: function (textarea, handlers) {
                        return MQ.saneKeyboardEvents(textarea, jQuery.extend({}, handlers, {
                            keystroke: function (_key, evt) {
                                key = _key;
                                return handlers.keystroke.apply(handlers, arguments);
                            },
                        }));
                    },
                });
                var key;
                $(mq.el()).find('textarea').trigger({ type: 'keydown', which: '37' });
                assert.equal(key, 'Left');
            });
            test('cut is async', function () {
                var mq = MQ.MathField($('<span>').appendTo('#mock')[0], {
                    substituteKeyboardEvents: function (textarea, handlers) {
                        return MQ.saneKeyboardEvents(textarea, jQuery.extend({}, handlers, {
                            cut: function () {
                                count += 1;
                                return handlers.cut.apply(handlers, arguments);
                            },
                        }));
                    },
                });
                var count = 0;
                $(mq.el()).find('textarea').trigger('cut');
                assert.equal(count, 0);
                $(mq.el()).find('textarea').trigger('input');
                assert.equal(count, 1);
                $(mq.el()).find('textarea').trigger('keyup');
                assert.equal(count, 1);
            });
        });
        suite('clickAt', function () {
            test('inserts at coordinates', function () {
                // Insert filler so that the page is taller than the window so this test is deterministic
                // Test that we use clientY instead of pageY
                var windowHeight = $(window).height();
                var filler = $('<div>').height(windowHeight);
                filler.prependTo('#mock');
                var mq = MQ.MathField($('<span>').appendTo('#mock')[0]);
                mq.typedText('mmmm/mmmm');
                mq.el().scrollIntoView();
                var box = mq.el().getBoundingClientRect();
                var clientX = box.left + 30;
                var clientY = box.top + 30;
                var target = document.elementFromPoint(clientX, clientY);
                assert.equal(document.activeElement, document.body);
                mq.clickAt(clientX, clientY, target).write('x');
                assert.equal(document.activeElement, $(mq.el()).find('textarea')[0]);
                assert.equal(mq.latex(), '\\frac{mmmm}{mmxmm}');
            });
            test('target is optional', function () {
                // Insert filler so that the page is taller than the window so this test is deterministic
                // Test that we use clientY instead of pageY
                var windowHeight = $(window).height();
                var filler = $('<div>').height(windowHeight);
                filler.prependTo('#mock');
                var mq = MQ.MathField($('<span>').appendTo('#mock')[0]);
                mq.typedText('mmmm/mmmm');
                mq.el().scrollIntoView();
                var box = mq.el().getBoundingClientRect();
                var clientX = box.left + 30;
                var clientY = box.top + 30;
                assert.equal(document.activeElement, document.body);
                mq.clickAt(clientX, clientY).write('x');
                assert.equal(document.activeElement, $(mq.el()).find('textarea')[0]);
                assert.equal(mq.latex(), '\\frac{mmmm}{mmxmm}');
            });
        });
        suite('dropEmbedded', function () {
            test('inserts into empty', function () {
                var mq = MQ.MathField($('<span>').appendTo('#mock')[0]);
                mq.dropEmbedded(0, 0, {
                    htmlString: '<span class="embedded-html"></span>',
                    text: function () {
                        return 'embedded text';
                    },
                    latex: function () {
                        return 'embedded latex';
                    },
                });
                assert.ok(jQuery('.embedded-html').length);
                assert.equal(mq.text(), 'embedded text');
                assert.equal(mq.latex(), 'embedded latex');
            });
            test('inserts at coordinates', function () {
                // Insert filler so that the page is taller than the window so this test is deterministic
                // Test that we use clientY instead of pageY
                var windowHeight = $(window).height();
                var filler = $('<div>').height(windowHeight);
                filler.prependTo('#mock');
                var mq = MQ.MathField($('<span>').appendTo('#mock')[0]);
                mq.typedText('mmmm/mmmm');
                var pos = $(mq.el()).offset();
                var mqx = pos.left;
                var mqy = pos.top;
                mq.el().scrollIntoView();
                mq.dropEmbedded(mqx + 30, mqy + 30, {
                    htmlString: '<span class="embedded-html"></span>',
                    text: function () {
                        return 'embedded text';
                    },
                    latex: function () {
                        return 'embedded latex';
                    },
                });
                assert.ok(jQuery('.embedded-html').length);
                assert.equal(mq.text(), '(m*m*m*m)/(m*m*embedded text*m*m)');
                assert.equal(mq.latex(), '\\frac{mmmm}{mmembedded latexmm}');
            });
        });
        test('.registerEmbed()', function () {
            var calls = 0, data;
            MQ.registerEmbed('thing', function (data_) {
                calls += 1;
                data = data_;
                return {
                    htmlString: '<span class="embedded-html"></span>',
                    text: function () {
                        return 'embedded text';
                    },
                    latex: function () {
                        return 'embedded latex';
                    },
                };
            });
            var mq = MQ.MathField($('<span>\\sqrt{\\embed{thing}}</span>').appendTo('#mock')[0]);
            assert.equal(calls, 1);
            assert.equal(data, undefined);
            assert.ok(jQuery('.embedded-html').length);
            assert.equal(mq.text(), 'sqrt(embedded text)');
            assert.equal(mq.latex(), '\\sqrt{embedded latex}');
            mq.latex('\\sqrt{\\embed{thing}[data]}');
            assert.equal(calls, 2);
            assert.equal(data, 'data');
            assert.ok(jQuery('.embedded-html').length);
            assert.equal(mq.text(), 'sqrt(embedded text)');
            assert.equal(mq.latex(), '\\sqrt{embedded latex}');
        });
    });
    suite('quietEmptyDelimiters', function () {
        test('transparent class properly applied to empty delimiters when typing', function () {
            var el = $('<span></span>');
            var mq = MQ.MathField(el.appendTo('#mock')[0]);
            // Test that parens are not transparent by default.
            mq.typedText('sin(').keystroke('Tab');
            assert.equal(mq.latex(), '\\sin\\left(\\right)');
            assert.equal(el.find('.mq-quiet-delimiter').length, 0);
            // Make parens transparent and verify the mq-quiet-delimiter class is applied.
            mq.latex('');
            mq.config({
                quietEmptyDelimiters: '(',
            });
            mq.typedText('sin(').keystroke('Tab');
            assert.equal(mq.latex(), '\\sin\\left(\\right)');
            assert.equal(el.find('.mq-quiet-delimiter').length, 1);
        });
        test('transparent class properly applied to empty delimiters when setting LaTeX', function () {
            var el = $('<span></span>');
            var mq = MQ.MathField(el.appendTo('#mock')[0]);
            // Test that parens are not transparent by default.
            mq.latex('\\sin\\left(\\right)');
            assert.equal(el.find('.mq-quiet-delimiter').length, 0);
            // Make parens transparent and verify the mq-quiet-delimiter class is applied.
            mq.latex('');
            mq.config({
                quietEmptyDelimiters: '(',
            });
            mq.latex('\\sin\\left(\\right)');
            assert.equal(el.find('.mq-quiet-delimiter').length, 1);
        });
    });
    suite('resetCursorOnBlur', function () {
        var $el;
        setup(function () {
            $el = $('<span style="display:inline-block; width: 100px"></span>');
        });
        test('remembers cursor position by default', function (done) {
            var mq = MQ.MathField($el.appendTo('#mock')[0]);
            mq.latex('a=2');
            mq.focus();
            mq.keystroke('Left');
            mq.typedText('1');
            assert.equal('a=12', mq.latex());
            mq.blur();
            setTimeout(function () {
                mq.focus();
                setTimeout(function () {
                    mq.typedText('3');
                    assert.equal('a=132', mq.latex());
                    done();
                }, 1);
            }, 1);
        });
        test('forgets cursor position with resetCursorOnBlur option', function (done) {
            var mq = MQ.MathField($el.appendTo('#mock')[0], {
                resetCursorOnBlur: true,
            });
            mq.latex('a=2');
            mq.focus();
            mq.keystroke('Left');
            mq.typedText('1');
            assert.equal('a=12', mq.latex());
            mq.blur();
            setTimeout(function () {
                mq.focus();
                setTimeout(function () {
                    mq.typedText('3');
                    assert.equal('a=123', mq.latex());
                    done();
                }, 1);
            }, 1);
        });
    });
    suite('saneKeyboardEvents', function () {
        var el;
        var Event = function (type, props) {
            return jQuery.extend(jQuery.Event(type), props);
        };
        function supportsSelectionAPI() {
            return 'selectionStart' in el[0];
        }
        setup(function () {
            el = $('<textarea>').appendTo('#mock');
        });
        test('normal keys', function (done) {
            var counter = 0;
            saneKeyboardEvents(el, {
                keystroke: noop,
                typedText: function (text, keydown, keypress) {
                    counter += 1;
                    assert.ok(counter <= 1, 'callback is only called once');
                    assert.equal(text, 'a', 'text comes back as a');
                    assert.equal(el.val(), '', 'the textarea remains empty');
                    done();
                },
            });
            el.trigger(Event('keydown', { which: 97 }));
            el.trigger(Event('keypress', { which: 97 }));
            el.val('a');
        });
        test('normal keys without keypress', function (done) {
            var counter = 0;
            saneKeyboardEvents(el, {
                keystroke: noop,
                typedText: function (text) {
                    counter += 1;
                    assert.ok(counter <= 1, 'callback is only called once');
                    assert.equal(text, 'a', 'text comes back as a');
                    assert.equal(el.val(), '', 'the textarea remains empty');
                    done();
                },
            });
            el.trigger(Event('keydown', { which: 97 }));
            el.trigger(Event('keyup', { which: 97 }));
            el.val('a');
        });
        test('one keydown only', function (done) {
            var counter = 0;
            saneKeyboardEvents(el, {
                keystroke: function (key, evt) {
                    counter += 1;
                    assert.ok(counter <= 1, 'callback is called only once');
                    assert.equal(key, 'Backspace', 'key is correctly set');
                    done();
                },
            });
            el.trigger(Event('keydown', { which: 8 }));
        });
        test('a series of keydowns only', function (done) {
            var counter = 0;
            saneKeyboardEvents(el, {
                keystroke: function (key, keydown) {
                    counter += 1;
                    assert.ok(counter <= 3, 'callback is called at most 3 times');
                    assert.ok(keydown);
                    assert.equal(key, 'Left');
                    if (counter === 3)
                        done();
                },
            });
            el.trigger(Event('keydown', { which: 37 }));
            el.trigger(Event('keydown', { which: 37 }));
            el.trigger(Event('keydown', { which: 37 }));
        });
        test('one keydown and a series of keypresses', function (done) {
            var counter = 0;
            saneKeyboardEvents(el, {
                keystroke: function (key, keydown) {
                    counter += 1;
                    assert.ok(counter <= 3, 'callback is called at most 3 times');
                    assert.ok(keydown);
                    assert.equal(key, 'Backspace');
                    if (counter === 3)
                        done();
                },
            });
            el.trigger(Event('keydown', { which: 8 }));
            el.trigger(Event('keypress', { which: 8 }));
            el.trigger(Event('keypress', { which: 8 }));
            el.trigger(Event('keypress', { which: 8 }));
        });
        suite('select', function () {
            test("select populates the textarea but doesn't call .typedText()", function () {
                var shim = saneKeyboardEvents(el, { keystroke: noop });
                shim.select('foobar');
                assert.equal(el.val(), 'foobar');
                el.trigger('keydown');
                assert.equal(el.val(), 'foobar', 'value remains after keydown');
                if (supportsSelectionAPI()) {
                    el.trigger('keypress');
                    assert.equal(el.val(), 'foobar', 'value remains after keypress');
                    el.trigger('input');
                    assert.equal(el.val(), 'foobar', 'value remains after flush after keypress');
                }
            });
            test("select populates the textarea but doesn't call text" +
                ' on keydown, even when the selection is not properly' +
                ' detectable', function () {
                var shim = saneKeyboardEvents(el, { keystroke: noop });
                shim.select('foobar');
                // monkey-patch the dom-level selection so that hasSelection()
                // returns false, as in IE < 9.
                el[0].selectionStart = el[0].selectionEnd = 0;
                el.trigger('keydown');
                assert.equal(el.val(), 'foobar', 'value remains after keydown');
            });
            test('blurring', function () {
                var shim = saneKeyboardEvents(el, { keystroke: noop });
                shim.select('foobar');
                el.trigger('blur');
                el.focus();
                // IE < 9 doesn't support selection{Start,End}
                if (supportsSelectionAPI()) {
                    assert.equal(el[0].selectionStart, 0, 'it is not selected at the start');
                    assert.equal(el[0].selectionEnd, 0, 'it is not selected at the end');
                }
                assert.equal(el.val(), '', 'it has no content');
            });
            test('blur then empty selection', function () {
                var shim = saneKeyboardEvents(el, { keystroke: noop });
                shim.select('foobar');
                el.blur();
                shim.select('');
                assert.ok(document.activeElement !== el[0], 'textarea remains blurred');
            });
            test('blur in keystroke handler', function (done) {
                if (!document.hasFocus()) {
                    console.warn('The test "blur in keystroke handler" needs the document to have ' +
                        'focus. Only when the document has focus does .select() on an ' +
                        'element also focus it, which is part of the problematic behavior ' +
                        'we are testing robustness against. (Specifically, erroneously ' +
                        'calling .select() in a timeout after the textarea has blurred, ' +
                        '"stealing back" focus.)\n' +
                        'Normally, the page being open and focused is enough to have focus, ' +
                        'but with the Developer Tools open, it depends on whether you last ' +
                        'clicked on something in the Developer Tools or on the page itself. ' +
                        'Click the page, or close the Developer Tools, and Refresh.');
                    $('#mock').empty(); // LOL next line skips teardown https://git.io/vaUWq
                    this.skip();
                }
                var shim = saneKeyboardEvents(el, {
                    keystroke: function (key) {
                        assert.equal(key, 'Left');
                        el[0].blur();
                    },
                });
                shim.select('foobar');
                assert.ok(document.activeElement === el[0], 'textarea focused');
                el.trigger(Event('keydown', { which: 37 }));
                assert.ok(document.activeElement !== el[0], 'textarea blurred');
                setTimeout(function () {
                    assert.ok(document.activeElement !== el[0], 'textarea remains blurred');
                    done();
                });
            });
            suite("selected text after keypress or paste doesn't get mistaken" +
                ' for inputted text', function () {
                test('select() immediately after paste', function () {
                    var pastedText;
                    var onPaste = function (text) {
                        pastedText = text;
                    };
                    var shim = saneKeyboardEvents(el, {
                        paste: function (text) {
                            onPaste(text);
                        },
                    });
                    el.trigger('paste').val('$x^2+1$');
                    shim.select('$\\frac{x^2+1}{2}$');
                    assert.equal(pastedText, '$x^2+1$');
                    assert.equal(el.val(), '$\\frac{x^2+1}{2}$');
                    onPaste = null;
                    shim.select('$2$');
                    assert.equal(el.val(), '$2$');
                });
                test('select() after paste/input', function () {
                    var pastedText;
                    var onPaste = function (text) {
                        pastedText = text;
                    };
                    var shim = saneKeyboardEvents(el, {
                        paste: function (text) {
                            onPaste(text);
                        },
                    });
                    el.trigger('paste').val('$x^2+1$');
                    el.trigger('input');
                    assert.equal(pastedText, '$x^2+1$');
                    assert.equal(el.val(), '');
                    onPaste = null;
                    shim.select('$\\frac{x^2+1}{2}$');
                    assert.equal(el.val(), '$\\frac{x^2+1}{2}$');
                    shim.select('$2$');
                    assert.equal(el.val(), '$2$');
                });
                test('select() immediately after keydown/keypress', function () {
                    var typedText;
                    var onText = function (text) {
                        typedText = text;
                    };
                    var shim = saneKeyboardEvents(el, {
                        keystroke: noop,
                        typedText: function (text) {
                            onText(text);
                        },
                    });
                    el.trigger(Event('keydown', { which: 97 }));
                    el.trigger(Event('keypress', { which: 97 }));
                    el.val('a');
                    shim.select('$\\frac{a}{2}$');
                    assert.equal(typedText, 'a');
                    assert.equal(el.val(), '$\\frac{a}{2}$');
                    onText = null;
                    shim.select('$2$');
                    assert.equal(el.val(), '$2$');
                });
                test('select() after keydown/keypress/input', function () {
                    var typedText;
                    var onText = function (text) {
                        typedText = text;
                    };
                    var shim = saneKeyboardEvents(el, {
                        keystroke: noop,
                        typedText: function (text) {
                            onText(text);
                        },
                    });
                    el.trigger(Event('keydown', { which: 97 }));
                    el.trigger(Event('keypress', { which: 97 }));
                    el.val('a');
                    el.trigger('input');
                    assert.equal(typedText, 'a');
                    onText = null;
                    shim.select('$\\frac{a}{2}$');
                    assert.equal(el.val(), '$\\frac{a}{2}$');
                    shim.select('$2$');
                    assert.equal(el.val(), '$2$');
                });
                suite('unrecognized keys that move cursor and clear selection', function () {
                    test('without keypress', function () {
                        var shim = saneKeyboardEvents(el, { keystroke: noop });
                        shim.select('a');
                        assert.equal(el.val(), 'a');
                        if (!supportsSelectionAPI())
                            return;
                        el.trigger(Event('keydown', { which: 37, altKey: true }));
                        el[0].selectionEnd = 0;
                        el.trigger(Event('keyup', { which: 37, altKey: true }));
                        assert.ok(el[0].selectionStart !== el[0].selectionEnd);
                        el.blur();
                        shim.select('');
                        assert.ok(document.activeElement !== el[0], 'textarea remains blurred');
                    });
                    test('with keypress, many characters selected', function () {
                        var shim = saneKeyboardEvents(el, { keystroke: noop });
                        shim.select('many characters');
                        assert.equal(el.val(), 'many characters');
                        if (!supportsSelectionAPI())
                            return;
                        el.trigger(Event('keydown', { which: 37, altKey: true }));
                        el.trigger(Event('keypress', { which: 37, altKey: true }));
                        el[0].selectionEnd = 0;
                        el.trigger('keyup');
                        assert.ok(el[0].selectionStart !== el[0].selectionEnd);
                        el.blur();
                        shim.select('');
                        assert.ok(document.activeElement !== el[0], 'textarea remains blurred');
                    });
                    test('with keypress, only 1 character selected', function () {
                        var count = 0;
                        var shim = saneKeyboardEvents(el, {
                            keystroke: noop,
                            typedText: function (ch) {
                                assert.equal(ch, 'a');
                                assert.equal(el.val(), '');
                                count += 1;
                            },
                        });
                        shim.select('a');
                        assert.equal(el.val(), 'a');
                        if (!supportsSelectionAPI())
                            return;
                        el.trigger(Event('keydown', { which: 37, altKey: true }));
                        el.trigger(Event('keypress', { which: 37, altKey: true }));
                        el[0].selectionEnd = 0;
                        el.trigger('keyup');
                        assert.equal(count, 1);
                        el.blur();
                        shim.select('');
                        assert.ok(document.activeElement !== el[0], 'textarea remains blurred');
                    });
                });
            });
        });
        suite('paste', function () {
            test('paste event only', function (done) {
                saneKeyboardEvents(el, {
                    paste: function (text) {
                        assert.equal(text, '$x^2+1$');
                        done();
                    },
                });
                el.trigger('paste');
                el.val('$x^2+1$');
            });
            test('paste after keydown/keypress', function (done) {
                saneKeyboardEvents(el, {
                    keystroke: noop,
                    paste: function (text) {
                        assert.equal(text, 'foobar');
                        done();
                    },
                });
                // Ctrl-V in Firefox or Opera, according to unixpapa.com/js/key.html
                // without an `input` event
                el.trigger('keydown', { which: 86, ctrlKey: true });
                el.trigger('keypress', { which: 118, ctrlKey: true });
                el.trigger('paste');
                el.val('foobar');
            });
            test('paste after keydown/keypress/input', function (done) {
                saneKeyboardEvents(el, {
                    keystroke: noop,
                    paste: function (text) {
                        assert.equal(text, 'foobar');
                        done();
                    },
                });
                // Ctrl-V in Firefox or Opera, according to unixpapa.com/js/key.html
                // with an `input` event
                el.trigger('keydown', { which: 86, ctrlKey: true });
                el.trigger('keypress', { which: 118, ctrlKey: true });
                el.trigger('paste');
                el.val('foobar');
                el.trigger('input');
            });
            test('keypress timeout happening before paste timeout', function (done) {
                saneKeyboardEvents(el, {
                    keystroke: noop,
                    paste: function (text) {
                        assert.equal(text, 'foobar');
                        done();
                    },
                });
                el.trigger('keydown', { which: 86, ctrlKey: true });
                el.trigger('keypress', { which: 118, ctrlKey: true });
                el.trigger('paste');
                el.val('foobar');
                // this synthesizes the keypress timeout calling handleText()
                // before the paste timeout happens.
                el.trigger('input');
            });
            test('pasting into a focused textarea should not fire a redundant focus event', function (done) {
                el.focus();
                var focusCalled = false;
                el.focus(function () {
                    focusCalled = true;
                });
                saneKeyboardEvents(el, {
                    paste: function () {
                        assert.ok(!focusCalled, 'Pasting into a focused mathquill should not fire a focus event');
                        done();
                    },
                });
                // Simulate a paste
                el.trigger('paste');
                el.val('2');
                el.trigger('input');
            });
        });
        suite('copy', function () {
            test('only runs handler once even if handler synchronously selects', function () {
                // ...which MathQuill does and resulted in a stack overflow: https://git.io/vosm0
                var shim = saneKeyboardEvents(el, {
                    copy: function () {
                        shim.select();
                    },
                });
                el.trigger('copy');
            });
        });
    });
    suite('scrollHoriz', function () {
        var mq;
        var $el;
        setup(function () {
            $el = $('<span style="display:inline-block; width: 100px"></span>');
            mq = MQ.MathField($el.appendTo('#mock')[0]);
        });
        test('classes added as expected', function (done) {
            mq.latex('beginning ------------ end');
            var $root = $el.find('.mq-root-block');
            assert.ok($root.is(':not(.mq-editing-overflow-left)'), 'no left overflow class');
            assert.ok($root.is(':not(.mq-editing-overflow-right)'), 'no right overflow class');
            assert.equal($root.scrollLeft(), 0, 'unscrolled');
            mq.focus();
            assert.ok($root.is(':not(.mq-editing-overflow-left)'), 'no left overflow class');
            assert.ok($root.is('.mq-editing-overflow-right'), 'has right overflow class');
            mq.keystroke('Shift-Right');
            setTimeout(function () {
                assert.ok($root.is('.mq-editing-overflow-left'), 'has left overflow class');
                assert.ok($root.is(':not(.mq-editing-overflow-right)'), 'no right overflow class');
                assert.ok($root.scrollLeft() > 0, 'now scrolled');
                mq.blur();
                setTimeout(function () {
                    assert.ok($root.is(':not(.mq-editing-overflow-left)'), 'left overflow class removed');
                    assert.ok($root.is(':not(.mq-editing-overflow-right)'), 'no right overflow class');
                    assert.equal($root.scrollLeft(), 0, 'scrolled back left');
                    done();
                }, 200);
            }, 200);
        });
    });
    suite('Cursor::select()', function () {
        var cursor = new Cursor();
        cursor.selectionChanged = noop;
        function assertSelection(A, B, leftEnd, rightEnd) {
            var lca = leftEnd.parent, frag = new Fragment(leftEnd, rightEnd || leftEnd);
            (function eitherOrder(A, B) {
                var count = 0;
                lca.selectChildren = function (leftEnd, rightEnd) {
                    count += 1;
                    assert.equal(frag.ends[L], leftEnd);
                    assert.equal(frag.ends[R], rightEnd);
                    return MQNode.prototype.selectChildren.apply(this, arguments);
                };
                Point.prototype.init.call(cursor, A.parent, A[L], A[R]);
                cursor.startSelection();
                Point.prototype.init.call(cursor, B.parent, B[L], B[R]);
                assert.equal(cursor.select(), true);
                assert.equal(count, 1);
                return eitherOrder;
            })(A, B)(B, A);
        }
        var parent = new MQNode();
        var child1 = new MQNode().adopt(parent, parent.ends[R], 0);
        var child2 = new MQNode().adopt(parent, parent.ends[R], 0);
        var child3 = new MQNode().adopt(parent, parent.ends[R], 0);
        var A = new Point(parent, 0, child1);
        var B = new Point(parent, child1, child2);
        var C = new Point(parent, child2, child3);
        var D = new Point(parent, child3, 0);
        var pt1 = new Point(child1, 0, 0);
        var pt2 = new Point(child2, 0, 0);
        var pt3 = new Point(child3, 0, 0);
        test('same parent, one Node', function () {
            assertSelection(A, B, child1);
            assertSelection(B, C, child2);
            assertSelection(C, D, child3);
        });
        test('same Parent, many Nodes', function () {
            assertSelection(A, C, child1, child2);
            assertSelection(A, D, child1, child3);
            assertSelection(B, D, child2, child3);
        });
        test('Point next to parent of other Point', function () {
            assertSelection(A, pt1, child1);
            assertSelection(B, pt1, child1);
            assertSelection(B, pt2, child2);
            assertSelection(C, pt2, child2);
            assertSelection(C, pt3, child3);
            assertSelection(D, pt3, child3);
        });
        test("Points' parents are siblings", function () {
            assertSelection(pt1, pt2, child1, child2);
            assertSelection(pt2, pt3, child2, child3);
            assertSelection(pt1, pt3, child1, child3);
        });
        test('Point is sibling of parent of other Point', function () {
            assertSelection(A, pt2, child1, child2);
            assertSelection(A, pt3, child1, child3);
            assertSelection(B, pt3, child2, child3);
            assertSelection(pt1, D, child1, child3);
            assertSelection(pt1, C, child1, child2);
        });
        test('same Point', function () {
            Point.prototype.init.call(cursor, A.parent, A[L], A[R]);
            cursor.startSelection();
            assert.equal(cursor.select(), false);
        });
        test('different trees', function () {
            var anotherTree = new MQNode();
            Point.prototype.init.call(cursor, A.parent, A[L], A[R]);
            cursor.startSelection();
            Point.prototype.init.call(cursor, anotherTree, 0, 0);
            assert.throws(function () {
                cursor.select();
            });
            Point.prototype.init.call(cursor, anotherTree, 0, 0);
            cursor.startSelection();
            Point.prototype.init.call(cursor, A.parent, A[L], A[R]);
            assert.throws(function () {
                cursor.select();
            });
        });
    });
    suite('SupSub', function () {
        var mq;
        setup(function () {
            mq = MQ.MathField($('<span></span>').appendTo('#mock')[0]);
        });
        function prayWellFormedPoint(pt) {
            prayWellFormed(pt.parent, pt[L], pt[R]);
        }
        var expecteds = [
            'x_{ab} x_{ba}, x_{a}^{b} x_{a}^{b}; x_{ab} x_{ba}, x_{a}^{b} x_{a}^{b}; x_{a} x_{a}, x_{a}^{} x_{a}^{}',
            'x_{b}^{a} x_{b}^{a}, x^{ab} x^{ba}; x_{b}^{a} x_{b}^{a}, x^{ab} x^{ba}; x_{}^{a} x_{}^{a}, x^{a} x^{a}',
        ];
        var expectedsAfterC = [
            'x_{abc} x_{bca}, x_{a}^{bc} x_{a}^{bc}; x_{ab}c x_{bca}, x_{a}^{b}c x_{a}^{b}c; x_{a}c x_{ca}, x_{a}^{}c x_{a}^{}c',
            'x_{bc}^{a} x_{bc}^{a}, x^{abc} x^{bca}; x_{b}^{a}c x_{b}^{a}c, x^{ab}c x^{bca}; x_{}^{a}c x_{}^{a}c, x^{a}c x^{ca}',
        ];
        'sub super'.split(' ').forEach(function (initSupsub, i) {
            var initialLatex = 'x_{a} x^{a}'.split(' ')[i];
            'typed, wrote, wrote empty'.split(', ').forEach(function (did, j) {
                var doTo = [
                    function (mq, supsub) {
                        mq.typedText(supsub).typedText('b');
                    },
                    function (mq, supsub) {
                        mq.write(supsub + 'b');
                    },
                    function (mq, supsub) {
                        mq.write(supsub + '{}');
                    },
                ][j];
                'sub super'.split(' ').forEach(function (supsub, k) {
                    var cmd = '_^'.split('')[k];
                    'after before'.split(' ').forEach(function (side, l) {
                        var moveToSide = [
                            noop,
                            function (mq) {
                                mq.moveToLeftEnd().keystroke('Right');
                            },
                        ][l];
                        var expected = expecteds[i].split('; ')[j].split(', ')[k].split(' ')[l];
                        var expectedAfterC = expectedsAfterC[i]
                            .split('; ')[j].split(', ')[k].split(' ')[l];
                        test('initial ' +
                            initSupsub +
                            'script then ' +
                            did +
                            ' ' +
                            supsub +
                            'script ' +
                            side, function () {
                            mq.latex(initialLatex);
                            assert.equal(mq.latex(), initialLatex);
                            moveToSide(mq);
                            doTo(mq, cmd);
                            assert.equal(mq.latex().replace(/ /g, ''), expected);
                            prayWellFormedPoint(mq.__controller.cursor);
                            mq.typedText('c');
                            assert.equal(mq.latex().replace(/ /g, ''), expectedAfterC);
                        });
                    });
                });
            });
        });
        var expecteds = 'x_{a}^{3} x_{a}^{3}, x_{a}^{3} x_{a}^{3}; x^{a3} x^{3a}, x^{a3} x^{3a}';
        var expectedsAfterC = 'x_{a}^{3}c x_{a}^{3}c, x_{a}^{3}c x_{a}^{3}c; x^{a3}c x^{3ca}, x^{a3}c x^{3ca}';
        'sub super'.split(' ').forEach(function (initSupsub, i) {
            var initialLatex = 'x_{a} x^{a}'.split(' ')[i];
            'typed wrote'.split(' ').forEach(function (did, j) {
                var doTo = [
                    function (mq) {
                        mq.typedText('³');
                    },
                    function (mq) {
                        mq.write('³');
                    },
                ][j];
                'after before'.split(' ').forEach(function (side, k) {
                    var moveToSide = [
                        noop,
                        function (mq) {
                            mq.moveToLeftEnd().keystroke('Right');
                        },
                    ][k];
                    var expected = expecteds.split('; ')[i].split(', ')[j].split(' ')[k];
                    var expectedAfterC = expectedsAfterC
                        .split('; ')[i].split(', ')[j].split(' ')[k];
                    test('initial ' + initSupsub + 'script then ' + did + " '³' " + side, function () {
                        mq.latex(initialLatex);
                        assert.equal(mq.latex(), initialLatex);
                        moveToSide(mq);
                        doTo(mq);
                        assert.equal(mq.latex().replace(/ /g, ''), expected);
                        prayWellFormedPoint(mq.__controller.cursor);
                        mq.typedText('c');
                        assert.equal(mq.latex().replace(/ /g, ''), expectedAfterC);
                    });
                });
            });
        });
        test("render LaTeX with 2 SupSub's in a row", function () {
            mq.latex('x_a_b');
            assert.equal(mq.latex(), 'x_{ab}');
            mq.latex('x_a_{}');
            assert.equal(mq.latex(), 'x_{a}');
            mq.latex('x_{}_a');
            assert.equal(mq.latex(), 'x_{a}');
            mq.latex('x^a^b');
            assert.equal(mq.latex(), 'x^{ab}');
            mq.latex('x^a^{}');
            assert.equal(mq.latex(), 'x^{a}');
            mq.latex('x^{}^a');
            assert.equal(mq.latex(), 'x^{a}');
        });
        test("render LaTeX with 3 alternating SupSub's in a row", function () {
            mq.latex('x_a^b_c');
            assert.equal(mq.latex(), 'x_{ac}^{b}');
            mq.latex('x^a_b^c');
            assert.equal(mq.latex(), 'x_{b}^{ac}');
        });
        suite('deleting', function () {
            test('backspacing out of and then re-typing subscript', function () {
                mq.latex('x_a^b');
                assert.equal(mq.latex(), 'x_{a}^{b}');
                mq.keystroke('Down Backspace');
                assert.equal(mq.latex(), 'x_{ }^{b}');
                mq.keystroke('Backspace');
                assert.equal(mq.latex(), 'x^{b}');
                mq.typedText('_a');
                assert.equal(mq.latex(), 'x_{a}^{b}');
                mq.keystroke('Left Backspace');
                assert.equal(mq.latex(), 'xa^{b}');
                mq.typedText('c');
                assert.equal(mq.latex(), 'xca^{b}');
            });
            test('backspacing out of and then re-typing superscript', function () {
                mq.latex('x_a^b');
                assert.equal(mq.latex(), 'x_{a}^{b}');
                mq.keystroke('Up Backspace');
                assert.equal(mq.latex(), 'x_{a}^{ }');
                mq.keystroke('Backspace');
                assert.equal(mq.latex(), 'x_{a}');
                mq.typedText('^b');
                assert.equal(mq.latex(), 'x_{a}^{b}');
                mq.keystroke('Left Backspace');
                assert.equal(mq.latex(), 'x_{a}b');
                mq.typedText('c');
                assert.equal(mq.latex(), 'x_{a}cb');
            });
        });
    });
    suite('text', function () {
        var mq, mostRecentlyReportedLatex;
        setup(function () {
            mostRecentlyReportedLatex = NaN; // != to everything
            mq = MQ.MathField($('<span></span>').appendTo('#mock')[0], {
                handlers: {
                    edit: function () {
                        mostRecentlyReportedLatex = mq.latex();
                    },
                },
            });
        });
        function prayWellFormedPoint(pt) {
            prayWellFormed(pt.parent, pt[L], pt[R]);
        }
        function assertLatex(latex) {
            prayWellFormedPoint(mq.__controller.cursor);
            assert.equal(mostRecentlyReportedLatex, latex, 'assertLatex failed');
            assert.equal(mq.latex(), latex, 'assertLatex failed');
        }
        function fromLatex(latex) {
            var block = latexMathParser.parse(latex);
            block.jQize();
            return block;
        }
        function assertSplit(jQ, prev, next) {
            var dom = jQ[0];
            if (prev) {
                assert.ok(dom.previousSibling instanceof Text);
                assert.equal(prev, dom.previousSibling.data, 'assertSplit failed');
            }
            else {
                assert.ok(!dom.previousSibling);
            }
            if (next) {
                assert.ok(dom.nextSibling instanceof Text);
                assert.equal(next, dom.nextSibling.data, 'assertSplit failed');
            }
            else {
                assert.ok(!dom.nextSibling);
            }
        }
        test('changes the text nodes as the cursor moves around', function () {
            var block = fromLatex('\\text{abc}');
            var ctrlr = new Controller(block, 0, 0);
            var cursor = ctrlr.cursor.insAtRightEnd(block);
            ctrlr.moveLeft();
            assertSplit(cursor.jQ, 'abc', null);
            ctrlr.moveLeft();
            assertSplit(cursor.jQ, 'ab', 'c');
            ctrlr.moveLeft();
            assertSplit(cursor.jQ, 'a', 'bc');
            ctrlr.moveLeft();
            assertSplit(cursor.jQ, null, 'abc');
            ctrlr.moveRight();
            assertSplit(cursor.jQ, 'a', 'bc');
            ctrlr.moveRight();
            assertSplit(cursor.jQ, 'ab', 'c');
            ctrlr.moveRight();
            assertSplit(cursor.jQ, 'abc', null);
        });
        test('does not change latex as the cursor moves around', function () {
            var block = fromLatex('\\text{x}');
            var ctrlr = new Controller(block, 0, 0);
            var cursor = ctrlr.cursor.insAtRightEnd(block);
            ctrlr.moveLeft();
            ctrlr.moveLeft();
            ctrlr.moveLeft();
            assert.equal(block.latex(), '\\text{x}');
        });
        suite('typing', function () {
            test('stepping out of an empty block deletes it', function () {
                var controller = mq.__controller;
                var cursor = controller.cursor;
                mq.latex('\\text{x}');
                assertLatex('\\text{x}');
                mq.keystroke('Left');
                assertSplit(cursor.jQ, 'x');
                assertLatex('\\text{x}');
                mq.keystroke('Backspace');
                assertSplit(cursor.jQ);
                assertLatex('');
                mq.keystroke('Right');
                assertSplit(cursor.jQ);
                assert.equal(cursor[L], 0);
                assertLatex('');
            });
            test('typing $ in a textblock splits it', function () {
                var controller = mq.__controller;
                var cursor = controller.cursor;
                mq.latex('\\text{asdf}');
                assertLatex('\\text{asdf}');
                mq.keystroke('Left Left Left');
                assertSplit(cursor.jQ, 'as', 'df');
                assertLatex('\\text{asdf}');
                mq.typedText('$');
                assertLatex('\\text{as}\\text{df}');
            });
        });
        suite('pasting', function () {
            test('sanity', function () {
                var controller = mq.__controller;
                var cursor = controller.cursor;
                mq.latex('\\text{asdf}');
                mq.keystroke('Left Left Left');
                assertSplit(cursor.jQ, 'as', 'df');
                controller.paste('foo');
                assertSplit(cursor.jQ, 'asfoo', 'df');
                assertLatex('\\text{asfoodf}');
                prayWellFormedPoint(cursor);
            });
            test('pasting a dollar sign', function () {
                var controller = mq.__controller;
                var cursor = controller.cursor;
                mq.latex('\\text{asdf}');
                mq.keystroke('Left Left Left');
                assertSplit(cursor.jQ, 'as', 'df');
                controller.paste('$foo');
                assertSplit(cursor.jQ, 'as$foo', 'df');
                assertLatex('\\text{as$foodf}');
                prayWellFormedPoint(cursor);
            });
            test('pasting a backslash', function () {
                var controller = mq.__controller;
                var cursor = controller.cursor;
                mq.latex('\\text{asdf}');
                mq.keystroke('Left Left Left');
                assertSplit(cursor.jQ, 'as', 'df');
                controller.paste('\\pi');
                assertSplit(cursor.jQ, 'as\\pi', 'df');
                assertLatex('\\text{as\\backslash pidf}');
                prayWellFormedPoint(cursor);
            });
            test('pasting a curly brace', function () {
                var controller = mq.__controller;
                var cursor = controller.cursor;
                mq.latex('\\text{asdf}');
                mq.keystroke('Left Left Left');
                assertSplit(cursor.jQ, 'as', 'df');
                controller.paste('{');
                assertSplit(cursor.jQ, 'as{', 'df');
                assertLatex('\\text{as\\{df}');
                prayWellFormedPoint(cursor);
            });
        });
        test('HTML for subclassed text blocks', function () {
            var block = fromLatex('\\text{abc}');
            var _id = block.html().match(/mathquill-command-id=([0-9]+)/)[1];
            function id() {
                _id = parseInt(_id) + 3;
                return _id;
            }
            block = fromLatex('\\text{abc}');
            assert.equal(block.html(), '<span class="mq-text-mode" mathquill-command-id=' + id() + '>abc</span>');
            block = fromLatex('\\textit{abc}');
            assert.equal(block.html(), '<i class="mq-text-mode" mathquill-command-id=' + id() + '>abc</i>');
            block = fromLatex('\\textbf{abc}');
            assert.equal(block.html(), '<b class="mq-text-mode" mathquill-command-id=' + id() + '>abc</b>');
            block = fromLatex('\\textsf{abc}');
            assert.equal(block.html(), '<span class="mq-sans-serif mq-text-mode" mathquill-command-id=' +
                id() +
                '>abc</span>');
            block = fromLatex('\\texttt{abc}');
            assert.equal(block.html(), '<span class="mq-monospace mq-text-mode" mathquill-command-id=' +
                id() +
                '>abc</span>');
            block = fromLatex('\\textsc{abc}');
            assert.equal(block.html(), '<span style="font-variant:small-caps" class="mq-text-mode" mathquill-command-id=' +
                id() +
                '>abc</span>');
            block = fromLatex('\\uppercase{abc}');
            assert.equal(block.html(), '<span style="text-transform:uppercase" class="mq-text-mode" mathquill-command-id=' +
                id() +
                '>abc</span>');
            block = fromLatex('\\lowercase{abc}');
            assert.equal(block.html(), '<span style="text-transform:lowercase" class="mq-text-mode" mathquill-command-id=' +
                id() +
                '>abc</span>');
        });
    });
    suite('tree', function () {
        suite('adopt', function () {
            function assertTwoChildren(parent, one, two) {
                assert.equal(one.parent, parent, 'one.parent is set');
                assert.equal(two.parent, parent, 'two.parent is set');
                assert.ok(!one[L], 'one has nothing leftward');
                assert.equal(one[R], two, 'one[R] is two');
                assert.equal(two[L], one, 'two[L] is one');
                assert.ok(!two[R], 'two has nothing rightward');
                assert.equal(parent.ends[L], one, 'parent.ends[L] is one');
                assert.equal(parent.ends[R], two, 'parent.ends[R] is two');
            }
            test('the empty case', function () {
                var parent = new MQNode();
                var child = new MQNode();
                child.adopt(parent, 0, 0);
                assert.equal(child.parent, parent, 'child.parent is set');
                assert.ok(!child[R], 'child has nothing rightward');
                assert.ok(!child[L], 'child has nothing leftward');
                assert.equal(parent.ends[L], child, 'child is parent.ends[L]');
                assert.equal(parent.ends[R], child, 'child is parent.ends[R]');
            });
            test('with two children from the left', function () {
                var parent = new MQNode();
                var one = new MQNode();
                var two = new MQNode();
                one.adopt(parent, 0, 0);
                two.adopt(parent, one, 0);
                assertTwoChildren(parent, one, two);
            });
            test('with two children from the right', function () {
                var parent = new MQNode();
                var one = new MQNode();
                var two = new MQNode();
                two.adopt(parent, 0, 0);
                one.adopt(parent, 0, two);
                assertTwoChildren(parent, one, two);
            });
            test('adding one in the middle', function () {
                var parent = new MQNode();
                var leftward = new MQNode();
                var rightward = new MQNode();
                var middle = new MQNode();
                leftward.adopt(parent, 0, 0);
                rightward.adopt(parent, leftward, 0);
                middle.adopt(parent, leftward, rightward);
                assert.equal(middle.parent, parent, 'middle.parent is set');
                assert.equal(middle[L], leftward, 'middle[L] is set');
                assert.equal(middle[R], rightward, 'middle[R] is set');
                assert.equal(leftward[R], middle, 'leftward[R] is middle');
                assert.equal(rightward[L], middle, 'rightward[L] is middle');
                assert.equal(parent.ends[L], leftward, 'parent.ends[L] is leftward');
                assert.equal(parent.ends[R], rightward, 'parent.ends[R] is rightward');
            });
        });
        suite('disown', function () {
            function assertSingleChild(parent, child) {
                assert.equal(parent.ends[L], child, 'parent.ends[L] is child');
                assert.equal(parent.ends[R], child, 'parent.ends[R] is child');
                assert.ok(!child[L], 'child has nothing leftward');
                assert.ok(!child[R], 'child has nothing rightward');
            }
            test('the empty case', function () {
                var parent = new MQNode();
                var child = new MQNode();
                child.adopt(parent, 0, 0);
                child.disown();
                assert.ok(!parent.ends[L], 'parent has no left end child');
                assert.ok(!parent.ends[R], 'parent has no right end child');
            });
            test('disowning the right end child', function () {
                var parent = new MQNode();
                var one = new MQNode();
                var two = new MQNode();
                one.adopt(parent, 0, 0);
                two.adopt(parent, one, 0);
                two.disown();
                assertSingleChild(parent, one);
                assert.equal(two.parent, parent, 'two retains its parent');
                assert.equal(two[L], one, 'two retains its [L]');
                assert.throws(function () {
                    two.disown();
                }, 'disown fails on a malformed tree');
            });
            test('disowning the left end child', function () {
                var parent = new MQNode();
                var one = new MQNode();
                var two = new MQNode();
                one.adopt(parent, 0, 0);
                two.adopt(parent, one, 0);
                one.disown();
                assertSingleChild(parent, two);
                assert.equal(one.parent, parent, 'one retains its parent');
                assert.equal(one[R], two, 'one retains its [R]');
                assert.throws(function () {
                    one.disown();
                }, 'disown fails on a malformed tree');
            });
            test('disowning the middle', function () {
                var parent = new MQNode();
                var leftward = new MQNode();
                var rightward = new MQNode();
                var middle = new MQNode();
                leftward.adopt(parent, 0, 0);
                rightward.adopt(parent, leftward, 0);
                middle.adopt(parent, leftward, rightward);
                middle.disown();
                assert.equal(leftward[R], rightward, 'leftward[R] is rightward');
                assert.equal(rightward[L], leftward, 'rightward[L] is leftward');
                assert.equal(parent.ends[L], leftward, 'parent.ends[L] is leftward');
                assert.equal(parent.ends[R], rightward, 'parent.ends[R] is rightward');
                assert.equal(middle.parent, parent, 'middle retains its parent');
                assert.equal(middle[R], rightward, 'middle retains its [R]');
                assert.equal(middle[L], leftward, 'middle retains its [L]');
                assert.throws(function () {
                    middle.disown();
                }, 'disown fails on a malformed tree');
            });
        });
        suite('fragments', function () {
            test('an empty fragment', function () {
                var empty = new Fragment();
                var count = 0;
                empty.each(function () {
                    count += 1;
                });
                assert.equal(count, 0, 'each is a noop on an empty fragment');
            });
            test('half-empty fragments are disallowed', function () {
                assert.throws(function () {
                    new Fragment(new MQNode(), 0);
                }, 'half-empty on the right');
                assert.throws(function () {
                    new Fragment(0, new MQNode());
                }, 'half-empty on the left');
            });
            test('directionalized constructor call', function () {
                var ChNode = /** @class */ (function (_super) {
                    __extends(ChNode, _super);
                    function ChNode(ch) {
                        var _this = _super.call(this) || this;
                        _this.ch = ch;
                        return _this;
                    }
                    return ChNode;
                }(MQNode));
                var parent = new MQNode();
                var a = new ChNode('a').adopt(parent, parent.ends[R], 0);
                var b = new ChNode('b').adopt(parent, parent.ends[R], 0);
                var c = new ChNode('c').adopt(parent, parent.ends[R], 0);
                var d = new ChNode('d').adopt(parent, parent.ends[R], 0);
                var e = new ChNode('e').adopt(parent, parent.ends[R], 0);
                function cat(str, node) {
                    return str + node.ch;
                }
                assert.equal('bcd', new Fragment(b, d).fold('', cat));
                assert.equal('bcd', new Fragment(b, d, L).fold('', cat));
                assert.equal('bcd', new Fragment(d, b, R).fold('', cat));
                assert.throws(function () {
                    new Fragment(d, b, L);
                });
                assert.throws(function () {
                    new Fragment(b, d, R);
                });
            });
            test('disown is idempotent', function () {
                var parent = new MQNode();
                var one = new MQNode().adopt(parent, 0, 0);
                var two = new MQNode().adopt(parent, one, 0);
                var frag = new Fragment(one, two);
                frag.disown();
                frag.disown();
            });
        });
    });
    suite('typing with auto-replaces', function () {
        var mq, mostRecentlyReportedLatex;
        setup(function () {
            mostRecentlyReportedLatex = NaN; // != to everything
            mq = MQ.MathField($('<span></span>').appendTo('#mock')[0], {
                handlers: {
                    edit: function () {
                        mostRecentlyReportedLatex = mq.latex();
                    },
                },
            });
        });
        function prayWellFormedPoint(pt) {
            prayWellFormed(pt.parent, pt[L], pt[R]);
        }
        function assertLatex(latex) {
            prayWellFormedPoint(mq.__controller.cursor);
            assert.equal(mostRecentlyReportedLatex, latex);
            assert.equal(mq.latex(), latex);
        }
        function assertMathspeak(mathspeak) {
            assert.equal(normalize(mq.mathspeak()), normalize(mathspeak));
            function normalize(str) {
                return str
                    .replace(/\d(?!\d)/g, '$& ')
                    .split(/[ ,]+/)
                    .join(' ')
                    .trim();
            }
        }
        suite('LiveFraction', function () {
            test('full MathQuill', function () {
                mq.typedText('1/2').keystroke('Tab').typedText('+sinx/');
                assertLatex('\\frac{1}{2}+\\frac{\\sin x}{ }');
                mq.latex('').typedText('1+/2');
                assertLatex('1+\\frac{2}{ }');
                mq.latex('').typedText('1 2/3');
                assertLatex('1\\ \\frac{2}{3}');
            });
            test('mathquill-basic', function () {
                var mq_basic = MQBasic.MathField($('<span></span>').appendTo('#mock')[0]);
                mq_basic.typedText('1/2');
                assert.equal(mq_basic.latex(), '\\frac{1}{2}');
            });
        });
        suite('EquivalentMinus', function () {
            test('different minus symbols', function () {
                //these 4 are all different characters (!!)
                mq.typedText('−—–-');
                //these 4 are all the same character
                assertLatex('----');
            });
        });
        suite('LongDivision', function () {
            test('places typed digits under the bar', function () {
                mq.typedText('⟌1234');
                assertLatex('\\longdiv{1234}');
            });
        });
        suite('LatexCommandInput', function () {
            test('basic', function () {
                mq.typedText('\\sqrt-x');
                assertLatex('\\sqrt{-x}');
            });
            test("they're passed their name", function () {
                mq.cmd('\\alpha');
                assert.equal(mq.latex(), '\\alpha');
            });
            test('replaces selection', function () {
                mq.typedText('49').select().typedText('\\sqrt').keystroke('Enter');
                assertLatex('\\sqrt{49}');
            });
            test('auto-operator names', function () {
                mq.typedText('\\sin^2');
                assertLatex('\\sin^{2}');
            });
            test('nonexistent LaTeX command', function () {
                mq.typedText('\\asdf').keystroke('Enter');
                assertLatex('\\text{asdf}');
            });
            test('nonexistent LaTeX command, then symbol', function () {
                mq.typedText('\\asdf+');
                assertLatex('\\text{asdf}+');
            });
            test('dollar sign', function () {
                mq.typedText('$');
                assertLatex('\\$');
            });
            test('\\text followed by command', function () {
                mq.typedText('\\text{');
                assertLatex('\\text{\\{}');
            });
        });
        suite('MathspeakShorthand', function () {
            test('fractions', function () {
                // Testing singular numeric fractions from 1/2 to 1/10
                mq.latex('\\frac{1}{2}');
                assertMathspeak('1 half');
                mq.latex('\\frac{1}{3}');
                assertMathspeak('1 third');
                mq.latex('\\frac{1}{4}');
                assertMathspeak('1 quarter');
                mq.latex('\\frac{1}{5}');
                assertMathspeak('1 fifth');
                mq.latex('\\frac{1}{6}');
                assertMathspeak('1 sixth');
                mq.latex('\\frac{1}{7}');
                assertMathspeak('1 seventh');
                mq.latex('\\frac{1}{8}');
                assertMathspeak('1 eighth');
                mq.latex('\\frac{1}{9}');
                assertMathspeak('1 ninth');
                mq.latex('\\frac{1}{10}');
                assertMathspeak('StartFraction, 1 Over 10, EndFraction');
                // Testing plural numeric fractions from 31/2 to 31/10
                mq.latex('\\frac{31}{2}');
                assertMathspeak('31 halves');
                mq.latex('\\frac{31}{3}');
                assertMathspeak('31 thirds');
                mq.latex('\\frac{31}{4}');
                assertMathspeak('31 quarters');
                mq.latex('\\frac{31}{5}');
                assertMathspeak('31 fifths');
                mq.latex('\\frac{31}{6}');
                assertMathspeak('31 sixths');
                mq.latex('\\frac{31}{7}');
                assertMathspeak('31 sevenths');
                mq.latex('\\frac{31}{8}');
                assertMathspeak('31 eighths');
                mq.latex('\\frac{31}{9}');
                assertMathspeak('31 ninths');
                mq.latex('\\frac{31}{10}');
                assertMathspeak('StartFraction, 31 Over 10, EndFraction');
                // Fractions with negative numerators should be shortened
                mq.latex('\\frac{-1}{2}');
                assertMathspeak('negative 1 half');
                mq.latex('\\frac{-3}{2}');
                assertMathspeak('negative 3 halves');
                mq.latex('-\\frac{3}{4}');
                assertMathspeak('negative 3 quarters');
                // Fractions with negative denominators should not be shortened
                mq.latex('\\frac{1}{-2}');
                assertMathspeak('StartFraction, 1 Over negative 2, EndFraction');
                // Traditional fractions should be spoken if either numerator or denominator are not numeric
                mq.latex('\\frac{x}{2}');
                assertMathspeak('StartFraction, "x" Over 2, EndFraction');
                mq.latex('\\frac{2}{x}');
                assertMathspeak('StartFraction, 2 Over "x", EndFraction');
                // Traditional fractions should be spoken if either numerator or denominator are not whole numbers
                mq.latex('\\frac{1.2}{2}');
                assertMathspeak('StartFraction, 1.2 Over 2, EndFraction');
                mq.latex('\\frac{4}{2.3}');
                assertMathspeak('StartFraction, 4 Over 2.3, EndFraction');
                // A whole number followed by a shortened fraction should include the word "and", and other combinations should not.
                mq.latex('3\\frac{3}{8}');
                assertMathspeak('3 and 3 eighths');
                mq.latex('3\\ \\frac{3}{8}');
                assertMathspeak('3 and 3 eighths');
                mq.latex('3\\ \\ \\ \\ \\ \\frac{3}{8}');
                assertMathspeak('3 and 3 eighths');
                mq.latex('3.1\\frac{3}{8}');
                assertMathspeak('3.1 3 eighths');
                mq.latex('3.1\\ \\frac{3}{8}');
                assertMathspeak('3.1 3 eighths');
                mq.latex('3.1\\ \\ \\ \\ \\frac{3}{8}');
                assertMathspeak('3.1 3 eighths');
                mq.latex('\\ \\frac{1}{2}');
                assertMathspeak('1 half');
                mq.latex('3\\frac{3}{x}');
                assertMathspeak('3 StartFraction, 3 Over "x", EndFraction');
                mq.latex('x\\frac{3}{8}');
                assertMathspeak('"x" 3 eighths');
            });
            test('exponents', function () {
                // Test simple superscripts and suffix rules
                mq.latex('x^{0}');
                assertMathspeak('"x" to the 0 power');
                mq.latex('x^{1}');
                assertMathspeak('"x" to the 1st power');
                mq.latex('x^{2}');
                assertMathspeak('"x" squared');
                mq.latex('x^{3}');
                assertMathspeak('"x" cubed');
                mq.latex('x^{4}');
                assertMathspeak('"x" to the 4th power');
                mq.latex('x^{5}');
                assertMathspeak('"x" to the 5th power');
                mq.latex('x^{6}');
                assertMathspeak('"x" to the 6th power');
                mq.latex('x^{7}');
                assertMathspeak('"x" to the 7th power');
                mq.latex('x^{8}');
                assertMathspeak('"x" to the 8th power');
                mq.latex('x^{9}');
                assertMathspeak('"x" to the 9th power');
                mq.latex('x^{10}');
                assertMathspeak('"x" to the 10th power');
                mq.latex('x^{11}');
                assertMathspeak('"x" to the 11th power');
                mq.latex('x^{12}');
                assertMathspeak('"x" to the 12th power');
                mq.latex('x^{13}');
                assertMathspeak('"x" to the 13th power');
                mq.latex('x^{14}');
                assertMathspeak('"x" to the 14th power');
                mq.latex('x^{21}');
                assertMathspeak('"x" to the 21st power');
                mq.latex('x^{22}');
                assertMathspeak('"x" to the 22nd power');
                mq.latex('x^{23}');
                assertMathspeak('"x" to the 23rd power');
                mq.latex('x^{999}');
                assertMathspeak('"x" to the 999th power');
                // Values greater than 1000 have no suffix
                mq.latex('x^{1000}');
                assertMathspeak('"x" to the 1000 power');
                mq.latex('x^{10000000000}');
                assertMathspeak('"x" to the 10000000000 power');
                // Ensure negative exponents are shortened
                mq.latex('10^{-5}');
                assertMathspeak('10 to the negative 5th power');
                mq.latex('x^{-5}');
                assertMathspeak('"x" to the negative 5th power');
                // Superscripts that are not strictly integers should continue to be spoken in longer form
                mq.latex('x^{5.3}');
                assertMathspeak('"x" Superscript, 5.3, Baseline');
                mq.latex('x^{y}');
                assertMathspeak('"x" Superscript, "y", Baseline');
                mq.latex('x^{y^{2}}');
                assertMathspeak('"x" Superscript, "y" squared, Baseline');
            });
            test('plus and minus differentiation', function () {
                // Distinguish between positive vs plus and negative vs. minus
                mq.latex('-25-25');
                assertMathspeak('negative 25 minus 25');
                mq.latex('+25+25');
                assertMathspeak('positive 25 plus 25');
            });
            test('styled text', function () {
                // Test that text-related elements include sensible mathspeak.
                // Letters in a non-wrapped block should be split apart (interpreted as variables):
                mq.latex('this is a test');
                assertMathspeak('"t" "h" "i" "s" "i" "s" "a" "t" "e" "s" "t"');
                // Contents of a text block should be returned exactly as entered with no start and end delimiters spoken:
                mq.latex('\\text{this is a test}');
                assertMathspeak('this is a test');
                // Specifically for mathrm, don't split characters and also don't speak delimiters.
                // note content is still interpreted as LaTeX, so we use \ to separate words:
                mq.latex('\\mathrm{this\\ is\\ a\\ test}');
                assertMathspeak('this is a test');
                // Any other font command should be spoken "normally"--
                // letters are split and delimiters are announced for remaining commands:
                mq.latex('\\mathit{this\\ is\\ a\\ test}');
                assertMathspeak('StartItalic Font "t" "h" "i" "s" "i" "s" "a" "t" "e" "s" "t" EndItalic Font');
                mq.latex('\\textcolor{red}{this\\ is\\ a\\ test}');
                assertMathspeak('Start red "t" "h" "i" "s" "i" "s" "a" "t" "e" "s" "t" End red');
                mq.latex('\\class{abc}{this\\ is\\ a\\ test}');
                assertMathspeak('Start abc class "t" "h" "i" "s" "i" "s" "a" "t" "e" "s" "t" End abc class');
            });
        });
        suite('auto-expanding parens', function () {
            suite('simple', function () {
                test('empty parens ()', function () {
                    mq.typedText('(');
                    assertLatex('\\left(\\right)');
                    mq.typedText(')');
                    assertLatex('\\left(\\right)');
                });
                test('straight typing 1+(2+3)+4', function () {
                    mq.typedText('1+(2+3)+4');
                    assertLatex('1+\\left(2+3\\right)+4');
                });
                test('basic command \\sin(', function () {
                    mq.typedText('\\sin(');
                    assertLatex('\\sin\\left(\\right)');
                });
                test('wrapping things in parens 1+(2+3)+4', function () {
                    mq.typedText('1+2+3+4');
                    assertLatex('1+2+3+4');
                    mq.keystroke('Left Left').typedText(')');
                    assertLatex('\\left(1+2+3\\right)+4');
                    mq.keystroke('Left Left Left Left').typedText('(');
                    assertLatex('1+\\left(2+3\\right)+4');
                });
                test('nested parens 1+(2+(3+4)+5)+6', function () {
                    mq.typedText('1+(2+(3+4)+5)+6');
                    assertLatex('1+\\left(2+\\left(3+4\\right)+5\\right)+6');
                });
            });
            suite('mismatched brackets', function () {
                test('empty mismatched brackets (] and [}', function () {
                    mq.typedText('(');
                    assertLatex('\\left(\\right)');
                    mq.typedText(']');
                    assertLatex('\\left(\\right]');
                    mq.typedText('[');
                    assertLatex('\\left(\\right]\\left[\\right]');
                    mq.typedText('}');
                    assertLatex('\\left(\\right]\\left[\\right\\}');
                });
                test('typing mismatched brackets 1+(2+3]+4', function () {
                    mq.typedText('1+');
                    assertLatex('1+');
                    mq.typedText('(');
                    assertLatex('1+\\left(\\right)');
                    mq.typedText('2+3');
                    assertLatex('1+\\left(2+3\\right)');
                    mq.typedText(']+4');
                    assertLatex('1+\\left(2+3\\right]+4');
                });
                test('wrapping things in mismatched brackets 1+(2+3]+4', function () {
                    mq.typedText('1+2+3+4');
                    assertLatex('1+2+3+4');
                    mq.keystroke('Left Left').typedText(']');
                    assertLatex('\\left[1+2+3\\right]+4');
                    mq.keystroke('Left Left Left Left').typedText('(');
                    assertLatex('1+\\left(2+3\\right]+4');
                });
                test('nested mismatched brackets 1+(2+[3+4)+5]+6', function () {
                    mq.typedText('1+(2+[3+4)+5]+6');
                    assertLatex('1+\\left(2+\\left[3+4\\right)+5\\right]+6');
                });
                suite('restrictMismatchedBrackets', function () {
                    setup(function () {
                        mq.config({ restrictMismatchedBrackets: true });
                    });
                    test('typing (|x|+1) works', function () {
                        mq.typedText('(|x|+1)');
                        assertLatex('\\left(\\left|x\\right|+1\\right)');
                    });
                    test('typing [x} becomes [{x}]', function () {
                        mq.typedText('[x}');
                        assertLatex('\\left[\\left\\{x\\right\\}\\right]');
                    });
                    test('normal matching pairs {f(n), [a,b]} work', function () {
                        mq.typedText('{f(n), [a,b]}');
                        assertLatex('\\left\\{f\\left(n\\right),\\ \\left[a,b\\right]\\right\\}');
                    });
                    test('[a,b) and (a,b] still work', function () {
                        mq.typedText('[a,b) + (a,b]');
                        assertLatex('\\left[a,b\\right)\\ +\\ \\left(a,b\\right]');
                    });
                });
            });
            suite('pipes', function () {
                test('empty pipes ||', function () {
                    mq.typedText('|');
                    assertLatex('\\left|\\right|');
                    mq.typedText('|');
                    assertLatex('\\left|\\right|');
                });
                test('straight typing 1+|2+3|+4', function () {
                    mq.typedText('1+|2+3|+4');
                    assertLatex('1+\\left|2+3\\right|+4');
                });
                test('wrapping things in pipes 1+|2+3|+4', function () {
                    mq.typedText('1+2+3+4');
                    assertLatex('1+2+3+4');
                    mq.keystroke('Home Right Right').typedText('|');
                    assertLatex('1+\\left|2+3+4\\right|');
                    mq.keystroke('Right Right Right').typedText('|');
                    assertLatex('1+\\left|2+3\\right|+4');
                });
                suite('can type mismatched paren/pipe group from any side', function () {
                    suite('straight typing', function () {
                        test('|)', function () {
                            mq.typedText('|)');
                            assertLatex('\\left|\\right)');
                        });
                        test('(|', function () {
                            mq.typedText('(|');
                            assertLatex('\\left(\\right|');
                        });
                    });
                    suite('the other direction', function () {
                        test('|)', function () {
                            mq.typedText(')');
                            assertLatex('\\left(\\right)');
                            mq.keystroke('Left').typedText('|');
                            assertLatex('\\left|\\right)');
                        });
                        test('(|', function () {
                            mq.typedText('||');
                            assertLatex('\\left|\\right|');
                            mq.keystroke('Left Left Del');
                            assertLatex('\\left|\\right|');
                            mq.typedText('(');
                            assertLatex('\\left(\\right|');
                        });
                    });
                });
            });
            suite('backspacing', backspacingTests);
            suite('backspacing with restrictMismatchedBrackets', function () {
                setup(function () {
                    mq.config({ restrictMismatchedBrackets: true });
                });
                backspacingTests();
            });
            function backspacingTests() {
                test('typing then backspacing a close-paren in the middle of 1+2+3+4', function () {
                    mq.typedText('1+2+3+4');
                    assertLatex('1+2+3+4');
                    mq.keystroke('Left Left').typedText(')');
                    assertLatex('\\left(1+2+3\\right)+4');
                    mq.keystroke('Backspace');
                    assertLatex('1+2+3+4');
                });
                test('backspacing close-paren then open-paren of 1+(2+3)+4', function () {
                    mq.typedText('1+(2+3)+4');
                    assertLatex('1+\\left(2+3\\right)+4');
                    mq.keystroke('Left Left Backspace');
                    assertLatex('1+\\left(2+3+4\\right)');
                    mq.keystroke('Left Left Left Backspace');
                    assertLatex('1+2+3+4');
                });
                test('backspacing open-paren of 1+(2+3)+4', function () {
                    mq.typedText('1+(2+3)+4');
                    assertLatex('1+\\left(2+3\\right)+4');
                    mq.keystroke('Left Left Left Left Left Left Backspace');
                    assertLatex('1+2+3+4');
                });
                test('backspacing close-bracket then open-paren of 1+(2+3]+4', function () {
                    mq.typedText('1+(2+3]+4');
                    assertLatex('1+\\left(2+3\\right]+4');
                    mq.keystroke('Left Left Backspace');
                    assertLatex('1+\\left(2+3+4\\right)');
                    mq.keystroke('Left Left Left Backspace');
                    assertLatex('1+2+3+4');
                });
                test('backspacing open-paren of 1+(2+3]+4', function () {
                    mq.typedText('1+(2+3]+4');
                    assertLatex('1+\\left(2+3\\right]+4');
                    mq.keystroke('Left Left Left Left Left Left Backspace');
                    assertLatex('1+2+3+4');
                });
                test('backspacing close-bracket then open-paren of 1+(2+3] (nothing after paren group)', function () {
                    mq.typedText('1+(2+3]');
                    assertLatex('1+\\left(2+3\\right]');
                    mq.keystroke('Backspace');
                    assertLatex('1+\\left(2+3\\right)');
                    mq.keystroke('Left Left Left Backspace');
                    assertLatex('1+2+3');
                });
                test('backspacing open-paren of 1+(2+3] (nothing after paren group)', function () {
                    mq.typedText('1+(2+3]');
                    assertLatex('1+\\left(2+3\\right]');
                    mq.keystroke('Left Left Left Left Backspace');
                    assertLatex('1+2+3');
                });
                test('backspacing close-bracket then open-paren of (2+3]+4 (nothing before paren group)', function () {
                    mq.typedText('(2+3]+4');
                    assertLatex('\\left(2+3\\right]+4');
                    mq.keystroke('Left Left Backspace');
                    assertLatex('\\left(2+3+4\\right)');
                    mq.keystroke('Left Left Left Backspace');
                    assertLatex('2+3+4');
                });
                test('backspacing open-paren of (2+3]+4 (nothing before paren group)', function () {
                    mq.typedText('(2+3]+4');
                    assertLatex('\\left(2+3\\right]+4');
                    mq.keystroke('Left Left Left Left Left Left Backspace');
                    assertLatex('2+3+4');
                });
                function assertParenBlockNonEmpty() {
                    var parenBlock = $(mq.el()).find('.mq-paren+span');
                    assert.equal(parenBlock.length, 1, 'exactly 1 paren block');
                    assert.ok(!parenBlock.hasClass('mq-empty'), 'paren block auto-expanded, should no longer be gray');
                }
                test('backspacing close-bracket then open-paren of 1+(]+4 (empty paren group)', function () {
                    mq.typedText('1+(]+4');
                    assertLatex('1+\\left(\\right]+4');
                    mq.keystroke('Left Left Backspace');
                    assertLatex('1+\\left(+4\\right)');
                    assertParenBlockNonEmpty();
                    mq.keystroke('Backspace');
                    assertLatex('1++4');
                });
                test('backspacing open-paren of 1+(]+4 (empty paren group)', function () {
                    mq.typedText('1+(]+4');
                    assertLatex('1+\\left(\\right]+4');
                    mq.keystroke('Left Left Left Backspace');
                    assertLatex('1++4');
                });
                test('backspacing close-bracket then open-paren of 1+(] (empty paren group, nothing after)', function () {
                    mq.typedText('1+(]');
                    assertLatex('1+\\left(\\right]');
                    mq.keystroke('Backspace');
                    assertLatex('1+\\left(\\right)');
                    mq.keystroke('Backspace');
                    assertLatex('1+');
                });
                test('backspacing open-paren of 1+(] (empty paren group, nothing after)', function () {
                    mq.typedText('1+(]');
                    assertLatex('1+\\left(\\right]');
                    mq.keystroke('Left Backspace');
                    assertLatex('1+');
                });
                test('backspacing close-bracket then open-paren of (]+4 (empty paren group, nothing before)', function () {
                    mq.typedText('(]+4');
                    assertLatex('\\left(\\right]+4');
                    mq.keystroke('Left Left Backspace');
                    assertLatex('\\left(+4\\right)');
                    assertParenBlockNonEmpty();
                    mq.keystroke('Backspace');
                    assertLatex('+4');
                });
                test('backspacing open-paren of (]+4 (empty paren group, nothing before)', function () {
                    mq.typedText('(]+4');
                    assertLatex('\\left(\\right]+4');
                    mq.keystroke('Left Left Left Backspace');
                    assertLatex('+4');
                });
                test('rendering mismatched brackets 1+(2+3]+4 from LaTeX then backspacing close-bracket then open-paren', function () {
                    mq.latex('1+\\left(2+3\\right]+4');
                    assertLatex('1+\\left(2+3\\right]+4');
                    mq.keystroke('Left Left Backspace');
                    assertLatex('1+\\left(2+3+4\\right)');
                    mq.keystroke('Left Left Left Backspace');
                    assertLatex('1+2+3+4');
                });
                test('rendering mismatched brackets 1+(2+3]+4 from LaTeX then backspacing open-paren', function () {
                    mq.latex('1+\\left(2+3\\right]+4');
                    assertLatex('1+\\left(2+3\\right]+4');
                    mq.keystroke('Left Left Left Left Left Left Backspace');
                    assertLatex('1+2+3+4');
                });
                test('rendering paren group 1+(2+3)+4 from LaTeX then backspacing close-paren then open-paren', function () {
                    mq.latex('1+\\left(2+3\\right)+4');
                    assertLatex('1+\\left(2+3\\right)+4');
                    mq.keystroke('Left Left Backspace');
                    assertLatex('1+\\left(2+3+4\\right)');
                    mq.keystroke('Left Left Left Backspace');
                    assertLatex('1+2+3+4');
                });
                test('rendering paren group 1+(2+3)+4 from LaTeX then backspacing open-paren', function () {
                    mq.latex('1+\\left(2+3\\right)+4');
                    assertLatex('1+\\left(2+3\\right)+4');
                    mq.keystroke('Left Left Left Left Left Left Backspace');
                    assertLatex('1+2+3+4');
                });
                test('wrapping selection in parens 1+(2+3)+4 then backspacing close-paren then open-paren', function () {
                    mq.typedText('1+2+3+4');
                    assertLatex('1+2+3+4');
                    mq.keystroke('Left Left Shift-Left Shift-Left Shift-Left').typedText(')');
                    assertLatex('1+\\left(2+3\\right)+4');
                    mq.keystroke('Backspace');
                    assertLatex('1+\\left(2+3+4\\right)');
                    mq.keystroke('Left Left Left Backspace');
                    assertLatex('1+2+3+4');
                });
                test('wrapping selection in parens 1+(2+3)+4 then backspacing open-paren', function () {
                    mq.typedText('1+2+3+4');
                    assertLatex('1+2+3+4');
                    mq.keystroke('Left Left Shift-Left Shift-Left Shift-Left').typedText('(');
                    assertLatex('1+\\left(2+3\\right)+4');
                    mq.keystroke('Backspace');
                    assertLatex('1+2+3+4');
                });
                test('backspacing close-bracket of 1+(2+3] (nothing after) then typing', function () {
                    mq.typedText('1+(2+3]');
                    assertLatex('1+\\left(2+3\\right]');
                    mq.keystroke('Backspace');
                    assertLatex('1+\\left(2+3\\right)');
                    mq.typedText('+4');
                    assertLatex('1+\\left(2+3+4\\right)');
                });
                test('backspacing open-paren of (2+3]+4 (nothing before) then typing', function () {
                    mq.typedText('(2+3]+4');
                    assertLatex('\\left(2+3\\right]+4');
                    mq.keystroke('Home Right Backspace');
                    assertLatex('2+3+4');
                    mq.typedText('1+');
                    assertLatex('1+2+3+4');
                });
                test('backspacing paren containing a one-sided paren 0+[(1+2)+3]+4', function () {
                    mq.typedText('0+[1+2+3]+4');
                    assertLatex('0+\\left[1+2+3\\right]+4');
                    mq.keystroke('Left Left Left Left Left').typedText(')');
                    assertLatex('0+\\left[\\left(1+2\\right)+3\\right]+4');
                    mq.keystroke('Right Right Right Backspace');
                    assertLatex('0+\\left[1+2\\right)+3+4');
                });
                test('backspacing paren inside a one-sided paren (0+[1+2]+3)+4', function () {
                    mq.typedText('0+[1+2]+3)+4');
                    assertLatex('\\left(0+\\left[1+2\\right]+3\\right)+4');
                    mq.keystroke('Left Left Left Left Left Backspace');
                    assertLatex('0+\\left[1+2+3\\right)+4');
                });
                test('backspacing paren containing and inside a one-sided paren (([1+2]))', function () {
                    mq.typedText('(1+2))');
                    assertLatex('\\left(\\left(1+2\\right)\\right)');
                    mq.keystroke('Left Left').typedText(']');
                    assertLatex('\\left(\\left(\\left[1+2\\right]\\right)\\right)');
                    mq.keystroke('Right Backspace');
                    assertLatex('\\left(\\left(1+2\\right]\\right)');
                    mq.keystroke('Backspace');
                    assertLatex('\\left(1+2\\right)');
                });
                test('auto-expanding calls .siblingCreated() on new siblings 1+((2+3))', function () {
                    mq.typedText('1+((2+3))');
                    assertLatex('1+\\left(\\left(2+3\\right)\\right)');
                    mq.keystroke('Left Left Left Left Left Left Del');
                    assertLatex('1+\\left(\\left(2+3\\right)\\right)');
                    mq.keystroke('Left Left Del');
                    assertLatex('\\left(1+\\left(2+3\\right)\\right)');
                    // now check that the inner open-paren isn't still a ghost
                    mq.keystroke('Right Right Right Right Del');
                    assertLatex('1+\\left(2+3\\right)');
                });
                test('that unwrapping calls .siblingCreated() on new siblings ((1+2)+(3+4))+5', function () {
                    mq.typedText('(1+2+3+4)+5');
                    assertLatex('\\left(1+2+3+4\\right)+5');
                    mq.keystroke('Home Right Right Right Right').typedText(')');
                    assertLatex('\\left(\\left(1+2\\right)+3+4\\right)+5');
                    mq.keystroke('Right').typedText('(');
                    assertLatex('\\left(\\left(1+2\\right)+\\left(3+4\\right)\\right)+5');
                    mq.keystroke('Right Right Right Right Right Backspace');
                    assertLatex('\\left(1+2\\right)+\\left(3+4\\right)+5');
                    mq.keystroke('Left Left Left Left Backspace');
                    assertLatex('\\left(1+2\\right)+3+4+5');
                });
                test('typing Ctrl-Backspace deletes everything to the left of the cursor', function () {
                    mq.typedText('12345');
                    assertLatex('12345');
                    mq.keystroke('Left Left');
                    mq.keystroke('Ctrl-Backspace');
                    assertLatex('45');
                    mq.keystroke('Ctrl-Backspace');
                    assertLatex('45');
                });
                test('typing Ctrl-Del deletes everything to the right of the cursor', function () {
                    mq.typedText('12345');
                    assertLatex('12345');
                    mq.keystroke('Left Left');
                    mq.keystroke('Ctrl-Del');
                    assertLatex('123');
                    mq.keystroke('Ctrl-Del');
                    assertLatex('123');
                });
                suite('pipes', function () {
                    test('typing then backspacing a pipe in the middle of 1+2+3+4', function () {
                        mq.typedText('1+2+3+4');
                        assertLatex('1+2+3+4');
                        mq.keystroke('Left Left Left').typedText('|');
                        assertLatex('1+2+\\left|3+4\\right|');
                        mq.keystroke('Backspace');
                        assertLatex('1+2+3+4');
                    });
                    test('backspacing close-pipe then open-pipe of 1+|2+3|+4', function () {
                        mq.typedText('1+|2+3|+4');
                        assertLatex('1+\\left|2+3\\right|+4');
                        mq.keystroke('Left Left Backspace');
                        assertLatex('1+\\left|2+3+4\\right|');
                        mq.keystroke('Left Left Left Backspace');
                        assertLatex('1+2+3+4');
                    });
                    test('backspacing open-pipe of 1+|2+3|+4', function () {
                        mq.typedText('1+|2+3|+4');
                        assertLatex('1+\\left|2+3\\right|+4');
                        mq.keystroke('Left Left Left Left Left Left Backspace');
                        assertLatex('1+2+3+4');
                    });
                    test('backspacing close-pipe then open-pipe of 1+|2+3| (nothing after pipe pair)', function () {
                        mq.typedText('1+|2+3|');
                        assertLatex('1+\\left|2+3\\right|');
                        mq.keystroke('Backspace');
                        assertLatex('1+\\left|2+3\\right|');
                        mq.keystroke('Left Left Left Backspace');
                        assertLatex('1+2+3');
                    });
                    test('backspacing open-pipe of 1+|2+3| (nothing after pipe pair)', function () {
                        mq.typedText('1+|2+3|');
                        assertLatex('1+\\left|2+3\\right|');
                        mq.keystroke('Left Left Left Left Backspace');
                        assertLatex('1+2+3');
                    });
                    test('backspacing close-pipe then open-pipe of |2+3|+4 (nothing before pipe pair)', function () {
                        mq.typedText('|2+3|+4');
                        assertLatex('\\left|2+3\\right|+4');
                        mq.keystroke('Left Left Backspace');
                        assertLatex('\\left|2+3+4\\right|');
                        mq.keystroke('Left Left Left Backspace');
                        assertLatex('2+3+4');
                    });
                    test('backspacing open-pipe of |2+3|+4 (nothing before pipe pair)', function () {
                        mq.typedText('|2+3|+4');
                        assertLatex('\\left|2+3\\right|+4');
                        mq.keystroke('Left Left Left Left Left Left Backspace');
                        assertLatex('2+3+4');
                    });
                    function assertParenBlockNonEmpty() {
                        var parenBlock = $(mq.el()).find('.mq-paren+span');
                        assert.equal(parenBlock.length, 1, 'exactly 1 paren block');
                        assert.ok(!parenBlock.hasClass('mq-empty'), 'paren block auto-expanded, should no longer be gray');
                    }
                    test('backspacing close-pipe then open-pipe of 1+||+4 (empty pipe pair)', function () {
                        mq.typedText('1+||+4');
                        assertLatex('1+\\left|\\right|+4');
                        mq.keystroke('Left Left Backspace');
                        assertLatex('1+\\left|+4\\right|');
                        assertParenBlockNonEmpty();
                        mq.keystroke('Backspace');
                        assertLatex('1++4');
                    });
                    test('backspacing open-pipe of 1+||+4 (empty pipe pair)', function () {
                        mq.typedText('1+||+4');
                        assertLatex('1+\\left|\\right|+4');
                        mq.keystroke('Left Left Left Backspace');
                        assertLatex('1++4');
                    });
                    test('backspacing close-pipe then open-pipe of 1+|| (empty pipe pair, nothing after)', function () {
                        mq.typedText('1+||');
                        assertLatex('1+\\left|\\right|');
                        mq.keystroke('Backspace');
                        assertLatex('1+\\left|\\right|');
                        mq.keystroke('Backspace');
                        assertLatex('1+');
                    });
                    test('backspacing open-pipe of 1+|| (empty pipe pair, nothing after)', function () {
                        mq.typedText('1+||');
                        assertLatex('1+\\left|\\right|');
                        mq.keystroke('Left Backspace');
                        assertLatex('1+');
                    });
                    test('backspacing close-pipe then open-pipe of ||+4 (empty pipe pair, nothing before)', function () {
                        mq.typedText('||+4');
                        assertLatex('\\left|\\right|+4');
                        mq.keystroke('Left Left Backspace');
                        assertLatex('\\left|+4\\right|');
                        assertParenBlockNonEmpty();
                        mq.keystroke('Backspace');
                        assertLatex('+4');
                    });
                    test('backspacing open-pipe of ||+4 (empty pipe pair, nothing before)', function () {
                        mq.typedText('||+4');
                        assertLatex('\\left|\\right|+4');
                        mq.keystroke('Left Left Left Backspace');
                        assertLatex('+4');
                    });
                    test('rendering pipe pair 1+|2+3|+4 from LaTeX then backspacing close-pipe then open-pipe', function () {
                        mq.latex('1+\\left|2+3\\right|+4');
                        assertLatex('1+\\left|2+3\\right|+4');
                        mq.keystroke('Left Left Backspace');
                        assertLatex('1+\\left|2+3+4\\right|');
                        mq.keystroke('Left Left Left Backspace');
                        assertLatex('1+2+3+4');
                    });
                    test('rendering pipe pair 1+|2+3|+4 from LaTeX then backspacing open-pipe', function () {
                        mq.latex('1+\\left|2+3\\right|+4');
                        assertLatex('1+\\left|2+3\\right|+4');
                        mq.keystroke('Left Left Left Left Left Left Backspace');
                        assertLatex('1+2+3+4');
                    });
                    test('rendering mismatched paren/pipe group 1+|2+3)+4 from LaTeX then backspacing close-paren then open-pipe', function () {
                        mq.latex('1+\\left|2+3\\right)+4');
                        assertLatex('1+\\left|2+3\\right)+4');
                        mq.keystroke('Left Left Backspace');
                        assertLatex('1+\\left|2+3+4\\right|');
                        mq.keystroke('Left Left Left Backspace');
                        assertLatex('1+2+3+4');
                    });
                    test('rendering mismatched paren/pipe group 1+|2+3)+4 from LaTeX then backspacing open-pipe', function () {
                        mq.latex('1+\\left|2+3\\right)+4');
                        assertLatex('1+\\left|2+3\\right)+4');
                        mq.keystroke('Left Left Left Left Left Left Backspace');
                        assertLatex('1+2+3+4');
                    });
                    test('rendering mismatched paren/pipe group 1+(2+3|+4 from LaTeX then backspacing close-pipe then open-paren', function () {
                        mq.latex('1+\\left(2+3\\right|+4');
                        assertLatex('1+\\left(2+3\\right|+4');
                        mq.keystroke('Left Left Backspace');
                        assertLatex('1+\\left(2+3+4\\right)');
                        mq.keystroke('Left Left Left Backspace');
                        assertLatex('1+2+3+4');
                    });
                    test('rendering mismatched paren/pipe group 1+(2+3|+4 from LaTeX then backspacing open-paren', function () {
                        mq.latex('1+\\left(2+3\\right|+4');
                        assertLatex('1+\\left(2+3\\right|+4');
                        mq.keystroke('Left Left Left Left Left Left Backspace');
                        assertLatex('1+2+3+4');
                    });
                    test('wrapping selection in pipes 1+|2+3|+4 then backspacing open-pipe', function () {
                        mq.typedText('1+2+3+4');
                        assertLatex('1+2+3+4');
                        mq.keystroke('Left Left Shift-Left Shift-Left Shift-Left').typedText('|');
                        assertLatex('1+\\left|2+3\\right|+4');
                        mq.keystroke('Backspace');
                        assertLatex('1+2+3+4');
                    });
                    test('wrapping selection in pipes 1+|2+3|+4 then backspacing close-pipe then open-pipe', function () {
                        mq.typedText('1+2+3+4');
                        assertLatex('1+2+3+4');
                        mq.keystroke('Left Left Shift-Left Shift-Left Shift-Left').typedText('|');
                        assertLatex('1+\\left|2+3\\right|+4');
                        mq.keystroke('Tab Backspace');
                        assertLatex('1+\\left|2+3+4\\right|');
                        mq.keystroke('Left Left Left Backspace');
                        assertLatex('1+2+3+4');
                    });
                    test('backspacing close-pipe of 1+|2+3| (nothing after) then typing', function () {
                        mq.typedText('1+|2+3|');
                        assertLatex('1+\\left|2+3\\right|');
                        mq.keystroke('Backspace');
                        assertLatex('1+\\left|2+3\\right|');
                        mq.typedText('+4');
                        assertLatex('1+\\left|2+3+4\\right|');
                    });
                    test('backspacing open-pipe of |2+3|+4 (nothing before) then typing', function () {
                        mq.typedText('|2+3|+4');
                        assertLatex('\\left|2+3\\right|+4');
                        mq.keystroke('Home Right Backspace');
                        assertLatex('2+3+4');
                        mq.typedText('1+');
                        assertLatex('1+2+3+4');
                    });
                    test('backspacing pipe containing a one-sided pipe 0+|1+|2+3||+4', function () {
                        mq.typedText('0+|1+2+3|+4');
                        assertLatex('0+\\left|1+2+3\\right|+4');
                        mq.keystroke('Left Left Left Left Left Left').typedText('|');
                        assertLatex('0+\\left|1+\\left|2+3\\right|\\right|+4');
                        mq.keystroke('Shift-Tab Shift-Tab Del');
                        assertLatex('0+1+\\left|2+3\\right|+4');
                    });
                    test('backspacing pipe inside a one-sided pipe 0+|1+|2+3|+4|', function () {
                        mq.typedText('0+1+|2+3|+4');
                        assertLatex('0+1+\\left|2+3\\right|+4');
                        mq.keystroke('Home Right Right').typedText('|');
                        assertLatex('0+\\left|1+\\left|2+3\\right|+4\\right|');
                        mq.keystroke('Right Right Del');
                        assertLatex('0+\\left|1+2+3\\right|+4');
                    });
                    test('backspacing pipe containing and inside a one-sided pipe |0+|1+|2+3||+4|', function () {
                        mq.typedText('0+|1+2+3|+4');
                        assertLatex('0+\\left|1+2+3\\right|+4');
                        mq.keystroke('Home').typedText('|');
                        assertLatex('\\left|0+\\left|1+2+3\\right|+4\\right|');
                        mq.keystroke('Right Right Right Right Right').typedText('|');
                        assertLatex('\\left|0+\\left|1+\\left|2+3\\right|\\right|+4\\right|');
                        mq.keystroke('Left Left Left Backspace');
                        assertLatex('\\left|0+1+\\left|2+3\\right|+4\\right|');
                    });
                    test('backspacing pipe containing a one-sided pipe facing same way 0+||1+2||+3', function () {
                        mq.typedText('0+|1+2|+3');
                        assertLatex('0+\\left|1+2\\right|+3');
                        mq.keystroke('Home Right Right Right').typedText('|');
                        assertLatex('0+\\left|\\left|1+2\\right|\\right|+3');
                        mq.keystroke('Tab Tab Backspace');
                        assertLatex('0+\\left|\\left|1+2\\right|+3\\right|');
                    });
                    test('backspacing pipe inside a one-sided pipe facing same way 0+|1+|2+3|+4|', function () {
                        mq.typedText('0+1+|2+3|+4');
                        assertLatex('0+1+\\left|2+3\\right|+4');
                        mq.keystroke('Home Right Right').typedText('|');
                        assertLatex('0+\\left|1+\\left|2+3\\right|+4\\right|');
                        mq.keystroke('Right Right Right Right Right Right Right Backspace');
                        assertLatex('0+\\left|1+\\left|2+3+4\\right|\\right|');
                    });
                    test('backspacing open-paren of mismatched paren/pipe group containing a one-sided pipe 0+(1+|2+3||+4', function () {
                        mq.latex('0+\\left(1+2+3\\right|+4');
                        assertLatex('0+\\left(1+2+3\\right|+4');
                        mq.keystroke('Left Left Left Left Left Left').typedText('|');
                        assertLatex('0+\\left(1+\\left|2+3\\right|\\right|+4');
                        mq.keystroke('Shift-Tab Shift-Tab Del');
                        assertLatex('0+1+\\left|2+3\\right|+4');
                    });
                    test('backspacing open-paren of mismatched paren/pipe group inside a one-sided pipe 0+|1+(2+3|+4|', function () {
                        mq.latex('0+1+\\left(2+3\\right|+4');
                        assertLatex('0+1+\\left(2+3\\right|+4');
                        mq.keystroke('Home Right Right').typedText('|');
                        assertLatex('0+\\left|1+\\left(2+3\\right|+4\\right|');
                        mq.keystroke('Right Right Del');
                        assertLatex('0+\\left|1+2+3\\right|+4');
                    });
                });
            }
            suite('typing outside ghost paren', function () {
                test('typing outside ghost paren solidifies ghost 1+(2+3)', function () {
                    mq.typedText('1+(2+3');
                    assertLatex('1+\\left(2+3\\right)');
                    mq.keystroke('Right').typedText('+4');
                    assertLatex('1+\\left(2+3\\right)+4');
                    mq.keystroke('Left Left Left Left Left Left Left Del');
                    assertLatex('\\left(1+2+3\\right)+4');
                });
                test('selected and replaced by LiveFraction solidifies ghosts (1+2)/( )', function () {
                    mq.typedText('1+2)/');
                    assertLatex('\\frac{\\left(1+2\\right)}{ }');
                    mq.keystroke('Left Backspace');
                    assertLatex('\\frac{\\left(1+2\\right)}{ }');
                });
                test('close paren group by typing close-bracket outside ghost paren (1+2]', function () {
                    mq.typedText('(1+2');
                    assertLatex('\\left(1+2\\right)');
                    mq.keystroke('Right').typedText(']');
                    assertLatex('\\left(1+2\\right]');
                });
                test('close adjacent paren group before containing paren group (1+(2+3])', function () {
                    mq.typedText('(1+(2+3');
                    assertLatex('\\left(1+\\left(2+3\\right)\\right)');
                    mq.keystroke('Right').typedText(']');
                    assertLatex('\\left(1+\\left(2+3\\right]\\right)');
                    mq.typedText(']');
                    assertLatex('\\left(1+\\left(2+3\\right]\\right]');
                });
                test('can type close-bracket on solid side of one-sided paren [](1+2)', function () {
                    mq.typedText('(1+2');
                    assertLatex('\\left(1+2\\right)');
                    mq.moveToLeftEnd().typedText(']');
                    assertLatex('\\left[\\right]\\left(1+2\\right)');
                });
                suite('pipes', function () {
                    test('close pipe pair from outside to the right |1+2|', function () {
                        mq.typedText('|1+2');
                        assertLatex('\\left|1+2\\right|');
                        mq.keystroke('Right').typedText('|');
                        assertLatex('\\left|1+2\\right|');
                        mq.keystroke('Home Del');
                        assertLatex('\\left|1+2\\right|');
                    });
                    test('close pipe pair from outside to the left |1+2|', function () {
                        mq.typedText('|1+2|');
                        assertLatex('\\left|1+2\\right|');
                        mq.keystroke('Home Del');
                        assertLatex('\\left|1+2\\right|');
                        mq.keystroke('Left').typedText('|');
                        assertLatex('\\left|1+2\\right|');
                        mq.keystroke('Ctrl-End Backspace');
                        assertLatex('\\left|1+2\\right|');
                    });
                    test('can type pipe on solid side of one-sided pipe ||||', function () {
                        mq.typedText('|');
                        assertLatex('\\left|\\right|');
                        mq.moveToLeftEnd().typedText('|');
                        assertLatex('\\left|\\left|\\right|\\right|');
                    });
                });
            });
        });
        suite('autoParenthesizedFunctions', function () {
            var normalConfig = {
                autoParenthesizedFunctions: 'sin cos tan ln',
                autoOperatorNames: 'sin ln',
                autoCommands: 'sum int',
            };
            var subscriptConfig = {
                autoParenthesizedFunctions: 'sin cos tan ln',
                autoOperatorNames: 'sin ln',
                autoCommands: 'sum int',
                disableAutoSubstitutionInSubscripts: true,
            };
            setup(function () {
                mq.config(normalConfig);
            });
            test('individual commands', function () {
                //autoParenthesized and also operatored
                mq.typedText('sin');
                assertLatex('\\sin\\left(\\right)');
                mq.latex('');
                //not parenthesized
                mq.typedText('cot');
                assertLatex('cot');
                mq.latex('');
                //we don't autoparenthesize non-autocommands
                mq.typedText('tan');
                assertLatex('tan');
                mq.latex('');
                //doesn't parenthesize when the middle is completed
                mq.typedText('tn');
                mq.keystroke('Left');
                mq.typedText('a');
                assertLatex('tan');
                mq.latex('');
                //doesn't parenthesize when the middle is completed, but does autoFn
                mq.typedText('sn');
                mq.keystroke('Left');
                mq.typedText('i');
                assertLatex('\\sin');
            });
            test('does not double parenthesize if parenthesized', function () {
                //autoParenthesized and also operatored
                mq.typedText('sin');
                assertLatex('\\sin\\left(\\right)');
                mq.keystroke('Left');
                mq.keystroke('Backspace');
                mq.typedText('n');
                assertLatex('\\sin\\left(\\right)');
            });
            test('works in \\sum', function () {
                mq.typedText('sum');
                assertLatex('\\sum_{ }^{ }');
                mq.typedText('sin');
                assertLatex('\\sum_{\\sin\\left(\\right)}^{ }');
            });
            test('works in \\int', function () {
                mq.typedText('int');
                assertLatex('\\int_{ }^{ }');
                mq.typedText('sin');
                assertLatex('\\int_{\\sin\\left(\\right)}^{ }');
            });
            test('no auto operator names in simple subscripts', function () {
                mq.config(normalConfig);
                mq.typedText('x_');
                assertLatex('x_{ }');
                mq.typedText('sin');
                assertLatex('x_{\\sin\\left(\\right)}');
                mq.latex('');
                mq.config(subscriptConfig);
                mq.typedText('x_');
                assertLatex('x_{ }');
                mq.typedText('sin');
                assertLatex('x_{sin}');
                mq.config(normalConfig);
            });
            test('no auto operator names in simple subscripts when pasting', function () {
                var textarea = $(mq.el()).find('textarea');
                mq.config(normalConfig);
                textarea.trigger('paste').val('x_{sin}').trigger('input');
                assertLatex('x_{\\sin}');
                mq.latex('');
                mq.config(subscriptConfig);
                textarea.trigger('paste').val('x_{sin}').trigger('input');
                assertLatex('x_{sin}');
                mq.config(normalConfig);
            });
        });
        suite('typingSlashCreatesNewFraction', function () {
            setup(function () {
                mq.config({
                    typingSlashCreatesNewFraction: true,
                });
            });
            test('typing slash creates new fraction', function () {
                //autoParenthesized and also operatored
                mq.typedText('1/');
                assertLatex('1\\frac{ }{ }');
            });
        });
        suite('autoCommands', function () {
            var normalConfig = {
                autoOperatorNames: 'sin pp',
                autoCommands: 'pi tau phi theta Gamma sum prod sqrt nthroot cbrt percent',
            };
            var subscriptConfig = {
                autoOperatorNames: 'sin pp',
                autoCommands: 'pi tau phi theta Gamma sum prod sqrt nthroot cbrt percent',
                disableAutoSubstitutionInSubscripts: true,
            };
            setup(function () {
                mq.config(normalConfig);
            });
            test('individual commands', function () {
                mq.typedText('sum' + 'n=0');
                mq.keystroke('Up').typedText('100').keystroke('Right');
                assertLatex('\\sum_{n=0}^{100}');
                mq.keystroke('Ctrl-Backspace');
                mq.typedText('prod');
                mq.typedText('n=0').keystroke('Up').typedText('100').keystroke('Right');
                assertLatex('\\prod_{n=0}^{100}');
                mq.keystroke('Ctrl-Backspace');
                mq.typedText('sqrt');
                mq.typedText('100').keystroke('Right');
                assertLatex('\\sqrt{100}');
                mq.keystroke('Ctrl-Backspace');
                mq.typedText('nthroot');
                mq.typedText('n').keystroke('Right').typedText('100').keystroke('Right');
                assertLatex('\\sqrt[n]{100}');
                assertMathspeak('Root Index "n" Start Root 100 End Root');
                mq.keystroke('Ctrl-Backspace');
                mq.typedText('pi');
                assertLatex('\\pi');
                mq.keystroke('Backspace');
                mq.typedText('tau');
                assertLatex('\\tau');
                mq.keystroke('Backspace');
                mq.typedText('phi');
                assertLatex('\\phi');
                mq.keystroke('Backspace');
                mq.typedText('theta');
                assertLatex('\\theta');
                mq.keystroke('Backspace');
                mq.typedText('Gamma');
                assertLatex('\\Gamma');
                mq.keystroke('Backspace');
                mq.typedText('percent');
                assertLatex('\\%\\operatorname{of}');
                mq.keystroke('Backspace');
                mq.typedText('cbrt');
                assertLatex('\\sqrt[3]{}');
                assertMathspeak('Start Cube Root End Cube Root');
                mq.typedText('pi');
                assertLatex('\\sqrt[3]{\\pi}');
            });
            test('sequences of auto-commands and other assorted characters', function () {
                mq.typedText('sin' + 'pi');
                assertLatex('\\sin\\pi');
                mq.keystroke('Left Backspace');
                assertLatex('si\\pi');
                mq.keystroke('Left').typedText('p');
                assertLatex('spi\\pi');
                mq.typedText('i');
                assertLatex('s\\pi i\\pi');
                mq.typedText('p');
                assertLatex('s\\pi pi\\pi');
                mq.keystroke('Right').typedText('n');
                assertLatex('s\\pi pin\\pi');
                mq.keystroke('Left Left Left').typedText('s');
                assertLatex('s\\pi spin\\pi');
                mq.keystroke('Backspace');
                assertLatex('s\\pi pin\\pi');
                mq.keystroke('Del').keystroke('Backspace');
                assertLatex('\\sin\\pi');
            });
            test('has lower "precedence" than operator names', function () {
                mq.typedText('ppi');
                assertLatex('\\operatorname{pp}i');
                mq.keystroke('Left Left').typedText('i');
                assertLatex('\\pi pi');
            });
            test('command contains non-letters', function () {
                assert.throws(function () {
                    MQ.config({ autoCommands: 'e1' });
                });
            });
            test('command length less than 2', function () {
                assert.throws(function () {
                    MQ.config({ autoCommands: 'e' });
                });
            });
            test('command is a built-in operator name', function () {
                var cmds = ('Pr arg deg det dim exp gcd hom inf ker lg lim ln log max min sup' +
                    ' limsup liminf injlim projlim Pr').split(' ');
                for (var i = 0; i < cmds.length; i += 1) {
                    assert.throws(function () {
                        MQ.config({ autoCommands: cmds[i] });
                    }, 'MQ.config({ autoCommands: "' + cmds[i] + '" })');
                }
            });
            test('built-in operator names even after auto-operator names overridden', function () {
                MQ.config({ autoOperatorNames: 'sin inf arcosh cosh cos cosec csc' });
                // ^ happen to be the ones required by autoOperatorNames.test.js
                var cmds = 'Pr arg deg det exp gcd inf lg lim ln log max min sup'.split(' ');
                for (var i = 0; i < cmds.length; i += 1) {
                    assert.throws(function () {
                        MQ.config({ autoCommands: cmds[i] });
                    }, 'MQ.config({ autoCommands: "' + cmds[i] + '" })');
                }
            });
            test('no auto commands in simple subscripts', function () {
                mq.config(normalConfig);
                mq.typedText('x_');
                assertLatex('x_{ }');
                mq.typedText('pi');
                assertLatex('x_{\\pi}');
                mq.latex('');
                mq.config(subscriptConfig);
                mq.typedText('x_');
                assertLatex('x_{ }');
                mq.typedText('pi');
                assertLatex('x_{pi}');
                mq.config(normalConfig);
            });
            suite('command list not perfectly space-delimited', function () {
                test('double space', function () {
                    assert.throws(function () {
                        MQ.config({ autoCommands: 'pi  theta' });
                    });
                });
                test('leading space', function () {
                    assert.throws(function () {
                        MQ.config({ autoCommands: ' pi' });
                    });
                });
                test('trailing space', function () {
                    assert.throws(function () {
                        MQ.config({ autoCommands: 'pi ' });
                    });
                });
            });
        });
        suite('inequalities', function () {
            // assertFullyFunctioningInequality() checks not only that the inequality
            // has the right LaTeX and when you backspace it has the right LaTeX,
            // but also that when you backspace you get the right state such that
            // you can either type = again to get the non-strict inequality again,
            // or backspace again and it'll delete correctly.
            function assertFullyFunctioningInequality(nonStrict, strict, nonStrictMathspeak, strictMathspeak) {
                assertLatex(nonStrict);
                assertMathspeak(nonStrictMathspeak);
                mq.keystroke('Backspace');
                assertLatex(strict);
                assertMathspeak(strictMathspeak);
                mq.typedText('=');
                assertLatex(nonStrict);
                assertMathspeak(nonStrictMathspeak);
                mq.keystroke('Backspace');
                assertLatex(strict);
                assertMathspeak(strictMathspeak);
                mq.keystroke('Backspace');
                assertLatex('');
                assertMathspeak('');
            }
            test('typing and backspacing <= and >=', function () {
                mq.typedText('<');
                assertLatex('<');
                assertMathspeak('less than');
                mq.typedText('=');
                assertFullyFunctioningInequality('\\le', '<', 'less than or equal to', 'less than');
                mq.typedText('>');
                assertLatex('>');
                mq.typedText('=');
                assertFullyFunctioningInequality('\\ge', '>', 'greater than or equal to', 'greater than');
                mq.typedText('<<>>==>><<==');
                assertLatex('<<>\\ge=>><\\le=');
                assertMathspeak('less than less than greater than greater than or equal to equals greater than greater than less than less than or equal to equals');
            });
            test('typing ≤ and ≥ chars directly', function () {
                mq.typedText('≤');
                assertFullyFunctioningInequality('\\le', '<', 'less than or equal to', 'less than');
                mq.typedText('≥');
                assertFullyFunctioningInequality('\\ge', '>', 'greater than or equal to', 'greater than');
            });
            test('typing and backspacing \\to', function () {
                mq.typedText('-');
                assertLatex('-');
                assertMathspeak('negative');
                mq.typedText('>');
                assertLatex('\\to');
                assertMathspeak('to');
                mq.typedText('-');
                assertLatex('\\to-');
                assertMathspeak('to negative');
                mq.typedText('>');
                assertLatex('\\to\\to');
                assertMathspeak('to to');
                mq.keystroke('Backspace');
                assertLatex('\\to-');
                assertMathspeak('to negative');
                mq.keystroke('Backspace');
                assertLatex('\\to');
                assertMathspeak('to');
                mq.keystroke('Backspace');
                assertLatex('-');
                assertMathspeak('negative');
                mq.keystroke('Backspace');
                mq.typedText('a->b');
                assertLatex('a\\to b');
                assertMathspeak('"a" to "b"');
                mq.latex('');
                mq.typedText('a→b');
                assertLatex('a\\to b');
                assertMathspeak('"a" to "b"');
            });
            test('typing and backspacing ~', function () {
                mq.typedText('~');
                assertLatex('\\sim');
                assertMathspeak('tilde');
                mq.typedText('~');
                assertLatex('\\approx');
                assertMathspeak('approximately equal');
                mq.typedText('~');
                assertLatex('\\approx\\sim');
                assertMathspeak('approximately equal tilde');
                mq.typedText('~');
                assertLatex('\\approx\\approx');
                assertMathspeak('approximately equal approximately equal');
                mq.keystroke('Backspace');
                assertLatex('\\approx\\sim');
                assertMathspeak('approximately equal tilde');
                mq.keystroke('Backspace');
                assertLatex('\\approx');
                assertMathspeak('approximately equal');
                mq.keystroke('Backspace');
                assertLatex('\\sim');
                assertMathspeak('tilde');
                mq.keystroke('Backspace');
                mq.typedText('a~b');
                assertLatex('a\\sim b');
                assertMathspeak('"a" tilde "b"');
                mq.keystroke('Backspace');
                mq.typedText('~b');
                assertLatex('a\\approx b');
                assertMathspeak('"a" approximately equal "b"');
            });
            test('typing ≈ char directly', function () {
                mq.typedText('≈');
                assertLatex('\\approx');
                assertMathspeak('approximately equal');
                mq.keystroke('Backspace');
                assertLatex('\\sim');
                assertMathspeak('tilde');
            });
            suite('rendered from LaTeX', function () {
                test('control sequences', function () {
                    mq.latex('\\le');
                    assertFullyFunctioningInequality('\\le', '<', 'less than or equal to', 'less than');
                    mq.latex('\\ge');
                    assertFullyFunctioningInequality('\\ge', '>', 'greater than or equal to', 'greater than');
                });
                test('≤ and ≥ chars', function () {
                    mq.latex('≤');
                    assertFullyFunctioningInequality('\\le', '<', 'less than or equal to', 'less than');
                    mq.latex('≥');
                    assertFullyFunctioningInequality('\\ge', '>', 'greater than or equal to', 'greater than');
                });
            });
        });
        suite('SupSub behavior options', function () {
            test('charsThatBreakOutOfSupSub', function () {
                assert.equal(mq.typedText('x^2n+y').latex(), 'x^{2n+y}');
                mq.latex('');
                assert.equal(mq.typedText('x^+2n').latex(), 'x^{+2n}');
                mq.latex('');
                assert.equal(mq.typedText('x^-2n').latex(), 'x^{-2n}');
                mq.latex('');
                assert.equal(mq.typedText('x^=2n').latex(), 'x^{=2n}');
                mq.latex('');
                MQ.config({ charsThatBreakOutOfSupSub: '+-=<>' });
                assert.equal(mq.typedText('x^2n+y').latex(), 'x^{2n}+y');
                mq.latex('');
                // Unary operators never break out of exponents.
                assert.equal(mq.typedText('x^+2n').latex(), 'x^{+2n}');
                mq.latex('');
                assert.equal(mq.typedText('x^-2n').latex(), 'x^{-2n}');
                mq.latex('');
                assert.equal(mq.typedText('x^=2n').latex(), 'x^{=2n}');
                mq.latex('');
                // Only break out of exponents if cursor at the end, don't
                // jump from the middle of the exponent out to the right.
                assert.equal(mq.typedText('x^ab').latex(), 'x^{ab}');
                assert.equal(mq.keystroke('Left').typedText('+').latex(), 'x^{a+b}');
                mq.latex('');
            });
            test('supSubsRequireOperand', function () {
                assert.equal(mq.typedText('^').latex(), '^{ }');
                assert.equal(mq.typedText('2').latex(), '^{2}');
                assert.equal(mq.typedText('n').latex(), '^{2n}');
                mq.latex('');
                assert.equal(mq.typedText('x').latex(), 'x');
                assert.equal(mq.typedText('^').latex(), 'x^{ }');
                assert.equal(mq.typedText('2').latex(), 'x^{2}');
                assert.equal(mq.typedText('n').latex(), 'x^{2n}');
                mq.latex('');
                assert.equal(mq.typedText('x').latex(), 'x');
                assert.equal(mq.typedText('^').latex(), 'x^{ }');
                assert.equal(mq.typedText('^').latex(), 'x^{^{ }}');
                assert.equal(mq.typedText('2').latex(), 'x^{^{2}}');
                assert.equal(mq.typedText('n').latex(), 'x^{^{2n}}');
                mq.latex('');
                assert.equal(mq.typedText('2').latex(), '2');
                assert.equal(mq.keystroke('Shift-Left').typedText('^').latex(), '^{2}');
                mq.latex('');
                MQ.config({ supSubsRequireOperand: true });
                assert.equal(mq.typedText('^').latex(), '');
                assert.equal(mq.typedText('2').latex(), '2');
                assert.equal(mq.typedText('n').latex(), '2n');
                mq.latex('');
                assert.equal(mq.typedText('x').latex(), 'x');
                assert.equal(mq.typedText('^').latex(), 'x^{ }');
                assert.equal(mq.typedText('2').latex(), 'x^{2}');
                assert.equal(mq.typedText('n').latex(), 'x^{2n}');
                mq.latex('');
                assert.equal(mq.typedText('x').latex(), 'x');
                assert.equal(mq.typedText('^').latex(), 'x^{ }');
                assert.equal(mq.typedText('^').latex(), 'x^{ }');
                assert.equal(mq.typedText('2').latex(), 'x^{2}');
                assert.equal(mq.typedText('n').latex(), 'x^{2n}');
                mq.latex('');
                assert.equal(mq.typedText('2').latex(), '2');
                assert.equal(mq.keystroke('Shift-Left').typedText('^').latex(), '^{2}');
            });
        });
        suite('alternative symbols when typing / and *', function () {
            test('typingSlashWritesDivisionSymbol', function () {
                mq.typedText('/');
                assertLatex('\\frac{ }{ }');
                mq.config({ typingSlashWritesDivisionSymbol: true });
                mq.keystroke('Backspace').typedText('/');
                assertLatex('\\div');
            });
            test('typingAsteriskWritesTimesSymbol', function () {
                mq.typedText('*');
                assertLatex('\\cdot');
                mq.config({ typingAsteriskWritesTimesSymbol: true });
                mq.keystroke('Backspace').typedText('*');
                assertLatex('\\times');
            });
        });
        suite('typingPercentWritesPercentOf', function () {
            test('typingSlashWritesDivisionSymbol', function () {
                mq.typedText('%');
                assertLatex('\\%');
                mq.keystroke('Backspace');
                mq.config({ typingPercentWritesPercentOf: true });
                mq.typedText('%');
                assertLatex('\\%\\operatorname{of}');
                mq.keystroke('Backspace');
                assertLatex('');
            });
            test('percentof round trips correctly through serializing and parsing', function () {
                mq.latex('\\%\\operatorname{of}');
                assertLatex('\\%\\operatorname{of}');
            });
            test('overline renders as expected', function () {
                mq.latex('0.3\\overline{5}');
                assertLatex('0.3\\overline{5}');
                assertMathspeak('0 .3 StartOverline 5 EndOverline');
            });
        });
    });
    suite('up/down', function () {
        var mq, rootBlock, controller, cursor;
        setup(function () {
            mq = MQ.MathField($('<span></span>').appendTo('#mock')[0]);
            rootBlock = mq.__controller.root;
            controller = mq.__controller;
            cursor = controller.cursor;
        });
        test('up/down in out of exponent', function () {
            controller.renderLatexMath('x^{nm}');
            var exp = rootBlock.ends[R], expBlock = exp.ends[L];
            assert.equal(exp.latex(), '^{nm}', 'right end el is exponent');
            assert.equal(cursor.parent, rootBlock, 'cursor is in root block');
            assert.equal(cursor[L], exp, 'cursor is at the end of root block');
            mq.keystroke('Up');
            assert.equal(cursor.parent, expBlock, 'cursor up goes into exponent');
            mq.keystroke('Down');
            assert.equal(cursor.parent, rootBlock, 'cursor down leaves exponent');
            assert.equal(cursor[L], exp, 'down when cursor at end of exponent puts cursor after exponent');
            mq.keystroke('Up Left Left');
            assert.equal(cursor.parent, expBlock, 'cursor up left stays in exponent');
            assert.equal(cursor[L], 0, 'cursor is at the beginning of exponent');
            mq.keystroke('Down');
            assert.equal(cursor.parent, rootBlock, 'cursor down leaves exponent');
            assert.equal(cursor[R], exp, 'cursor down in beginning of exponent puts cursor before exponent');
            mq.keystroke('Up Right');
            assert.equal(cursor.parent, expBlock, 'cursor up left stays in exponent');
            assert.equal(cursor[L].latex(), 'n', 'cursor is in the middle of exponent');
            assert.equal(cursor[R].latex(), 'm', 'cursor is in the middle of exponent');
            mq.keystroke('Down');
            assert.equal(cursor.parent, rootBlock, 'cursor down leaves exponent');
            assert.equal(cursor[R], exp, 'cursor down in middle of exponent puts cursor before exponent');
        });
        // literally just swapped up and down, exponent with subscript, nm with 12
        test('up/down in out of subscript', function () {
            controller.renderLatexMath('a_{12}');
            var sub = rootBlock.ends[R], subBlock = sub.ends[L];
            assert.equal(sub.latex(), '_{12}', 'right end el is subscript');
            assert.equal(cursor.parent, rootBlock, 'cursor is in root block');
            assert.equal(cursor[L], sub, 'cursor is at the end of root block');
            mq.keystroke('Down');
            assert.equal(cursor.parent, subBlock, 'cursor down goes into subscript');
            mq.keystroke('Up');
            assert.equal(cursor.parent, rootBlock, 'cursor up leaves subscript');
            assert.equal(cursor[L], sub, 'up when cursor at end of subscript puts cursor after subscript');
            mq.keystroke('Down Left Left');
            assert.equal(cursor.parent, subBlock, 'cursor down left stays in subscript');
            assert.equal(cursor[L], 0, 'cursor is at the beginning of subscript');
            mq.keystroke('Up');
            assert.equal(cursor.parent, rootBlock, 'cursor up leaves subscript');
            assert.equal(cursor[R], sub, 'cursor up in beginning of subscript puts cursor before subscript');
            mq.keystroke('Down Right');
            assert.equal(cursor.parent, subBlock, 'cursor down left stays in subscript');
            assert.equal(cursor[L].latex(), '1', 'cursor is in the middle of subscript');
            assert.equal(cursor[R].latex(), '2', 'cursor is in the middle of subscript');
            mq.keystroke('Up');
            assert.equal(cursor.parent, rootBlock, 'cursor up leaves subscript');
            assert.equal(cursor[R], sub, 'cursor up in middle of subscript puts cursor before subscript');
        });
        test('up/down into and within fraction', function () {
            controller.renderLatexMath('\\frac{12}{34}');
            var frac = rootBlock.ends[L], numer = frac.ends[L], denom = frac.ends[R];
            assert.equal(frac.latex(), '\\frac{12}{34}', 'fraction is in root block');
            assert.equal(frac, rootBlock.ends[R], 'fraction is sole child of root block');
            assert.equal(numer.latex(), '12', 'numerator is left end child of fraction');
            assert.equal(denom.latex(), '34', 'denominator is right end child of fraction');
            mq.keystroke('Up');
            assert.equal(cursor.parent, numer, 'cursor up goes into numerator');
            assert.equal(cursor[R], 0, 'cursor up from right of fraction inserts at right end of numerator');
            mq.keystroke('Down');
            assert.equal(cursor.parent, denom, 'cursor down goes into denominator');
            assert.equal(cursor[R], 0, 'cursor down from numerator inserts at right end of denominator');
            mq.keystroke('Up');
            assert.equal(cursor.parent, numer, 'cursor up goes into numerator');
            assert.equal(cursor[R], 0, 'cursor up from denominator inserts at right end of numerator');
            mq.keystroke('Left Left Left');
            assert.equal(cursor.parent, rootBlock, 'cursor outside fraction');
            assert.equal(cursor[R], frac, 'cursor before fraction');
            mq.keystroke('Up');
            assert.equal(cursor.parent, numer, 'cursor up goes into numerator');
            assert.equal(cursor[L], 0, 'cursor up from left of fraction inserts at left end of numerator');
            mq.keystroke('Left');
            assert.equal(cursor.parent, rootBlock, 'cursor outside fraction');
            assert.equal(cursor[R], frac, 'cursor before fraction');
            mq.keystroke('Down');
            assert.equal(cursor.parent, denom, 'cursor down goes into denominator');
            assert.equal(cursor[L], 0, 'cursor down from left of fraction inserts at left end of denominator');
        });
        test('nested subscripts and fractions', function () {
            controller.renderLatexMath('\\frac{d}{dx_{\\frac{24}{36}0}}\\sqrt{x}=x^{\\frac{1}{2}}');
            var exp = rootBlock.ends[R], expBlock = exp.ends[L], half = expBlock.ends[L], halfNumer = half.ends[L], halfDenom = half.ends[R];
            mq.keystroke('Left');
            assert.equal(cursor.parent, expBlock, 'cursor left goes into exponent');
            mq.keystroke('Down');
            assert.equal(cursor.parent, halfDenom, 'cursor down goes into denominator of half');
            mq.keystroke('Down');
            assert.equal(cursor.parent, rootBlock, 'down again puts cursor back in root block');
            assert.equal(cursor[L], exp, 'down from end of half puts cursor after exponent');
            var derivative = rootBlock.ends[L], dBlock = derivative.ends[L], dxBlock = derivative.ends[R], sub = dxBlock.ends[R], subBlock = sub.ends[L], subFrac = subBlock.ends[L], subFracNumer = subFrac.ends[L], subFracDenom = subFrac.ends[R];
            cursor.insAtLeftEnd(rootBlock);
            mq.keystroke('Down Right Right Down');
            assert.equal(cursor.parent, subBlock, 'cursor in subscript');
            mq.keystroke('Up');
            assert.equal(cursor.parent, subFracNumer, 'cursor up from beginning of subscript goes into subscript fraction numerator');
            mq.keystroke('Up');
            assert.equal(cursor.parent, dxBlock, 'cursor up from subscript fraction numerator goes out of subscript');
            assert.equal(cursor[R], sub, 'cursor up from subscript fraction numerator goes before subscript');
            mq.keystroke('Down Down');
            assert.equal(cursor.parent, subFracDenom, 'cursor in subscript fraction denominator');
            mq.keystroke('Up Up');
            assert.equal(cursor.parent, dxBlock, 'cursor up up from subscript fraction denominator thats not at right end goes out of subscript');
            assert.equal(cursor[R], sub, 'cursor up up from subscript fraction denominator thats not at right end goes before subscript');
            cursor.insAtRightEnd(subBlock);
            controller.backspace();
            assert.equal(subFrac[R], 0, 'subscript fraction is at right end');
            assert.equal(cursor[L], subFrac, 'cursor after subscript fraction');
            mq.keystroke('Down');
            assert.equal(cursor.parent, subFracDenom, 'cursor in subscript fraction denominator');
            mq.keystroke('Up Up');
            assert.equal(cursor.parent, dxBlock, 'cursor up up from subscript fraction denominator that is at right end goes out of subscript');
            assert.equal(cursor[L], sub, 'cursor up up from subscript fraction denominator that is at right end goes after subscript');
        });
        test('integral in exponent', function () {
            controller.renderLatexMath('2^{\\int_0^1}');
            var exp = rootBlock.ends[R], expBlock = exp.ends[L];
            mq.keystroke('Up');
            mq.keystroke('Up');
            assert.equal(cursor.parent.latex(), '1', 'cursor up goes to upper limit');
            var upperRect = cursor.parent.jQ[0].getBoundingClientRect();
            mq.keystroke('Down');
            assert.equal(cursor.parent.latex(), '0', 'cursor down goes to lower limit');
            var lowerRect = cursor.parent.jQ[0].getBoundingClientRect();
            mq.keystroke('Up');
            assert.equal(cursor.parent.latex(), '1', 'cursor up goes to upper limit');
            var upperAboveLower = upperRect.bottom < lowerRect.top;
            assert.equal(upperAboveLower, true, 'cursor actually moves downward for lower limit');
        });
        test('\\MathQuillMathField{} in a fraction', function () {
            var outer = MQ.StaticMath($('<span>\\frac{\\MathQuillMathField{n}}{2}</span>').appendTo('#mock')[0]);
            var inner = MQ($(outer.el()).find('.mq-editable-field')[0]);
            assert.equal(inner.__controller.cursor.parent, inner.__controller.root);
            inner.keystroke('Down');
            assert.equal(inner.__controller.cursor.parent, inner.__controller.root);
        });
    });
    var MQ1 = getInterface(1);
    for (var key in MQ1)
        (function (key, val) {
            if (typeof val === 'function') {
                MathQuill[key] = function () {
                    insistOnInterVer();
                    return val.apply(this, arguments);
                };
                MathQuill[key].prototype = val.prototype;
            }
            else
                MathQuill[key] = val;
        }(key, MQ1[key]));
}());

