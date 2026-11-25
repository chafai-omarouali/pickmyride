// PickMyRide — kleine, progressieve verbeteringen. Alles werkt ook zonder JavaScript (server valideert altijd).
(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const TZ = 'Europe/Amsterdam';
  const fmt = new Intl.DateTimeFormat('nl-NL', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

  // Interpreteer lokale Amsterdamse datum+tijd als moment (zelfde methode als de server).
  function amsToDate(d, t) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !/^\d{2}:\d{2}$/.test(t)) return null;
    const [y, m, day] = d.split('-').map(Number), [h, mi] = t.split(':').map(Number);
    const naive = Date.UTC(y, m - 1, day, h, mi);
    const off = (ms) => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(ms)).map(x => [x.type, x.value])); return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - Math.floor(ms / 60000) * 60000; };
    let utc = naive - off(naive); utc = naive - off(utc);
    return new Date(utc);
  }

  // ───── Snelformulier: terugreis tonen bij "Retour" ─────
  $$('.quick-form').forEach(qf => {
    const sync = () => { const r = qf.querySelector('input[name=trip_type][value=retour]'); const on = !!(r && r.checked); qf.classList.toggle('is-retour', on); qf.querySelectorAll('.qf-return input, .qf-return select').forEach(x => { x.disabled = !on; x.required = on; }); };
    qf.addEventListener('change', (ev) => { if (ev.target.name === 'trip_type') { sync(); if (qf.classList.contains('is-retour')) { const d = qf.querySelector('#qf-rdate'); if (d && !d.value) (document.getElementById('qf-rdate-kiezer') || d).focus(); } } });
    sync();
    // Volledig adres vragen (straat + huisnummer, postcode, plaats), zodat het volgende scherm niets opnieuw hoeft te vragen
    const AIRPORT = /(airport|luchthaven|schiphol|eelde|flughafen|a[eé]roport)/i;
    const FULL = /^(.*\d.*?)[,\s]+([1-9]\d{3}\s?[A-Za-z]{2})[,\s]+(\S.*)$/;
    const check = (inp) => {
      const v = inp.value.trim(); let msg = '';
      if (v && !AIRPORT.test(v)) {
        if (!/[1-9]\d{3}\s?[A-Za-z]{2}/.test(v)) msg = 'Vul ook de postcode en plaats in, bijvoorbeeld: Damrak 1, 1012 LG Amsterdam';
        else if (!FULL.test(v)) msg = 'Vul straat, huisnummer, postcode en plaats in, bijvoorbeeld: Damrak 1, 1012 LG Amsterdam';
      }
      inp.setCustomValidity(msg); return !msg;
    };
    const addr = ['pickup_street', 'dropoff_street', 'stop_street'].map(n => qf.querySelector('[name=' + n + ']')).filter(Boolean);
    addr.forEach(inp => inp.addEventListener('input', () => check(inp)));
    qf.addEventListener('submit', (ev) => { for (const inp of addr) { if (!inp.disabled && !check(inp)) { ev.preventDefault(); inp.reportValidity(); return; } } });
    const stop = qf.querySelector('.qf-stop');
    if (stop) stop.addEventListener('toggle', () => {
      const inp = stop.querySelector('input'), lbl = stop.querySelector('summary span');
      if (stop.open) { lbl.textContent = 'Tussenstop verwijderen'; inp.focus(); } else { lbl.textContent = 'Tussenstop toevoegen'; inp.value = ''; }
    });
  });

  // ───── Ritaanvraag in stappen ─────
  const form = $('#request-form');
  if (form) {
    const cfg = JSON.parse(form.dataset.config);
    const steps = $$('.step', form);
    const stepper = $$('#stepper li');
    let current = cfg.startStep || 2;
    const val = (n) => { const hh = form.elements[n + '__h']; if (hh) { const mm = form.elements[n + '__m']; return hh.value && mm.value ? hh.value + ':' + mm.value : ''; } const el = form.elements[n]; if (!el) return ''; if (el instanceof RadioNodeList) return el.value; if (el.type === 'checkbox') return el.checked ? 'ja' : ''; return el.value.trim(); };
    function show(n) {
      current = n;
      steps.forEach(s => { s.hidden = Number(s.dataset.step) !== n; });
      stepper.forEach((li, i) => { li.className = i + 1 < n ? 'done' : i + 1 === n ? 'current' : ''; });
      if (n === 4) buildSummary();
    }
    function setErr(name, msg) {
      if (name === 'vehicle_category') {
        const card = $('[data-vehicles]', form); if (!card) return;
        let p = card.querySelector('.error-text'); if (!msg) { if (p) p.remove(); card.classList.remove('has-error'); return; }
        if (!p) { p = document.createElement('p'); p.className = 'error-text'; card.appendChild(p); }
        p.textContent = msg; card.classList.add('has-error'); return;
      }
      const el = form.elements[name]; if (!el || el instanceof RadioNodeList) return;
      const field = el.closest('.field, .seat-row'); if (!field) return;
      let p = field.querySelector('.error-text.js-err');
      field.querySelectorAll('.error-text:not(.js-err)').forEach(x => x.remove());
      if (!msg) { field.classList.remove('has-error'); el.removeAttribute('aria-invalid'); if (p) p.remove(); return; }
      field.classList.add('has-error'); el.setAttribute('aria-invalid', 'true');
      if (!p) { p = document.createElement('p'); p.className = 'error-text js-err'; p.id = el.id + '-jserr'; field.appendChild(p); el.setAttribute('aria-describedby', p.id); }
      p.textContent = msg;
    }
    const PC = { NL: [/^[1-9]\d{3}\s?[A-Za-z]{2}$/, '1012 AB'], BE: [/^(B-?)?[1-9]\d{3}$/i, '2000'], DE: [/^(D-?)?\d{5}$/i, '40474'], FR: [/^(F-?)?\d{5}$/i, '75001'], LU: [/^(L-?)?\d{4}$/i, 'L-1009'] };
    const country = (p) => (form.elements[p + '_country'] && form.elements[p + '_country'].value) || 'NL';
    const syncCountry = (p) => { const c = country(p); const el = form.elements[p + '_postcode']; if (el) { el.placeholder = PC[c][1]; el.maxLength = c === 'NL' ? 7 : 8; } };
    ['pickup', 'dropoff'].forEach(syncCountry);
    function validate(step) {
      const errs = {};
      if (step === 2) {
        for (const [p, l] of [['pickup', 'het vertrekadres'], ['dropoff', 'de bestemming']]) {
          const c = country(p);
          if (!val(p + '_street')) errs[p + '_street'] = (c === 'NL' ? 'Vul straat en huisnummer in voor ' : 'Vul het adres in voor ') + l + '.';
          else if (c === 'NL' && !/\d/.test(val(p + '_street'))) errs[p + '_street'] = 'Vul ook een huisnummer in.';
          if (!PC[c][0].test(val(p + '_postcode').replace(/\s+/g, c === 'NL' ? ' ' : ''))) errs[p + '_postcode'] = 'Vul een geldige postcode in (bijv. ' + PC[c][1] + ').';
          if (!val(p + '_city')) errs[p + '_city'] = 'Vul de plaats in voor ' + l + '.';
        }
        if (country('pickup') !== 'NL' && country('dropoff') !== 'NL') errs.dropoff_street = 'Vertrek of bestemming moet in Nederland liggen.';
        if (!errs.dropoff_street && val('pickup_street').toLowerCase().replace(/\s/g, '') === val('dropoff_street').toLowerCase().replace(/\s/g, '') && val('pickup_postcode').replace(/\s/g, '').toUpperCase() === val('dropoff_postcode').replace(/\s/g, '').toUpperCase())
          errs.dropoff_street = 'Vertrekadres en bestemming mogen niet gelijk zijn.';
        const out = amsToDate(val('date'), val('time'));
        if (!out) errs.date = 'Vul een geldige datum en tijd in.';
        else if (out.getTime() < Date.now() + cfg.minLead * 3600e3) errs.date = 'Een rit moet minimaal ' + cfg.minLead + ' uur van tevoren worden aangevraagd.';
        if (val('trip_type') === 'retour') {
          const back = amsToDate(val('return_date'), val('return_time'));
          if (!back) errs.return_date = 'Vul een geldige datum en tijd voor de terugrit in.';
          else if (out && back <= out) errs.return_date = 'De terugrit moet na de heenrit plaatsvinden.';
        }
        if (!errs.date && !val('time')) errs.date = 'Kies een ophaaltijd.';
        ['pickup_street', 'pickup_postcode', 'pickup_city', 'dropoff_street', 'dropoff_postcode', 'dropoff_city', 'date', 'return_date'].forEach(n => setErr(n, errs[n]));
      }
      if (step === 2) {
        const pax = +val('passengers'), seats = val('need_seats') ? (+val('seat_maxicosi') + +val('seat_kinderstoel') + +val('seat_verhoger')) : 0;
        if (val('need_seats') && seats === 0) errs.seat_maxicosi = 'Kies minimaal één kinderzitje, of zet "Ik heb kinderzitjes nodig" uit.';
        else if (seats > pax) errs.seat_maxicosi = 'Er kunnen niet meer kinderzitjes zijn dan personen.';
        setErr('seat_maxicosi', errs.seat_maxicosi);
      }
      if (step === 2) {
        const c = cfg.categories[val('vehicle_category')];
        const pax = +val('passengers'), bags = +val('large_bags'), small = +val('small_bags');
        if (!c) errs.vehicle_category = 'Kies een voertuig.';
        else if (pax > c.pax) errs.vehicle_category = 'Een ' + c.name.toLowerCase() + ' biedt plaats aan maximaal ' + c.pax + ' personen; je reist met ' + pax + '. Kies een groter voertuig.';
        else if (bags > c.bags) errs.vehicle_category = 'In een ' + c.name.toLowerCase() + ' passen maximaal ' + c.bags + ' grote koffers; je hebt er ' + bags + '. Kies een groter voertuig.';
        else if (c.small != null && small > c.small) errs.vehicle_category = 'In een ' + c.name.toLowerCase() + ' passen maximaal ' + c.small + ' kleine koffers; je hebt er ' + small + '. Kies een groter voertuig.';
        setErr('vehicle_category', errs.vehicle_category);
      }
      if (step === 3) {
        if (val('name').length < 2) errs.name = 'Vul je naam in.';
        if (!/^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(val('email'))) errs.email = 'Vul een geldig e-mailadres in.';
        if (!/^(\+|00)?[0-9][0-9\s\-()]{7,18}$/.test(val('phone'))) errs.phone = 'Vul een geldig telefoonnummer in.';
        ['name', 'email', 'phone'].forEach(n => setErr(n, errs[n]));
      }
      const first = Object.keys(errs)[0];
      if (first) { const el = form.elements[first]; if (el && el.focus) el.focus(); }
      return !first;
    }
    function buildSummary() {
      const iconBase = ($('link[rel=stylesheet]') || {}).href ? $('link[rel=stylesheet]').href.replace(/styles\.css.*$/, 'img/icons/') : '/static/img/icons/';
      const el = (tag, cls, txt) => { const x = document.createElement(tag); if (cls) x.className = cls; if (txt != null) x.textContent = txt; return x; };
      const ico = (n, w) => { const i = el('img', 'ps-ico'); i.src = iconBase + n + '.svg'; i.alt = ''; i.width = w || 20; i.height = w || 20; return i; };
      const NAMES = { BE: 'België', DE: 'Duitsland', FR: 'Frankrijk', LU: 'Luxemburg' };
      const pcFmt = (p, pc) => { pc = pc.toUpperCase().replace(/\s+/g, ''); return country(p) === 'NL' && /^\d{4}[A-Z]{2}$/.test(pc) ? pc.slice(0, 4) + ' ' + pc.slice(4) : pc; };
      const airportOf = (p) => { const pc = val(p + '_postcode').replace(/\s+/g, '').toUpperCase(); return cfg.airports.find(a => a.postcode.replace(/\s+/g, '').toUpperCase() === pc && a.street.toLowerCase() === val(p + '_street').toLowerCase()); };
      const addr = (p) => { const ap = p !== 'stop' && airportOf(p); if (ap) return ap.name; return [val(p + '_street'), [pcFmt(p, val(p + '_postcode')), val(p + '_city')].filter(Boolean).join(' '), p !== 'stop' && country(p) !== 'NL' ? NAMES[country(p)] : ''].filter(Boolean).join(', '); };
      const card = (title, editStep) => {
        const c = el('section', 'sum-card'); const h = el('div', 'prefill-head'); h.appendChild(el('h3', 'prefill-title', title));
        const b = el('button', 'prefill-edit', 'Wijzigen'); b.type = 'button'; b.addEventListener('click', () => { show(editStep); form.scrollIntoView({ block: 'start' }); });
        h.appendChild(b); c.appendChild(h); return c;
      };
      const chips = () => el('ul', 'ps-chips');
      const chip = (list, icon, txt, w) => { const li = el('li'); li.append(ico(icon, w || 16), el('span', null, txt)); list.appendChild(li); };
      const box = $('#summary'); box.innerHTML = '';

      // 1. Rit
      const rit = card('Je rit', 2);
      const route = el('ol', 'ps-route');
      const stopRow = (icon, label, value) => { const li = el('li'); li.append(ico(icon)); const t = el('div'); t.append(el('span', 'ps-label', label), el('span', 'ps-value', value)); li.appendChild(t); route.appendChild(li); };
      stopRow('vertrekpunt', 'Vertrek', addr('pickup'));
      if (val('stop_street')) stopRow('tussenstop', 'Tussenstop', addr('stop'));
      stopRow('bestemming', 'Bestemming', addr('dropoff'));
      rit.appendChild(route);
      const rc = chips(); const retour = val('trip_type') === 'retour';
      const out = amsToDate(val('date'), val('time'));
      chip(rc, 'datum', (retour ? 'Heen: ' : '') + (out ? fmt.format(out) : '—'));
      if (retour) { const back = amsToDate(val('return_date'), val('return_time')); chip(rc, 'terug', 'Terug: ' + (back ? fmt.format(back) : '—')); }
      chip(rc, retour ? 'retour' : 'rijrichting', retour ? 'Retour (twee aparte ritten)' : 'Enkele reis');
      if (val('flight_number')) chip(rc, 'vliegtuig', 'Vlucht ' + val('flight_number').toUpperCase() + (retour && val('return_flight_number') ? ' · terug ' + val('return_flight_number').toUpperCase() : ''));
      rit.appendChild(rc); box.appendChild(rit);

      // 2. Bagage en voertuig
      const bag = card('Reizigers, bagage en voertuig', 2);
      const c = cfg.categories[val('vehicle_category')];
      const bc = chips();
      const pax = +val('passengers') || 0, lb = +val('large_bags') || 0, sb = +val('small_bags') || 0;
      chip(bc, 'personen', pax + (pax === 1 ? ' persoon' : ' personen'));
      chip(bc, 'koffer-groot', lb + (lb === 1 ? ' grote koffer' : ' grote koffers'));
      chip(bc, 'koffer-klein', sb + (sb === 1 ? ' kleine koffer' : ' kleine koffers'));
      if (c) { const icon = val('vehicle_category') === 'taxibus' ? 'bus' : val('vehicle_category') === 'stationwagen' ? 'station' : 'sedan'; const li = el('li', 'chip-car'); const i = ico('auto-' + icon, 28); i.width = 32; i.height = 16; li.append(i, el('span', null, c.name)); bc.appendChild(li); }
      if (val('need_seats')) { const s = [['seat_maxicosi', 'Maxi-Cosi'], ['seat_kinderstoel', 'kinderstoel'], ['seat_verhoger', 'verhoger']].filter(([k]) => +val(k) > 0).map(([k, n]) => val(k) + '× ' + n).join(', '); if (s) chip(bc, 'kinderzitje', s); }
      bag.appendChild(bc);
      if (val('notes')) { const n = el('p', 'sum-note'); n.append(ico('notitie', 16), el('span', null, val('notes'))); bag.appendChild(n); }
      box.appendChild(bag);

      // 3. Contact
      const con = card('Contactgegevens', 3);
      const cl = el('ul', 'sum-contact');
      [['naam', val('name')], ['mail', val('email')], ['telefoon', val('phone')]].forEach(([i, t]) => { const li = el('li'); li.append(ico(i, 18), el('span', null, t)); cl.appendChild(li); });
      con.appendChild(cl); box.appendChild(con);

      if (out) {
        const deadline = new Date(Math.min(Date.now() + cfg.window * 3600e3, out.getTime() - cfg.cutoff * 3600e3));
        $('#bid-deadline').textContent = fmt.format(deadline) + ' (voor de heenrit; na bevestiging van je e-mailadres)';
      }
    }
    form.addEventListener('click', (ev) => {
      const step = ev.target.closest('[data-step-inc],[data-step-dec]');
      if (step) { const sel = document.getElementById(step.dataset.stepInc || step.dataset.stepDec); const d = step.dataset.stepInc ? 1 : -1; const i = Math.min(sel.options.length - 1, Math.max(0, sel.selectedIndex + d)); if (i !== sel.selectedIndex) { sel.selectedIndex = i; sel.dispatchEvent(new Event('change', { bubbles: true })); } return; }
      const back = ev.target.closest('[data-back]');
      if (back) { if (document.referrer && new URL(document.referrer).origin === location.origin && history.length > 1) { ev.preventDefault(); history.back(); } return; }
      const t = ev.target.closest('[data-next],[data-prev]'); if (!t) return;
      if (t.hasAttribute('data-next')) { if (validate(current)) { show(current + 1); form.scrollIntoView({ block: 'start' }); } }
      else if (t.hasAttribute('data-prev')) { show(current - 1); form.scrollIntoView({ block: 'start' }); }

    });
    form.addEventListener('change', (ev) => {
      const cs = ev.target.closest('[data-country-for]'); if (cs) { syncCountry(cs.dataset.countryFor); return; }
      const sel = ev.target.closest('[data-fill-airport]'); if (!sel || !sel.value) return;
      const a = cfg.airports.find(x => x.code === sel.value); const p = sel.dataset.fillAirport;
      if (a) { form.elements[p + '_street'].value = a.street; form.elements[p + '_postcode'].value = a.postcode; form.elements[p + '_city'].value = a.city; if (form.elements[p + '_country']) { form.elements[p + '_country'].value = a.country || 'NL'; syncCountry(p); } }
      sel.value = '';
    });
    // ───── Overnemen uit het snelformulier (homepage, stadspagina's): niets twee keer vragen ─────
    const qs = new URLSearchParams(location.search);
    const setIfEmpty = (n, v) => { const el = form.elements[n]; if (!el || v == null || v === '') return; if (el instanceof RadioNodeList) { if (!qs.has('_seen')) el.value = v; return; } if (!el.value) el.value = v; };
    if (qs.has('pickup_street') || qs.has('dropoff_street')) {
      const label = {};
      for (const p of ['pickup', 'dropoff', 'stop']) {
        let raw = qs.get(p + '_street') || '';
        if (!raw) continue;
        const lc = raw.toLowerCase();
        const ap = cfg.airports.find(a => lc && (a.name.toLowerCase() === lc || lc.includes(a.name.toLowerCase()) || (a.code === 'AMS' && lc.includes('schiphol'))));
        if (ap && !qs.get(p + '_postcode')) { label[p] = ap.name; setIfEmpty(p + '_street', ap.street); setIfEmpty(p + '_postcode', ap.postcode); setIfEmpty(p + '_city', ap.city); if (form.elements[p + '_country']) form.elements[p + '_country'].value = ap.country || 'NL'; syncCountry(p); continue; }
        const m = /^(.*?)[,\s]+([1-9]\d{3}\s?[A-Za-z]{2})[,\s]*(.*)$/.exec(raw);
        if (m && !qs.get(p + '_postcode')) { raw = m[1].trim(); setIfEmpty(p + '_postcode', m[2].toUpperCase()); setIfEmpty(p + '_city', m[3].trim()); }
        setIfEmpty(p + '_street', raw);
      }
      ['date', 'passengers', 'trip_type', 'pickup_postcode', 'pickup_city', 'dropoff_postcode', 'dropoff_city'].forEach(n => setIfEmpty(n, qs.get(n)));
      for (const n of ['time', 'return_time']) {
        const t = /^(\d{2}):(\d{2})$/.exec(qs.get(n) || '');
        if (t && form.elements[n + '__h'] && !form.elements[n + '__h'].value) { form.elements[n + '__h'].value = t[1]; form.elements[n + '__m'].value = t[2]; }
      }
      setIfEmpty('return_date', qs.get('return_date'));
      $('#return-fields').hidden = val('trip_type') !== 'retour';
      // Wat al bekend is, tonen we als samenvatting in plaats van opnieuw als invulveld
      const known = [['trip_type', null], ['pickup_street', 'pickup'], ['dropoff_street', 'dropoff'], ['date', null], ['time__h', null], ['passengers', null], ['return_date', null], ['return_time__h', null]];
      const hide = [];
      for (const [n, p] of known) {
        const el = form.elements[n]; if (!el) continue;
        if (n === 'trip_type' ? !qs.has('trip_type') : !val(n.endsWith('__h') ? n.slice(0, -3) : n)) continue;
        const node = n === 'trip_type' ? $('.segmented', form).closest('.field') : (el.closest ? el.closest('.field') : null);
        if (node) hide.push(node);
        if (p) {
          const block = $('[data-address="' + p + '"]', form);
          // Volledig bekend adres (bijv. een luchthaven): het hele adresblok hoeft niet meer
          if (block && val(p + '_postcode') && val(p + '_city')) hide.push(block);
          else { const pick = $('[data-fill-airport="' + p + '"]', form); if (pick) hide.push(pick); }
        }
      }
      // Land is bij een adres uit het snelformulier al bekend (Nederland, of het land van de luchthaven)
      ['pickup', 'dropoff'].forEach(p => { const c = form.elements[p + '_country']; const f = c && c.closest('.field'); if (f && val(p + '_street')) hide.push(f); });
      // Tussenstop opgegeven: tonen, en alleen open laten als er nog iets ontbreekt
      { const det0 = $('[data-address="stop"]', form).closest('details'); if (det0 && !val('stop_street')) hide.push(det0); }
      if (val('stop_street')) { const det = $('[data-address="stop"]', form).closest('details'); if (val('stop_postcode') && val('stop_city')) { if (det) hide.push(det); } else if (det) { det.open = true; const sf = form.elements.stop_street.closest('.field'); if (sf) hide.push(sf); } }
      const step1 = $('.step[data-step="2"]', form);
      if (hide.length && step1) {
        hide.forEach(x => { x.hidden = true; x.dataset.prefilled = '1'; });
        const NAMES = { BE: 'België', DE: 'Duitsland', FR: 'Frankrijk', LU: 'Luxemburg' };
        // Nette weergave: route als tijdlijn, daaronder datum, personen en soort reis als labels
        const iconBase = ($('link[rel=stylesheet]') || {}).href ? $('link[rel=stylesheet]').href.replace(/styles\.css.*$/, 'img/icons/') : '/static/img/icons/';
        const el = (tag, cls, txt) => { const x = document.createElement(tag); if (cls) x.className = cls; if (txt != null) x.textContent = txt; return x; };
        const ico = (n) => { const i = el('img', 'ps-ico'); i.src = iconBase + n + '.svg'; i.alt = ''; i.width = 20; i.height = 20; return i; };
        const nice = (t) => t.replace(/(^|[\s-])(\p{Ll})/gu, (m, a, c) => a + c.toUpperCase());
        ['pickup', 'dropoff', 'stop'].forEach(p => { const c = form.elements[p + '_city']; if (c && c.value) c.value = nice(c.value); });
        const where = (p) => label[p] || [val(p + '_street'), val(p + '_city')].filter(Boolean).join(', ');
        const box = el('div', 'prefill-summary');
        const head = el('div', 'prefill-head');
        const btn = el('button', 'prefill-edit', 'Wijzigen'); btn.type = 'button';
        head.append(el('p', 'prefill-title', 'Je rit'), btn); box.appendChild(head);
        const route = el('ol', 'ps-route');
        const stopRow = (icon, label, value) => { const li = el('li'); li.append(ico(icon)); const t = el('div'); t.append(el('span', 'ps-label', label), el('span', 'ps-value', value)); li.appendChild(t); route.appendChild(li); };
        stopRow('vertrekpunt', 'Vertrek', where('pickup'));
        if (val('stop_street')) stopRow('tussenstop', 'Tussenstop', where('stop'));
        stopRow('bestemming', 'Bestemming', where('dropoff'));
        box.appendChild(route);
        const chips = el('ul', 'ps-chips');
        const chip = (icon, txt) => { const li = el('li'); li.append(ico(icon), el('span', null, txt)); chips.appendChild(li); };
        const out = amsToDate(val('date'), val('time'));
        const retour = val('trip_type') === 'retour';
        chip('datum', (retour ? 'Heen: ' : '') + (out ? fmt.format(out) : val('date')));
        if (retour) { const back = amsToDate(val('return_date'), val('return_time')); if (back) chip('terug', 'Terug: ' + fmt.format(back)); }
        const pax = +val('passengers') || 0; chip('personen', pax + (pax === 1 ? ' persoon' : ' personen'));
        chip(retour ? 'retour' : 'rijrichting', retour ? 'Retour' : 'Enkele reis');
        box.appendChild(chips);
        box.appendChild(el('p', 'prefill-note', 'Klopt dit? Vul hieronder je bagage en eventueel je vluchtnummer in.'));
        const legend = $('legend', step1); legend.after(box);
        btn.addEventListener('click', () => { if (document.referrer && new URL(document.referrer).origin === location.origin && history.length > 1) { history.back(); return; } $$('[data-prefilled]', form).forEach(x => { x.hidden = false; }); box.remove(); syncFlight(); });
        // Bij een fout in een verborgen veld: veld weer tonen
        const origSetErr = setErr;
        setErr = function (name, msg) { origSetErr(name, msg); if (msg) { const el = form.elements[name]; const f = el && el.closest && el.closest('[data-prefilled]'); if (f) f.hidden = false; } };
        const first = $$('input:not([type=hidden]), select', step1).find(x => x.offsetParent !== null && !x.value && !x.closest('[hidden]') && !x.closest('details:not([open])'));
        if (first && window.innerWidth > 979) first.focus({ preventScroll: true });
      }
    }
    // Vluchtnummer alleen tonen als vertrek of bestemming een luchthaven is
    const norm = (x) => String(x || '').replace(/\s+/g, '').toUpperCase();
    const isAirport = (p) => {
      const st = val(p + '_street').toLowerCase(), pc = norm(val(p + '_postcode'));
      return /schiphol|airport|luchthaven|flughafen|a[eé]roport/.test(st + ' ' + val(p + '_city').toLowerCase())
        || cfg.airports.some(a => norm(a.postcode) === pc && pc && a.street.toLowerCase() === st);
    };
    const flightFields = ['flight_number', 'return_flight_number'].map(n => form.elements[n] && form.elements[n].closest('.field')).filter(Boolean);
    const syncFlight = () => {
      const show = isAirport('pickup') || isAirport('dropoff');
      flightFields.forEach(f => { f.hidden = !show; if (!show) { const i = f.querySelector('input'); if (i) i.value = ''; } });
      const rf = $('#return-fields'); if (rf) rf.classList.toggle('rf-empty', !$$('.field', rf).some(f => !f.hidden && !f.closest('[hidden]')));
    };
    form.addEventListener('input', (ev) => { if (/_(street|postcode|city)$/.test(ev.target.name || '')) syncFlight(); });
    form.addEventListener('change', (ev) => { if (ev.target.matches('[data-fill-airport], [name$=_country]')) setTimeout(syncFlight, 0); });
    syncFlight();
    // Voertuig: wat niet past grijs maken en zo nodig automatisch het kleinste passende voertuig kiezen
    const syncVehicle = () => {
      const pax = +val('passengers') || 1, large = +val('large_bags') || 0, small = +val('small_bags') || 0;
      const tiles = $$('.veh-tile', form); let firstFit = null;
      tiles.forEach(t => { const fit = pax <= +t.dataset.pax && large <= +t.dataset.large && (t.dataset.small === '' || small <= +t.dataset.small); t.classList.toggle('no-fit', !fit); if (fit && !firstFit) firstFit = t; });
      const cur = tiles.find(t => t.querySelector('input').checked);
      if (cur && cur.classList.contains('no-fit') && firstFit) { firstFit.querySelector('input').checked = true; setErr('vehicle_category', ''); }
    };
    form.addEventListener('change', (ev) => { if (['passengers', 'large_bags', 'small_bags'].includes(ev.target.name)) syncVehicle(); if (ev.target.name === 'vehicle_category') setErr('vehicle_category', ''); });
    syncVehicle();
    form.addEventListener('submit', (ev) => { for (const st of [2, 3]) if (!validate(st)) { ev.preventDefault(); show(st); return; } });
    $$('input[name=trip_type]', form).forEach(r => r.addEventListener('change', () => { $('#return-fields').hidden = val('trip_type') !== 'retour'; }));
    show(current);
  }

  // ───── Bod: live berekening klantprijs / commissie / uitbetaling (server rekent altijd opnieuw) ─────
  const bidForm = $('#bid-form');
  if (bidForm) {
    const rule = JSON.parse(bidForm.dataset.rule);
    const eur = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' });
    const parse = (s) => { s = String(s).replace(/[€\s]/g, ''); if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.'); else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ''); const n = Number(s); return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null; };
    const upd = () => {
      const c = parse(bidForm.elements.price.value);
      const out = $('#calc');
      if (c === null) { out.querySelectorAll('dd').forEach(d => d.textContent = '—'); return; }
      const com = Math.min(c, Math.max(rule.min_cents, Math.round(c * rule.percent_bp / 10000) + rule.fixed_cents));
      $('#calc-price').textContent = eur.format(c / 100); $('#calc-com').textContent = '− ' + eur.format(com / 100); $('#calc-pay').textContent = eur.format((c - com) / 100);
    };
    bidForm.elements.price.addEventListener('input', upd); upd();
  }

  // ───── Aanbiedingen: sorteren en alles tonen ─────
  $$('[data-offers]').forEach(box => {
    const list = $('.offers', box); const limit = Number(box.dataset.limit);
    const items = () => $$('.offer-item', list);
    const apply = () => { const showAll = box.dataset.all === '1'; items().forEach((el, i) => { el.hidden = !showAll && i >= limit; }); const b = $('[data-show-all]', box); if (b) b.hidden = showAll || items().length <= limit; };
    const sel = $('select[data-sort]', box);
    if (sel) sel.addEventListener('change', () => {
      const key = sel.value; const arr = items();
      arr.sort((a, b) => key === 'beoordeling' ? (Number(b.dataset.rating || -1) - Number(a.dataset.rating || -1)) || (a.dataset.price - b.dataset.price) : a.dataset.price - b.dataset.price);
      arr.forEach(el => list.appendChild(el)); apply();
    });
    const btn = $('[data-show-all]', box); if (btn) btn.addEventListener('click', (ev) => { ev.preventDefault(); box.dataset.all = '1'; apply(); });
    apply();
  });


  // ───── Gesprek: automatisch verversen (elke 10 s) en naar het nieuwste bericht scrollen ─────
  $$('[data-conversation]').forEach(box => {
    const list = $('.chat', box); if (!list) return;
    const scroll = () => { list.scrollTop = list.scrollHeight; };
    scroll();
    let last = box.dataset.last || '';
    const viewer = box.dataset.viewer, other = box.dataset.other;
    const t = new Intl.DateTimeFormat('nl-NL', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
    const seen = new Set();
    const poll = async () => {
      if (document.hidden) return;
      try {
        const res = await fetch('/api/boekingen/' + box.dataset.conversation + '/berichten?na=' + encodeURIComponent(last || '1970-01-01T00:00:00Z'), { headers: { Accept: 'application/json' }, credentials: 'same-origin' });
        if (!res.ok) return;
        const rows = await res.json();
        rows.forEach(m => {
          if (seen.has(m.id) || list.querySelector('[data-id="' + m.id + '"]')) return; seen.add(m.id);
          const empty = $('.chat-empty', list); if (empty) empty.remove();
          const li = document.createElement('li'); li.dataset.id = m.id;
          li.className = 'msg ' + (m.role === 'system' ? 'msg-system' : m.role === viewer ? 'msg-mine' : 'msg-theirs');
          const meta = document.createElement('span'); meta.className = 'msg-meta';
          meta.textContent = (m.role === viewer ? 'Jij' : m.role === 'system' ? 'PickMyRide' : other) + ' · ' + t.format(new Date(m.at));
          const body = document.createElement('span'); body.className = 'msg-body';
          if (m.hidden) { const em = document.createElement('em'); em.textContent = 'Dit bericht is door PickMyRide verborgen.'; body.appendChild(em); } else body.textContent = m.body;
          li.append(meta, body); list.appendChild(li); last = m.at;
        });
        if (rows.length) scroll();
      } catch (e) { /* netwerkfout: volgende ronde opnieuw */ }
    };
    // bestaande berichten markeren zodat ze niet dubbel verschijnen
    setInterval(poll, 10000);
    const ta = $('textarea', box);
    if (ta) ta.addEventListener('keydown', ev => { if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); ta.form.requestSubmit(); } });
  });

  // Bevestiging voor onomkeerbare acties
  document.addEventListener('submit', (ev) => { const m = ev.target.getAttribute && ev.target.getAttribute('data-confirm'); if (m && !window.confirm(m)) ev.preventDefault(); });

  // ───── Rekenhulp maximumtarief (werkt ook zonder server) ─────
  const calc = document.querySelector('form.calc[data-tariffs]');
  if (calc) {
    const T = JSON.parse(calc.dataset.tariffs);
    const eur = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' });
    calc.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const km = Math.round(parseFloat(String(calc.elements.km.value).replace(',', '.')) * 10) / 10, min = Math.round(+calc.elements.min.value), kind = calc.elements.soort.value === 'busje' ? 'busje' : 'personenauto';
      const out = document.getElementById('calc-live'); const t = T[kind];
      const old = calc.parentElement.querySelector('.calc-result:not(#calc-live .calc-result)'); if (old) old.remove();
      if (!(km > 0 && km <= 1000 && min > 0 && min <= 900)) { out.innerHTML = '<p class="error-text">Vul een afstand en rijtijd groter dan 0 in.</p>'; return; }
      const cents = Math.round(t.start + km * t.km + min * t.min);
      out.innerHTML = '<div class="calc-result"><p class="small muted" style="margin:0"></p><p class="calc-price"></p><p class="small" style="margin:0"></p></div>';
      const ps = out.querySelectorAll('p');
      ps[0].textContent = 'Maximumprijs op de meter, ' + km + ' km en ' + min + ' minuten, ' + (kind === 'busje' ? 'busje' : 'personenauto') + ':';
      ps[1].textContent = eur.format(cents / 100);
      ps[2].textContent = eur.format(t.start / 100) + ' start + ' + km + ' × ' + eur.format(t.km / 100) + ' + ' + min + ' × ' + eur.format(t.min / 100) + '. Via PickMyRide krijg je vooraf een vaste prijs, vaak met wachttijd inbegrepen.';
    });
  }
})();

