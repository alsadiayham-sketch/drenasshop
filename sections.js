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
    var categoriesData = null;

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
        window.db.collection('categories').orderBy('order', 'asc').onSnapshot(function (snap) {
            categoriesData = [];
            snap.forEach(function (d) { var c = d.data(); c.id = d.id; categoriesData.push(c); });
            render();
        }, function () { categoriesData = []; render(); });
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

        var rendered = 0;
        var showcase = buildCategoryShowcase(products);
        if (showcase) { container.appendChild(showcase); rendered++; }

        defs.forEach(function (section, i) {
            var items = resolveProducts(section, products);
            if (!items.length) return;
            if (rendered > 0) {
                var divider = document.createElement('div');
                divider.className = 'home-sec-divider reveal';
                divider.setAttribute('aria-hidden', 'true');
                divider.innerHTML = '<span class="hsd-line"></span><span class="hsd-mark">✦</span><span class="hsd-line"></span>';
                container.appendChild(divider);
            }
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

    function getShowcaseCats(products) {
        if (categoriesData && categoriesData.length) {
            return categoriesData.map(function (c, i) {
                return { name: c.name, image: c.image || DEFAULT_COVERS[i % DEFAULT_COVERS.length], description: c.description || '' };
            });
        }
        var seen = {}, out = [];
        products.forEach(function (p) {
            if (p.category && !seen[p.category]) { seen[p.category] = 1; out.push({ name: p.category, image: DEFAULT_COVERS[out.length % DEFAULT_COVERS.length], description: '' }); }
        });
        return out;
    }

    function buildCategoryShowcase(products) {
        var cats = getShowcaseCats(products);
        if (!cats.length) return null;
        var sec = document.createElement('section');
        sec.className = 'home-sec cat-showcase reveal';
        var head = '<div class="home-sec-head"><div class="home-sec-heading">' +
            '<h2 class="home-sec-title">تسوّقي حسب الفئة</h2>' +
            '<p class="home-sec-sub">اكتشفي تشكيلاتنا حسب نوع العناية</p></div></div>';
        var arrow = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>';
        var grid = '<div class="cat-showcase-grid">';
        cats.forEach(function (c, i) {
            var href = 'collection.html?type=category&value=' + encodeURIComponent(c.name) + '&title=' + encodeURIComponent(c.name);
            var count = products.filter(function (p) { return p.category === c.name; }).length;
            grid += '<a class="cat-card" href="' + href + '" style="animation-delay:' + (i * 45) + 'ms" aria-label="' + esc(c.name) + '">' +
                '<div class="cat-card-media"><img src="' + esc(c.image) + '" alt="' + esc(c.name) + '" loading="lazy"></div>' +
                '<span class="cat-card-veil" aria-hidden="true"></span>' +
                '<div class="cat-card-body">' +
                    '<h3 class="cat-card-name">' + esc(c.name) + '</h3>' +
                    (count ? '<span class="cat-card-count">' + count + ' منتج</span>' : '') +
                    '<span class="cat-card-cta">استكشفي الكل ' + arrow + '</span>' +
                '</div></a>';
        });
        grid += '</div>';
        sec.innerHTML = head + grid;
        return sec;
    }

    function buildDefaults(products) {
        var defs = [];
        var hasStatus = function (st) { return products.some(function (p) { return p.status === st; }); };
        if (hasStatus('bestseller')) defs.push({ title: 'الأكثر مبيعاً', subtitle: 'اختيارات عميلاتنا المفضّلة', type: 'status', value: 'bestseller', layout: 'spotlight', cover: DEFAULT_COVERS[0], limit: 8 });
        defs.push({ title: 'وصل حديثاً', subtitle: 'أحدث ما أضفناه لك', type: 'new', layout: 'rail', limit: 12 });
        if (hasStatus('special')) defs.push({ title: 'لمسة مميّزة', subtitle: 'منتجات منتقاة بعناية', type: 'status', value: 'special', layout: 'rail', cover: DEFAULT_COVERS[1], limit: 12 });
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
            '<div class="home-sec-heading"><h2 class="home-sec-title">' + esc(section.title) + '</h2>' +
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
