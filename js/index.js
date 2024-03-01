let onDomain = null;

chrome.runtime.onMessage.addListener(async () => { await loadTab(); });

$(async function () {
    await loadTab();
});

const loadTab = async () => {
    if (!db) { await initDB() }
    let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    appSettings = await getStorage('appSettings');
    stats = await getStorage('stats');
    let tabDomain = domainFromURL(tab.url);
    let domain = onDomain ?? tabDomain;
    let tabDomainData = stats.todayDomains[tabDomain];
    document.documentElement.setAttribute('data-theme', appSettings.theme);
    Object.entries(appSettings.i18n).forEach(function ([key, value]) {
        $('#' + key).text(value);
        $('.' + key).text(value);
    });
    $('#svg').html('');
    $('#svg').append(baseCircle);
    $('#svg').append(centerCircle);

    $('#blockOnText').html(appSettings.i18n.unBlockTitle);
    $('#blockOffText').html(appSettings.i18n.blockTitle);

    $('#todayTotalTime').html(formatTime(stats.todayTotalMinutes));
    $('.extension-icon').attr('src', stats.allDomains[tabDomain].icon);
    $('#timeUnderIcon').html(formatTime(tabDomainData.todayMinutes));
    $('#percentageUnderIcon').html(displayPercentage(tabDomainData.todayPercentage));
    $('#idleInfo').attr('title', appSettings.i18n.idleSettingDescription);
    $('#rankListOption0').text(stats.rank.todayTitle);
    $('#rankListOption1').text(stats.rank.title);
    $('#version').text(chrome.runtime.getManifest().short_name + ' V.' + chrome.runtime.getManifest().version);
    if (stats.allDaily.length == 1) {
        $('#rankListModeDD').attr("disabled", true);
        $('#rankListOption1').hide();
    }
    for (const d in stats.todayDomains) {
        let color = colors[stats.todayDomains[d].index % colors.length];
        addArc(stats.todayDomains[d].startAngle, stats.todayDomains[d].endAngle, color, d, stats.allDomains[d].favIconUrl);
    }
    $('#languageCodeDD').val(appSettings.i18n.languageCode);
    $('#idleMinutesDD').val(appSettings.idleMinutes);
    $('#rankListModeDD').val(appSettings.rankListMode);
    $('.badgeOption').removeClass('bg-primary').addClass('bg-secondary');
    $('#badgeOption-' + appSettings.badgeText).removeClass('bg-secondary').addClass('bg-primary');
    printCenterText(domain);
    printActiveTabs(domain);
    generateRankList(domain);

}

const addArc = (startAngle, endAngle, color, domain, iconURL) => {

    let angleDiff = endAngle - startAngle;
    if (angleDiff >= 2 * Math.PI)
        endAngle = endAngle - 0.001;
    let paddingAngle = 0.0025;
    if (angleDiff <= paddingAngle * 30) {
        paddingAngle = 0;
        color = 'white';
    }
    if (stats.allDomains[domain].isBlocked)
        color = 'pink';
    let p1 = getCoordinates(startAngle + paddingAngle, r1, svgWidth / 2);
    let p2 = getCoordinates(endAngle - paddingAngle, r1, svgWidth / 2);
    let p3 = getCoordinates(endAngle - paddingAngle, r2, svgWidth / 2);
    let p4 = getCoordinates(startAngle + paddingAngle, r2, svgWidth / 2);
    let mid = getCoordinates((startAngle + endAngle) / 2, (r1 + r2) / 2, svgWidth / 2);
    let largeArcFlag = (angleDiff > Math.PI) ? 1 : 0;
    let path = document.createElementNS("http://www.w3.org/2000/svg", 'path');
    path.setAttribute('d', `M ${p1[0]} ${p1[1]} 
                             A ${r1} ${r1} 0 ${largeArcFlag} 1 ${p2[0]} ${p2[1]} 
                             L ${p3[0]} ${p3[1]}
                             A ${r2} ${r2} 0 ${largeArcFlag} 0 ${p4[0]} ${p4[1]} Z`);
    path.setAttribute('fill', color);
    path.setAttribute('id', 'arc-' + getDomainID(domain));
    path.setAttribute('data-domain', domain);
    path.setAttribute('class', "pointer");
    $('#svg').append(path);
    let iconWidth = angleDiff * r2 * 0.5;
    if (iconWidth > 1) {
        if (iconWidth > maxIconWidth)
            iconWidth = maxIconWidth;
        let image = document.createElementNS("http://www.w3.org/2000/svg", 'image');
        image.setAttribute('x', mid[0] - iconWidth / 2);
        image.setAttribute('y', mid[1] - iconWidth / 2);
        image.setAttribute('width', iconWidth);
        image.setAttribute('height', iconWidth);
        image.setAttribute('id', 'logo-' + getDomainID(domain));
        image.setAttribute('data-domain', domain);
        image.setAttribute('class', "pointer");
        image.setAttributeNS('http://www.w3.org/1999/xlink', 'href', iconURL);
        $('#svg').append(image);
    }
}

