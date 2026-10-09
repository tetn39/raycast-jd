// Run with: /usr/bin/osascript -l JavaScript register.js READING WORD
// Prepare the native editor visibly, then hide Settings for AX input and save.
ObjC.import("ApplicationServices");
ObjC.import("AppKit");

function attribute(element, name) {
  var result = Ref();
  if ($.AXUIElementCopyAttributeValue(element, $(name), result) !== 0) return null;
  return ObjC.castRefToObject(result[0]);
}
function value(element, name) {
  var result = attribute(element, name);
  return result ? ObjC.unwrap(result) : null;
}
function children(element, name) {
  var array = attribute(element, name || "AXChildren"), result = [];
  if (array) for (var i = 0; i < array.count; i++) result.push(array.objectAtIndex(i));
  return result;
}
function contents(element) {
  if (!element) return [];
  var pending = [element], seen = Object.create(null), result = [];
  while (pending.length) {
    var current = pending.pop(), key = String($.CFHash(current)), bucket = seen[key] || [];
    // AX can repeat references, including cycles while a window is unavailable.
    if (bucket.some(function (old) { return $.CFEqual(old, current); })) continue;
    bucket.push(current);
    seen[key] = bucket;
    result.push(current);
    var nested = children(current);
    for (var i = nested.length - 1; i >= 0; i--) pending.push(nested[i]);
  }
  return result;
}
function role(element) { return value(element, "AXRole"); }
function strings(element) {
  // System Events omits SwiftUI button labels on current macOS versions.
  return ["AXTitle", "AXDescription", "AXValue"].map(function (name) {
    return value(element, name);
  }).filter(function (x) { return typeof x === "string"; });
}
function click(element) {
  if ($.AXUIElementPerformAction(element, $("AXPress")) !== 0) {
    throw new Error("ボタンを操作できませんでした。ユーザ辞書を確認してください。");
  }
}
function matches(element, labels) {
  return strings(element).some(function (x) { return labels.indexOf(x) !== -1; });
}
function screenLocked() {
  var session = $.CGSessionCopyCurrentDictionary();
  return session && ObjC.deepUnwrap(ObjC.castRefToObject(session)).CGSSessionScreenIsLocked === true;
}
function waitFor(find, message) {
  var deadline = Date.now() + 9000;
  while (Date.now() < deadline) {
    var result = find();
    if (result) return result;
    delay(0.15);
  }
  throw new Error(message);
}
function onlyButton(root, labels) {
  var buttons = contents(root).filter(function (x) {
    return role(x) === "AXButton" && matches(x, labels);
  });
  return buttons.length === 1 ? buttons[0] : null;
}
function sheets(process) {
  var result = [];
  children(process, "AXWindows").forEach(function (window) {
    contents(window).forEach(function (x) {
      if (role(x) === "AXSheet") result.push(x);
    });
  });
  return result;
}
function fieldLabels(field) {
  var result = strings(field);
  var title = attribute(field, "AXTitleUIElement");
  if (title) result = result.concat(strings(title));
  return result;
}
function labeledField(root, labels) {
  var fields = contents(root).filter(function (x) {
    return role(x) === "AXTextField" && fieldLabels(x).some(function (s) { return labels.indexOf(s) !== -1; });
  });
  return fields.length === 1 ? fields[0] : null;
}
function editorFields(process) {
  var dialogs = sheets(process);
  for (var i = dialogs.length - 1; i >= 0; i--) {
    var reading = labeledField(dialogs[i], ["入力/読み", "入力/読み:", "入力/読み：", "入力／読み", "読み", "読み:", "読み：", "Replace", "Replace:", "置換", "置換:", "置換："]);
    var word = labeledField(dialogs[i], ["変換/語句", "変換/語句:", "変換/語句：", "変換／語句", "語句", "語句:", "語句：", "With", "With:", "入力", "入力:", "入力："]);
    if (reading && word) return { root: dialogs[i], reading: reading, word: word };
  }
  return null;
}
function pairCount(dictionary, reading, word) {
  return contents(dictionary).filter(function (row) {
    if (role(row) !== "AXRow") return false;
    var values = contents(row).filter(function (x) {
      return role(x) === "AXTextField" || role(x) === "AXStaticText";
    }).map(function (x) { return value(x, "AXValue"); });
    return reading === word
      ? values.filter(function (x) { return x === reading; }).length >= 2
      : values.indexOf(reading) !== -1 && values.indexOf(word) !== -1;
  }).length;
}
function inputAndConfirm(field, text) {
  if (screenLocked()) throw new Error("画面がロックされました。ロックを解除して辞書を確認してください。");
  if ($.AXUIElementSetAttributeValue(field, $("AXFocused"), $(true)) !== 0 ||
      $.AXUIElementSetAttributeValue(field, $("AXSelectedText"), $(text)) !== 0 ||
      $.AXUIElementPerformAction(field, $("AXConfirm")) !== 0) {
    throw new Error("非表示で入力を確定できませんでした。ユーザ辞書を確認してください。");
  }
}
function hideSettings(actor) {
  actor.hide;
  waitFor(function () {
    $.NSRunLoop.currentRunLoop.runUntilDate($.NSDate.dateWithTimeIntervalSinceNow(0.05));
    if (screenLocked()) throw new Error("画面がロックされました。ロックを解除して再実行してください。");
    var windows = ObjC.deepUnwrap(ObjC.castRefToObject($.CGWindowListCopyWindowInfo($.kCGWindowListOptionOnScreenOnly, $.kCGNullWindowID)));
    return actor.hidden && !windows.some(function (window) {
      return window.kCGWindowOwnerPID === actor.processIdentifier && window.kCGWindowLayer === 0 && window.kCGWindowAlpha > 0;
    });
  }, "システム設定を非表示にできませんでした。");
}
function closeSettings(dictionary, process, settings) {
  try {
    var done = onlyButton(dictionary, ["完了", "Done"]);
    if (!done || !value(done, "AXEnabled")) throw new Error("辞書画面の完了ボタンを特定できません。");
    click(done);
    waitFor(function () { return sheets(process).length === 0; }, "辞書画面が閉じませんでした。");
    settings.quit();
    waitFor(function () { return !settings.running(); }, "システム設定が終了しませんでした。");
  } catch (error) {
    throw new Error("単語の登録は確認済みですが、画面を閉じられませんでした。" + error.message);
  }
}
function run(argv) {
  if (argv.length !== 2 || !argv[0].trim() || !argv[1].trim()) throw new Error("読みと単語を入力してください。");
  var reading = argv[0], word = argv[1];
  if (!$.AXIsProcessTrusted()) {
    throw new Error("アクセシビリティ権限がありません。システム設定 → プライバシーとセキュリティ → アクセシビリティでRaycastを許可し、再実行してください。");
  }
  if (screenLocked()) throw new Error("画面のロックを解除してから辞書登録を開いてください。");
  var app = Application.currentApplication();
  app.includeStandardAdditions = true;
  // A running Settings process can have no window; activation alone does not reopen it.
  app.doShellScript("/usr/bin/open -b com.apple.systempreferences");
  app.openLocation("x-apple.systempreferences:com.apple.Keyboard-Settings.extension");
  var settings = Application("com.apple.systempreferences");
  settings.activate();
  var actor = null;
  var process = waitFor(function () {
    var apps = $.NSRunningApplication.runningApplicationsWithBundleIdentifier($("com.apple.systempreferences"));
    if (!apps.count) return null;
    actor = apps.objectAtIndex(0);
    var p = $.AXUIElementCreateApplication(actor.processIdentifier);
    return children(p, "AXWindows").some(function (window) { return role(window) === "AXWindow"; }) ? p : null;
  }, "システム設定を開けませんでした。");
  var dictionaryLabels = ["ユーザ辞書…", "ユーザ辞書...", "ユーザ辞書", "ユーザ辞書を編集", "テキスト置換…", "テキスト置換...", "テキスト置換", "Text Replacements…", "Text Replacements...", "Text Replacements", "User Dictionary…", "User Dictionary"];
  var openedDictionary = false;
  var dictionary = waitFor(function () {
    var current = sheets(process);
    for (var i = 0; i < current.length; i++) {
      var elements = contents(current[i]);
      var hasReading = elements.some(function (x) { return matches(x, ["入力/読み", "入力／読み", "Replace", "置換"]); });
      var hasWord = elements.some(function (x) { return matches(x, ["変換/語句", "変換／語句", "With", "入力"]); });
      if (hasReading && hasWord && elements.some(function (x) { return role(x) === "AXOutline" || role(x) === "AXTable"; })) return current[i];
    }
    var button = openedDictionary ? null : onlyButton(children(process, "AXWindows")[0], dictionaryLabels);
    if (button) { click(button); openedDictionary = true; }
    return null;
  }, "ユーザ辞書画面を特定できません。標準日本語入力を選び、ユーザ辞書を手動で開いて再実行してください。");
  // Never overwrite a user's unfinished native editor.
  var fields = editorFields(process);
  if (fields && (value(fields.reading, "AXValue") !== "" || value(fields.word, "AXValue") !== "")) {
    throw new Error("ユーザ辞書に入力途中の内容があります。保存またはキャンセルしてから再実行してください。");
  }
  if (!fields && pairCount(dictionary, reading, word) > 0) {
    closeSettings(dictionary, process, settings);
    return "EXISTS";
  }
  if (!fields) {
    var add = onlyButton(dictionary, ["追加", "追加ボタン", "Add", "Add button", "+"]);
    if (!add) throw new Error("辞書の追加ボタンを一意に特定できません。");
    click(add);
    fields = waitFor(function () { return editorFields(process); }, "読み・単語の欄を特定できません。");
  }
  var before = pairCount(dictionary, reading, word);
  try {
    hideSettings(actor);
    inputAndConfirm(fields.reading, reading);
    if (value(fields.reading, "AXValue") !== reading) throw new Error("読みの入力結果が一致しません。");
    inputAndConfirm(fields.word, word);
    // AXConfirm on the word can also submit the native dialog.
    if (pairCount(dictionary, reading, word) <= before) {
      if (value(fields.reading, "AXValue") !== reading || value(fields.word, "AXValue") !== word) {
        throw new Error("入力結果が一致しません。ユーザ辞書を確認してください。");
      }
      var save = onlyButton(fields.root, ["追加", "Add"]);
      if (!save || !value(save, "AXEnabled")) throw new Error("追加ボタンが有効になりませんでした。入力内容を確認してください。");
      click(save);
    }
    waitFor(function () {
      if (screenLocked()) throw new Error("画面がロックされました。ロックを解除して登録結果を確認してください。");
      return pairCount(dictionary, reading, word) > before && !editorFields(process);
    }, "指定した読み・単語の登録を確認できませんでした。");
    closeSettings(dictionary, process, settings);
    return "REGISTERED";
  } catch (error) {
    // Failed hidden operations must not leave the native editor inaccessible.
    if (settings.running() && !screenLocked()) settings.activate();
    throw error;
  }
}
