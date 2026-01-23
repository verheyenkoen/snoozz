function replaceSettingsURL() {
  var found = document.getElementById("snoozz_settings_url");
  if (found) found.href = chrome.runtime.getURL("html/settings.html");
}
replaceSettingsURL();
