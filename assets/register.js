// Run with: /usr/bin/osascript -l JavaScript register.js READING WORD
// Uses only macOS GUI automation; never edits dictionary databases directly.
ObjC.import("ApplicationServices");

function safe(fn, fallback) {
  try { return fn(); } catch (_) { return fallback; }
}
function contents(element) {
  return [element].concat(safe(function () { return element.entireContents(); }, []));
}
function role(element) { return safe(function () { return element.role(); }, ""); }
function strings(element) {
  return [safe(function () { return element.name(); }, ""),
    safe(function () { return element.description(); }, ""),
    safe(function () { return element.value(); }, "")].filter(function (x) { return typeof x === "string"; });
}
function matches(element, labels) {
  return strings(element).some(function (x) { return labels.indexOf(x) !== -1; });
}
function waitFor(find, message) {
  for (var i = 0; i < 60; i++) {
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
  process.windows().forEach(function (window) {
    contents(window).forEach(function (x) {
      if (role(x) === "AXSheet") result.push(x);
    });
  });
  return result;
}
function fieldLabels(field) {
  var result = strings(field);
  var title = safe(function () { return field.attributes.byName("AXTitleUIElement").value(); }, null);
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
  var events = Application("System Events");
  var process = waitFor(function () {
    var p = events.processes.byName("System Settings");
    return safe(function () { return p.exists() && p.windows().length ? p : null; }, null);
  }, "システム設定を開けませんでした。");
  var dictionaryLabels = ["ユーザ辞書…", "ユーザ辞書...", "ユーザ辞書", "ユーザ辞書を編集", "テキスト置換…", "テキスト置換...", "テキスト置換", "Text Replacements…", "Text Replacements...", "Text Replacements", "User Dictionary…", "User Dictionary"];
  var openedDictionary = false;
  var dictionary = waitFor(function () {
    var current = sheets(process);
    for (var i = 0; i < current.length; i++) {
      if (contents(current[i]).some(function (x) { return matches(x, dictionaryLabels); })) return current[i];
    }
    var window = process.windows()[0];
    var button = openedDictionary ? null : onlyButton(window, dictionaryLabels);
    if (button) { button.click(); openedDictionary = true; return null; }
    return null;
  }, "ユーザ辞書画面を特定できません。標準日本語入力を選び、ユーザ辞書を手動で開いて再実行してください。");
  if (hasPair(dictionary, reading, word)) return "EXISTS";
  var add = onlyButton(dictionary, ["追加", "追加ボタン", "Add", "Add button", "+"]);
  if (!add) throw new Error("辞書の追加ボタンを一意に特定できません。単語は登録していません。");
  add.click();
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
  fields.reading.value = reading;
  fields.word.value = word;
  if (fields.reading.value() !== reading || fields.word.value() !== word) {
    throw new Error("入力値を確認できません。追加画面をキャンセルしてください。単語は保存していません。");
  }
  var save = onlyButton(fields.root, ["追加", "Add"]);
  if (!save || !safe(function () { return save.enabled(); }, false)) {
    throw new Error("追加確定ボタンを特定できません。追加画面をキャンセルしてください。単語は保存していません。");
  }
  save.click();
  waitFor(function () {
    return sheets(process).some(function (sheet) { return hasPair(sheet, reading, word); });
  }, "追加操作後、登録行を確認できませんでした。保存されている可能性があるため、ユーザ辞書を確認してから再実行してください。");
  return "REGISTERED";
}
