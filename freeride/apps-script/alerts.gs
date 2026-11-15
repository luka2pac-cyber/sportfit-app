/**
 * Sella Nevea Freeride Arena – e-mail alert (Powder + pericolo valanghe)
 * Google Apps Script, progetto standalone (script.google.com).
 *
 * SETUP (una volta):
 *  1. Incolla questo file in un nuovo progetto su script.google.com
 *  2. Esegui la funzione setup()  → crea il foglio "Freeride alerts" e il trigger orario
 *  3. Distribuisci → Nuova distribuzione → App web
 *       Esegui come: Me   ·   Chi ha accesso: Chiunque
 *  4. Copia l'URL dell'app web in CONFIG.alertsEndpoint della pagina
 */

const CFG = {
  pageUrl: 'https://luka2pac-cyber.github.io/sportfit-app/freeride/',
  stationId: 541,          // Livinal Lunc
  snowSensor: 23,          // Nivometro (cm)
  tempSensor: 2,
  windSensor: 6,
  powderCm: 15,            // neve fresca 24 h per inviare il Powder alert
  powderCooldownH: 24,     // non più di un powder alert ogni 24 h
  avaMinLevel: 4,          // 4 = forte, 5 = molto forte
  bulletinUrl: 'https://bollettini.aineva.it/albina_files/latest/IT-36_it_CAAMLv6.json',
  bulletinRegion: 'IT-36-UD-04', // CANIN
  bulletinPage: 'https://www.protezionecivile.fvg.it/it/bollettino-valanghe',
  dailyMailLimit: 95,      // Gmail consumer: 100 destinatari/giorno
  senderName: 'Sella Nevea Freeride Arena'
};

/* ===================== setup ===================== */
function setup() {
  const p = PropertiesService.getScriptProperties();
  if (!p.getProperty('SHEET_ID')) {
    const ss = SpreadsheetApp.create('Freeride alerts – iscritti');
    const sh = ss.getActiveSheet();
    sh.setName('Iscritti');
    sh.appendRow(['email', 'token', 'confermato', 'powder', 'valanghe', 'iscritto_il', 'confermato_il']);
    sh.setFrozenRows(1);
    p.setProperty('SHEET_ID', ss.getId());
  }
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('checkConditions').timeBased().everyHours(1).create();
  Logger.log('OK. Foglio: https://docs.google.com/spreadsheets/d/' + p.getProperty('SHEET_ID'));
}

function sheet_() {
  return SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SHEET_ID')).getSheetByName('Iscritti');
}

/* ===================== web app ===================== */
function doPost(e) {
  const p = e.parameter || {};
  if (p.a === 'subscribe') return json_(subscribe_(p));
  return json_({ ok: false, error: 'Azione non valida' });
}

function doGet(e) {
  const p = e.parameter || {};
  if (p.a === 'confirm') return html_(confirm_(p.t));
  if (p.a === 'unsub') return html_(unsubscribe_(p.t));
  if (p.a === 'bulletin') {           // proxy per il semaforo, se il browser non può leggere AINEVA
    try { return ContentService.createTextOutput(UrlFetchApp.fetch(CFG.bulletinUrl).getContentText())
            .setMimeType(ContentService.MimeType.JSON); }
    catch (err) { return json_({ bulletins: [] }); }
  }
  return html_('Sella Nevea Freeride Arena – alert');
}

function subscribe_(p) {
  const email = String(p.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: 'E-mail non valida' };
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const sh = sheet_(), data = sh.getDataRange().getValues();
    let row = data.findIndex((r, i) => i > 0 && r[0] === email);
    const token = row > 0 ? data[row][1] : Utilities.getUuid();
    const vals = [email, token, row > 0 ? data[row][2] : false, p.powder === '1', p.ava === '1', new Date(), row > 0 ? data[row][6] : ''];
    if (row > 0) sh.getRange(row + 1, 1, 1, vals.length).setValues([vals]); else sh.appendRow(vals);
    if (row > 0 && data[row][2] === true) return { ok: true };   // già confermato: aggiorna solo le preferenze
    if (!quotaOk_(1)) return { ok: false, error: 'Troppe iscrizioni oggi, riprova domani.' };
    const url = ScriptApp.getService().getUrl() + '?a=confirm&t=' + token;
    MailApp.sendEmail({ to: email, name: CFG.senderName,
      subject: 'Conferma iscrizione – Sella Nevea Freeride alert',
      htmlBody: 'Ciao!<br><br>Per ricevere gli alert di Sella Nevea Freeride Arena conferma qui:<br>' +
        '<a href="' + url + '">Confermo l\'iscrizione</a><br><br>Se non sei stato tu, ignora questa e-mail.' });
    countMail_(1);
    return { ok: true };
  } finally { lock.releaseLock(); }
}

