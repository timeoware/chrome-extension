let blockedOn = new Date();
let blockedDomain = '';
let url = '';

$(async function () {

    if (!db) { await initDB() }

    appSettings = await getStorage('appSettings');

    $("#unBlockBtn").click(async function () {
        await toggleBlock(blockedDomain);
        refresh();
    });

    $("#tempUnBlockBtn").click(async function () {
        await tempUnBlock(blockedDomain, appSettings.tempUnBlockMinutes);
        refresh();
    });

    $("#blockMsg").on('keyup', async function () {
        appSettings = await updateSetting('blockMsg', $('#blockMsg').val());
        $('#msg').html(appSettings.blockMsg.replace(/\n/g, "<br/>"));
    });

    $('#blockMsg').val(appSettings.blockMsg);

    refreshBlockPage();

})

const refreshBlockPage = async () => {
    appSettings = await getStorage('appSettings');
    Object.entries(appSettings.i18n).forEach(function ([key, value]) {
        $('#' + key).text(value);
        $('.' + key).text(value);
    });
    $('#tempUnBlockBtn').text(appSettings.i18n.tempUnBlockTitle + ' ' + appSettings.tempUnBlockMinutes + ' ' + appSettings.i18n.minutesTitle.toLowerCase());
    let { domain } = { ...extractFromBlockedURL() };
    blockedDomain = domain;
    if (blockedDomain.length > 0) {
        let domainData = await getSetDomain(blockedDomain);
        blockedOn = domainData.blockedOn;
        $('.extension-icon').attr('src', domainData.icon);
        $('.fav-icon').attr('src', domainData.favIconUrl);
        $('#domain').html(blockedDomain);
        $('#msg').html(appSettings.blockMsg.replace(/\n/g, "<br/>"));
        $('#blockedOnDate').html(domainData.blockedOn.toLocaleDateString(appSettings.i18n.languageCode.substring(0,2)));
        $('#blockedOnTime').html(domainData.blockedOn.toLocaleTimeString(appSettings.i18n.languageCode.substring(0,2)));
        $('#since').html(blockedSince((new Date() - blockedOn) / 1000));
    }
}

setInterval(() => {
    refreshBlockPage()
}, 1000)