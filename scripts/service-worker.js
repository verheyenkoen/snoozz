import "./dayjs.min.js";

// ========================
// UTILITY FUNCTIONS
// ========================

function getBrowser() {
  if (
    !!navigator.userAgent.match(/safari/i) &&
    !navigator.userAgent.match(/chrome/i) &&
    typeof document.body.style.webkitFilter !== "undefined"
  )
    return "safari";
  if (!!globalThis.sidebar) return "firefox";
  return "chrome";
}

const DEFAULT_OPTIONS = {
  morning: [9, 0],
  evening: [18, 0],
  hourFormat: 12,
  icons: "human",
  theme: "light",
  notifications: "on",
  history: 30,
  badge: "today",
  closeDelay: 1000,
  polling: "on",
  napCollapsed: [],
  weekStart: 0,
  popup: {
    weekend: "morning",
    monday: "morning",
    week: "morning",
    month: "morning",
  },
  contextMenu: [
    "startup",
    "in-an-hour",
    "today-evening",
    "tom-morning",
    "weekend",
  ],
};

// ========================
// STORAGE FUNCTIONS
// ========================

async function getSnoozedTabs(ids) {
  const p = await chrome.storage.local.get("snoozed");
  if (!p.snoozed) return [];
  if (!ids || (ids.length && ids.length === 0)) return p.snoozed;
  const found = p.snoozed.filter(
    (s) => s.id && (ids.length ? ids.includes(s.id) : ids === s.id),
  );
  return found.length === 1 ? found[0] : found;
}

async function getOptions(keys) {
  const p = await chrome.storage.local.get("snoozedOptions");
  if (!p.snoozedOptions) return [];
  if (!keys) return p.snoozedOptions;
  if (typeof keys === "string") return p.snoozedOptions[keys];
  return Object.keys(p.snoozedOptions)
    .filter((k) => keys.includes(k))
    .reduce((o, k) => {
      o[k] = p.snoozedOptions[k];
      return o;
    }, {});
}

async function saveOptions(o) {
  if (!o) return;
  return chrome.storage.local.set({ snoozedOptions: o });
}

async function saveTab(t) {
  if (!t || !t.id) return;
  const tabs = await getSnoozedTabs();
  if (tabs.some((tab) => tab.id === t.id)) {
    tabs[tabs.findIndex((tab) => tab.id === t.id)] = t;
  } else {
    tabs.push(t);
  }
  await saveTabs(tabs);
}

async function saveTabs(tabs) {
  if (!tabs) return;
  return chrome.storage.local.set({ snoozed: tabs });
}

// ========================
// HELPER FUNCTIONS
// ========================

function getRandomId() {
  return [...Array(16)]
    .map((_) =>
      Math.random()
        .toString(36)[2]
        [Math.random() < 0.5 ? "toLowerCase" : "toUpperCase"](),
    )
    .join("");
}

function getHostname(url) {
  try {
    const h = new URL(url).hostname;
    return h && h.length ? h : undefined;
  } catch (e) {
    return undefined;
  }
}

function getBetterUrl(url) {
  try {
    const a = new URL(url);
    return a.hostname + a.pathname;
  } catch (e) {
    return url;
  }
}

function getTabCountLabel(tabs) {
  return `${tabs.length} tab${tabs.length === 1 ? "" : "s"}`;
}

function getSiteCountLabel(tabs) {
  const count = tabs
    .map((t) => getHostname(t.url))
    .filter((v, i, s) => s.indexOf(v) === i).length;
  return count > 1 ? `${count} different websites` : `${count} website`;
}

function sleeping(tabs) {
  return tabs.filter((t) => !t.opened);
}

function today(tabs) {
  return tabs.filter(
    (t) =>
      t.wakeUpTime &&
      dayjs(t.wakeUpTime).dayOfYear() === dayjs().dayOfYear() &&
      dayjs(t.wakeUpTime).year() === dayjs().year(),
  );
}

function isDefault(tab) {
  return (
    tab.title &&
    [
      "nap room | snoozz",
      "settings | snoozz",
      "rise and shine | snoozz",
      "New Tab",
      "Start Page",
    ].includes(tab.title)
  );
}

function isValid(tab) {
  const validProtocols = [
    "http",
    "https",
    "ftp",
    "chrome-extension",
    "web-extension",
    "moz-extension",
    "extension",
  ];
  if (getBrowser() === "chrome") validProtocols.push("file");
  return (
    tab.url &&
    validProtocols.includes(tab.url.substring(0, tab.url.indexOf(":")))
  );
}