// ───── Datum- en tijdkiezer in het snelformulier (kalender en tijdraster in een venster) ─────
(function () {
  'use strict';
  if (typeof HTMLDialogElement === 'undefined' || !HTMLDialogElement.prototype.showModal) return;
  const dateInputs = Array.from(document.querySelectorAll('input[type=date][data-date-picker]'));
  const timeSelects = Array.from(document.querySelectorAll('select[data-time-picker]'));
  if (!dateInputs.length && !timeSelects.length) return;
  const parseDay = (v) => { if (!/^\d{4}-\d{2}-\d{2}$/.test(v || '')) return null; const [y, m, d] = v.split('-').map(Number); const x = new Date(y, m - 1, d, 12); return x.getMonth() === m - 1 && x.getDate() === d ? x : null; };
  const dayValue = (d) => [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12);
  const moveMonth = (d, n) => { const f = new Date(d.getFullYear(), d.getMonth() + n, 1, 12); const last = new Date(f.getFullYear(), f.getMonth() + 1, 0, 12).getDate(); return new Date(f.getFullYear(), f.getMonth(), Math.min(d.getDate(), last), 12); };
  const monthDays = (d) => { const first = new Date(d.getFullYear(), d.getMonth(), 1, 12); const off = (first.getDay() + 6) % 7; const start = addDays(first, -off); const count = Math.ceil((off + new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()) / 7) * 7; return Array.from({ length: count }, (_, i) => addDays(start, i)); };
  const longDate = new Intl.DateTimeFormat('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const fieldDate = new Intl.DateTimeFormat('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' });
  const monthLabel = new Intl.DateTimeFormat('nl-NL', { month: 'long', year: 'numeric' });
  const chevron = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>';
  const today = () => parseDay(dayValue(new Date()));
  const fire = (el) => { el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
  const outsideClose = (dlg) => dlg.addEventListener('click', (e) => { if (e.target !== dlg) return; const r = dlg.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dlg.close(); });
  const makeTrigger = (el, cls) => {
    const t = document.createElement('button'); t.type = 'button'; t.className = 'pick-trigger ' + cls; t.id = el.id + '-kiezer';
    t.setAttribute('aria-haspopup', 'dialog'); t.setAttribute('aria-expanded', 'false');
    const span = document.createElement('span'); span.id = t.id + '-waarde'; t.append(span); t.insertAdjacentHTML('beforeend', chevron);
    const lbl = document.querySelector('label[for="' + el.id + '"]'); if (lbl) { lbl.id = lbl.id || el.id + '-label'; t.setAttribute('aria-labelledby', lbl.id + ' ' + span.id); lbl.htmlFor = t.id; }
    el.after(t); el.classList.add('pick-value'); el.hidden = true; el.closest('.qf-input')?.classList.add('has-picker');
    // Verplicht maar leeg: het verborgen veld kan de browser niet tonen, dus de knop markeren en de kiezer openen
    el.addEventListener('invalid', (e) => { e.preventDefault(); t.classList.add('is-invalid'); t.focus(); setTimeout(() => t.click(), 0); });
    el.addEventListener('change', () => t.classList.remove('is-invalid'));
    return { t, span };
  };

  // Kalender
  if (dateInputs.length) {
    const dlg = document.createElement('dialog'); dlg.className = 'pmr-picker'; dlg.id = 'pmr-kalender'; dlg.setAttribute('aria-labelledby', 'pmr-kal-titel');
    dlg.innerHTML = '<header class="pk-head"><div><p>Je reisdatum</p><h2 id="pmr-kal-titel"></h2></div><button type="button" class="pk-close" aria-label="Kalender sluiten">×</button></header>' +
      '<div class="pk-month"><button type="button" class="pk-prev" aria-label="Vorige maand">' + chevron + '</button><h3 id="pmr-kal-maand" aria-live="polite"></h3><button type="button" class="pk-next" aria-label="Volgende maand">' + chevron + '</button></div>' +
      '<table role="grid" aria-labelledby="pmr-kal-maand"><thead><tr>' + ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'].map((d, i) => '<th scope="col" abbr="' + ['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag'][i] + '">' + d + '</th>').join('') + '</tr></thead><tbody></tbody></table>' +
      '<footer class="pk-foot"><p>Kies de dag van je rit.</p><button type="button" class="pk-today">Eerste mogelijke dag</button></footer>';
    document.body.append(dlg); outsideClose(dlg);
    let active = null, focused = today(), visible = today();
    const binds = new Map();
    const minOf = () => { const m = parseDay(active && active.min); return m && m > today() ? m : today(); };
    const allowed = (d) => d >= minOf();
    const clamp = (d) => (d < minOf() ? minOf() : d);
    const render = (focus) => {
      const tb = dlg.querySelector('tbody'); tb.replaceChildren(); const days = monthDays(visible);
      for (let i = 0; i < days.length; i += 7) {
        const tr = document.createElement('tr');
        days.slice(i, i + 7).forEach(d => {
          const td = document.createElement('td');
          if (d.getMonth() !== visible.getMonth()) { tr.append(td); return; }
          const v = dayValue(d), b = document.createElement('button'); b.type = 'button'; b.dataset.day = v; b.textContent = String(d.getDate());
          b.setAttribute('aria-label', longDate.format(d)); b.tabIndex = v === dayValue(focused) ? 0 : -1; b.disabled = !allowed(d);
          if (v === active.value) { b.classList.add('is-selected'); td.setAttribute('aria-selected', 'true'); }
          if (v === dayValue(today())) { b.classList.add('is-today'); b.setAttribute('aria-current', 'date'); }
          td.append(b); tr.append(td);
        });
        tb.append(tr);
      }
      dlg.querySelector('#pmr-kal-maand').textContent = monthLabel.format(visible);
      dlg.querySelector('.pk-prev').disabled = new Date(visible.getFullYear(), visible.getMonth(), 0, 12) < minOf();
      if (focus) dlg.querySelector('[data-day="' + dayValue(focused) + '"]')?.focus();
    };
    const open = (input) => { active = input; focused = clamp(parseDay(input.value) || minOf()); visible = focused; dlg.querySelector('#pmr-kal-titel').textContent = input.dataset.datePicker; binds.get(input).t.setAttribute('aria-expanded', 'true'); render(); dlg.showModal(); dlg.querySelector('[data-day="' + dayValue(focused) + '"]')?.focus(); };
    dlg.querySelector('.pk-close').addEventListener('click', () => dlg.close());
    dlg.addEventListener('close', () => { const b = binds.get(active); if (b) { b.t.setAttribute('aria-expanded', 'false'); b.t.focus({ preventScroll: true }); } });
    dlg.addEventListener('click', (e) => { const b = e.target.closest('[data-day]'); if (b && !b.disabled) { active.value = b.dataset.day; fire(active); dlg.close(); } });
    dlg.querySelector('.pk-prev').addEventListener('click', () => { focused = clamp(moveMonth(focused, -1)); visible = focused; render(); });
    dlg.querySelector('.pk-next').addEventListener('click', () => { focused = moveMonth(focused, 1); visible = focused; render(); });
    dlg.querySelector('.pk-today').addEventListener('click', () => { focused = minOf(); visible = focused; render(true); });
    dlg.querySelector('tbody').addEventListener('keydown', (e) => {
      const d = parseDay(e.target.dataset.day); if (!d) return; let n;
      if (e.key === 'ArrowLeft') n = addDays(d, -1); if (e.key === 'ArrowRight') n = addDays(d, 1); if (e.key === 'ArrowUp') n = addDays(d, -7); if (e.key === 'ArrowDown') n = addDays(d, 7);
      if (e.key === 'PageUp') n = moveMonth(d, -1); if (e.key === 'PageDown') n = moveMonth(d, 1); if (!n) return;
      e.preventDefault(); focused = clamp(n); visible = focused; render(true);
    });
    dateInputs.forEach(input => {
      const { t, span } = makeTrigger(input, 'pick-date');
      const sync = () => { const d = parseDay(input.value); span.textContent = d ? fieldDate.format(d) : 'Kies een datum'; t.classList.toggle('is-empty', !d); t.disabled = input.disabled; };
      binds.set(input, { t, sync }); t.addEventListener('click', () => { if (!input.disabled) open(input); });
      input.addEventListener('change', sync); new MutationObserver(sync).observe(input, { attributes: true, attributeFilter: ['disabled', 'min'] }); sync();
    });
    // Terugreis kan niet vóór de heenreis
    document.querySelectorAll('.quick-form').forEach(qf => {
      const heen = qf.querySelector('[name=date]'), terug = qf.querySelector('[name=return_date]'); if (!heen || !terug) return;
      const upd = () => { if (heen.value) { terug.min = heen.value; if (terug.value && terug.value < heen.value) { terug.value = ''; fire(terug); } } };
      heen.addEventListener('change', upd); upd();
    });
  }

  // Tijdkiezer: uur en minuten (per 5 minuten)
  if (timeSelects.length) {
    const dlg = document.createElement('dialog'); dlg.className = 'pmr-picker pmr-time'; dlg.id = 'pmr-tijd'; dlg.setAttribute('aria-labelledby', 'pmr-tijd-titel');
    const choices = (name, vals, unit) => vals.map(v => '<label class="pk-choice"><input class="sr" type="radio" name="' + name + '" value="' + v + '" aria-label="' + v + ' ' + unit + '"><span>' + v + '</span></label>').join('');
    const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')), MINS = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));
    dlg.innerHTML = '<header class="pk-head"><div><p>Je reistijd</p><h2 id="pmr-tijd-titel"></h2></div><button type="button" class="pk-close" aria-label="Tijdkiezer sluiten">×</button></header>' +
      '<fieldset class="pk-group"><legend>Uur <span>00 – 23</span></legend><div class="pk-options">' + choices('pk_uur', HOURS, 'uur') + '</div></fieldset>' +
      '<fieldset class="pk-group"><legend>Minuten <span>per 5 minuten</span></legend><div class="pk-options">' + choices('pk_min', MINS, 'minuten') + '</div></fieldset>' +
      '<footer class="pk-timefoot"><div><span>Gekozen tijd</span><output id="pmr-tijd-voorbeeld" aria-live="polite"></output></div><button type="button" class="pk-confirm">Tijd bevestigen</button></footer>';
    document.body.append(dlg); outsideClose(dlg);
    let active = null; const binds = new Map();
    const pick = () => dlg.querySelector('[name=pk_uur]:checked').value + ':' + dlg.querySelector('[name=pk_min]:checked').value;
    const preview = () => { dlg.querySelector('#pmr-tijd-voorbeeld').textContent = pick(); };
    dlg.addEventListener('change', preview);
    dlg.querySelector('.pk-close').addEventListener('click', () => dlg.close());
    dlg.addEventListener('close', () => { const b = binds.get(active); if (b) { b.t.setAttribute('aria-expanded', 'false'); b.t.focus({ preventScroll: true }); } });
    dlg.querySelector('.pk-confirm').addEventListener('click', () => { if (!active) return; active.value = pick(); fire(active); dlg.close(); });
    const open = (sel) => {
      active = sel; const m = /^(\d{2}):(\d{2})$/.exec(sel.value) || [0, '09', '00'];
      dlg.querySelector('[name=pk_uur][value="' + m[1] + '"]').checked = true;
      dlg.querySelector('[name=pk_min][value="' + String(Math.floor(+m[2] / 5) * 5).padStart(2, '0') + '"]').checked = true;
      dlg.querySelector('#pmr-tijd-titel').textContent = sel.dataset.timePicker; binds.get(sel).t.setAttribute('aria-expanded', 'true');
      preview(); dlg.showModal(); dlg.querySelector('[name=pk_uur]:checked').focus();
    };
    timeSelects.forEach(sel => {
      const { t, span } = makeTrigger(sel, 'pick-time');
      const sync = () => { span.textContent = sel.value || 'Kies een tijd'; t.classList.toggle('is-empty', !sel.value); t.disabled = sel.disabled; };
      binds.set(sel, { t, sync }); t.addEventListener('click', () => { if (!sel.disabled) open(sel); });
      sel.addEventListener('change', sync); new MutationObserver(sync).observe(sel, { attributes: true, attributeFilter: ['disabled'] }); sync();
    });
  }
})();

// Portaaltabellen: kolomnamen als label per cel, zodat rijen op mobiel als kaarten leesbaar zijn.
document.querySelectorAll('.area-company main .table-wrap table, .area-admin main .table-wrap table').forEach(function (t) {
  var heads = Array.prototype.map.call(t.querySelectorAll('thead th'), function (th) { return th.textContent.trim(); });
  if (!heads.length) return;
  t.classList.add('stack');
  t.querySelectorAll('tbody tr').forEach(function (tr) {
    Array.prototype.forEach.call(tr.children, function (td, i) { if (heads[i] && !td.hasAttribute('data-label')) td.setAttribute('data-label', heads[i]); });
  });
});
