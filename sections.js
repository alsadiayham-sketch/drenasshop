/* ============================================================
   sections.js — Dynamic curated home sections (storefront)
   Reads `sections` collection; renders editorial spotlight +
   horizontal rails into #homeSections. Falls back to smart
   defaults so the home always looks curated. ES5, RTL.
   ============================================================ */
(function () {
    'use strict';

    var DEFAULT_COVERS = [
        'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?auto=format&fit=crop&w=1200&q=80',
        'https://images.unsplash.com/photo-1556228578-8c89e6adf883?auto=format&fit=crop&w=1200&q=80',
        'https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?auto=format&fit=crop&w=1200&q=80',
        'https://images.unsplash.com/photo-1571781926291-c477ebfd024b?auto=format&fit=crop&w=1200&q=80'
    ];
    var sectionsData = null; // null = not loaded yet

    document.addEventListener('DOMContentLoaded', function () {
        if (!window.db) return;
        window.db.collection('sections').orderBy('order', 'asc').onSnapshot(function (snap) {
            sectionsData = [];
            snap.forEach(function (d) {
                var s = d.data(); s.id = d.id;
                if (s.visible === false) return;
                sectionsData.push(s);
            });
            render();
        }, function () { sectionsData = []; render(); });
    });

    // called by script.js renderStorefront() once products are ready
    window.shRenderSections = render;

    function render() {
        var host = document.getElementById('homeSections');
        if (!host) return;
        var products = window.products || [];
        if (!products.length && sectionsData === null) return; // wait

        var defs = (sectionsData && sectionsData.length) ? sectionsData : buildDefaults(products);
        var container = document.createElement('div');
        container.className = 'container';

        var chips = buildCategoryChips(products);
        if (chips) container.appendChild(chips);

        var rendered = 0;
        defs.forEach(function (section, i) {
            var items = resolveProducts(section, products);
            if (!items.length) return;
            container.appendChild(section.layout === 'spotlight'
                ? buildSpotlight(section, items, i)
                : (section.layout === 'grid' ? buildGrid(section, items, i) : buildRail(section, items, i)));
            rendered++;
        });

        if (!rendered) {
            var sk = document.getElementById('homeSectionsSkeleton');
            if (products.length) host.innerHTML = ''; // nothing to show, stay quiet
            else if (sk) return; // keep skeleton while loading
            return;
        }
        host.innerHTML = '';
        host.appendChild(container);
        observeReveal(host);
        if (window.shSyncWishHearts) window.shSyncWishHearts();
    }

    function buildCategoryChips(products) {
        var cats = [];
        products.forEach(function (p) { if (p.category && cats.indexOf(p.category) < 0) cats.push(p.category); });
        if (cats.length < 2) return null;
        var wrap = document.createElement('div');
        wrap.className = 'cat-chips reveal';
        var html = '<a class="cat-chip cat-chip-all" href="collection.html?type=all&title=' + encodeURIComponent('كل المنتجات') + '">كل المنتجات</a>';
        cats.slice(0, 10).forEach(function (c) {
            html += '<a class="cat-chip" href="collection.html?type=category&value=' + encodeURIComponent(c) + '&title=' + encodeURIComponent(c) + '">' + esc(c) + '</a>';
        });
        wrap.innerHTML = html;
        return wrap;
    }

    function buildDefaults(products) {
        var defs = [];
        var hasStatus = function (st) { return products.some(function (p) { return p.status === st; }); };
        if (hasStatus('bestseller')) defs.push({ title: 'الأكثر مبيعاً', subtitle: 'اختيارات عميلاتنا المفضّلة', type: 'status', value: 'bestseller', layout: 'spotlight', cover: DEFAULT_COVERS[0], limit: 8 });
        defs.push({ title: 'وصل حديثاً', subtitle: 'أحدث ما أضفناه لك', type: 'new', layout: 'rail', limit: 12 });
        if (hasStatus('special')) defs.push({ title: 'لمسة مميّزة', subtitle: 'منتجات منتقاة بعناية', type: 'status', value: 'special', layout: 'rail', cover: DEFAULT_COVERS[1], limit: 12 });
        var cats = [];
        products.forEach(function (p) { if (p.category && cats.indexOf(p.category) < 0) cats.push(p.category); });
        cats.forEach(function (cat, idx) {
            defs.push({ title: cat, subtitle: 'تشكيلة ' + cat, type: 'category', value: cat, layout: 'rail', cover: DEFAULT_COVERS[(idx + 2) % DEFAULT_COVERS.length], limit: 12 });
        });
        return defs;
    }

    function resolveProducts(section, all) {
        var type = section.type || 'manual';
        var limit = section.limit || 12;
        var out;
        if (type === 'manual') {
            var ids = (section.productIds || []).map(String);
            out = ids.map(function (id) {
                return all.filter(function (p) { return String(p.id) === id; })[0];
            }).filter(Boolean);
        } else if (type === 'category') {
            out = all.filter(function (p) { return p.category === section.value; });
        } else if (type === 'brand') {
            out = all.filter(function (p) { return p.brand === section.value; });
        } else if (type === 'status') {
            out = all.filter(function (p) { return p.status === section.value; });
        } else if (type === 'new') {
            out = all.slice().sort(function (a, b) { return (b.id || 0) - (a.id || 0); });
        } else {
            out = all.slice();
        }
        return out.slice(0, limit);
    }

    function sectionHeader(section, href) {
        return '<div class="home-sec-head reveal">' +
            '<div><h2 class="home-sec-title">' + esc(section.title) + '</h2>' +
            (section.subtitle ? '<p class="home-sec-sub">' + esc(section.subtitle) + '</p>' : '') + '</div>' +
            (href ? '<a class="home-sec-viewall" href="' + href + '">عرض الكل <span class="va-arrow">‹</span></a>' : '') +
            '</div>';
    }

    // Build a link to the dedicated collection page for this section
    function collectionHref(section) {
        var t = section.type || 'manual';
        var qs;
        if (t === 'manual') {
            if (!section.id) return null; // no dedicated page for ad-hoc manual defaults
            qs = 'type=section&id=' + encodeURIComponent(section.id);
        } else if (t === 'category' || t === 'brand' || t === 'status') {
            qs = 'type=' + t + '&value=' + encodeURIComponent(section.value || '');
        } else if (t === 'new') {
            qs = 'type=new';
        } else {
            qs = 'type=all';
        }
        qs += '&title=' + encodeURIComponent(section.title || '');
        return 'collection.html?' + qs;
    }

    function buildRail(section, items, i) {
        var wrap = document.createElement('div');
        wrap.className = 'home-sec home-sec-rail reveal';
        var html = sectionHeader(section, collectionHref(section));
        html += '<div class="rail-viewport">';
        html += '<button type="button" class="rail-nav rail-nav-prev" aria-label="السابق">‹</button>';
        html += '<div class="rail-scroller" role="list">';
        items.forEach(function (p) { html += productCard(p, 'rail'); });
        html += '</div>';
        html += '<button type="button" class="rail-nav rail-nav-next" aria-label="التالي">›</button>';
        html += '</div>';
        wrap.innerHTML = html;
        wireRail(wrap);
        return wrap;
    }

    function buildGrid(section, items, i) {
        var wrap = document.createElement('div');
        wrap.className = 'home-sec home-sec-grid reveal';
        var html = sectionHeader(section, collectionHref(section));
        html += '<div class="sec-grid">';
        items.slice(0, 8).forEach(function (p) { html += productCard(p, 'grid'); });
        html += '</div>';
        wrap.innerHTML = html;
        return wrap;
    }

    function buildSpotlight(section, items, i) {
        var wrap = document.createElement('div');
        wrap.className = 'home-sec home-sec-spotlight reveal';
        var cover = section.cover || DEFAULT_COVERS[i % DEFAULT_COVERS.length];
        var href = collectionHref(section);
        var html = '';
        html += '<div class="spotlight-banner" style="background-image:url(' + cover + ')">' +
            '<div class="spotlight-veil"></div>' +
            '<div class="spotlight-copy">' +
            '<span class="spotlight-kicker">' + esc(section.kicker || 'مختارات إيناس') + '</span>' +
            '<h2>' + esc(section.title) + '</h2>' +
            (section.subtitle ? '<p>' + esc(section.subtitle) + '</p>' : '') +
            (href ? '<a class="spotlight-cta" href="' + href + '">تصفّحي التشكيلة</a>' : '') +
            '</div></div>';
        html += '<div class="rail-viewport">';
        html += '<button type="button" class="rail-nav rail-nav-prev" aria-label="السابق">‹</button>';
        html += '<div class="rail-scroller spotlight-rail" role="list">';
        items.forEach(function (p) { html += productCard(p, 'rail'); });
        html += '</div>';
        html += '<button type="button" class="rail-nav rail-nav-next" aria-label="التالي">›</button>';
        html += '</div>';
        wrap.innerHTML = html;
        wireRail(wrap);
        return wrap;
    }

    // Wire rail arrow buttons (RTL-aware) + hide when not scrollable
    function wireRail(wrap) {
        var scroller = wrap.querySelector('.rail-scroller');
        var prev = wrap.querySelector('.rail-nav-prev');
        var next = wrap.querySelector('.rail-nav-next');
        if (!scroller || !prev || !next) return;
        function step() { return Math.max(220, Math.round(scroller.clientWidth * 0.8)); }
        // In RTL, scrollLeft is negative; "prev" (‹, toward start) moves content right.
        prev.addEventListener('click', function () { scroller.scrollBy({ left: step(), behavior: 'smooth' }); });
        next.addEventListener('click', function () { scroller.scrollBy({ left: -step(), behavior: 'smooth' }); });
        function sync() {
            var overflow = scroller.scrollWidth - scroller.clientWidth > 8;
            wrap.classList.toggle('rail-has-overflow', overflow);
            var x = Math.abs(scroller.scrollLeft);
            var max = scroller.scrollWidth - scroller.clientWidth - 4;
            prev.classList.toggle('is-disabled', x <= 4);
            next.classList.toggle('is-disabled', x >= max);
        }
        scroller.addEventListener('scroll', sync);
        window.addEventListener('resize', sync);
        setTimeout(sync, 60);
    }

    function productCard(p, variant) {
        var pricing = (typeof getFinalPrice === 'function') ? getFinalPrice(p, 0, window.discounts || []) : { final: p.price, original: p.price, hasDiscount: false, discountPercent: 0 };
        var priceHTML = (typeof getPriceHTML === 'function') ? getPriceHTML(pricing) : '<span>' + window.formatCurrency(p.price) + '</span>';
        var badge = (typeof getStatusBadge === 'function') ? getStatusBadge(p.status) : '';
        var fb = window.FALLBACK_IMAGE || '';
        var wished = window.isWished && window.isWished(p.id);
        var soldout = p.status === 'soldout';
        var discountBadge = (pricing.hasDiscount && pricing.discountPercent) ? '<span class="sec-card-off">-' + pricing.discountPercent + '%</span>' : '';
        return '<article class="sec-card' + (soldout ? ' is-soldout' : '') + '" role="listitem" onclick="openPDP(\'' + escJs(String(p.id)) + '\')">' +
            '<div class="sec-card-media">' +
            '<img src="' + (p.image || '') + '" alt="' + esc(p.name) + '" loading="lazy" onerror="this.src=\'' + fb + '\'">' +
            '<div class="sec-card-badges">' + badge + discountBadge + '</div>' +
            '<button class="wish-btn' + (wished ? ' is-on' : '') + '" data-wish="' + esc(p.id) + '" onclick="toggleWishlist(\'' + escJs(String(p.id)) + '\',event)" aria-label="المفضلة">' + (wished ? '❤' : '♡') + '</button>' +
            (soldout ? '' : '<button class="sec-card-quick" onclick="addToCart(event,\'' + escJs(String(p.id)) + '\')">أضيفي للسلة +</button>') +
            '</div>' +
            '<div class="sec-card-body">' +
            (p.brand ? '<div class="sec-card-brand">' + esc(p.brand) + '</div>' : '') +
            '<h3 class="sec-card-name">' + esc(p.name) + '</h3>' +
            '<div class="sec-card-foot"><div class="sec-card-price">' + priceHTML + '</div>' +
            (soldout ? '<span class="sec-card-soldout">نفذت</span>' : '<button class="sec-card-add" onclick="addToCart(event,\'' + escJs(String(p.id)) + '\')" aria-label="أضيفي للسلة">+</button>') + '</div>' +
            '</div></article>';
    }

    // open browse-all and apply a filter
    window.shBrowseFilter = function (value) {
        if (typeof window.toggleBrowseAll === 'function') {
            var wrap = document.getElementById('browseAllWrap');
            if (wrap && wrap.hasAttribute('hidden')) window.toggleBrowseAll();
        }
        if (value && value !== 'all' && typeof window.filterProducts === 'function') {
            window.filterProducts(value);
        }
        var target = document.getElementById('browseAllWrap');
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    /* ---- reveal on scroll (enhances already-visible content) ---- */
    function observeReveal(root) {
        var els = root.querySelectorAll('.reveal');
        if (!('IntersectionObserver' in window) || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)) {
            for (var i = 0; i < els.length; i++) els[i].classList.add('in');
            return;
        }
        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (en) {
                if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
            });
        }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
        for (var j = 0; j < els.length; j++) io.observe(els[j]);
        // Safety net: never let content stay hidden if the observer can't fire
        // (hidden tabs, headless renderers, non-scrolling sessions).
        setTimeout(function () {
            for (var k = 0; k < els.length; k++) els[k].classList.add('in');
        }, 2400);
    }

    function esc(s) { return window.shEsc(s); }
    function escJs(s) { return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }

    // Expose the premium card so other pages (collection.html) render identically
    window.shProductCard = productCard;
})();
