let stats;
let appSettings = {};
const availableLangs = ['ar', 'de', 'en', 'es', 'fr', 'id', 'ms', 'ru', 'tr', 'ta', 'bn', 'nl', 'sv', 'pl', 'ko', 'th', 'it', 'hi', 'fa', 'pt', 'ja', 'vi', 'uk', 'zh'];
const ignoreDomains = ['InvalidURL', ''];
const colors = ["white", "whitesmoke"];
const hiliteColor = '#ea4335';
const idleHiliteColor = 'silver';
const idleBgColor = 'gray';
const barColor = '#184a7e';
const defaultFavIcon = 'images/chrome-icon.png';
let db;
const dbName = 'iDB';
const logTable = 'stats';
const domainTable = 'domains';
const versionNumber = 1;


const initDB = async () => {
    await new Promise((resolve, reject) => {

        const openRequest = indexedDB.open(dbName, versionNumber);
        openRequest.onupgradeneeded = function (e) {
            db = e.target.result;
            if (!db.objectStoreNames.contains(domainTable)) {
                const dTab = db.createObjectStore(domainTable, { keyPath: 'key', autoIncrement: true });
                dTab.createIndex('domain', "domain", { unique: true });
            }
            if (!db.objectStoreNames.contains(logTable)) {
                const oTab = db.createObjectStore(logTable, { keyPath: 'key', autoIncrement: true });
                oTab.createIndex('day', "day", { unique: false });
                oTab.createIndex('domainDay', ["domain", "day"], { unique: true });
            }
        };
        openRequest.onsuccess = function (e) { db = e.target.result; resolve(); };
        openRequest.onerror = function (e) { console.log(e); reject(); };

    });
}

