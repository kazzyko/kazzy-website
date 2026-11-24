// Google Ads visit marker. Any page reached from a Google ad click (Google adds
// gclid / gbraid / wbraid to every ad click, sitelinks included) marks the visitor
// as an ad visitor, the same flag Aidan's lp-*.html pages set. thank-you.html then
// sends the Google Ads form conversion (kk_form_lead). No GTM change needed.
(function () {
  try {
    var q = new URLSearchParams(window.location.search);
    if (q.get('gclid') || q.get('gbraid') || q.get('wbraid') ||
        (q.get('utm_source') === 'google' && q.get('utm_medium') === 'cpc')) {
      sessionStorage.setItem('kk_ad_visit', '1');
      sessionStorage.setItem('kk_ad_call', '1');
    }
  } catch (e) {}
})();

// Google Ads phone-tap tracking on every page. Aidan's lp-*.html pages already
// send kk_call_click on their own, so they're skipped here. On every other page,
// a tap on a tel: link sends kk_call_click only for visitors who came from a
// Google ad in this visit (GTM then records the "ALVIER - Call" conversion).
(function () {
  if (/^\/lp-/.test(window.location.pathname)) return;
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest && e.target.closest('a[href^="tel:"]');
    if (!a) return;
    try {
      if (sessionStorage.getItem('kk_ad_visit') !== '1' &&
          sessionStorage.getItem('kk_ad_call') !== '1') return;
    } catch (err) { return; }
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event: 'kk_call_click' });
  }, true);
})();

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

  // Desktop dropdown menus: tell screen readers whether each one is open
  document.querySelectorAll('.nav-dropdown').forEach(function (dd) {
    var trigger = dd.querySelector('.nav-link[aria-expanded]');
    if (!trigger) return;
    var set = function (open) { trigger.setAttribute('aria-expanded', String(open)); };
    dd.addEventListener('mouseenter', function () { set(true); });
    dd.addEventListener('mouseleave', function () { set(dd.contains(document.activeElement)); });
    dd.addEventListener('focusin', function () { set(true); });
    dd.addEventListener('focusout', function (e) { if (!dd.contains(e.relatedTarget)) set(dd.matches(':hover')); });
  });

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
  var links = document.querySelectorAll('a[data-gr-link]');
  if ((!spots.length && !links.length) || location.protocol === 'file:') return;
  var apply = function (d) {
    if (d && typeof d.placeId === 'string' && /^[\w-]{10,}$/.test(d.placeId)) {
      links.forEach(function (a) {
        // Only maps-search links get the place ID added; direct review links already point at the listing.
        if (a.href.indexOf('/maps/search/') !== -1 && a.href.indexOf('query_place_id=') === -1) a.href += '&query_place_id=' + encodeURIComponent(d.placeId);
      });
    }
    if (d && Array.isArray(d.reviews)) showLiveReviews(d.reviews);
    if (!d || typeof d.count !== 'number' || d.count < 1) return;
    spots.forEach(function (el) {
      var k = el.getAttribute('data-gr');
      if (k === 'count') el.textContent = String(d.count);
      if (k === 'rating' && typeof d.rating === 'number') el.textContent = d.rating.toFixed(1);
    });
  };
  // Homepage: swap in the latest 5-star Google reviews, with the reviewer's real name
  var showLiveReviews = function (list) {
    var box = document.getElementById('review-cards');
    if (!box) return;
    // Only reviews with a real reviewer name are used (no "A Google User" / anonymous ones)
    var good = list.filter(function (r) { return r.rating === 5 && hasName(r.name) && r.text && r.text.length >= 40 && r.text.length <= 420; }).slice(0, 3);
    if (!good.length) return;
    // Top up with the named reviews already on the page if Google sent fewer than 3
    var seen = good.map(function (r) { return r.name.trim().toLowerCase(); });
    var keep = [].slice.call(box.querySelectorAll('.review-card')).filter(function (c) {
      var who = c.querySelector('.reviewer-meta');
      var n = who && who.firstChild ? String(who.firstChild.textContent).trim() : '';
      return hasName(n) && seen.indexOf(n.toLowerCase()) < 0;
    }).slice(0, 3 - good.length).map(function (c) { return c.outerHTML; });
    box.innerHTML = good.map(function (r) {
      return '<figure class="review-card">' +
        '<div class="stars" role="img" aria-label="Rated 5 out of 5 stars">★★★★★</div>' +
        '<blockquote class="review-quote">“' + esc(r.text) + '”</blockquote>' +
        '<figcaption class="reviewer-meta">' + esc(r.name) + '<span>Google review' + (r.when ? ' · ' + esc(r.when) : '') + '</span></figcaption>' +
        '</figure>';
    }).join('') + keep.join('');
  };
  var hasName = function (n) {
    n = String(n || '').trim();
    return n.length > 1 && !/^(a )?google user$/i.test(n) && !/anonymous|homeowner|google reviewer/i.test(n);
  };
  var esc =function (s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
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

// Homepage review pop-up: a small card in the bottom corner with one random review.
// Tapping it opens the Google reviews; the X hides it for the rest of the visit.
(function () {
  var cards = document.getElementById('review-cards');
  var link = document.querySelector('a[data-gr-link]');
  if (!cards || !link) return;
  var KEY = 'kk-review-pop-closed';
  try { if (sessionStorage.getItem(KEY)) return; } catch (e) {}
  var pop = null, gone = false;
  var close = function (remember) {
    gone = true;
    if (pop) { pop.classList.remove('is-in'); setTimeout(function () { if (pop && pop.parentNode) pop.parentNode.removeChild(pop); }, 300); }
    if (remember) { try { sessionStorage.setItem(KEY, '1'); } catch (e) {} }
  };
  var show = function () {
    if (gone || document.querySelector('.estimate-modal:not([hidden])')) return;
    var all = Array.prototype.slice.call(cards.querySelectorAll('.review-card'));
    if (!all.length) return;
    var pick = all[Math.floor(Math.random() * all.length)];
    var quote = (pick.querySelector('.review-quote') || {}).textContent || '';
    var meta = pick.querySelector('.reviewer-meta');
    var name = meta && meta.firstChild ? String(meta.firstChild.textContent).trim() : '';
    quote = quote.replace(/^[“"]|[”"]$/g, '').trim();
    if (quote.length > 130) quote = quote.slice(0, 127).replace(/\s+\S*$/, '') + '…';
    pop = document.createElement('aside');
    pop.className = 'review-pop';
    pop.setAttribute('aria-label', 'Customer review');
    pop.innerHTML =
      '<a class="review-pop-link" target="_blank" rel="noopener">' +
        '<span class="review-pop-stars" aria-hidden="true">★★★★★</span>' +
        '<span class="review-pop-quote"></span>' +
        '<span class="review-pop-meta"><strong></strong> · Google review</span>' +
        '<span class="review-pop-cta">Read our Google reviews →</span>' +
      '</a>' +
      '<button type="button" class="review-pop-close" aria-label="Close review">×</button>';
    var a = pop.querySelector('.review-pop-link');
    a.href = link.href;
    a.setAttribute('aria-label', '5-star Google review: ' + quote + (name ? ', ' + name : '') + '. Read our Google reviews');
    pop.querySelector('.review-pop-quote').textContent = '“' + quote + '”';
    pop.querySelector('.review-pop-meta strong').textContent = name || 'Google reviewer';
    pop.querySelector('.review-pop-close').addEventListener('click', function () { close(true); });
    a.addEventListener('click', function () { close(true); });
    document.body.appendChild(pop);
    requestAnimationFrame(function () { requestAnimationFrame(function () { if (pop) pop.classList.add('is-in'); }); });
  };
  // Get out of the way once someone starts filling in the estimate form
  document.addEventListener('focusin', function (e) {
    if (pop && e.target.closest && e.target.closest('form')) close(false);
  });
  // Shows only once they've scrolled past the first screen, so it never covers
  // the headline, the estimate form's first fields or the main buttons.
  var timer = null;
  var onScroll = function () {
    if (window.pageYOffset > window.innerHeight * 1.2) {
      window.removeEventListener('scroll', onScroll);
      timer = setTimeout(show, 1500);
    }
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('pagehide', function () { if (timer) clearTimeout(timer); });
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
      '<button type="button" class="btn btn-primary btn-block">Continue to my estimate request</button>' +
      '</div>';
    wrap.querySelector('.estimate-modal-price').textContent = est.price;
    wrap.querySelector('.estimate-modal-load').textContent = est.label + (est.special && est.special.length ? ' + specialty items priced separately' : '');
    var close = function () { wrap.remove(); document.removeEventListener('keydown', onKey); };
    var onKey = function (e) { if (e.key === 'Escape') close(); };
    wrap.addEventListener('click', function (e) { if (e.target === wrap) close(); });
    wrap.querySelector('button').addEventListener('click', function () {
      close();
      var f = document.getElementById('service_type') || document.getElementById('full_name');
      if (f && f.offsetParent === null) f = document.getElementById('full_name');
      if (f) f.focus();
    });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(wrap);
    wrap.querySelector('button').focus();
  }

  function initForm(form) {
    var $ = function (sel) { return form.querySelector(sel); };
    var service = $('#service_type'), locField = $('.loc-field'), locOther = $('.location-other');
    var panel = $('.booking-panel'), dateIn = $('#booking_date'), grid = $('.slot-grid'), note = $('.slot-length-note');
    var address = $('#service_address'), slotField = $('[name="booking_slot"]'), status = $('[name="booking_status"]');
    var err = $('.form-error'), submit = form.querySelector('button[type="submit"]');
    var bookingOff = false;

    // Let people know a text is coming
    var micro = form.querySelector('.form-microcopy:not(.step-note)');
    if (micro && !form.querySelector('.text-notice')) {
      micro.insertAdjacentHTML('beforebegin', '<p class="form-microcopy text-notice">By submitting, you agree we can call or text you at the number above about your request.</p>');
    }

    // Calculator hand-off
    var est = store.get('kk-calc');
    if (est) {
      var desc = $('#job_description');
      var list = (est.items || []).concat((est.special || []).map(function (s) { return s + ' (specialty item)'; }));
      var filled = '';
      if (desc && !desc.value && list.length) { filled = 'Items from the price calculator:\n- ' + list.join('\n- ') + '\n\n'; desc.value = filled; }
      $('[name="estimated_price"]').value = est.price + ' (' + est.label + ', about ' + est.yards + ' cu. yd.)';
      $('[name="calculator_items"]').value = list.join('; ');
      var banner = $('.estimate-banner');
      banner.hidden = false;
      banner.querySelector('.estimate-banner-price').textContent = est.price + ' · ' + est.label;
      // Let people remove a calculator estimate they don't want anymore
      var clearBtn = banner.querySelector('.estimate-clear');
      if (clearBtn) clearBtn.addEventListener('click', function () {
        store.del('kk-calc'); store.del('kk-calc-new');
        est = null;
        banner.hidden = true;
        $('[name="estimated_price"]').value = '';
        $('[name="calculator_items"]').value = '';
        if (desc && filled && desc.value.indexOf(filled) === 0) desc.value = desc.value.slice(filled.length);
        if (window.kkMiniReset) window.kkMiniReset();
      });
      // Show the price popup once for each new calculator estimate, whichever button brought them here
      var fresh = false; try { fresh = sessionStorage.getItem('kk-calc-new') === '1'; } catch (e) {}
      if ((fresh || /[?&]from=calculator/.test(location.search)) && !window.__kkModalShown) {
        window.__kkModalShown = true;
        try { sessionStorage.removeItem('kk-calc-new'); } catch (e) {}
        try { if (/[?&]from=calculator/.test(location.search)) history.replaceState(null, '', location.pathname + location.hash); } catch (e) {}
        showEstimateModal(est);
      }
    }

    // Mini estimator (quick load-size pick). Hidden when a calculator estimate already came in,
    // and for demolition or specialty jobs, which aren't priced by trailer space.
    var mini = form.querySelector('.mini-calc');
    if (mini) {
      {
        var miniRes = mini.querySelector('.mini-calc-result');
        var priceField = $('[name="estimated_price"]');
        mini.addEventListener('change', function (e) {
          var r = e.target;
          if (r.name !== 'load_size') return;
          miniRes.hidden = false;
          miniRes.querySelector('strong').textContent = r.getAttribute('data-price');
          priceField.value = r.getAttribute('data-price') + ' (' + r.value.replace(/ \(\$\d+\)$/, '') + ', picked on the form)';
        });
        var syncMini = function () {
          var o = service.options[service.selectedIndex];
          var off = !!(o && o.dataset.nomini);
          mini.hidden = off || !!est;
          if (off) {
            Array.prototype.forEach.call(mini.querySelectorAll('input[name="load_size"]'), function (i) { i.checked = false; });
            miniRes.hidden = true; priceField.value = '';
          }
        };
        service.addEventListener('change', syncMini); syncMini();
        window.kkMiniReset = syncMini;
      }
    }

    // Item locations and access notes: check-all-that-apply chips feed hidden fields
    var chipsToField = function (attr, fieldName) {
      var boxes = form.querySelectorAll('input[' + attr + ']');
      var field = $('[name="' + fieldName + '"]');
      var sync = function () {
        field.value = Array.prototype.filter.call(boxes, function (b) { return b.checked; })
          .map(function (b) { return b.value; }).join(', ');
      };
      Array.prototype.forEach.call(boxes, function (b) { b.addEventListener('change', sync); });
      sync();
      return field;
    };
    var locHidden = chipsToField('data-loc', 'item_location');
    var syncLoc = function () {
      var other = form.querySelector('input[data-loc][value="Other"]');
      var show = !!(other && other.checked);
      locOther.hidden = !show;
      $('#item_location_other').required = show;
      if (locHidden.value) locField.classList.remove('has-error');
    };
    Array.prototype.forEach.call(form.querySelectorAll('input[data-loc]'), function (b) { b.addEventListener('change', syncLoc); });
    syncLoc();

    // Curbside discount: when "Curbside or driveway" is checked, the 1- and 2-item boxes show
    // the regular price crossed out and the curbside price in green. Other boxes stay the same.
    var curbBox = form.querySelector('input[data-loc][value="Curbside or driveway"]');
    if (curbBox && mini) {
      var CURB = { '1 bulky item': '$125', '2 bulky items': '$175' };
      var curbChips = [];
      Array.prototype.forEach.call(mini.querySelectorAll('input[name="load_size"]'), function (i) {
        var name = i.value.replace(/ \(\$\d+\)$/, '');
        if (!CURB[name]) return;
        var priceEl = i.parentNode.querySelector('.size-chip-price');
        curbChips.push({ input: i, name: name, reg: i.getAttribute('data-price'), regValue: i.value, curb: CURB[name], priceEl: priceEl });
      });
      var syncCurb = function () {
        var on = curbBox.checked;
        curbChips.forEach(function (c) {
          c.input.setAttribute('data-price', on ? c.curb : c.reg);
          c.input.value = on ? c.name + ', curbside (' + c.curb + ')' : c.regValue;
          c.input.parentNode.classList.toggle('is-curb', on);
          if (c.priceEl) c.priceEl.innerHTML = on
            ? '<s class="size-chip-was" aria-label="Regular price ' + c.reg + '">' + c.reg + '</s><span class="size-chip-curb">' + c.curb + '</span>'
            : c.reg;
          if (c.input.checked) c.input.dispatchEvent(new Event('change', { bubbles: true }));
        });
      };
      curbBox.addEventListener('change', syncCurb);
      syncCurb();
    }

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
          var any = false, anySoon = false;
          slots.forEach(function (s) {
            // Open, but starting too soon to book online: show a glowing "call now" button instead of crossing it out
            if (s.soon) {
              anySoon = true;
              var c = document.createElement('a');
              c.className = 'slot slot-soon'; c.href = 'tel:+14143886289';
              c.setAttribute('aria-label', s.label + ' may still be open. Call (414) 388-6289 to check.');
              c.innerHTML = '<span class="slot-soon-time"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M12 6.8V12l3.6 2.2" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>' + s.label + '</span><span class="slot-soon-cta">Hurry · Call now</span>';
              grid.appendChild(c);
              return;
            }
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
          if (anySoon) grid.insertAdjacentHTML('beforeend', '<p class="slot-msg slot-msg-soon">Need it today? Times marked <strong>Call now</strong> are too soon to book online but may still be open. Call <a href="tel:+14143886289">(414) 388-6289</a> and we\'ll try to fit you in.</p>');
          else if (!any) grid.insertAdjacentHTML('beforeend', '<p class="slot-msg">No open times that day. Try another date.</p>');
          // Arrow keys move between open time slots, like a normal radio group
          var open = Array.prototype.slice.call(grid.querySelectorAll('button.slot:not(:disabled)'));
          open.forEach(function (b, i) {
            b.tabIndex = i === 0 ? 0 : -1;
            b.addEventListener('keydown', function (e) {
              var step = (e.key === 'ArrowRight' || e.key === 'ArrowDown') ? 1 : (e.key === 'ArrowLeft' || e.key === 'ArrowUp') ? -1 : 0;
              if (!step) return;
              e.preventDefault();
              var next = open[(i + step + open.length) % open.length];
              open.forEach(function (x) { x.tabIndex = -1; });
              next.tabIndex = 0; next.focus(); next.click();
            });
          });
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
      submit.textContent = on ? 'Book My Time Slot →' : 'Request My Free Estimate →';
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

    // Two short steps: the job first, then contact details. Without this script the whole form shows at once.
    var steps = form.querySelectorAll('.form-step');
    var goStep = null, curStep = 2;
    if (steps.length === 2) {
      var s1 = steps[0], s2 = steps[1], next = $('.step-next'), back = $('.step-back');
      var prog = $('.form-progress'), stepErr = $('.step-error'), stepNote = $('.step-note');
      var card = form.closest('.quote-card') || form;
      goStep = function (n, move) {
        curStep = n;
        s1.hidden = n !== 1; s2.hidden = n !== 2;
        Array.prototype.forEach.call(prog.children, function (li) {
          var k = Number(li.getAttribute('data-for'));
          li.classList.toggle('is-on', k === n); li.classList.toggle('is-done', k < n);
          if (k === n) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
        });
        if (!move) return;
        var top = card.getBoundingClientRect().top;
        var head = document.querySelector('.site-header');
        var off = (head ? head.offsetHeight : 0) + 12;
        if (top < off || top > window.innerHeight * 0.5) window.scrollTo(0, window.pageYOffset + top - off);
        var first = (n === 1 ? s1 : s2).querySelector('select, input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), textarea');
        if (first) { try { first.focus({ preventScroll: true }); } catch (e) { first.focus(); } }
      };
      var stepOneOk = function () {
        stepErr.hidden = true;
        var fields = s1.querySelectorAll('select, input, textarea');
        for (var i = 0; i < fields.length; i++) {
          if (!fields[i].checkValidity()) { fields[i].reportValidity(); return false; }
        }
        if (!locHidden.value) {
          locField.classList.add('has-error');
          stepErr.textContent = 'Please check at least one place where the items are.'; stepErr.hidden = false;
          locField.scrollIntoView({ block: 'center' });
          return false;
        }
        return true;
      };
      prog.hidden = false; next.hidden = false; back.hidden = false; if (stepNote) stepNote.hidden = false;
      form.classList.add('is-stepped');
      next.addEventListener('click', function () { if (stepOneOk()) goStep(2, true); });
      back.addEventListener('click', function () { goStep(1, true); });
      Array.prototype.forEach.call(form.querySelectorAll('input[data-loc]'), function (b) {
        b.addEventListener('change', function () { if (locHidden.value) stepErr.hidden = true; });
      });
      // Enter in a step-one box moves on instead of trying to send a half-finished form
      form.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && curStep === 1 && e.target.tagName === 'INPUT' && e.target.type !== 'file') { e.preventDefault(); next.click(); }
      });
      goStep(1, false);
    }

    // Unique email subject per lead so Gmail doesn't stack them into one thread
    var subjectField = $('[name="subject"]');
    var setSubject = function (how) {
      if (!subjectField) return;
      var nm = ($('#full_name') && $('#full_name').value.trim()) || 'Website lead';
      var svc = service && service.value ? service.value : 'Service not picked';
      var d = new Date();
      var stamp = d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
      subjectField.value = 'New lead: ' + nm + ' – ' + svc + ' – ' + how + ' (' + stamp + ')';
    };
    form.addEventListener('submit', function (e) {
      err.hidden = true;
      setSubject('Call to schedule');
      if (goStep && curStep === 1) { e.preventDefault(); form.querySelector('.step-next').click(); return; }
      if (!locHidden.value) {
        e.preventDefault();
        if (goStep) { goStep(1, false); form.querySelector('.step-next').click(); return; }
        locField.classList.add('has-error');
        err.textContent = 'Please check at least one place where the items are.'; err.hidden = false;
        locField.scrollIntoView({ block: 'center' });
        return;
      }
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
          location: v('[name="item_location"]') + (v('#item_location_other') ? ': ' + v('#item_location_other') : ''),
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
          setSubject('Booked ' + res.d.when);
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