function capitalize(s) {
  return s
    .toLowerCase()
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function getHourFormat(showZeros) {
  const HOUR_FORMAT = 12; // Default to 12-hour, will be updated from options
  return HOUR_FORMAT && HOUR_FORMAT === 24
    ? "HH:mm"
    : `h${showZeros ? ":mm" : ""} A`;
}

function getEveningLabel(hour, type) {
  let t = "evening",
    prefix = "this ";
  if (type && type === "tomorrow") prefix = "tomorrow ";
  if (type && type === "every") prefix = "every ";
  if (hour && hour <= 16) t = "afternoon";
  if (hour && hour >= 20) t = "night";
  if (hour && hour >= 20 && !type) prefix = "to";
  return capitalize(prefix + t);
}

function getOrdinal(num) {
  num = parseInt(num);
  if (num % 100 >= 11 && num % 100 <= 13) return `${num}th`;
  if (num % 10 === 1) return `${num}st`;
  if (num % 10 === 2) return `${num}nd`;
  if (num % 10 === 3) return `${num}rd`;
  return `${num}th`;
}

function upgradeSettings(settings) {
  if (!settings) return;
  if (settings.morning && typeof settings.morning === "number")
    settings.morning = [settings.morning, 0];
  if (settings.evening && typeof settings.evening === "number")
    settings.evening = [settings.evening, 0];
  if (settings.popup && settings.timeOfDay) delete settings.timeOfDay;
  return settings;
}

function bgLog(logs, colors, timestampColor = "grey") {
  const timestamp = dayjs().format("[%c]DD/MM/YY HH:mm:ss[%c] | ");
  let logString = logs.map((l) => "%c" + l + "%c").join(" ");
  colors.unshift(timestampColor);
  const colorStrings = colors
    .flatMap((v, i, a) => (i !== a.length ? [v, ""] : v))
    .map((c) => {
      const colorMap = {
        green: "limegreen",
        red: "crimson",
        blue: "dodgerblue",
        yellow: "gold",
        pink: "violet",
        grey: "slategrey",
        white: "navajowhite",
      };
      return "color:" + (colorMap[c] || "unset");
    });
  console.log(timestamp + logString, ...colorStrings);
}

function formatSnoozedUntil(t) {
  if (t.startUp || (t.repeat && t.repeat.type === "startup"))
    return `Next ${capitalize(getBrowser())} Launch`;
  const ts = t.wakeUpTime;
  const date = dayjs(ts);
  if (date.dayOfYear() === dayjs().dayOfYear())
    return (
      (date.hour() > 17 ? "Tonight" : "Today") +
      date.format(` [@] ${getHourFormat(date.minute() !== 0)}`)
    );
  if (date.dayOfYear() === dayjs().add(1, "d").dayOfYear())
    return (
      "Tomorrow" + date.format(` [@] ${getHourFormat(date.minute() !== 0)}`)
    );
  if (date.week() === dayjs().week())
    return date.format(`dddd [@] ${getHourFormat(date.minute() !== 0)}`);
  if (date.year() !== dayjs().year()) return date.format(`ddd, MMM D, YYYY`);
  return date.format(`ddd, MMM D [@] ${getHourFormat(date.minute() !== 0)}`);
}

// ========================
// ALARM FUNCTIONS
// ========================

async function createAlarm(when, willWakeUpATab) {
  bgLog(
    ["Next Alarm at", dayjs(when).format("HH:mm:ss DD/MM/YY")],
    ["", willWakeUpATab ? "yellow" : "white"],
  );
  await chrome.alarms.create("wakeUpTabs", { when });
}

// ========================
// NOTIFICATION FUNCTIONS
// ========================

async function createNotification(id, title, imgUrl, message, force) {
  const n = await getOptions("notifications");
  if (n === "sound") {
    try {
      new Audio(chrome.runtime.getURL("sounds/appointed.mp3")).play();
    } catch (e) {}
  }
  if (!chrome.notifications || (n && n === "off" && !force)) return;
  await chrome.notifications.create(id, {
    type: "basic",
    iconUrl: chrome.runtime.getURL(imgUrl),
    title,
    message,
  });
}

// ========================
// TAB FUNCTIONS
// ========================

async function getTabsInWindow(active) {
  if (getBrowser() === "safari") active = true;
  const tabs = await chrome.tabs.query({ active: active, currentWindow: true });
  if (!active) return tabs;
  return tabs[0];
}

async function getAllWindows() {
  return chrome.windows.getAll({ windowTypes: ["normal"] });
}

async function getTabId(url) {
  const tabsInWindow = await getTabsInWindow();
  const tabs = Array.isArray(tabsInWindow) ? tabsInWindow : [tabsInWindow];
  const foundTab = tabs.find((t) => t.url === url);
  return foundTab ? parseInt(foundTab.id) : false;
}

async function findTabAnywhere(url, tabDBId) {
  const wins = await getAllWindows();
  let found = false;
  if (!wins || !wins.length) return found;
  for (const wid of wins.map((w) => w.id)) {
    if (found) return;
    const tabs = await chrome.tabs.query({ windowId: wid });
    if (url && tabs && tabs.some((t) => t.url === url))
      return (found = tabs.find((t) => t.url === url));
    if (
      !url &&
      tabDBId &&
      tabs &&
      tabs.some((t) => t.url.indexOf(tabDBId) > -1)
    )
      return (found = tabs.find((t) => t.url.indexOf(tabDBId) > -1));
  }
  return found;
}

async function createWindow(tabId, incognito) {
  if (tabId)
    return chrome.windows.create({
      url: `/html/rise-and-shine.html#${tabId}`,
    });
  return chrome.windows.create({ incognito });
}

async function openExtensionTab(url) {
  if (getBrowser() === "safari") url = chrome.runtime.getURL(url);
  let tabs = await getTabsInWindow();
  if (getBrowser() === "safari" && !tabs.length) tabs = [tabs];
  const extTabs = Array.isArray(tabs) ? tabs.filter((t) => isDefault(t)) : [];
  if (extTabs.length === 1) {
    await chrome.tabs.update(extTabs[0].id, { url, active: true });
  } else if (extTabs.length > 1) {
    const activeTab = extTabs.some((et) => et.active)
      ? extTabs.find((et) => et.active)
      : extTabs.reduce((t1, t2) => (t1.index > t2.index ? t1 : t2));
    await chrome.tabs.update(activeTab.id, { url, active: true });
    await chrome.tabs.remove(
      extTabs.filter((et) => et !== activeTab).map((t) => t.id),
    );
  } else {
    const activeTab = Array.isArray(tabs) ? tabs.find((t) => t.active) : tabs;
    if (activeTab && ["New Tab", "Start Page"].includes(activeTab.title)) {
      await chrome.tabs.update(activeTab.id, { url });
    } else {
      await chrome.tabs.create({ url });
    }
  }
}

async function openTab(tab, windowId, automatic = false) {
  const windows = await getAllWindows();
  if (tab.incognito) {
    const w =
      windows.find((i) => i.incognito) ||
      (await createWindow(undefined, tab.incognito));
    await chrome.tabs.create({
      url: tab.url,
      active: false,
      pinned: tab.pinned,
      windowId: w.id,
    });
  } else if (!windows || !windows.filter((w) => !w.incognito).length) {
    await chrome.windows.create({ url: tab.url });
  } else {
    await chrome.tabs.create({
      url: tab.url,
      active: false,
      pinned: tab.pinned,
      windowId,
    });
  }
  if (!automatic) return;
  const msg = `${tab.title} -- snoozed ${dayjs(tab.timeCreated).fromNow()}`;
  await createNotification(tab.id, "A tab woke up!", "icons/logo.svg", msg);
}

async function openSelection(t, automatic = false) {
  let targetWindowID = null;
  const windows = await getAllWindows();
  if (!windows || !windows.length || t.newWindow) {
    const window = await createWindow(undefined, t.incognito);
    targetWindowID = globalThis.id;
  }
  for (const s of t.tabs) await openTab(s, targetWindowID);
  if (!automatic) return;
  const msg = `These tabs were put to sleep ${dayjs(t.timeCreated).fromNow()}`;
  await createNotification(
    t.id,
    `${t.title.split(" ")[0]} tabs woke up!`,
    "icons/logo.svg",
    msg,
  );
}

async function openWindow(t, automatic = false) {
  let targetWindowID;
  const currentWindow = await getTabsInWindow();
  const tabs = Array.isArray(currentWindow) ? currentWindow : [currentWindow];
  if (
    tabs.length &&
    (tabs.filter(isDefault).length === tabs.length ||
      (typeof t.newWindow === "boolean" && t.newWindow === false))
  ) {
    await openExtensionTab(`/html/rise-and-shine.html#${t.id}`);
    targetWindowID = tabs[0].windowId;
  } else {
    const window = await createWindow(t.id);
    targetWindowID = globalThis.id;
  }

  let loadingCount = 0;
  const cleanTabsAfterLoad = async (id, state) => {
    if (loadingCount > t.tabs.length) {
      await chrome.runtime.sendMessage({ startMapping: true });
      chrome.tabs.onUpdated.removeListener(cleanTabsAfterLoad);
    }
    if (state.status === "loading" && state.url) loadingCount++;
  };

  chrome.tabs.onUpdated.addListener(cleanTabsAfterLoad);

  for (const s of t.tabs) await openTab(s, targetWindowID);
  await chrome.windows.update(targetWindowID, { focused: true });

  if (!automatic) return;
  const msg = `This window was put to sleep ${dayjs(t.timeCreated).fromNow()}`;
  await createNotification(t.id, "A window woke up!", "icons/logo.svg", msg);
}

// ========================
// SNOOZE FUNCTIONS
// ========================

async function calculateNextSnoozeTime(data) {
  const NOW = dayjs();
  const TYPE = data.type;
  const [HOUR, MINUTE] = data.time;
  if (TYPE === "startup") {
    return NOW.add(20, "y");
  } else if (TYPE === "hourly") {
    const isNextHour = NOW.minute() >= MINUTE ? 1 : 0;
    return NOW.startOf("h").add(isNextHour, "h").minute(MINUTE).valueOf();
  } else if (TYPE === "daily") {
    const isNextDay =
      NOW.hour() > HOUR || (NOW.hour() === HOUR && NOW.minute() >= MINUTE)
        ? 1
        : 0;
    return NOW.startOf("d")
      .add(isNextDay, "d")
      .hour(HOUR)
      .minute(MINUTE)
      .valueOf();
  } else if (TYPE === "daily_morning") {
    const [m_hour, m_minute] = await getOptions("morning");
    const isNextDay =
      NOW.hour() > m_hour || (NOW.hour() === m_hour && NOW.minute() >= m_minute)
        ? 1
        : 0;
    return NOW.startOf("d")
      .add(isNextDay, "d")
      .hour(m_hour)
      .minute(m_minute)
      .valueOf();
  } else if (TYPE === "daily_evening") {
    const [e_hour, e_minute] = await getOptions("evening");
    const isNextDay =
      NOW.hour() > e_hour || (NOW.hour() === e_hour && NOW.minute() >= e_minute)
        ? 1
        : 0;
    return NOW.startOf("d")
      .add(isNextDay, "d")
      .hour(e_hour)
      .minute(e_minute)
      .valueOf();
  } else if (
    ["weekends", "mondays", "weekly", "monthly", "custom"].includes(TYPE)
  ) {
    let days = [];
    if (data.weekly) {
      const thisWeek = data.weekly;
      const nextWeek = data.weekly.map((day) => day + 7);
      days = nextWeek
        .concat(thisWeek)
        .map((day) =>
          dayjs().startOf("w").add(day, "d").hour(HOUR).minute(MINUTE),
        );
    } else if (data.monthly) {
      const thisMonth = data.monthly
        .filter((d) => d <= dayjs().daysInMonth())
        .map((d) => dayjs().startOf("M").date(d).hour(HOUR).minute(MINUTE));
      const nextMonth = data.monthly
        .filter((d) => d <= dayjs().add(1, "M").daysInMonth())
        .map((d) =>
          dayjs().startOf("M").add(1, "M").date(d).hour(HOUR).minute(MINUTE),
        );
      days = nextMonth.concat(thisMonth);
    }
    return days
      .filter((d) => d > NOW)
      .pop()
      .valueOf();
  }
  return false;
}

async function getChoices(which) {
  const NOW = dayjs();
  const config = await getOptions(["morning", "evening"]);
  const upgradedConfig = upgradeSettings(config);
  const morning = upgradedConfig.morning || [9, 0];
  const evening = upgradedConfig.evening || [18, 0];

  const all = {
    startup: {
      label: "On Next Startup",
      repeatLabel: "Every Browser Startup",
      startUp: true,
      time: NOW.add(20, "y"),
      timeString: "",
      repeatTime: NOW.add(20, "y"),
      repeatTimeString: "",
      repeat_id: "startup",
      menuLabel: "till next startup",
    },
    "in-an-hour": {
      label: "In One Hour",
      repeatLabel: "Every hour",
      time: NOW.add(1, "h"),
      timeString:
        NOW.add(1, "h").dayOfYear() == NOW.dayOfYear() ? "Today" : "Tomorrow",
      repeatTime: NOW.add(1, "h").format(getHourFormat(true)),
      repeatTimeString: `Starts at`,
      repeat_id: "hourly",
      menuLabel: "for an hour",
    },
    "today-morning": {
      label: "This Morning",
      repeatLabel: "",
      time: NOW.startOf("d").add(morning[0], "h").add(morning[1], "m"),
      timeString: "Today",
      repeatTime: "",
      repeatTimeString: "",
      menuLabel: "till this morning",
      disabled:
        NOW.startOf("d").add(morning[0], "h").add(morning[1], "m").valueOf() <
        dayjs(),
      repeatDisabled: true,
    },
    "today-evening": {
      label: getEveningLabel(evening[0]),
      repeatLabel: `Everyday, Now`,
      time: NOW.startOf("d").add(evening[0], "h").add(evening[1], "m"),
      timeString: "Today",
      repeatTime: NOW.format(getHourFormat(true)),
      repeatTimeString: "Starts Tom at",
      repeat_id: "daily",
      menuLabel: "till this evening",
      disabled:
        NOW.startOf("d").add(evening[0], "h").add(evening[1], "m").valueOf() <
        dayjs(),
    },
    "tom-morning": {
      label: "Tomorrow Morning",
      repeatLabel: "Every Morning",
      time: NOW.startOf("d")
        .add(1, "d")
        .add(morning[0], "h")
        .add(morning[1], "m"),
      timeString: NOW.add(1, "d").format("ddd, D MMM"),
      repeatTime: NOW.startOf("d")
        .add(morning[0], "h")
        .add(morning[1], "m")
        .format(getHourFormat(true)),
      repeatTimeString: `Starts ${NOW < NOW.startOf("d").add(morning[0], "h").add(morning[1], "m") ? "Today" : "Tom"} at`,
      repeat_id: "daily_morning",
      menuLabel: "till tomorrow morning",
    },
    "tom-evening": {
      label: getEveningLabel(evening[0], "tomorrow"),
      repeatLabel: getEveningLabel(evening[0], "everyday"),
      time: NOW.startOf("d")
        .add(1, "d")
        .add(evening[0], "h")
        .add(evening[1], "m"),
      timeString: NOW.add(1, "d").format("ddd, D MMM"),
      repeatTime: NOW.startOf("d")
        .add(evening[0], "h")
        .add(evening[1], "m")
        .format(getHourFormat(true)),
      repeatTimeString: `Starts ${NOW < NOW.startOf("d").add(evening[0], "h").add(evening[1], "m") ? "Today" : "Tom"} at`,
      repeat_id: "daily_evening",
      menuLabel: "till tomorrow evening",
    },
    weekend: {
      label: "Saturday",
      repeatLabel: "Every Saturday",
      time: NOW.startOf("d").weekday(6),
      timeString: NOW.weekday(6).format("ddd, D MMM"),
      repeatTime: NOW.startOf("d").format(getHourFormat(true)),
      repeatTimeString: `${NOW.weekday(6).format("dddd")}s at`,
      repeat_id: "weekends",
      menuLabel: "till the weekend",
    },
    monday: {
      label: "Next Monday",
      repeatLabel: "Every Monday",
      time: NOW.startOf("d").weekday(
        NOW.startOf("d") < dayjs().startOf("d").weekday(1) ? 1 : 8,
      ),
      timeString: NOW.weekday(
        NOW.startOf("d") < dayjs().startOf("d").weekday(1) ? 1 : 8,
      ).format("ddd, D MMM"),
      repeatTime: NOW.startOf("d").format(getHourFormat(true)),
      repeatTimeString: `${NOW.weekday(1).format("dddd")}s at`,
      repeat_id: "mondays",
      menuLabel: "till next Monday",
    },
    week: {
      label: "Next Week",
      repeatLabel: "Every " + NOW.format("dddd"),
      time: NOW.startOf("d").add(1, "week"),
      timeString: NOW.startOf("d").add(1, "week").format("ddd, D MMM"),
      repeatTime: NOW.format(getHourFormat(true)),
      repeatTimeString: `${NOW.format("dddd")}s at`,
      repeat_id: "weekly",
      menuLabel: "for a week",
    },
    month: {
      label: "Next Month",
      repeatLabel: "Every Month",
      time: NOW.startOf("d").add(1, "M"),
      timeString: NOW.startOf("d").add(1, "M").format("ddd, D MMM"),
      repeatTime: NOW.format(getHourFormat(true)),
      repeatTimeString: `${getOrdinal(NOW.format("D"))} of Month`,
      repeat_id: "monthly",
      menuLabel: "for a month",
    },
  };
  return which && all[which] ? all[which] : all;
}

async function snoozeTab(snoozeTime, overrideTab) {
  const activeTab = overrideTab || (await getTabsInWindow(true));
  if (!activeTab || !activeTab.url) return {};
  const sleepyTab = {
    id: getRandomId(),
    title: activeTab.title || getBetterUrl(activeTab.url),
    url: activeTab.url,
    ...(activeTab.pinned ? { pinned: true } : {}),
    ...(activeTab.incognito ? { incognito: true } : {}),
    wakeUpTime:
      snoozeTime === "startup"
        ? dayjs().add(20, "y").valueOf()
        : dayjs(snoozeTime).valueOf(),
    timeCreated: dayjs().valueOf(),
  };
  if (snoozeTime === "startup") sleepyTab.startUp = true;
  await saveTab(sleepyTab);
  await chrome.runtime
    .sendMessage({ logOptions: ["tab", sleepyTab, snoozeTime] })
    .catch(() => {});
  const tabId = activeTab.id || (await getTabId(activeTab.url));
  return { tabId, tabDBId: sleepyTab.id };
}

// ========================
// CONTEXT MENU FUNCTIONS
// ========================

async function setUpContextMenus(cachedMenus) {
  const cm = cachedMenus || (await getOptions("contextMenu"));
  if (!cm || !cm.length || cm.length === 0) return;
  const choices = await getChoices();
  const contexts = getBrowser() === "firefox" ? ["link", "tab"] : ["link"];

  // Clear all existing context menus
  await chrome.contextMenus.removeAll();

  if (cm.length === 1) {
    await chrome.contextMenus.create({
      id: cm[0],
      contexts: contexts,
      title: `Snoozz ${choices[cm[0]].label.toLowerCase()}`,
      documentUrlPatterns: ["<all_urls>"],
      ...(getBrowser() === "firefox"
        ? { icons: { 32: `../icons/${cm[0]}.png` } }
        : {}),
    });
  } else {
    await chrome.contextMenus.create({
      id: "snoozz",
      contexts: contexts,
      title: "Snoozz",
      documentUrlPatterns: ["<all_urls>"],
    });
    for (const o of cm)
      await chrome.contextMenus.create({
        parentId: "snoozz",
        id: o,
        contexts: contexts,
        title: choices[o].menuLabel,
        ...(getBrowser() === "firefox"
          ? { icons: { 32: `../icons/${o}.png` } }
          : {}),
      });
  }
}

async function snoozeInBackground(item, tab) {
  const c = await getChoices(item.menuItemId);

  const isHref = item.linkUrl && item.linkUrl.length;
  const url = isHref ? item.linkUrl : item.pageUrl;
  if (!isValid({ url }))
    return await createNotification(
      null,
      `Can't snoozz that :(`,
      "icons/logo.svg",
      "The link you are trying to snooze is invalid.",
      true,
    );

  let snoozeTime = c && c.time;
  if (c && ["weekend", "monday", "week", "month"].includes(item.menuItemId))
    snoozeTime = await getTimeWithModifier(item.menuItemId);
  if (!snoozeTime || c.disabled || dayjs().isAfter(dayjs(snoozeTime))) {
    return await createNotification(
      null,
      `Can't snoozz that :(`,
      "icons/logo.svg",
      "The time you have selected is invalid.",
      true,
    );
  }

  const startUp = item.menuItemId === "startup" ? true : undefined;
  const title = !isHref
    ? tab.title
    : item.linkText
      ? item.linkText
      : item.selectionText;
  const wakeUpTime = snoozeTime.valueOf();
  const pinned = !isHref && tab.pinned ? tab.pinned : undefined;
  const assembledTab = Object.assign(item, {
    url,
    title,
    pinned,
    startUp,
    wakeUpTime,
  });

  const snoozed = await snoozeTab(
    item.menuItemId === "startup" ? "startup" : snoozeTime.valueOf(),
    assembledTab,
  );

  const msg = `${!isHref ? tab.title : getHostname(url)} will wake up ${formatSnoozedUntil(assembledTab)}.`;
  await createNotification(
    snoozed.tabDBId,
    "A new tab is now napping :)",
    "icons/logo.svg",
    msg,
    true,
  );

  if (!isHref) await chrome.tabs.remove(tab.id);
  await chrome.runtime.sendMessage({ updateDash: true }).catch(() => {});
}

async function getTimeWithModifier(choice) {
  const c = await getChoices([choice]);
  const options = await getOptions(["morning", "evening", "popup"]);
  const modifier = options.popup ? options.popup[choice] : "";
  const upgradedOptions = upgradeSettings(options);
  const m = upgradedOptions[modifier] || [dayjs().hour(), dayjs().minute()];
  return dayjs(c.time).add(m[0], "h").add(m[1], "m");
}

async function contextMenuUpdater(menu) {
  const choices = await getChoices();
  for (const c of menu.menuIds) {
    if (choices[c])
      await chrome.contextMenus.update(c, { enabled: !choices[c].disabled });
  }
  await chrome.contextMenus.refresh();
}

// ========================
// BADGE UPDATE FUNCTION
// ========================

async function updateBadge(cachedTabs, cachedBadge) {
  let num = 0;
  const badge = cachedBadge || (await getOptions("badge"));
  let tabs = cachedTabs || (await getSnoozedTabs());
  tabs = sleeping(tabs);
  if (tabs.length > 0 && badge && ["all", "today"].includes(badge))
    num = badge === "today" ? today(tabs).length : tabs.length;
  await chrome.action.setBadgeText({ text: num > 0 ? num.toString() : "" });
  await chrome.action.setBadgeBackgroundColor({ color: "#0072BC" });
}

// ========================
// WAKE UP FUNCTIONS
// ========================

async function cleanUpHistory(tabs) {
  const h = (await getOptions("history")) || 365;
  const tabsToDelete = tabs.filter(
    (t) => h && t.opened && dayjs().isAfter(dayjs(t.opened).add(h, "d")),
  );
  if (tabsToDelete.length === 0) return;
  bgLog(
    ["Deleting old tabs automatically:", tabsToDelete.map((t) => t.id)],
    ["", "red"],
    "red",
  );
  await saveTabs(tabs.filter((t) => !tabsToDelete.includes(t)));
}

let debounce;
async function setNextAlarm(tabs) {
  const next = sleeping(tabs)
    .filter((t) => t.wakeUpTime && !t.paused)
    .reduce((t1, t2) => (t1.wakeUpTime < t2.wakeUpTime ? t1 : t2), {
      wakeUpTime: Infinity,
    });

  if (!next) return;
  if (next.wakeUpTime <= dayjs().valueOf()) {
    clearTimeout(debounce);
    debounce = setTimeout((_) => wakeMeUp(tabs), 3000);
  } else {
    const oneHour = dayjs().add(1, "h").valueOf();
    bgLog(
      [
        "Next tab waking up:",
        next.id,
        "at",
        dayjs(next.wakeUpTime).format("HH:mm:ss DD/MM/YY"),
      ],
      ["", "green", "", "yellow"],
    );
    await createAlarm(
      next.wakeUpTime < oneHour ? next.wakeUpTime : oneHour,
      next.wakeUpTime < oneHour,
    );
  }
}

async function wakeMeUp(tabs) {
  const now = dayjs().valueOf();
  const wakingUp = (t) =>
    !t.paused &&
    !t.opened &&
    (t.url || (t.tabs && t.tabs.length && t.tabs.length > 0)) &&
    t.wakeUpTime &&
    t.wakeUpTime <= now;
  const tabsToWakeUp = tabs.filter(wakingUp);
  if (tabsToWakeUp.length === 0) return;
  bgLog(
    ["Waking up tabs", tabsToWakeUp.map((t) => t.id).join(", ")],
    ["", "green"],
    "yellow",
  );
  tabs
    .filter(wakingUp)
    .filter((t) => !t.repeat)
    .forEach((t) => (t.opened = now));
  for (const s of tabs.filter(wakingUp).filter((t) => t.repeat)) {
    const next = await calculateNextSnoozeTime(s.repeat);
    s.wakeUpTime = next.valueOf();
  }
  await saveTabs(tabs);

  for (const s of tabsToWakeUp)
    s.tabs
      ? s.selection
        ? await openSelection(s, true)
        : await openWindow(s, true)
      : await openTab(s, null, true);
}

async function wakeUpTask(cachedTabs) {
  const tabs = cachedTabs || (await getSnoozedTabs());
  if (!tabs || !tabs.length || tabs.length === 0) return;
  await cleanUpHistory(tabs);
  if (sleeping(tabs).length === 0) {
    bgLog(["No tabs are asleep"], ["pink"], "pink");
    return chrome.alarms.clear("wakeUpTabs");
  }
  await setNextAlarm(tabs);
}

// ========================
// INITIALIZATION FUNCTION
// ========================

async function setUpExtension() {
  let snoozed = await getSnoozedTabs();
  if (!snoozed || !snoozed.length || snoozed.length === 0) await saveTabs([]);
  let options = await getOptions();
  options = Object.assign(DEFAULT_OPTIONS, options);
  options = upgradeSettings(options);
  await saveOptions(options);
  await init();
}

async function init() {
  const allTabs = await getSnoozedTabs();
  if (
    allTabs &&
    allTabs.length &&
    allTabs.some(
      (t) =>
        (t.startUp || (t.repeat && t.repeat.type === "startup")) && !t.opened,
    )
  ) {
    allTabs
      .filter(
        (t) =>
          (t.startUp || (t.repeat && t.repeat.type === "startup")) && !t.opened,
      )
      .forEach((t) => (t.wakeUpTime = dayjs().subtract(10, "s").valueOf()));
    await saveTabs(allTabs);
  }
  await wakeUpTask();
  await setUpContextMenus();
}

function sendToLogs([which, p1]) {
  try {
    if (["tab", "window", "group", "selection"].includes(which))
      bgLog(
        [
          "Snoozing a new " + which,
          p1.id,
          "till",
          dayjs(p1.wakeUpTime).format("HH:mm:ss DD/MM/YY"),
        ],
        ["", "green", "", "yellow"],
        "green",
      );
    if (which === "history")
      bgLog(["Sending tabs to history:", p1.join(", ")], ["", "green"], "blue");
    if (which === "manually")
      bgLog(["Waking up tabs manually:", p1.join(", ")], ["", "green"], "blue");
    if (which === "delete")
      bgLog(["Deleting tabs manually:", p1.join(", ")], ["", "red"], "red");
  } catch (e) {
    console.log("logError", e, which, p1);
  }
}

// ========================
// EVENT LISTENERS
// ========================

chrome.runtime.onMessage.addListener(async (msg) => {
  if (msg.logOptions) sendToLogs(msg.logOptions);
  if (msg.wakeUp) await wakeUpTask();
  if (msg.close)
    setTimeout((_) => {
      if (msg.tabId) chrome.tabs.remove(msg.tabId);
      if (msg.windowId) chrome.windows.remove(msg.windowId);
      chrome.runtime.sendMessage({ closePopup: true }).catch(() => {});
    }, msg.delay || 2000);
});

chrome.storage.onChanged.addListener(async (changes) => {
  if (changes.snoozedOptions) {
    await setUpContextMenus(changes.snoozedOptions.newValue.contextMenu);
    await updateBadge(null, changes.snoozedOptions.newValue.badge);
    if (
      changes.snoozedOptions.oldValue &&
      changes.snoozedOptions.newValue.history !==
        changes.snoozedOptions.oldValue.history
    )
      await wakeUpTask();
  }
  if (changes.snoozed) {
    await updateBadge(changes.snoozed.newValue);
    await wakeUpTask(changes.snoozed.newValue);
  }
});

if (chrome.notifications)
  chrome.notifications.onClicked.addListener(async (id) => {
    await chrome.notifications.clear(id);
    if (id === "_wakeUpNow") return await wakeUpTask();
    const t = await getSnoozedTabs(id);
    if (t && t.id && id && id.length) {
      const found = t.tabs
        ? await findTabAnywhere(null, t.id)
        : await findTabAnywhere(t.url);
      if (found && found.id && found.windowId) {
        try {
          await chrome.windows.update(found.windowId, { focused: true });
          if (t.tabs) {
            const winTabs = await chrome.tabs.query({
              windowId: found.windowId,
            });
            await chrome.tabs.update(
              winTabs[0] && winTabs[0].id ? winTabs[0].id : found.id,
              { active: true },
            );
          } else {
            await chrome.tabs.update(found.id, { active: true });
          }
          return;
        } catch (e) {}
      }
    }
    await openExtensionTab("html/nap-room.html");
  });

if (chrome.commands)
  chrome.commands.onCommand.addListener(async (command, tab) => {
    if (command === "nap-room") return openExtensionTab("/html/nap-room.html");
    tab = tab || (await getTabsInWindow(true));
    await snoozeInBackground({ menuItemId: command, pageUrl: tab.url }, tab);
  });

chrome.contextMenus.onClicked.addListener(snoozeInBackground);

if (getBrowser() === "firefox")
  chrome.contextMenus.onShown.addListener(contextMenuUpdater);

chrome.runtime.onInstalled.addListener(async (details) => {
  await setUpExtension();
  if (
    details &&
    details.reason &&
    details.reason == "update" &&
    details.previousVersion &&
    details.previousVersion != chrome.runtime.getManifest().version
  ) {
    if (
      chrome.runtime
        .getManifest()
        .version.search(/^\d{1,3}(\.\d{1,3}){1,2}$/) !== 0
    )
      return; // skip if minor version
    await chrome.storage.local.set({ updated: true });
    if (chrome.notifications)
      await createNotification(
        null,
        "Snoozz has been updated",
        "icons/logo.svg",
        "Click here to see what's new.",
        true,
      );
  }
});

chrome.runtime.onStartup.addListener(init);

chrome.alarms.onAlarm.addListener(async (a) => {
  if (a.name === "wakeUpTabs") await wakeUpTask();
});

if (chrome.idle)
  chrome.idle.onStateChanged.addListener(async (s) => {
    if (s === "active" || getBrowser() === "firefox") {
      if (navigator && navigator.onLine === false) {
        globalThis.addEventListener(
          "online",
          async (_) => {
            await wakeUpTask();
          },
          { once: true },
        );
      } else {
        await wakeUpTask();
      }
    }
  });