const printCenterText = (domain) => {
    onDomain = domain;
    let domainData = stats.todayDomains[domain];
    $('.timeToday').html(formatTime(domainData.todayMinutes));
    $('.percentageToday').html(displayPercentage(domainData.todayPercentage))
        .attr('title', displayPercentage(domainData.todayPercentage) + appSettings.i18n.ofYourBrowserTimeToday);
    $('#avgTime').html(formatTime(stats.allDomains[domain].totalAvg));
    $('#domainTotalPercentage').html(displayPercentage(stats.allDomains[domain].totalPercentage))
        .attr('title', displayPercentage(stats.allDomains[domain].totalPercentage) + ' ' + appSettings.i18n.ofYourTotalBrowserTime);

    $('.hilite').removeClass('hilite');
    $('#arc-' + getDomainID(domain)).addClass('hilite');

    $('#domain').html(domain.substring(0, 25) + (domain.length > 25 ? '...' : ''));
    $('.fav-icon').attr('src', stats.allDomains[domain].favIconUrl);
    if (stats.allDaily.length == 1) {
        $('#dayOne').show();
        $('#dayOneNot').hide();
        $('#domainBarChartWrapper').hide();
    }
    else {
        $('#dayOne').hide();
        $('#dayOneNot').show();
        generateDomainBarChart(domain);
        $('#domainBarChartWrapper').show();
    }
    $('.blockToggle').attr("block-domain", domain);

    $('#blockWait').hide();
    $('#blockOn').hide();
    $('#blockOff').hide();
    if (stats.allDomains[domain].isBlocked)
        $('#blockOn').show();
    else
        $('#blockOff').show();

}

const generateDomainBarChart = (domain) => {
    let allStats = stats.allDaily;
    let maxMinutes = Math.max(...allStats.map(s => s.minutes));
    let barMaxHeight = 55;
    let barMaxWidth = 15;
    let barWidth = Math.floor(220 / allStats.length);
    if (barWidth > barMaxWidth)
        barWidth = barMaxWidth;

    let fromDate = barDate(stats.allDaily[0].day);
    let toDate = barDate(stats.allDaily[stats.allDaily.length - 1].day);
    $('#averageTitle').html(allStats.length + appSettings.i18n.dayAvgTitle)
    $('#fromDate').html(fromDate);
    if (fromDate != toDate)
        $('#toDate').html(toDate);

    let i = 0;
    let barChartHTML = `
      <div class="d-flex flex-row align-items-end justify-content-center">
    `;
    while (i < allStats.length) {

        let totalMinutes = allStats[i].minutes;
        let thisDate = allStats[i].day;

        let domainMinutes = 0;
        if (stats.todayDomains[domain].domainDaily && stats.todayDomains[domain].domainDaily[thisDate])
            domainMinutes = stats.todayDomains[domain].domainDaily[thisDate].minutes;

        let thisBarDomainHeight = domainMinutes * barMaxHeight / maxMinutes;
        let thisBarTotalHeight = totalMinutes * barMaxHeight / maxMinutes;

        let thisBarOtherHeight = thisBarTotalHeight - thisBarDomainHeight;
        if (thisBarOtherHeight == 0)
            thisBarOtherHeight = 1;

        let id = `d${i}`;
        let toolTipContent = `${formatTime(domainMinutes)} ${appSettings.i18n.totalTitle}: ${formatTime(totalMinutes)}`;

        barChartHTML += `
            <div data-id="${id}" style="margin-left:1px;"
                data-summary="${toolTipContent}" data-date="${barDate(thisDate)}" class="d-flex flex-column align-items-center">
                    <div style="height:19px;"><img id="${id}" class="down-arrow" style="display:none" src="images/down-arrow.png" /></div>
                    <div class="rounded-top barBgColor" style="height:${thisBarOtherHeight}px; width:${barWidth}px;"></div>
                    <div style="height:${thisBarDomainHeight}px; width:${barWidth}px; background-color:${'tomato'};">
                </div>
            </div>
        `;

        i++;
    }
    barChartHTML += '</div>';
    $('#domainBarChart').html(barChartHTML);
}