const getStats = async () => {
    let ro = { todayTotalMinutes: 0, allTotalMinutes: 0, allDaily: [], allDomains: {}, todayDomains: {}, rank: {} }
    let today = getToday();
    const tran = db.transaction([logTable, domainTable], 'readonly');
    const logIndex = tran.objectStore(logTable).index("day");
    await new Promise((resolve) => {
        logIndex.openCursor(IDBKeyRange.only(today)).onsuccess = async (o) => {
            const logCursor = o.target.result;
            if (logCursor) {
                ro.todayTotalMinutes += logCursor.value.minutes;
                if (!ro.todayDomains[logCursor.value.domain]) {
                    ro.todayDomains[logCursor.value.domain] = {
                        index: 0,
                        todayMinutes: logCursor.value.minutes,
                        domainDaily: {},
                        startAngle: 0,
                        endAngle: 0,
                        todayPercentage: 0
                    }
                }
                logCursor.continue();
            }
            else {
                resolve();
            }
        };
    });

    for (let i = 1; i <= 30; i++) {
        let dayStr = addDays(today, i - 30);
        let oAllDaily = { day: dayStr, minutes: 0 }
        let goCount = false;
        await new Promise((resolve) => {
            logIndex.openCursor(IDBKeyRange.only(dayStr)).onsuccess = async (o) => {
                const logCursor = o.target.result;
                if (logCursor) {
                    oAllDaily.minutes += logCursor.value.minutes;
                    if (ro.todayDomains[logCursor.value.domain]) { /* domainDaily contains only today's domains' data */
                        if (!ro.todayDomains[logCursor.value.domain].domainDaily[dayStr])
                            ro.todayDomains[logCursor.value.domain].domainDaily[dayStr] = { minutes: 0 }
                        ro.todayDomains[logCursor.value.domain].domainDaily[dayStr].minutes += logCursor.value.minutes;
                    }

                    if (!ro.allDomains[logCursor.value.domain]) {
                        ro.allDomains[logCursor.value.domain] = { totalMinutes: 0 }
                    }
                    ro.allDomains[logCursor.value.domain].totalMinutes += logCursor.value.minutes;

                    logCursor.continue();
                }
                else {
                    if (oAllDaily.minutes > 0)
                        goCount = true;
                    if (goCount)
                        ro.allDaily.push(oAllDaily);
                    resolve();
                }
            };
        });
    }

    ro.allTotalMinutes = ro.allDaily.map(a => a.minutes).reduce((p, t) => p + t, 0);
    let allSorted = Object.keys(ro.allDomains).map((key) => [key, ro.allDomains[key].totalMinutes]);
    allSorted.sort((a, b) => { return b[1] - a[1] });
    let j = 0;
    while (j < allSorted.length) {
        let asDomain = allSorted[j][0];
        let domainData = await getSetDomain(asDomain);
        let asMinutes = ro.allDomains[asDomain].totalMinutes;
        let asPercentage = getPercentage(asMinutes, ro.allTotalMinutes);
        let asAvg = Math.round(asMinutes / ro.allDaily.length);
        ro.allDomains[asDomain].index = j;
        ro.allDomains[asDomain].favIconUrl = domainData.favIconUrl;
        ro.allDomains[asDomain].isBlocked = domainData.isBlocked;
        ro.allDomains[asDomain].icon = domainData.icon;
        ro.allDomains[asDomain].totalPercentage = asPercentage;
        ro.allDomains[asDomain].totalAvg = asAvg;
        j++;
    }

    let todaySorted = Object.keys(ro.todayDomains).map((key) => [key, ro.todayDomains[key].todayMinutes]);
    todaySorted.sort((a, b) => { return b[1] - a[1] });
    let i = 0;
    let lastAngle = -Math.PI / 2;
    while (i < todaySorted.length) {
        let sDomain = todaySorted[i][0];
        let sMinutes = todaySorted[i][1]; /* = ro.todayDomains[sDomain].minutes */
        let thisAngle = sMinutes * 2 * Math.PI / ro.todayTotalMinutes;
        let domainTotalMinutes = (Object.values(ro.todayDomains[sDomain].domainDaily)).map(a => a.todayMinutes).reduce((p, t) => p + t, 0);
        let thisStartAngle = lastAngle;
        let thisEndAngle = thisStartAngle + thisAngle;
        let sPercentage = getPercentage(sMinutes, ro.todayTotalMinutes);
        lastAngle += thisAngle;
        ro.todayDomains[sDomain].index = i;
        ro.todayDomains[sDomain].startAngle = thisStartAngle;
        ro.todayDomains[sDomain].endAngle = thisEndAngle;
        ro.todayDomains[sDomain].todayPercentage = sPercentage;
        ro.todayDomains[sDomain].avg = Math.ceil(domainTotalMinutes / ro.allDaily.length);
        i++;
    }

    if (ro.allDaily.length > 0) {
        let dayTitle = ro.allDaily.length > 1 ? appSettings.i18n.daysTitle : appSettings.i18n.dayTitle;
        ro.rank.todayTitle = `${appSettings.i18n.todayTitle} · ${barDate(ro.allDaily[0].day)}`;
        let rankTitle = `${appSettings.i18n.allTimeTitle} · ${ro.allDaily.length} ${dayTitle}`;
        if (ro.allDaily.length == 1)
            rankTitle += ` · ${barDate(ro.allDaily[0].day)}`;
        else
            rankTitle += ` · ${barDate(ro.allDaily[ro.allDaily.length - 1].day)} - ${barDate(ro.allDaily[0].day)}`;
        ro.rank.title = rankTitle;
    }
    return ro;

}

const getPercentage = (a, b) => {
    return 100 * a / b;
}

const displayPercentage = (p) => {
    if (p < 1)
        return p.toFixed(1) + '%';
    else
        return Math.round(p) + '%';
}

const insertDB = (domain, day, currentDateTime) => {
    return new Promise((resolve) => {
        const store = db.transaction(logTable, 'readwrite').objectStore(logTable);
        const index = store.index("domainDay");
        const request = index.get([domain, day]);
        request.onsuccess = () => {
            const record = request.result;
            if (record) {
                if (record.lastPing != currentDateTime) {
                    record.lastPing = currentDateTime;
                    record.minutes++;
                    store.put(record)
                }
            }
            else {
                const item = { domain: domain, day: day, minutes: 1, lastPing: currentDateTime };
                store.add(item);
            }
            resolve(record);
        };
    });
}

