// Start every newly opened page at the top. Back/forward keeps your old spot,
// and links to a section (#pricing etc.) still jump to that section.
(function () {
  var userMoved = false;
  ['wheel', 'touchstart', 'keydown', 'mousedown'].forEach(function (ev) {
    window.addEventListener(ev, function () { userMoved = true; }, { passive: true, once: true });
  });
  var toTop = function () {
    if (userMoved) return;
    try {
      var nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
      var type = nav ? nav.type : (performance.navigation && performance.navigation.type === 2 ? 'back_forward' : 'navigate');
      if (type === 'navigate' && !location.hash) {
        var html = document.documentElement, prev = html.style.scrollBehavior;
        html.style.scrollBehavior = 'auto';
        window.scrollTo(0, 0);
        html.style.scrollBehavior = prev;
      }
    } catch (e) {}
  };
  toTop();
  document.addEventListener('DOMContentLoaded', toTop);
  window.addEventListener('load', function () { setTimeout(toTop, 0); });
})();

document.addEventListener('DOMContentLoaded', function () {
  // Mobile menu
  var btn = document.getElementById('mobile-menu-btn');
  var drawer = document.getElementById('mobile-drawer');
  if (btn && drawer) {
    var setOpen = function (open) {
      btn.setAttribute('aria-expanded', String(open));
      drawer.classList.toggle('open', open);
      btn.querySelector('.label').textContent = open ? 'Close' : 'Menu';
      btn.querySelector('.icon').textContent = open ? '✕' : '☰';
    };
    btn.addEventListener('click', function () {
      setOpen(btn.getAttribute('aria-expanded') !== 'true');
    });
    drawer.addEventListener('click', function (e) {
      if (e.target.closest('a')) setOpen(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && drawer.classList.contains('open')) { setOpen(false); btn.focus(); }
    });
  }

  // Show the chosen photo's file name in the quote form
  document.querySelectorAll('input[type="file"]').forEach(function (input) {
    input.addEventListener('change', function (e) {
      var wrap = e.target.closest('.file-input-wrapper');
      var label = wrap ? wrap.querySelector('[data-file-label]') : null;
      if (label && e.target.files.length > 0) {
        label.textContent = 'Selected: ' + e.target.files[0].name;
      }
    });
  });

  // Keep the footer year current
  document.querySelectorAll('[data-year]').forEach(function (el) {
    el.textContent = String(new Date().getFullYear());
  });
});

// Live Google rating & review count (falls back to the numbers already on the page)
(function () {
  var spots = document.querySelectorAll('[data-gr]');
  if (!spots.length || location.protocol === 'file:') return;
  var apply = function (d) {
    if (!d || typeof d.count !== 'number' || d.count < 1) return;
    spots.forEach(function (el) {
      var k = el.getAttribute('data-gr');
      if (k === 'count') el.textContent = String(d.count);
      if (k === 'rating' && typeof d.rating === 'number') el.textContent = d.rating.toFixed(1);
    });
  };
  try {
    var saved = JSON.parse(sessionStorage.getItem('kk-google-rating') || 'null');
    if (saved) { apply(saved); return; }
  } catch (e) {}
  fetch('/api/google-rating')
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) {
      apply(d);
      try { if (d && d.count) sessionStorage.setItem('kk-google-rating', JSON.stringify(d)); } catch (e) {}
    })
    .catch(function () {});
})();

