self.importScripts('common.js');

let isIdle = false;
let activeTabs = [];
let isRunning = false;

chrome.idle.onStateChanged.addListener(async (newState) => {
        isIdle = newState === "idle" || newState === "locked";
        await goTabs();
});

chrome.runtime.onInstalled.addListener(async () => { await initUser(); await goTabs() });
chrome.tabs.onActivated.addListener(async () => { await goTabs() });
chrome.alarms.onAlarm.addListener(async () => { await goTabs() });
chrome.runtime.onMessage.addListener(async () => { await goTabs() });
chrome.tabs.onUpdated.addListener(async (t, e) => { if (e.status == 'complete') { await goTabs() } });
chrome.tabs.onRemoved.addListener(async () => { await goTabs() });

const initUser = async () => {
        await initDB();
        appSettings = {};
        let defaultSettings = {
                theme: 'blue',
                badgeText: 'percentage',
                tempUnBlockMinutes: 3,
                idleMinutes: 10,
                rankListMode: 0, /* 0: Today 1: All time */
                trackAsDomain: ['google.com/finance', 'google.com/maps'],
                i18n: { languageCode: '' },
                blockMsg: ''
        }
        let currentSettings = await getStorage('appSettings');
        if (currentSettings) {
                appSettings = { ...defaultSettings, ...currentSettings }
        }
        else {
                appSettings = { ...defaultSettings }
        }
        let i18nValues = {};
        let lang = (availableLangs.indexOf(navigator.language) >= 0) ? navigator.language : 'en';
        lang = (availableLangs.indexOf(appSettings.i18n.languageCode) >= 0) ? appSettings.i18n.languageCode : lang;
        const response = await fetch('../_locales/' + lang + '/messages.json');
        const data = await response.json();
        Object.entries(data).forEach(([key, value]) => {
                i18nValues[key] = value.message
        });
        appSettings.i18n = i18nValues;

        if (appSettings.blockMsg == '')
                appSettings.blockMsg = appSettings.i18n.defaultBlockMsg;

        await chrome.storage.local.set({ 'appSettings': appSettings });
        await setAlarm();
}

const setAlarm = async () => {
        let alarmName = "everyMinute";
        const alarm = await chrome.alarms.get(alarmName);
        return new Promise((resolve) => {
                if (typeof alarm === 'undefined') {
                        let w = new Date();
                        w.setMinutes(w.getMinutes() + 1);
                        w.setSeconds(0);
                        w.setMilliseconds(0);
                        chrome.alarms.create(alarmName, { periodInMinutes: 1, when: Date.parse(w) });
                }
                resolve();
        })
}

const goTabs = async () => {
        if (isRunning) { return; }
        isRunning = true;
        try {
                if (!db) { await initDB() }
                appSettings = await getStorage('appSettings');
                chrome.idle.setDetectionInterval(appSettings.idleMinutes * 60);
                stats = await getStats();
                activeTabs = [];
                var tabs = await chrome.tabs.query({});
                await Promise.all(tabs.map(async (tab) => {
                        let tabDomain = domainFromURL(tab.url);
                        if (ignoreDomains.includes(tabDomain)) { return }
                        let domainData = await getSetDomain(tabDomain, tab.favIconUrl);

                        let chromeWindow = await chrome.windows.get(tab.windowId);
                        let isTabActive = chromeWindow.state !== "minimized" && tab.active;
                        let isTabIdle = isIdle && !tab.audible;

                        if (domainData.blockBy && domainData.blockBy <= new Date()) {
                                await toggleBlock(tabDomain);
                                domainData = await getSetDomain(tabDomain);
                        }

                        if (domainData.isBlocked) {
                                if (!tab.url.includes("blocked-by-extension.html"))
                                        await chrome.tabs.update(tab.id, { url: "blocked-by-extension.html?domain=" + tabDomain + '&url=' + tab.url });
                        }
                        else {
                                if (tab.url.includes("blocked-by-extension.html")) {
                                        let { url } = { ...extractFromBlockedURL(tab.url) };
                                        await chrome.tabs.update(tab.id, { url: url });
                                }
                        }

                        if (!domainData.isBlocked && (tab.audible || isTabActive) && !isTabIdle) {
                                activeTabs.push({ tabID: tab.id, favIconUrl: (tab.favIconUrl == '' ? defaultFavIcon : tab.favIconUrl), domain: tabDomain })
                                await insertDB(tabDomain, getToday(), getCurrentDateAndTime());
                        }
                }));
                await updateTabIcons();
        }
        catch {
                isRunning = false;
        }

}