const updateDomain = async (domain, favIconUrl, icon) => {
    return new Promise((resolve) => {
        const store = db.transaction(domainTable, 'readwrite').objectStore(domainTable);
        const index = store.index("domain");
        const request = index.get(domain);
        request.onsuccess = function () {
            const record = request.result;
            record.favIconUrl = favIconUrl;
            record.icon = icon;
            store.put(record);
            resolve();
        };
    });
}

const populateSampleData = async (domain) => {
    let today = getToday();
    let i = 0;
    while (i < 7) {
        insertDB(domain, addDays(today, -i), getCurrentDateAndTime());
        i++;
    }
}

const toggleBlock = async (domain) => {
    return new Promise((resolve) => {
        const store = db.transaction(domainTable, 'readwrite').objectStore(domainTable);
        const index = store.index("domain");
        const request = index.get(domain);
        request.onsuccess = function () {
            const record = request.result;
            record.isBlocked = !record.isBlocked;
            record.blockBy = null;
            if (record.isBlocked) {
                record.blockedOn = new Date();
            }
            store.put(record);
            resolve();
        };
    });
}

const tempUnBlock = async (domain, minutes) => {
    return new Promise((resolve) => {
        const store = db.transaction(domainTable, 'readwrite').objectStore(domainTable);
        const index = store.index("domain");
        const request = index.get(domain);
        request.onsuccess = function () {
            const record = request.result;
            record.isBlocked = false;
            record.blockedOn = null;
            if (minutes > 0) {
                let bd = new Date();
                bd.setMinutes(bd.getMinutes() + minutes);
                record.blockBy = bd;
            }
            else {
                record.blockBy = null;
            }
            store.put(record);
            resolve(record);
        };
    });
}

const updateSetting = async (s, v) => {
    appSettings = await getStorage('appSettings');
    return new Promise(async (resolve) => {
        appSettings[s] = v;
        await chrome.storage.local.set({ 'appSettings': appSettings });
        resolve(appSettings);
    });
}

const getDomainID = (domain) => {
    return domain.replace(/[\W_]+/g, '');
}

const getSetDomain = async (domain, favIconUrl) => {

    return new Promise((resolve) => {
        const store = db.transaction(domainTable, 'readwrite').objectStore(domainTable);
        const index = store.index("domain");
        index.openCursor(IDBKeyRange.only(domain)).onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                resolve(cursor.value);
            }
            else {
                if (favIconUrl && favIconUrl.includes('file://')) {
                    favIconUrl = defaultFavIcon;
                }
                const item = { domain: domain, favIconUrl: favIconUrl ?? defaultFavIcon, isBlocked: false };
                store.add(item);
                resolve(item);
            }
        };
    });
};

const getToday = () => {
    return new Date().toLocaleDateString('en-CA') /* yyy-mm-dd */
}