function confirm_(token) {
  const sh = sheet_(), data = sh.getDataRange().getValues();
  const row = data.findIndex((r, i) => i > 0 && r[1] === token);
  if (row < 1) return 'Link non valido o già usato.';
  sh.getRange(row + 1, 3).setValue(true);
  sh.getRange(row + 1, 7).setValue(new Date());
  return 'Iscrizione confermata ✅<br>Riceverai gli alert di Sella Nevea Freeride Arena.';
}

function unsubscribe_(token) {
  const sh = sheet_(), data = sh.getDataRange().getValues();
  const row = data.findIndex((r, i) => i > 0 && r[1] === token);
  if (row < 1) return 'Sei già disiscritto.';
  sh.deleteRow(row + 1);
  return 'Disiscrizione completata. La tua e-mail è stata cancellata.';
}

/* ===================== controllo orario ===================== */
function checkConditions() {
  const props = PropertiesService.getScriptProperties();

  // --- Powder alert ---
  try {
    const snow = measures_(CFG.snowSensor, 26);
    const fresh = newSnow_(snow);
    const last = Number(props.getProperty('LAST_POWDER') || 0);
    if (fresh !== null && fresh >= CFG.powderCm && Date.now() - last > CFG.powderCooldownH * 3600e3) {
      const t = lastVal_(measures_(CFG.tempSensor, 2));
      const w = lastVal_(measures_(CFG.windSensor, 2));
      const hs = Math.round(snow[snow.length - 1].v);
      sendAll_('powder',
        '❄️ Powder alert: +' + fresh + ' cm a Sella Nevea',
        '<b>+' + fresh + ' cm di neve fresca nelle ultime 24 h</b> al Livinal Lunc (1837 m).<br>' +
        'Neve al suolo: ' + hs + ' cm' + (t !== null ? ' · Temperatura: ' + t.toFixed(1) + ' °C' : '') +
        (w !== null ? ' · Vento: ' + Math.round(w * 3.6) + ' km/h' : '') + '<br><br>' +
        '⚠️ Prima di uscire leggi il <a href="' + CFG.bulletinPage + '">bollettino valanghe</a>.');
      props.setProperty('LAST_POWDER', String(Date.now()));
    }
  } catch (err) { Logger.log('Powder: ' + err); }

  // --- Pericolo valanghe forte ---
  try {
    const j = JSON.parse(UrlFetchApp.fetch(CFG.bulletinUrl, { muteHttpExceptions: true }).getContentText() || '{}');
    const b = (j.bulletins || []).find(x => (x.regions || []).some(r => r.regionID === CFG.bulletinRegion));
    if (b && new Date(b.validTime.endTime) > new Date()) {
      const map = { low: 1, moderate: 2, considerable: 3, high: 4, very_high: 5 };
      const lvl = Math.max(0, ...(b.dangerRatings || []).map(d => map[d.mainValue] || 0));
      const key = b.validTime.endTime;
      if (lvl >= CFG.avaMinLevel && props.getProperty('LAST_AVA') !== key) {
        const name = lvl === 5 ? '5 – MOLTO FORTE' : '4 – FORTE';
        const day = Utilities.formatDate(new Date(new Date(b.validTime.startTime).getTime() + 12 * 3600e3), 'Europe/Rome', 'dd.MM.yyyy');
        sendAll_('ava',
          '🔴 Pericolo valanghe ' + name + ' – Canin (' + day + ')',
          '<b>Pericolo valanghe ' + name + '</b> nella zona Canin per il ' + day + '.<br>' +
          ((b.avalancheActivity || {}).highlights || '') + '<br><br>' +
          '<a href="' + CFG.bulletinPage + '">Leggi il bollettino completo</a>.');
        props.setProperty('LAST_AVA', key);
      }
    }
  } catch (err) { Logger.log('Valanghe: ' + err); }
}