const updateTabIcons = async () => {
        try {
                stats = await getStats();
                var tabs = await chrome.tabs.query({});
                await Promise.all(tabs.map(async (tab) => {
                        let tabDomain = domainFromURL(tab.url);
                        if (ignoreDomains.includes(tabDomain)) { return }
                        let chromeWindow = await chrome.windows.get(tab.windowId);
                        let isTabActive = chromeWindow.state !== "minimized" && tab.active;
                        let isTabIdle = isIdle && !tab.audible;
                        if (stats.todayDomains[tabDomain] && isTabActive) {
                                let { startAngle, endAngle, todayMinutes, todayPercentage } = stats.todayDomains[tabDomain];
                                if (!tab.favIconUrl)
                                        tab.favIconUrl = defaultFavIcon;
                                let canvas = generateIcon(startAngle, endAngle, true, isTabIdle);
                                let smallCanvas = generateIcon(startAngle, endAngle, false, isTabIdle);
                                await canvas.canvas.convertToBlob().then((blob) => {
                                        let reader = new FileReader();
                                        reader.readAsDataURL(blob);
                                        reader.onloadend = async () => {
                                                await updateDomain(tabDomain, tab.favIconUrl, reader.result);
                                                updateIconAndBadge(tab.id, tabDomain, canvas, smallCanvas, todayMinutes, displayPercentage(todayPercentage));
                                        }
                                });
                        }
                }));
                stats = await getStats();
                stats.activeTabs = activeTabs;
                chrome.storage.local.set({ 'stats': stats }, () => {
                        refresh();
                        isRunning = false;
                });
        } catch {
                isRunning = false;
        }

}

const generateIcon = (startAngle, endAngle, isFullSize, isTabIdle) => {
        let canvas = new OffscreenCanvas(128, 128).getContext("2d", { alpha: true });
        let barBgColor = colors[0];
        let wh = 128;
        let arcLineWidth = wh / 5;
        let arcR = wh / 2 - arcLineWidth / 1.9;
        canvas.translate(0, 0);
        canvas.clearRect(0, 0, wh, wh);
        canvas.translate(wh / 2, wh / 2);
        if (!isFullSize) {
                arcLineWidth = arcLineWidth / 2;
                arcR = arcR / 2;
                canvas.translate(0, -wh / 4);
        }

        canvas.beginPath();
        canvas.arc(0, 0, arcR, 0, 2 * Math.PI);
        canvas.lineWidth = arcLineWidth;
        canvas.lineCap = "butt";
        canvas.strokeStyle = isTabIdle ? idleBgColor : barBgColor;
        canvas.stroke();

        canvas.beginPath();
        canvas.arc(0, 0, arcR, startAngle, endAngle);
        canvas.lineWidth = arcLineWidth * 0.85;
        canvas.lineCap = "butt";
        canvas.strokeStyle = isTabIdle ? idleHiliteColor : hiliteColor;
        canvas.stroke();
        return canvas;
}

const updateIconAndBadge = (tabID, domain, canvas, smallCanvas, minutes, percentage) => {

        chrome.action.setTitle({ tabId: tabID, title: domain + ': ' + formatTime(minutes) + ' (' + percentage + ') ' + appSettings.i18n.todayTitle });

        if (appSettings.badgeText != 'none')
                chrome.action.setIcon({ tabId: tabID, imageData: { "128": smallCanvas.getImageData(0, 0, 128, 128) } });
        else
                chrome.action.setIcon({ tabId: tabID, imageData: { "128": canvas.getImageData(0, 0, 128, 128) } });

        if (appSettings.badgeText == 'time') {
                chrome.action.setBadgeText({ tabId: tabID, text: whiteFill(formatTime(minutes)) });
        }
        else if (appSettings.badgeText == 'percentage') {
                chrome.action.setBadgeText({ tabId: tabID, text: whiteFill(percentage) });
        }
        else {
                chrome.action.setBadgeText({ tabId: tabID, text: '' });
        }

}

