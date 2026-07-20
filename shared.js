/* ============================================================
   shared.js — Foundation module for Enas Shop
   Loaded on index.html, checkout.html, admin.html (after
   firebase-config.js + data.js). ES5 only, RTL Arabic.
   Provides: toast system, customer auth (Web Crypto PBKDF2),
   session helpers, loyalty config + tier logic, worker
   permission model / role presets, small utilities.
   ============================================================ */
(function () {
    'use strict';

    /* -------- tiny utils -------- */
    function esc(str) {
        if (typeof window.escapeHtml === 'function') return window.escapeHtml(str);
        return String(str == null ? '' : str).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    window.shEsc = esc;

    /* ============================================================
       TOAST SYSTEM
       ============================================================ */
    function ensureToastHost() {
        var host = document.getElementById('shToastHost');
        if (!host) {
            host = document.createElement('div');
            host.id = 'shToastHost';
            host.className = 'sh-toast-host';
            host.setAttribute('aria-live', 'polite');
            host.setAttribute('aria-atomic', 'true');
            (document.body || document.documentElement).appendChild(host);
        }
        return host;
    }

    var TOAST_ICONS = { success: '✅', error: '⚠️', info: 'ℹ️', warning: '⚠️', loyalty: '⭐' };

    window.showToast = function (message, type, duration) {
        try {
            var host = ensureToastHost();
            var t = document.createElement('div');
            t.className = 'sh-toast sh-toast-' + (type || 'info');
            t.setAttribute('role', 'status');
            t.innerHTML = '<span class="sh-toast-icon">' + (TOAST_ICONS[type] || TOAST_ICONS.info) +
                '</span><span class="sh-toast-msg">' + esc(message) + '</span>';
            host.appendChild(t);
            // force reflow so the entrance transition runs
            void t.offsetWidth;
            t.classList.add('is-in');
            var ttl = duration || (type === 'error' ? 4200 : 3000);
            var timer = setTimeout(dismiss, ttl);
            t.addEventListener('click', dismiss);
            function dismiss() {
                clearTimeout(timer);
                if (t.classList.contains('is-out')) return;
                t.classList.add('is-out');
                t.classList.remove('is-in');
                setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 320);
            }
        } catch (e) { /* toast must never break the app */ }
    };

    /* ============================================================
       CRYPTO — PBKDF2-SHA256 salted password hashing
       (client-side; matches the store's client-only security
       posture while avoiding plaintext passwords in Firestore)
       ============================================================ */
    function toHex(buf) {
        var bytes = new Uint8Array(buf), out = '';
        for (var i = 0; i < bytes.length; i++) {
            var h = bytes[i].toString(16);
            out += h.length === 1 ? '0' + h : h;
        }
        return out;
    }

    window.shRandomSalt = function () {
        var a = new Uint8Array(16);
        (window.crypto || window.msCrypto).getRandomValues(a);
        return toHex(a.buffer);
    };

    // returns a Promise<hexHash>
    window.shHashPassword = function (password, saltHex) {
        var subtle = (window.crypto && window.crypto.subtle) || (window.msCrypto && window.msCrypto.subtle);
        if (!subtle) {
            // extremely defensive fallback (old browsers): weak, but never plaintext
            return Promise.resolve('plain$' + btoa(unescape(encodeURIComponent(saltHex + '|' + password))));
        }
        var enc = new TextEncoder();
        var saltBytes = new Uint8Array(saltHex.match(/.{1,2}/g).map(function (b) { return parseInt(b, 16); }));
        return subtle.importKey('raw', enc.encode(password), { name: 'PBKDF2' }, false, ['deriveBits'])
            .then(function (key) {
                return subtle.deriveBits({
                    name: 'PBKDF2', salt: saltBytes, iterations: 150000, hash: 'SHA-256'
                }, key, 256);
            })
            .then(function (bits) { return toHex(bits); });
    };

    /* ============================================================
       CUSTOMER SESSION (localStorage)
       ============================================================ */
    var CUSTOMER_KEY = 'drenasshop_customer';

    window.getCurrentCustomer = function () {
        try { return JSON.parse(localStorage.getItem(CUSTOMER_KEY) || 'null'); }
        catch (e) { return null; }
    };
    window.setCurrentCustomer = function (c) {
        if (!c) { localStorage.removeItem(CUSTOMER_KEY); return; }
        localStorage.setItem(CUSTOMER_KEY, JSON.stringify({
            id: c.id, name: c.name, phone: c.phone, email: c.email || ''
        }));
    };
    window.clearCurrentCustomer = function () { localStorage.removeItem(CUSTOMER_KEY); };

    function normPhone(p) { return String(p || '').replace(/[^\d]/g, ''); }
    window.shNormPhone = normPhone;

    /* ============================================================
       CUSTOMER AUTH
       ============================================================ */
    // Register -> Promise<customer>
    window.shRegisterCustomer = function (data) {
        var name = String(data.name || '').trim();
        var phone = normPhone(data.phone);
        var email = String(data.email || '').trim().toLowerCase();
        var password = String(data.password || '');
        if (!name) return Promise.reject(new Error('الرجاء إدخال الاسم'));
        if (phone.length < 9) return Promise.reject(new Error('رقم الهاتف غير صحيح'));
        if (password.length < 6) return Promise.reject(new Error('كلمة المرور يجب أن تكون 6 أحرف على الأقل'));
        if (!window.db) return Promise.reject(new Error('تعذر الاتصال بقاعدة البيانات'));

        var col = window.db.collection('customers');
        return col.where('phone', '==', phone).limit(1).get().then(function (snap) {
            if (!snap.empty) throw new Error('رقم الهاتف مسجّل مسبقاً، سجّلي الدخول');
            var salt = window.shRandomSalt();
            return window.shHashPassword(password, salt).then(function (hash) {
                return window.shGetLoyaltyConfig().then(function (cfg) {
                    var bonus = (cfg.enabled && cfg.signupBonus > 0) ? cfg.signupBonus : 0;
                    var now = new Date().toISOString();
                    var doc = {
                        name: name, phone: phone, email: email,
                        salt: salt, passHash: hash,
                        blocked: false,
                        points: bonus, lifetimePoints: bonus, lifetimeSpend: 0,
                        tier: window.shComputeTier(bonus, cfg).id,
                        wishlist: [], ordersCount: 0,
                        createdAt: now, updatedAt: now
                    };
                    return col.add(doc).then(function (ref) {
                        doc.id = ref.id;
                        if (bonus > 0) {
                            ref.collection('ledger').add({
                                type: 'earn', reason: 'signup', points: bonus,
                                balance: bonus, at: now
                            }).catch(function () {});
                        }
                        window.setCurrentCustomer(doc);
                        return doc;
                    });
                });
            });
        });
    };

    // Login by phone OR email -> Promise<customer>
    window.shLoginCustomer = function (identifier, password) {
        identifier = String(identifier || '').trim();
        if (!identifier || !password) return Promise.reject(new Error('الرجاء إدخال البيانات'));
        if (!window.db) return Promise.reject(new Error('تعذر الاتصال بقاعدة البيانات'));
        var col = window.db.collection('customers');
        var isEmail = identifier.indexOf('@') >= 0;
        var query = isEmail
            ? col.where('email', '==', identifier.toLowerCase()).limit(1)
            : col.where('phone', '==', normPhone(identifier)).limit(1);
        return query.get().then(function (snap) {
            if (snap.empty) throw new Error('لا يوجد حساب بهذه البيانات');
            var docSnap = snap.docs[0];
            var c = docSnap.data(); c.id = docSnap.id;
            if (c.blocked) throw new Error('تم حظر هذا الحساب. تواصلي مع الدعم');
            return window.shHashPassword(password, c.salt).then(function (hash) {
                if (hash !== c.passHash) throw new Error('كلمة المرور غير صحيحة');
                window.setCurrentCustomer(c);
                return c;
            });
        });
    };

    // Refresh the cached customer from Firestore (points/tier/blocked may change)
    window.shRefreshCustomer = function () {
        var cur = window.getCurrentCustomer();
        if (!cur || !window.db) return Promise.resolve(cur);
        return window.db.collection('customers').doc(cur.id).get().then(function (docSnap) {
            if (!docSnap.exists) { window.clearCurrentCustomer(); return null; }
            var c = docSnap.data(); c.id = docSnap.id;
            if (c.blocked) { window.clearCurrentCustomer(); return null; }
            window.setCurrentCustomer(c);
            return c;
        }).catch(function () { return cur; });
    };

    /* ============================================================
       LOYALTY — config + tier logic
       ============================================================ */
    var DEFAULT_LOYALTY = {
        enabled: true,
        earnRate: 1,        // points earned per 1 ₪ spent
        redeemValue: 0.1,   // ₪ value of 1 point when redeeming
        minRedeem: 100,     // minimum points before redemption allowed
        maxRedeemPercent: 30, // max % of order payable via points
        signupBonus: 50,
        tiers: [
            { id: 'silver', name: 'فضّي', min: 0, perkMultiplier: 1, freeDelivery: false },
            { id: 'gold', name: 'ذهبي', min: 500, perkMultiplier: 1.25, freeDelivery: false },
            { id: 'vip', name: 'VIP', min: 1500, perkMultiplier: 1.5, freeDelivery: true }
        ]
    };
    window.SH_DEFAULT_LOYALTY = DEFAULT_LOYALTY;

    var _loyaltyCache = null;
    window.shGetLoyaltyConfig = function () {
        if (_loyaltyCache) return Promise.resolve(_loyaltyCache);
        if (!window.db) return Promise.resolve(DEFAULT_LOYALTY);
        return window.db.collection('loyalty').doc('config').get().then(function (docSnap) {
            _loyaltyCache = docSnap.exists ? mergeLoyalty(docSnap.data()) : DEFAULT_LOYALTY;
            return _loyaltyCache;
        }).catch(function () { return DEFAULT_LOYALTY; });
    };
    // live subscribe (returns unsubscribe)
    window.shSubscribeLoyaltyConfig = function (cb) {
        if (!window.db) { cb(DEFAULT_LOYALTY); return function () {}; }
        return window.db.collection('loyalty').doc('config').onSnapshot(function (docSnap) {
            _loyaltyCache = docSnap.exists ? mergeLoyalty(docSnap.data()) : DEFAULT_LOYALTY;
            cb(_loyaltyCache);
        }, function () { cb(DEFAULT_LOYALTY); });
    };
    function mergeLoyalty(raw) {
        var c = {};
        for (var k in DEFAULT_LOYALTY) if (DEFAULT_LOYALTY.hasOwnProperty(k)) c[k] = DEFAULT_LOYALTY[k];
        for (var j in raw) if (raw.hasOwnProperty(j) && raw[j] != null) c[j] = raw[j];
        if (!Array.isArray(c.tiers) || !c.tiers.length) c.tiers = DEFAULT_LOYALTY.tiers;
        return c;
    }

    window.shComputeTier = function (lifetimePoints, cfg) {
        cfg = cfg || DEFAULT_LOYALTY;
        var tiers = cfg.tiers.slice().sort(function (a, b) { return a.min - b.min; });
        var current = tiers[0];
        for (var i = 0; i < tiers.length; i++) {
            if (lifetimePoints >= tiers[i].min) current = tiers[i];
        }
        // next tier + progress
        var next = null;
        for (var j = 0; j < tiers.length; j++) {
            if (tiers[j].min > current.min) { next = tiers[j]; break; }
        }
        return {
            id: current.id, name: current.name, current: current, next: next,
            progress: next ? Math.min(100, Math.round((lifetimePoints - current.min) / (next.min - current.min) * 100)) : 100
        };
    };

    // Atomic points mutation via transaction. delta may be +/-.
    // reason: 'order'|'redeem'|'signup'|'adjust'|'birthday'. Returns Promise<newCustomer>.
    window.shApplyPoints = function (customerId, delta, reason, meta) {
        if (!window.db) return Promise.reject(new Error('no db'));
        var ref = window.db.collection('customers').doc(customerId);
        return window.shGetLoyaltyConfig().then(function (cfg) {
            return window.db.runTransaction(function (tx) {
                return tx.get(ref).then(function (snap) {
                    if (!snap.exists) throw new Error('customer missing');
                    var c = snap.data();
                    var points = (c.points || 0) + delta;
                    if (points < 0) points = 0;
                    var lifetime = c.lifetimePoints || 0;
                    if (delta > 0) lifetime += delta;
                    var tier = window.shComputeTier(lifetime, cfg).id;
                    var now = new Date().toISOString();
                    var update = { points: points, lifetimePoints: lifetime, tier: tier, updatedAt: now };
                    if (meta && meta.spend) update.lifetimeSpend = (c.lifetimeSpend || 0) + meta.spend;
                    if (meta && meta.incOrders) update.ordersCount = (c.ordersCount || 0) + 1;
                    tx.update(ref, update);
                    tx.set(ref.collection('ledger').doc(), {
                        type: delta >= 0 ? 'earn' : 'redeem', reason: reason || 'adjust',
                        points: delta, balance: points, at: now,
                        note: (meta && meta.note) || '', orderId: (meta && meta.orderId) || ''
                    });
                    return { id: customerId, points: points, lifetimePoints: lifetime, tier: tier };
                });
            });
        });
    };

    /* ============================================================
       WORKER PERMISSION MODEL
       ============================================================ */
    // module keys map to admin tabs / capabilities
    var MODULES = [
        { key: 'dashboard', label: 'لوحة التحكم' },
        { key: 'products', label: 'المنتجات' },
        { key: 'sections', label: 'الأقسام' },
        { key: 'offers', label: 'العروض والخصومات' },
        { key: 'hero', label: 'السلايدر' },
        { key: 'orders', label: 'الطلبات' },
        { key: 'customers', label: 'العملاء' },
        { key: 'tickets', label: 'الدعم' },
        { key: 'loyalty', label: 'نقاط الولاء' },
        { key: 'workers', label: 'الموظفين' },
        { key: 'settings', label: 'الإعدادات' }
    ];
    window.SH_MODULES = MODULES;

    function fill(level, keys) {
        var p = {};
        MODULES.forEach(function (m) { p[m.key] = 'none'; });
        (keys || []).forEach(function (k) { p[k] = level; });
        return p;
    }
    function allPerms(level) {
        var p = {}; MODULES.forEach(function (m) { p[m.key] = level; }); return p;
    }

    var ROLE_PRESETS = {
        manager: {
            id: 'manager', name: 'مدير',
            desc: 'صلاحيات كاملة عدا إدارة الموظفين والإعدادات الحساسة',
            perms: (function () {
                var p = allPerms('write'); p.workers = 'none'; p.settings = 'read'; return p;
            })()
        },
        fulfillment: {
            id: 'fulfillment', name: 'موظف طلبات',
            desc: 'إدارة الطلبات ومتابعتها + عرض العملاء والدعم',
            perms: (function () {
                var p = fill('write', ['orders']);
                p.dashboard = 'read'; p.customers = 'read'; p.tickets = 'read';
                return p;
            })()
        },
        catalog: {
            id: 'catalog', name: 'محرّر المحتوى',
            desc: 'إدارة المنتجات والأقسام والسلايدر والعروض',
            perms: (function () {
                var p = fill('write', ['products', 'sections', 'hero', 'offers']);
                p.dashboard = 'read';
                return p;
            })()
        },
        support: {
            id: 'support', name: 'دعم فني',
            desc: 'إدارة تذاكر الدعم + عرض العملاء وحظرهم',
            perms: (function () {
                var p = fill('write', ['tickets']);
                p.dashboard = 'read'; p.customers = 'write';
                p.products = 'read';
                return p;
            })()
        },
        marketing: {
            id: 'marketing', name: 'تسويق',
            desc: 'العروض والأقسام والسلايدر ونقاط الولاء',
            perms: (function () {
                var p = fill('write', ['offers', 'sections', 'hero', 'loyalty']);
                p.dashboard = 'read';
                return p;
            })()
        }
    };
    window.SH_ROLE_PRESETS = ROLE_PRESETS;

    // owner = super admin; workers carry a perms map. Returns true if allowed.
    // level 'read' passes for read or write; 'write' requires write.
    window.shHasPerm = function (user, moduleKey, level) {
        if (!user) return false;
        if (user.owner || user.role === 'owner') return true;
        var p = (user.permissions || {})[moduleKey] || 'none';
        if (p === 'write') return true;
        if (p === 'read') return level !== 'write';
        return false;
    };
})();