/* ===================== helper ===================== */
function measures_(sensor, hours) {
  const to = new Date(), from = new Date(to.getTime() - hours * 3600e3);
  const f = d => Utilities.formatDate(d, 'UTC', 'yyyy-MM-dd HH:mm:ss');
  const url = 'https://monitor.protezionecivile.fvg.it/api/stations/' + CFG.stationId + '/sensors/' + sensor +
    '/measures?from=' + encodeURIComponent(f(from)) + '&to=' + encodeURIComponent(f(to));
  const j = JSON.parse(UrlFetchApp.fetch(url).getContentText());
  return (j.measures || []).map(m => ({ t: new Date(m.dt.replace(' ', 'T') + 'Z'), v: m.value }))
    .sort((a, b) => a.t - b.t);
}
function lastVal_(a) { return a.length ? a[a.length - 1].v : null; }
function newSnow_(snow) {   // stessa formula della pagina
  if (snow.length < 8) return null;
  const lastT = snow[snow.length - 1].t.getTime();
  const recent = snow.filter(x => x.t.getTime() > lastT - 3600e3).map(x => x.v).sort((a, b) => a - b);
  const now = recent[Math.floor(recent.length / 2)];
  const base = Math.min(...snow.filter(x => x.t.getTime() >= lastT - 24 * 3600e3).map(x => x.v));
  return Math.max(0, Math.round(now - base));
}

function sendAll_(type, subject, body) {
  const sh = sheet_(), data = sh.getDataRange().getValues().slice(1);
  const col = type === 'powder' ? 3 : 4;
  const list = data.filter(r => r[2] === true && r[col] === true);
  const base = ScriptApp.getService().getUrl();
  let sent = 0;
  for (const r of list) {
    if (!quotaOk_(1)) { Logger.log('Limite giornaliero raggiunto: ' + (list.length - sent) + ' non inviati'); break; }
    MailApp.sendEmail({ to: r[0], name: CFG.senderName, subject: subject,
      htmlBody: body + '<br><br><a href="' + CFG.pageUrl + '">Condizioni live</a>' +
        '<hr style="border:0;border-top:1px solid #ddd"><small>Ricevi questa e-mail perché sei iscritto agli alert di Sella Nevea Freeride Arena. ' +
        '<a href="' + base + '?a=unsub&t=' + r[1] + '">Disiscriviti</a>. Dati: Protezione Civile FVG / AINEVA, non validati – non sostituiscono la valutazione sul posto.</small>' });
    countMail_(1); sent++;
  }
  Logger.log(type + ': inviati ' + sent);
}

function quotaOk_(n) {
  const p = PropertiesService.getScriptProperties();
  const today = Utilities.formatDate(new Date(), 'Europe/Rome', 'yyyy-MM-dd');
  if (p.getProperty('MAIL_DAY') !== today) { p.setProperty('MAIL_DAY', today); p.setProperty('MAIL_COUNT', '0'); }
  return Number(p.getProperty('MAIL_COUNT')) + n <= CFG.dailyMailLimit && MailApp.getRemainingDailyQuota() >= n;
}
function countMail_(n) {
  const p = PropertiesService.getScriptProperties();
  p.setProperty('MAIL_COUNT', String(Number(p.getProperty('MAIL_COUNT') || 0) + n));
}
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function html_(msg) {
  return HtmlService.createHtmlOutput('<div style="font-family:sans-serif;max-width:480px;margin:40px auto;font-size:18px">' +
    msg + '<br><br><a href="' + CFG.pageUrl + '" target="_top">Torna alla pagina</a></div>').setTitle('Sella Nevea Freeride');
}