const getCurrentDateAndTime = () => {
    return (new Date().toLocaleDateString('en-CA') + ' ' + new Date().toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' }))
}

const domainFromURL = (url) => {

    if (!url)
        return "InvalidURL";
    let tURL = new URL(url);

    let tHost = tURL.host.replace(/^www\./, '');
    let tad = getTrackAsDomain(tHost + tURL.pathname);

    if (tad != '')
        return tad;

    if (url.includes("chrome-extension://") && url.includes("blocked-by-extension")) {
        let { domain } = { ...extractFromBlockedURL(url) };
        return domain;
    }
    else {
        if (tHost == '')
            tHost = 'localFile';
        return tHost;
    }

}

const getTrackAsDomain = (url) => {
    let r = '';
    for (const d of appSettings.trackAsDomain) {
        let td = d.replace(/https?:\/\/(www\.)?/g, '');
        if (url.startsWith(td)) {
            r = td;
            break;
        }
    }
    return r;
}

const extractFromBlockedURL = (furl) => {
    if (!furl)
        furl = window.location.href;
    let url = new URL(furl);
    let search = new URLSearchParams(url.search);
    let sDomain = search.get('domain');
    let sURL = search.get('url');
    let tad = getTrackAsDomain(sURL);

    if (tad != '')
        sDomain = tad;

    return { domain: sDomain, url: sURL };
}

const getCoordinates = (angle, radius, distance) => {
    const x = Math.cos(angle);
    const y = Math.sin(angle);
    const coordX = x * radius + distance;
    const coordY = y * radius + distance;
    return [coordX, coordY];
}

const addDays = (dateString, days) => {
    let ds = dateString.split('-');
    let date = new Date(ds[0], ds[1] - 1, ds[2]);
    date.setDate(date.getDate() + days);
    return date.toLocaleDateString('en-CA');
}

const stringToDate = (dateString) => {
    let ds = dateString.split('-');
    let date = new Date(ds[0], ds[1] - 1, ds[2]);
    return date.toLocaleDateString(appSettings.i18n.languageCode, { weekday: "long", day: "numeric", month: "long", year: "2-digit" });
}

const barDate = (dateString) => {
    let ds = dateString.split('-');
    let date = new Date(ds[0], ds[1] - 1, ds[2]);
    return date.toLocaleDateString(appSettings.i18n.languageCode, { day: "numeric", month: "short", weekday: "short" });
}

const addDaysToDate = (dateString, days) => {
    let ds = dateString.split('-');
    let date = new Date(ds[0], ds[1] - 1, ds[2]);
    date.setDate(date.getDate() + days);
    return date;
}

const getDHMS = (c) => {
    let dhms = appSettings.i18n.dayHourMinuteSecond.split(',');
    if (c == 'd')
        return dhms[0];
    else if (c == 'h')
        return dhms[1];
    else if (c == 'm')
        return dhms[2];
    else if (c == 's')
        return dhms[3];
}

const formatTime = (minutes) => {
    const d = Math.floor(minutes / 1440);
    const h = Math.floor((minutes % 1440) / 60);
    const m = minutes % 60;
    const formattedMinutes = String(m).padStart(2, '0');
    let r = [h, formattedMinutes];
    if (d > 0)
        r.unshift(d);
    return r.join(':');;
}

const formatTimeString = (minutes) => {
    const d = Math.floor(minutes / 1440);
    const h = Math.floor((minutes % 1440) / 60);
    const m = minutes % 60;
    let r = '';
    if (m > 0)
        r = `${m}${getDHMS('m')}`;
    if (h > 0)
        r = `${h}${getDHMS('h')} ${r}`;
    if (d > 0)
        r = `${d}${getDHMS('d')} ${r}`;
    return r;
}

const whiteFill = (s) => {
    if (s.length < 2) {
        s = '  ' + s + '  ';
    }
    else if (s.length < 3) {
        s = ' ' + s + ' ';
    }
    return s;
}

const blockedSince = (seconds) => {
    seconds = Number(seconds);
    var d = Math.floor(seconds / (3600 * 24));
    var h = Math.floor(seconds % (3600 * 24) / 3600);
    var m = Math.floor(seconds % 3600 / 60);
    var s = Math.floor(seconds % 60);
    var dDisplay = d > 0 ? d + getDHMS('d') + " " : "";
    var hDisplay = h > 0 ? h + getDHMS('h') + " " : "";
    var mDisplay = m > 0 ? m + getDHMS('m') + " " : "";
    var sDisplay = s > 0 ? s + getDHMS('s') + " " : "";
    return dDisplay + hDisplay + mDisplay + sDisplay;
}

const getStorage = async (key) => {
    return new Promise((resolve) => {
        chrome.storage.local.get([key], function (result) {
            resolve(result[key]);
        });
    });
};

const refresh = async (from) => {
    return new Promise((resolve, error) => {
        chrome.runtime.sendMessage({ msg: 'refresh', from: from }, response => {
            if (!chrome.runtime.lastError) {
                /* msg is received */
            }
            else {
                /* popup not open to receive the msg */
            }
            resolve();
        });
    })
}

const truncateDB = async () => {
    await new Promise((resolve, reject) => {
        const tran = db.transaction([logTable, domainTable], 'readwrite');
        const logStore = tran.objectStore(logTable);
        const domainStore = tran.objectStore(domainTable);
        const logClearRequest = logStore.clear();
        logClearRequest.onsuccess = () => {
            const domainClearRequest = domainStore.clear();
            domainClearRequest.onsuccess = () => {
                resolve();
            }
            domainClearRequest.onerror = () => {
                reject();
            }
        }
        logClearRequest.onerror = () => {
            reject();
        }
    }
    );
}

