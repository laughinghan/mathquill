/*********************************************
 * Manage the MathQuill instance's textarea
 * (as owned by the Controller)
 ********************************************/

Controller.open(function(_) {
  _.createTextarea = function() {
    // TODO: everywhere else stop depending on root.textareaSpan, and rm it
    var textareaSpan = this.textareaSpan = this.root.textareaSpan =
        $('<span class="textarea"><textarea></textarea></span>'),
      textarea = this.textarea = textareaSpan.children();

    //prevent native selection except textarea
    this.container.bind('selectstart.mathquill', function(e) {
      if (e.target !== textarea[0]) e.preventDefault();
      e.stopPropagation();
    });
  };
  _.setRootSelectionChangedFn = function(selectFn) {
    var root = this.root, cursor = this.cursor, container = this.container;

    // throttle calls to setTextareaSelection(), because setting textarea.value
    // and/or calling textarea.select() can have anomalously bad performance:
    // https://github.com/mathquill/mathquill/issues/43#issuecomment-1399080
    var textareaSelectionTimeout;
    root.selectionChanged = function() {
      if (textareaSelectionTimeout === undefined) {
        textareaSelectionTimeout = setTimeout(setTextareaSelection);
      }
      forceIERedraw(container[0]);
    };
    function setTextareaSelection() {
      textareaSelectionTimeout = undefined;
      var latex = '';
      if (cursor.selection) {
        latex = cursor.selection.fold('', function(latex, el) {
          return latex + el.latex();
        });
        latex = '$' + latex + '$';
      }
      selectFn(latex);
    }
    container.bind('copy', setTextareaSelection);
  };
  _.staticMathTextareaEvents = function() {
    var ctrlr = this, root = ctrlr.root, cursor = ctrlr.cursor,
      textarea = ctrlr.textarea, textareaSpan = ctrlr.textareaSpan;

    this.container.prepend('<span class="selectable">$'+ctrlr.exportLatex()+'$</span>');
    ctrlr.blurred = true;
    textarea.bind('cut paste', false)
    .focus(function() { ctrlr.blurred = false; }).blur(function() {
      if (cursor.selection) cursor.selection.clear();
      setTimeout(detach); //detaching during blur explodes in WebKit
    });
    function detach() {
      textareaSpan.detach();
      ctrlr.blurred = true;
    }
  };
  _.editablesTextareaEvents = function() {
    var ctrlr = this, root = ctrlr.root, cursor = ctrlr.cursor,
      textarea = ctrlr.textarea, textareaSpan = ctrlr.textareaSpan;

    var keyboardEventsShim = saneKeyboardEvents(textarea, {
      container: this.container,
      key: function(key, evt) {
        cursor.parent.keystroke(key, evt, ctrlr);
      },
      text: function(ch) {
        cursor.parent.write(cursor, ch, ctrlr.notify().cursor.show().replaceSelection());
      },
      cut: function(e) {
        if (cursor.selection) {
          setTimeout(function() {
            ctrlr.notify('edit'); // deletes selection if present
            cursor.parent.bubble('redraw');
          });
        }

        e.stopPropagation();
      },
      paste: function(text) {
        // FIXME: this always inserts math or a TextBlock, even in a RootTextBlock
        if (text.slice(0,1) === '$' && text.slice(-1) === '$') {
          text = text.slice(1, -1);
        }
        else {
          text = '\\text{' + text + '}';
        }

        ctrlr.writeLatex(text).cursor.show();
      }
    });

    this.container.prepend(textareaSpan);

    textarea.focus(function(e) {
      ctrlr.blurred = false;
      if (!cursor.parent)
        cursor.insAtRightEnd(root);
      cursor.parent.jQ.addClass('hasCursor');
      if (cursor.selection) {
        cursor.selection.jQ.removeClass('blur');
        setTimeout(root.selectionChanged); //re-select textarea contents after tabbing away and back
      }
      else
        cursor.show();
    }).blur(function(e) {
      ctrlr.blurred = true;
      cursor.hide().parent.blur();
      if (cursor.selection)
        cursor.selection.jQ.addClass('blur');
    }).blur();

    return keyboardEventsShim;
  };
});