const generateRankList = (domain) => {

    let i = 0;
    let rankHTML = '';
    let barWidth = 80;
    let list = stats.allDomains;
    if (appSettings.rankListMode == 0)
        list = stats.todayDomains;

    while (i < Object.keys(list).length) {

        let rdomain = Object.keys(list).find(k => list[k].index == i);
        let todayMinutes = stats.todayDomains[rdomain] ? stats.todayDomains[rdomain].todayMinutes : 0;
        let todayPercentage = stats.todayDomains[rdomain] ? stats.todayDomains[rdomain].todayPercentage : 0;
        let todayBarWidth = Math.ceil(barWidth * todayPercentage / 100);
        let todayRank = stats.todayDomains[rdomain] ? '#' + (stats.todayDomains[rdomain].index + 1) : '-';

        let allMinutes = stats.allDomains[rdomain].totalMinutes;
        let allPercentage = stats.allDomains[rdomain].totalPercentage;
        let allBarWidth = Math.ceil(barWidth * allPercentage / 100);
        let allRank = '#' + (stats.allDomains[rdomain].index + 1);
        let rBlockImg = 'images/block-' + (stats.allDomains[rdomain].isBlocked ? 'on.png' : 'off.png');

        let bgColor = '#e9ecef';
        if (rdomain == domain)
            bgColor = '#DBE0E6';

        rankHTML += `
                <div class="rankListItem mb-2 rounded border-start border-4 border-primary p-2 small" style="background:${bgColor}">
                <table class="w-100">
                    <tr>
                        <td><img title="${appSettings.i18n.rankTitle} ${i + 1}" src="${stats.allDomains[rdomain].favIconUrl}" style="max-width:20px; max-height:20px;"/></td>
                        <td colspan="5" class="fw-bold">${rdomain} <img block-domain="${rdomain}" class="blockToggle pointer" src="${rBlockImg}" style="width:15px;" />
                        </td>
                    </tr>
                    <tr>
                        <td></td>
                        <td>${appSettings.i18n.todayTitle}</td>
                        <td>${todayRank}</td>
                        <td>${formatTime(todayMinutes)}</td>
                        <td>${displayPercentage(todayPercentage)}</td>
                        <td class="align-middle">
                            <div class="d-flex flex-row align-items-center border rounded" style="width:${barWidth}px; height:11px; background:white; padding:1px;">
                                <div class="rounded-start bg-danger" style="width:${todayBarWidth}px; height:100%;"></div>
                            </div>
                        </td>
                    </tr>
                    
                
        `;

        if (stats.allDaily.length > 1) {
            rankHTML += `
                    <tr>
                        <td></td>
                        <td>${appSettings.i18n.avgTitle}</td>
                        <td>${allRank}</td>
                        <td>${formatTime(allMinutes)}</td>
                        <td>${displayPercentage(allPercentage)}</td>
                        <td class="align-middle">
                            <div class="d-flex flex-row align-items-center border rounded" style="width:${barWidth}px; height:11px; background:white; padding:1px;">
                                <div class="rounded-start bg-primary" style="width:${allBarWidth}px; height:100%;"></div>
                            </div>
                        </td>
                    </tr>
                    `;
        }

        rankHTML += `</table></div>`;

        i++;
    }
    rankHTML += `
    
    <div class="text-dark rounded p-1 mb-3">
    <table class="w-100 small">
        <tr>
            <td class="text-end align-middle small">${appSettings.i18n.totalTitle} ${stats.rank.todayTitle}:</td>
            <td class="align-middle fw-bold ps-2 text-end">${formatTimeString(stats.todayTotalMinutes)}</td>
        </tr>
        `;

    if (stats.allDaily.length > 1) {
        rankHTML += `
            <tr>
                <td class="text-end align-middle small">${stats.rank.title}:</td>
                <td class="fw-bold align-middle ps-2 text-end">${formatTimeString(stats.allTotalMinutes)}</td>
            </tr>
            `;
    }
    rankHTML += `</table></div>`;



    $('#rankListDiv').html(rankHTML);

}

