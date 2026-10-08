// Run with: /usr/bin/osascript -l JavaScript register.js READING WORD
// Uses only macOS GUI automation; never edits dictionary databases directly.
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
  var result = [element];
  children(element).forEach(function (child) { result = result.concat(contents(child)); });
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
function pasteValue(element, text, clipboard) {
  var pid = Ref();
  if ($.AXUIElementGetPid(element, pid) !== 0 ||
      $.AXUIElementSetAttributeValue(element, $("AXFocused"), $(true)) !== 0) {
    throw new Error("入力欄を操作できません。追加画面をキャンセルしてください。単語は保存していません。");
  }
  waitFor(function () { return value(element, "AXFocused"); }, "入力欄にフォーカスできません。");
  function shortcut(key) {
    if ($.NSWorkspace.sharedWorkspace.frontmostApplication.processIdentifier !== pid[0]) {
      throw new Error("システム設定からフォーカスが移りました。追加画面をキャンセルして再実行してください。");
    }
    [true, false].forEach(function (down) {
      var event = $.CGEventCreateKeyboardEvent(null, key, down);
      $.CGEventSetFlags(event, $.kCGEventFlagMaskCommand);
      $.CGEventPost($.kCGHIDEventTap, event);
    });
  }
  var pasteboard = clipboard.pasteboard;
  pasteboard.clearContents;
  var prepared = pasteboard.setStringForType($(text), $.NSPasteboardTypeString);
  clipboard.changeCount = pasteboard.changeCount;
  if (!prepared) throw new Error("入力用のテキストを準備できませんでした。単語は保存していません。");
  shortcut(0); // Command-A
  delay(0.15);
  shortcut(9); // Command-V triggers SwiftUI's editing state, unlike AXValue.
  delay(0.15);
  waitFor(function () { return value(element, "AXValue") === text; }, "入力値を確認できません。追加画面をキャンセルしてください。");
}
function fillFields(fields, reading, word) {
  var pasteboard = $.NSPasteboard.generalPasteboard;
  var originals = pasteboard.pasteboardItems, saved = [];
  if (originals) for (var i = 0; i < originals.count; i++) {
    var original = originals.objectAtIndex(i), copy = $.NSPasteboardItem.alloc.init;
    var types = original.types;
    for (var j = 0; j < types.count; j++) {
      var type = types.objectAtIndex(j), data = original.dataForType(type);
      if (!data || !copy.setDataForType(data, type)) {
        throw new Error("クリップボードを保持できないため、入力を中止しました。");
      }
    }
    saved.push(copy);
  }
  var clipboard = { pasteboard: pasteboard, changeCount: pasteboard.changeCount };
  try {
    pasteValue(fields.reading, reading, clipboard);
    pasteValue(fields.word, word, clipboard);
  } finally {
    // Restore every original format; don't overwrite a user's intervening copy.
    if (pasteboard.changeCount === clipboard.changeCount) {
      pasteboard.clearContents;
      if (saved.length) pasteboard.writeObjects($(saved));
    }
  }
}
function matches(element, labels) {
  return strings(element).some(function (x) { return labels.indexOf(x) !== -1; });
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
function hasPair(root, reading, word) {
  // Both values must belong to the same row, not two unrelated dictionary entries.
  return contents(root).some(function (row) {
    if (role(row) !== "AXRow") return false;
    var values = [];
    contents(row).forEach(function (x) { values = values.concat(strings(x)); });
    return values.indexOf(reading) !== -1 && values.indexOf(word) !== -1;
  });
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
  if (argv.length !== 2 || !argv[0].trim() || !argv[1].trim()) {
    throw new Error("読みと単語を指定してください。");
  }
  var reading = argv[0].trim(), word = argv[1].trim();
  if (!/^[ぁ-ゖー]+$/.test(reading) || Array.from(reading).length > 32 || Array.from(word).length > 64 || /[\r\n\t]/.test(word)) {
    throw new Error("読みはひらがな32文字以内、単語は改行・タブなしの64文字以内で指定してください。");
  }
  // This call checks permission without displaying a permission request.
  if (!$.AXIsProcessTrusted()) {
    throw new Error("アクセシビリティ権限がありません。システム設定 → プライバシーとセキュリティ → アクセシビリティでRaycastを許可し、再実行してください。");
  }
  var app = Application.currentApplication();
  app.includeStandardAdditions = true;
  app.openLocation("x-apple.systempreferences:com.apple.Keyboard-Settings.extension");
  var settings = Application("com.apple.systempreferences");
  settings.activate();
  var process = waitFor(function () {
    var apps = $.NSRunningApplication.runningApplicationsWithBundleIdentifier($("com.apple.systempreferences"));
    if (!apps.count) return null;
    var p = $.AXUIElementCreateApplication(apps.objectAtIndex(0).processIdentifier);
    return children(p, "AXWindows").length ? p : null;
  }, "システム設定を開けませんでした。");
  var dictionaryLabels = ["ユーザ辞書…", "ユーザ辞書...", "ユーザ辞書", "ユーザ辞書を編集", "テキスト置換…", "テキスト置換...", "テキスト置換", "Text Replacements…", "Text Replacements...", "Text Replacements", "User Dictionary…", "User Dictionary"];
  var openedDictionary = false;
  var dictionary = waitFor(function () {
    var current = sheets(process);
    for (var i = 0; i < current.length; i++) {
      var elements = contents(current[i]);
      var hasReading = elements.some(function (x) { return matches(x, ["入力/読み", "入力／読み", "Replace", "置換"]); });
      var hasWord = elements.some(function (x) { return matches(x, ["変換/語句", "変換／語句", "With", "入力"]); });
      // The dictionary sheet has column headers, but no dictionary title.
      if (hasReading && hasWord && elements.some(function (x) { return role(x) === "AXOutline" || role(x) === "AXTable"; })) return current[i];
    }
    var window = children(process, "AXWindows")[0];
    var button = openedDictionary ? null : onlyButton(window, dictionaryLabels);
    if (button) { click(button); openedDictionary = true; return null; }
    return null;
  }, "ユーザ辞書画面を特定できません。標準日本語入力を選び、ユーザ辞書を手動で開いて再実行してください。");
  if (hasPair(dictionary, reading, word)) {
    closeSettings(dictionary, process, settings);
    return "EXISTS";
  }
  var add = onlyButton(dictionary, ["追加", "追加ボタン", "Add", "Add button", "+"]);
  if (!add) throw new Error("辞書の追加ボタンを一意に特定できません。単語は登録していません。");
  click(add);
  var fields = waitFor(function () {
    var dialogs = sheets(process);
    // Prefer the innermost sheet. Labels are mandatory; never guess field order.
    for (var i = dialogs.length - 1; i >= 0; i--) {
      var r = labeledField(dialogs[i], ["入力/読み", "入力/読み:", "入力/読み：", "入力／読み", "読み", "読み:", "読み：", "Replace", "Replace:", "置換", "置換:", "置換："]);
      var w = labeledField(dialogs[i], ["変換/語句", "変換/語句:", "変換/語句：", "変換／語句", "語句", "語句:", "語句：", "With", "With:", "入力", "入力:", "入力："]);
      if (r && w) return { root: dialogs[i], reading: r, word: w };
    }
    return null;
  }, "読み・単語の欄をラベルで特定できません。追加画面をキャンセルしてください。単語は保存していません。");
  fillFields(fields, reading, word);
  if (value(fields.reading, "AXValue") !== reading || value(fields.word, "AXValue") !== word) {
    throw new Error("入力値を確認できません。追加画面をキャンセルしてください。単語は保存していません。");
  }
  var save = waitFor(function () {
    var button = onlyButton(fields.root, ["追加", "Add"]);
    return button && value(button, "AXEnabled") ? button : null;
  }, "追加確定ボタンを特定できません。追加画面をキャンセルしてください。単語は保存していません。");
  click(save);
  waitFor(function () {
    return sheets(process).some(function (sheet) { return hasPair(sheet, reading, word); });
  }, "追加操作後、登録行を確認できませんでした。保存されている可能性があるため、ユーザ辞書を確認してから再実行してください。");
  closeSettings(dictionary, process, settings);
  return "REGISTERED";
}
