// Run with: /usr/bin/osascript -l JavaScript register.js
// The user enters the word in System Settings; dictionary databases are never edited.
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
function entryEditor(process) {
  var dialogs = sheets(process);
  for (var i = dialogs.length - 1; i >= 0; i--) {
    var reading = labeledField(dialogs[i], ["入力/読み", "入力/読み:", "入力/読み：", "入力／読み", "読み", "読み:", "読み：", "Replace", "Replace:", "置換", "置換:", "置換："]);
    var word = labeledField(dialogs[i], ["変換/語句", "変換/語句:", "変換/語句：", "変換／語句", "語句", "語句:", "語句：", "With", "With:", "入力", "入力:", "入力："]);
    if (reading && word) return dialogs[i];
  }
  return null;
}
function entryCounts(dictionary) {
  var counts = Object.create(null);
  contents(dictionary).forEach(function (row) {
    if (role(row) !== "AXRow") return;
    var values = contents(row).filter(function (x) {
      return role(x) === "AXTextField" || role(x) === "AXStaticText";
    }).map(function (x) { return value(x, "AXValue"); }).filter(function (x) { return typeof x === "string"; });
    if (values.length < 2) return;
    var key = JSON.stringify(values);
    counts[key] = (counts[key] || 0) + 1;
  });
  return counts;
}
function hasAddedEntry(dictionary, before) {
  var after = entryCounts(dictionary);
  return Object.keys(after).some(function (key) { return after[key] > (before[key] || 0); });
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
  if (argv.length) throw new Error("読みと単語は、開いたユーザ辞書画面に入力してください。");
  if (!$.AXIsProcessTrusted()) {
    throw new Error("アクセシビリティ権限がありません。システム設定 → プライバシーとセキュリティ → アクセシビリティでRaycastを許可し、再実行してください。");
  }
  if (screenLocked()) throw new Error("画面のロックを解除してから辞書登録を開いてください。");
  var app = Application.currentApplication();
  app.includeStandardAdditions = true;
  // Reopen a running Settings process even when it has no window.
  app.doShellScript("/usr/bin/open -b com.apple.systempreferences");
  app.openLocation("x-apple.systempreferences:com.apple.Keyboard-Settings.extension");
  var settings = Application("com.apple.systempreferences");
  settings.activate();
  var process = waitFor(function () {
    var apps = $.NSRunningApplication.runningApplicationsWithBundleIdentifier($("com.apple.systempreferences"));
    if (!apps.count) return null;
    var p = $.AXUIElementCreateApplication(apps.objectAtIndex(0).processIdentifier);
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
  var before = entryCounts(dictionary);
  var editor = entryEditor(process);
  if (!editor) {
    var add = onlyButton(dictionary, ["追加", "追加ボタン", "Add", "Add button", "+"]);
    if (!add) throw new Error("辞書の追加ボタンを一意に特定できません。");
    click(add);
    editor = waitFor(function () { return entryEditor(process); }, "読み・単語の欄を特定できません。ユーザ辞書を確認してください。");
  }
  // No input injection or time limit: the user edits and saves in the native UI.
  var dismissedAt = null;
  while (settings.running()) {
    // Locked sessions can conceal AX sheets and rows; that is not a save or cancel.
    if (screenLocked()) {
      dismissedAt = null;
      delay(0.2);
      continue;
    }
    if (sheets(process).some(function (sheet) { return $.CFEqual(sheet, editor); })) {
      dismissedAt = null;
      delay(0.2);
      continue;
    }
    // A dismissed editor is not proof of a save: Cancel must not close Settings.
    if (dismissedAt === null) dismissedAt = Date.now();
    if (hasAddedEntry(dictionary, before)) {
      closeSettings(dictionary, process, settings);
      return "REGISTERED";
    }
    if (Date.now() - dismissedAt >= 9000) break;
    delay(0.15);
  }
  return "CANCELLED";
}