// ---------------------------------------------------------------------------
// Quote form: calculator hand-off, location/other, online booking
// ---------------------------------------------------------------------------
(function () {
  var store = {
    get: function (k) { try { return JSON.parse(sessionStorage.getItem(k) || 'null'); } catch (e) { return null; } },
    set: function (k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
    del: function (k) { try { sessionStorage.removeItem(k); } catch (e) {} }
  };
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  var chicagoToday = function () {
    try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date()); }
    catch (e) { var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  };
  var addDays = function (iso, n) {
    var d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n);
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  };

  function showEstimateModal(est) {
    var wrap = document.createElement('div');
    wrap.className = 'estimate-modal';
    wrap.innerHTML =
      '<div class="estimate-modal-box" role="dialog" aria-modal="true" aria-labelledby="est-title">' +
      '<p class="estimate-modal-kicker" id="est-title">Your estimated price</p>' +
      '<p class="estimate-modal-price"></p>' +
      '<p class="estimate-modal-load"></p>' +
      '<p class="estimate-modal-note"><strong>This is an estimate, not a final price.</strong> Your final price is set on the day of the job, after we load your items and measure how much of the trailer they actually fill.</p>' +
      '<button type="button" class="btn btn-primary btn-block">Continue to my quote request</button>' +
      '</div>';
    wrap.querySelector('.estimate-modal-price').textContent = est.price;
    wrap.querySelector('.estimate-modal-load').textContent = est.label + (est.special && est.special.length ? ' + specialty items quoted separately' : '');
    var close = function () { wrap.remove(); document.removeEventListener('keydown', onKey); };
    var onKey = function (e) { if (e.key === 'Escape') close(); };
    wrap.addEventListener('click', function (e) { if (e.target === wrap) close(); });
    wrap.querySelector('button').addEventListener('click', function () {
      close();
      var f = document.getElementById('full_name'); if (f) f.focus();
    });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(wrap);
    wrap.querySelector('button').focus();
  }

  function initForm(form) {
    var $ = function (sel) { return form.querySelector(sel); };
    var service = $('#service_type'), loc = $('#item_location'), locOther = $('.location-other');
    var panel = $('.booking-panel'), dateIn = $('#booking_date'), grid = $('.slot-grid'), note = $('.slot-length-note');
    var address = $('#service_address'), slotField = $('[name="booking_slot"]'), status = $('[name="booking_status"]');
    var err = $('.form-error'), submit = form.querySelector('button[type="submit"]');
    var bookingOff = false;

    // Let people know a text is coming
    var micro = form.querySelector('.form-microcopy');
    if (micro && !form.querySelector('.text-notice')) {
      micro.insertAdjacentHTML('beforebegin', '<p class="form-microcopy text-notice">By submitting, you agree we can text you at the number above about your request.</p>');
    }

    // Calculator hand-off
    var est = store.get('kk-calc');
    if (est) {
      var desc = $('#job_description');
      var list = (est.items || []).concat((est.special || []).map(function (s) { return s + ' (specialty item)'; }));
      if (desc && !desc.value && list.length) desc.value = 'Items from the price calculator:\n- ' + list.join('\n- ') + '\n\n';
      $('[name="estimated_price"]').value = est.price + ' (' + est.label + ', about ' + est.yards + ' cu. yd.)';
      $('[name="calculator_items"]').value = list.join('; ');
      var banner = $('.estimate-banner');
      banner.hidden = false;
      banner.querySelector('.estimate-banner-price').textContent = est.price + ' · ' + est.label;
      // Show the price popup once for each new calculator estimate, whichever button brought them here
      var fresh = false; try { fresh = sessionStorage.getItem('kk-calc-new') === '1'; } catch (e) {}
      if ((fresh || /[?&]from=calculator/.test(location.search)) && !window.__kkModalShown) {
        window.__kkModalShown = true;
        try { sessionStorage.removeItem('kk-calc-new'); } catch (e) {}
        try { if (/[?&]from=calculator/.test(location.search)) history.replaceState(null, '', location.pathname + location.hash); } catch (e) {}
        showEstimateModal(est);
      }
    }

    // "Other" location
    var syncLoc = function () {
      var show = loc.value === 'Other' || loc.value === 'Multiple locations';
      locOther.hidden = !show;
      $('#item_location_other').required = show;
    };
    loc.addEventListener('change', syncLoc); syncLoc();

    // Booking
    var isLong = function () { var o = service.options[service.selectedIndex]; return !!(o && o.dataset.long); };
    var booking = function () { var r = form.querySelector('[name="schedule_method"]:checked'); return r && r.value.indexOf('Book') === 0; };

    function loadSlots() {
      slotField.value = '';
      if (!dateIn.value) { grid.innerHTML = '<p class="slot-msg">Pick a date to see open times.</p>'; return; }
      grid.innerHTML = '<p class="slot-msg">Checking open times…</p>';
      fetch('/api/booking?date=' + encodeURIComponent(dateIn.value))
        .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
        .then(function (res) {
          if (!res.ok) throw new Error(res.d && res.d.error || 'unavailable');
          var slots = isLong() ? res.d.long : res.d.short;
          grid.innerHTML = '';
          var any = false;
          slots.forEach(function (s) {
            var b = document.createElement('button');
            b.type = 'button'; b.className = 'slot'; b.textContent = s.label;
            b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', 'false');
            if (!s.available) { b.disabled = true; b.title = 'Not available'; } else { any = true; }
            b.addEventListener('click', function () {
              grid.querySelectorAll('.slot').forEach(function (x) { x.classList.remove('selected'); x.setAttribute('aria-checked', 'false'); });
              b.classList.add('selected'); b.setAttribute('aria-checked', 'true');
              slotField.value = s.id + '|' + s.label; err.hidden = true;
            });
            grid.appendChild(b);
          });
          if (!any) grid.insertAdjacentHTML('beforeend', '<p class="slot-msg">No open times that day. Try another date.</p>');
        })
        .catch(function () {
          bookingOff = true;
          grid.innerHTML = '<p class="slot-msg slot-msg-warn">Online booking isn\'t available right now. Choose “Contact me” and we\'ll call to set up a time.</p>';
        });
    }

    function syncBooking() {
      var on = booking();
      panel.hidden = !on;
      address.required = on; dateIn.required = on;
      note.textContent = isLong() ? 'Cleanouts and demolition book a half-day (6-hour) block' : '2-hour arrival window';
      submit.textContent = on ? 'Book My Time Slot →' : 'Request My Free Quote →';
      if (on && !dateIn.min) {
        var t = chicagoToday(); dateIn.min = t; dateIn.max = addDays(t, 30);
        var timing = $('#preferred_timing').value;
        if (!dateIn.value) dateIn.value = timing && timing.indexOf('As soon') === 0 ? t : addDays(t, 1);
        loadSlots();
      }
    }
    form.querySelectorAll('[name="schedule_method"]').forEach(function (r) { r.addEventListener('change', syncBooking); });
    service.addEventListener('change', function () { syncBooking(); if (booking()) loadSlots(); });
    dateIn.addEventListener('change', loadSlots);
    syncBooking();

    form.addEventListener('submit', function (e) {
      err.hidden = true;
      if (!booking()) { status.value = 'Contact to schedule'; return; } // normal Netlify submit
      e.preventDefault();
      if (!form.reportValidity()) return;
      if (bookingOff) { err.textContent = 'Online booking is unavailable right now. Please choose “Contact me”.'; err.hidden = false; return; }
      if (!slotField.value) { err.textContent = 'Please choose a time slot.'; err.hidden = false; grid.scrollIntoView({ block: 'center' }); return; }
      var v = function (sel) { var el = $(sel); return el ? el.value : ''; };
      submit.disabled = true; submit.textContent = 'Booking…';
      fetch('/api/booking', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: v('#full_name'), phone: v('#phone'), email: v('#email'), address: v('#service_address'),
          service: v('#service_type'), date: v('#booking_date'), slot: slotField.value.split('|')[0],
          location: v('#item_location') + (v('#item_location_other') ? ': ' + v('#item_location_other') : ''),
          details: v('#job_description'), estimate: v('[name="estimated_price"]'), hp: v('[name="bot-field"]')
        })
      })
        .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
        .then(function (res) {
          if (!res.ok) {
            submit.disabled = false; submit.textContent = 'Book My Time Slot →';
            err.textContent = res.d.error || 'Something went wrong. Please try again.'; err.hidden = false;
            if (res.d.taken) loadSlots();
            return;
          }
          status.value = 'Booked online: ' + res.d.when;
          store.set('kk-booking', { when: res.d.when });
          HTMLFormElement.prototype.submit.call(form); // send the details to Netlify too
        })
        .catch(function () {
          submit.disabled = false; submit.textContent = 'Book My Time Slot →';
          err.textContent = 'We couldn\'t reach the booking system. Choose “Contact me” and we\'ll call you to schedule.'; err.hidden = false;
        });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('form.kk-quote-form').forEach(initForm);
    // Thank-you page
    var box = document.getElementById('booking-confirm');
    if (box) {
      var b = store.get('kk-booking');
      if (b && b.when) { box.hidden = false; box.querySelector('strong').textContent = b.when; }
      store.del('kk-booking'); store.del('kk-calc');
    }
  });
})();