const printActiveTabs = (domain) => {
    if (stats.activeTabs) {
        let activeTabs = stats.activeTabs;
        let i = 0;
        let tabTitle = activeTabs.length > 1 ? appSettings.i18n.activeTabsTitle + ' (' + activeTabs.length + ')' : appSettings.i18n.activeTabTitle;
        if (activeTabs.length == 0)
            tabTitle = '';
        activeTabsHTML = `<div class="small">${tabTitle}</div>
      <div class="d-flex flex-row align-items-center justify-content-start w-100 gap-1">`;
        let tabIconMaxWidth = '17';
        let tabIconWidth = Math.ceil(230 / activeTabs.length);
        if (tabIconWidth > tabIconMaxWidth)
            tabIconWidth = tabIconMaxWidth;
        while (i < activeTabs.length) {
            activeTabsHTML += `
            <div class="pointer" data-id="activeTab${i}" data-domain="${activeTabs[i].domain}" title="${activeTabs[i].domain}" style="margin-left:1px">
                <img src="${activeTabs[i].favIconUrl}" style="max-width:${tabIconWidth}px;">
            </div>
        `;
            i++;
        }
        activeTabsHTML += '</div>';
    }
    $('#activeTabs').html(activeTabsHTML);
}

$(function () {

    $(document).on("click", "[data-domain]", async function (e) {
        let domain = $(this).data('domain');
        printCenterText(domain);
    });

    $("#domainBarChart").on('mouseover', 'div div[data-summary]', async function (e) {
        $('#barDates').hide();
        let el = e.target;
        let id = $(el).closest('div[data-id]').data('id');
        let summary = $(el).closest('div[data-summary]').data('summary');
        let date = $(el).closest('div[data-date]').data('date');
        $('#barSummary').html(summary);
        $('#barDate').html(date);
        $('.down-arrow').hide();
        $('#' + id).show();
        $('#barIcon').show();
        $('#barDetails').show();
    });

    $("#domainBarChart").on('mouseout', async function (e) {
        $('#barDates').show();
        $('#barDetails').hide();
        $('.down-arrow').hide();
    });

    $(".badgeOption").click(async function () {
        appSettings = await updateSetting('badgeText', $(this).attr('data-val'));
        loadTab();
        await refresh();
    });

    $(document).on('click', '.blockToggle', async function (e) {
        $('#blockWait').show();
        $('#blockOn').hide();
        $('#blockOff').hide();
        let el = e.target;
        let domain = $(this).attr('block-domain');
        await toggleBlock(domain);
        onDomain = domain;
        await refresh();
    });

    $(".reset-toggle").click(async () => {
        $('#resetDiv').toggle();
        $('#resetConfirmationDiv').toggle();
    });

    $("#resetButton").click(async () => {
        $('#resetWait').show();
        $('#resetConfirmationDiv').hide();
        truncateDB().then(() => {
            setTimeout(() => {
                onDomain = null;
                refresh();
                $('#resetWait').hide();
                $('#resetDiv').toggle();
                $('#settingsCloseBtn').trigger('click');
            }, 3000);
        }).catch(error => { console.error(error); });
    });

    $(document).on("click", ".homeClick", async function (e) {
        onDomain = null;
        loadTab();
    });

    $(document).on("click", "#menuSettings, #settingsBtn", async function (e) {
        $('.menuToggleButton').removeClass('bg-primary').addClass('bg-secondary');
        $('#menuSettings').removeClass('bg-secondary').addClass('bg-primary');
        $('.menuContent').hide();
        $('#menuSettingsContent').show();
    });

    $(document).on("click", "#menuList, #todayTotalTime", async function (e) {
        $('.menuToggleButton').removeClass('bg-primary').addClass('bg-secondary');
        $('#menuList').removeClass('bg-secondary').addClass('bg-primary');
        $('.menuContent').hide();
        $('#menuListContent').show();
    });

    $("#languageCodeDD").on('change', async () => {
        let updateBlockMsg = false;
        if (appSettings.blockMsg == appSettings.i18n.defaultBlockMsg) {
            updateBlockMsg = true;
        }
        let lc = $('#languageCodeDD').val();
        let i18nValues = {};
        let lang = (availableLangs.indexOf(lc) >= 0) ? lc : 'en';
        const response = await fetch('../_locales/' + lang + '/messages.json');
        const data = await response.json();
        Object.entries(data).forEach(([key, value]) => {
            i18nValues[key] = value.message
        });
        if (updateBlockMsg) {
            await updateSetting('blockMsg', i18nValues.defaultBlockMsg);
        }
        appSettings = await updateSetting('i18n', i18nValues);
        $('#languageCodeDD').blur();
        await refresh();
    });

    $("#idleMinutesDD").on('change', async () => {
        let im = $('#idleMinutesDD').val();
        appSettings = await updateSetting('idleMinutes', im);
        $('#idleMinutesDD').blur();
        await refresh();
    });

    $("#rankListModeDD").on('change', async () => {
        let im = $('#rankListModeDD').val();
        appSettings = await updateSetting('rankListMode', im);
        $('#rankListModeDD').blur();
        await refresh();
    });

});


