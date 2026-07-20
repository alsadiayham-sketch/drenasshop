/* ============================================================
   account.js — Customer account + support UI (storefront)
   Requires shared.js (auth, loyalty, toast). ES5, RTL Arabic.
   ============================================================ */
(function () {
    'use strict';

    var loyaltyCfg = window.SH_DEFAULT_LOYALTY;

    document.addEventListener('DOMContentLoaded', function () {
        if (window.shSubscribeLoyaltyConfig) {
            window.shSubscribeLoyaltyConfig(function (cfg) { loyaltyCfg = cfg; });
        }
        refreshNav();
        // keep session fresh (points/tier/blocked)
        if (window.shRefreshCustomer) {
            window.shRefreshCustomer().then(function () { refreshNav(); });
        }
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') { closeAccount(); closeSupport(); }
        });
    });

    function refreshNav() {
        var c = window.getCurrentCustomer();
        var label = document.getElementById('accountIconLabel');
        var icon = document.getElementById('accountIcon');
        if (label) label.textContent = c ? firstName(c.name) : 'حسابي';
        if (icon) icon.classList.toggle('is-authed', !!c);
    }
    function firstName(n) { return String(n || '').split(' ')[0] || 'حسابي'; }

    /* -------------------- modal plumbing -------------------- */
    function openModal(id) {
        var m = document.getElementById(id);
        if (!m) return;
        m.style.display = 'flex';
        void m.offsetWidth;
        m.classList.add('is-open');
        document.body.style.overflow = 'hidden';
    }
    function closeModal(id) {
        var m = document.getElementById(id);
        if (!m) return;
        m.classList.remove('is-open');
        document.body.style.overflow = '';
        setTimeout(function () { if (!m.classList.contains('is-open')) m.style.display = 'none'; }, 260);
    }

    /* ==================== ACCOUNT ==================== */
    window.openAccount = function () {
        var c = window.getCurrentCustomer();
        if (c) renderDashboard(); else renderAuth('login');
        openModal('accountModal');
    };
    window.closeAccount = function (e) {
        if (e && e.target && e.target.id !== 'accountModal') return;
        closeModal('accountModal');
    };

    function renderAuth(mode) {
        var body = document.getElementById('accountModalBody');
        if (!body) return;
        var isLogin = mode !== 'register';
        var html = '';
        html += '<div class="auth-head"><div class="auth-logo"><img src="logo.png" alt="Enas Shop"></div>';
        html += '<h2>' + (isLogin ? 'أهلاً بعودتك' : 'أنشئي حسابك') + '</h2>';
        html += '<p>' + (isLogin ? 'سجّلي الدخول لمتابعة طلباتك ونقاط الولاء' : 'انضمّي واحصلي على نقاط ولاء ومزايا حصرية') + '</p></div>';
        html += '<div class="auth-tabs"><button type="button" class="auth-tab' + (isLogin ? ' active' : '') + '" onclick="switchAuth(\'login\')">تسجيل الدخول</button>';
        html += '<button type="button" class="auth-tab' + (!isLogin ? ' active' : '') + '" onclick="switchAuth(\'register\')">حساب جديد</button></div>';
        html += '<form class="auth-form" id="authForm" onsubmit="return submitAuth(event,\'' + (isLogin ? 'login' : 'register') + '\')">';
        if (!isLogin) {
            html += field('text', 'authName', 'الاسم الكامل', 'مثال: إيناس محمد', true);
        }
        html += field(isLogin ? 'text' : 'tel', 'authIdentifier', isLogin ? 'الهاتف أو البريد الإلكتروني' : 'رقم الهاتف', isLogin ? '05x أو you@mail.com' : '059xxxxxxx', true);
        if (!isLogin) {
            html += field('email', 'authEmail', 'البريد الإلكتروني (اختياري)', 'you@mail.com', false);
        }
        html += '<div class="auth-field"><label>كلمة المرور</label><div class="auth-pass-wrap">' +
            '<input type="password" id="authPassword" placeholder="••••••" required>' +
            '<button type="button" class="auth-pass-toggle" onclick="togglePass()" aria-label="إظهار">👁</button></div></div>';
        html += '<button type="submit" class="btn-primary auth-submit" id="authSubmitBtn">' + (isLogin ? 'دخول' : 'إنشاء الحساب') + '</button>';
        html += '</form>';
        if (isLogin) html += '<p class="auth-switch-hint">ما عندك حساب؟ <a href="#" onclick="switchAuth(\'register\');return false;">أنشئي حساب</a></p>';
        else html += '<p class="auth-switch-hint">عندك حساب؟ <a href="#" onclick="switchAuth(\'login\');return false;">سجّلي الدخول</a></p>';
        body.innerHTML = html;
    }
    function field(type, id, label, ph, req) {
        return '<div class="auth-field"><label>' + label + '</label>' +
            '<input type="' + type + '" id="' + id + '" placeholder="' + ph + '"' + (req ? ' required' : '') + '></div>';
    }
    window.switchAuth = function (mode) { renderAuth(mode); };
    window.togglePass = function () {
        var i = document.getElementById('authPassword');
        if (i) i.type = i.type === 'password' ? 'text' : 'password';
    };

    window.submitAuth = function (e, mode) {
        e.preventDefault();
        var btn = document.getElementById('authSubmitBtn');
        var pass = document.getElementById('authPassword').value;
        btn.disabled = true; var orig = btn.textContent; btn.textContent = 'جاري المعالجة...';
        var done = function () { btn.disabled = false; btn.textContent = orig; };
        var p;
        if (mode === 'register') {
            p = window.shRegisterCustomer({
                name: document.getElementById('authName').value,
                phone: document.getElementById('authIdentifier').value,
                email: (document.getElementById('authEmail') || {}).value || '',
                password: pass
            });
        } else {
            p = window.shLoginCustomer(document.getElementById('authIdentifier').value, pass);
        }
        p.then(function (c) {
            refreshNav();
            window.showToast(mode === 'register' ? 'تم إنشاء حسابك بنجاح 🎉' : 'أهلاً ' + firstName(c.name), 'success');
            renderDashboard();
        }).catch(function (err) {
            window.showToast(err.message || 'حدث خطأ، حاولي مجدداً', 'error');
            done();
        });
        return false;
    };

    function renderDashboard() {
        var c = window.getCurrentCustomer();
        if (!c) { renderAuth('login'); return; }
        var body = document.getElementById('accountModalBody');
        // pull fresh doc for accurate points
        window.db.collection('customers').doc(c.id).get().then(function (snap) {
            var d = snap.exists ? snap.data() : c; d.id = c.id;
            if (d.blocked) { window.clearCurrentCustomer(); refreshNav(); renderAuth('login'); window.showToast('تم حظر حسابك', 'error'); return; }
            window.setCurrentCustomer(d);
            var tier = window.shComputeTier(d.lifetimePoints || 0, loyaltyCfg);
            var pts = d.points || 0;
            var redeemVal = (loyaltyCfg.redeemValue || 0.1) * pts;
            var html = '';
            html += '<div class="acc-head"><div class="acc-avatar">' + esc(firstName(d.name).charAt(0)) + '</div>';
            html += '<div><h2>' + esc(d.name) + '</h2><p class="acc-phone">' + esc(d.phone) + '</p></div>';
            html += '<button class="acc-logout" onclick="logoutCustomer()">خروج</button></div>';

            if (loyaltyCfg.enabled) {
                html += '<div class="loyalty-card tier-' + tier.id + '">';
                html += '<div class="loyalty-card-top"><span class="loyalty-tier-badge">' + esc(tier.name) + '</span>';
                html += '<span class="loyalty-points"><b id="loyaltyPointsNum">0</b> نقطة</span></div>';
                html += '<div class="loyalty-redeem-hint">تعادل خصم ' + window.formatCurrency(Math.round(redeemVal)) + ' عند الشراء</div>';
                if (tier.next) {
                    html += '<div class="loyalty-progress"><div class="loyalty-progress-bar" style="width:' + tier.progress + '%"></div></div>';
                    html += '<div class="loyalty-next">باقي ' + Math.max(0, tier.next.min - (d.lifetimePoints || 0)) + ' نقطة للوصول إلى ' + esc(tier.next.name) + '</div>';
                } else {
                    html += '<div class="loyalty-next">وصلتِ إلى أعلى مستوى 🏆</div>';
                }
                html += '</div>';
            }

            html += '<div class="acc-tabs">';
            html += '<button class="acc-tab active" data-at="orders" onclick="accTab(\'orders\')">طلباتي</button>';
            html += '<button class="acc-tab" data-at="wishlist" onclick="accTab(\'wishlist\')">المفضلة</button>';
            html += '<button class="acc-tab" data-at="tickets" onclick="accTab(\'tickets\')">تذاكر الدعم</button>';
            html += '<button class="acc-tab" data-at="profile" onclick="accTab(\'profile\')">الملف</button>';
            html += '</div>';
            html += '<div class="acc-tab-body" id="accTabBody"></div>';
            body.innerHTML = html;

            if (loyaltyCfg.enabled) animateCount('loyaltyPointsNum', pts);
            accTab('orders');
        }).catch(function () {
            window.showToast('تعذر تحميل الحساب', 'error');
        });
    }

    window.logoutCustomer = function () {
        window.clearCurrentCustomer(); refreshNav();
        window.showToast('تم تسجيل الخروج', 'info');
        renderAuth('login');
    };

    window.accTab = function (which) {
        var body = document.getElementById('accTabBody');
        var tabs = document.querySelectorAll('.acc-tab');
        for (var i = 0; i < tabs.length; i++) tabs[i].classList.toggle('active', tabs[i].getAttribute('data-at') === which);
        if (!body) return;
        var c = window.getCurrentCustomer();
        if (which === 'orders') { body.innerHTML = spinner(); loadMyOrders(body, c); }
        else if (which === 'wishlist') { renderWishlist(body, c); }
        else if (which === 'tickets') { body.innerHTML = spinner(); loadMyTickets(body, c); }
        else if (which === 'profile') { renderProfile(body, c); }
    };

    function loadMyOrders(body, c) {
        window.db.collection('orders').where('customerPhone', '==', c.phone).get().then(function (snap) {
            var orders = [];
            snap.forEach(function (d) { var o = d.data(); o.id = d.id; orders.push(o); });
            orders.sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
            if (!orders.length) { body.innerHTML = empty('لا يوجد طلبات بعد', 'ابدئي التسوّق واستمتعي بنقاط الولاء'); return; }
            var html = '<div class="acc-orders">';
            orders.forEach(function (o) {
                html += '<div class="acc-order"><div class="acc-order-top"><span class="acc-order-id">' + esc(o.id) + '</span>' +
                    statusPill(o.status) + '</div>' +
                    '<div class="acc-order-meta">' + fmtDate(o.date) + ' • ' + (o.items ? o.items.length : 0) + ' منتج</div>' +
                    '<div class="acc-order-total">' + (o.totalDisplay || window.formatCurrency(o.total || 0)) + '</div></div>';
            });
            html += '</div>';
            body.innerHTML = html;
        }).catch(function () { body.innerHTML = empty('تعذر تحميل الطلبات', ''); });
    }

    function renderWishlist(body, c) {
        var ids = (window.getCurrentCustomer().wishlist) || [];
        if (!ids.length) { body.innerHTML = empty('قائمة المفضلة فارغة', 'اضغطي على القلب لإضافة منتجاتك المفضلة'); return; }
        var list = (window.products || []).filter(function (p) { return ids.indexOf(String(p.id)) >= 0 || ids.indexOf(p.id) >= 0; });
        if (!list.length) { body.innerHTML = empty('قائمة المفضلة فارغة', ''); return; }
        var html = '<div class="acc-wishlist">';
        list.forEach(function (p) {
            html += '<div class="acc-wish-item" onclick="closeAccount();openPDP(' + JSON.stringify(p.id) + ')">' +
                '<img src="' + (p.image || '') + '" alt="' + esc(p.name) + '" loading="lazy">' +
                '<div class="acc-wish-name">' + esc(p.name) + '</div></div>';
        });
        html += '</div>';
        body.innerHTML = html;
    }

    function renderProfile(body, c) {
        var d = window.getCurrentCustomer();
        var html = '<form class="acc-profile" onsubmit="return saveProfile(event)">';
        html += '<div class="auth-field"><label>الاسم</label><input type="text" id="pfName" value="' + esc(d.name) + '" required></div>';
        html += '<div class="auth-field"><label>الهاتف</label><input type="tel" id="pfPhone" value="' + esc(d.phone) + '" disabled></div>';
        html += '<div class="auth-field"><label>البريد الإلكتروني</label><input type="email" id="pfEmail" value="' + esc(d.email || '') + '" placeholder="you@mail.com"></div>';
        html += '<button type="submit" class="btn-primary auth-submit">حفظ التعديلات</button>';
        html += '</form>';
        body.innerHTML = html;
    }
    window.saveProfile = function (e) {
        e.preventDefault();
        var c = window.getCurrentCustomer();
        var name = document.getElementById('pfName').value.trim();
        var email = document.getElementById('pfEmail').value.trim().toLowerCase();
        window.db.collection('customers').doc(c.id).update({ name: name, email: email, updatedAt: new Date().toISOString() })
            .then(function () {
                c.name = name; c.email = email; window.setCurrentCustomer(c); refreshNav();
                window.showToast('تم حفظ التعديلات', 'success');
            }).catch(function () { window.showToast('تعذر الحفظ', 'error'); });
        return false;
    };

    /* -------- wishlist toggle (called from product cards/PDP) -------- */
    window.toggleWishlist = function (productId, ev) {
        if (ev) { ev.stopPropagation(); ev.preventDefault(); }
        var c = window.getCurrentCustomer();
        if (!c) { window.showToast('سجّلي الدخول لحفظ المفضلة', 'info'); openAccount(); return; }
        var pid = String(productId);
        var list = (c.wishlist || []).map(String);
        var idx = list.indexOf(pid);
        var added = idx < 0;
        if (added) list.push(pid); else list.splice(idx, 1);
        c.wishlist = list; window.setCurrentCustomer(c);
        syncWishHearts();
        window.db.collection('customers').doc(c.id).update({ wishlist: list }).catch(function () {});
        window.showToast(added ? 'أُضيف للمفضلة ❤' : 'أُزيل من المفضلة', added ? 'success' : 'info', 1600);
    };
    window.isWished = function (productId) {
        var c = window.getCurrentCustomer();
        if (!c || !c.wishlist) return false;
        return c.wishlist.map(String).indexOf(String(productId)) >= 0;
    };
    function syncWishHearts() {
        var hearts = document.querySelectorAll('[data-wish]');
        for (var i = 0; i < hearts.length; i++) {
            var on = window.isWished(hearts[i].getAttribute('data-wish'));
            hearts[i].classList.toggle('is-on', on);
            hearts[i].textContent = on ? '❤' : '♡';
        }
    }
    window.shSyncWishHearts = syncWishHearts;

    /* ==================== SUPPORT ==================== */
    window.openSupport = function () {
        var c = window.getCurrentCustomer();
        var body = document.getElementById('supportModalBody');
        var html = '';
        html += '<div class="auth-head"><h2>الدعم والمساعدة</h2><p>فريقنا جاهز لمساعدتك. اكتبي استفسارك وسنردّ في أقرب وقت.</p></div>';
        html += '<form class="auth-form" id="supportForm" onsubmit="return submitTicket(event)">';
        if (!c) {
            html += field('text', 'supName', 'الاسم', 'اسمك', true);
            html += field('tel', 'supPhone', 'رقم الهاتف', '059xxxxxxx', true);
        }
        html += '<div class="auth-field"><label>الموضوع</label><input type="text" id="supSubject" placeholder="مثال: استفسار عن طلب" required></div>';
        html += '<div class="auth-field"><label>رسالتك</label><textarea id="supMessage" rows="4" placeholder="اكتبي تفاصيل استفسارك..." required></textarea></div>';
        html += '<button type="submit" class="btn-primary auth-submit" id="supSubmitBtn">إرسال التذكرة</button>';
        html += '</form>';
        if (c) html += '<p class="auth-switch-hint">تابعي ردود الدعم من <a href="#" onclick="closeSupport();openAccount();setTimeout(function(){accTab(\'tickets\')},300);return false;">حسابك › تذاكر الدعم</a></p>';
        body.innerHTML = html;
        openModal('supportModal');
    };
    window.closeSupport = function (e) {
        if (e && e.target && e.target.id !== 'supportModal') return;
        closeModal('supportModal');
    };

    window.submitTicket = function (e) {
        e.preventDefault();
        var c = window.getCurrentCustomer();
        var btn = document.getElementById('supSubmitBtn');
        btn.disabled = true; var orig = btn.textContent; btn.textContent = 'جاري الإرسال...';
        var now = new Date().toISOString();
        var subject = document.getElementById('supSubject').value.trim();
        var message = document.getElementById('supMessage').value.trim();
        var ticket = {
            subject: subject,
            status: 'open',
            customerId: c ? c.id : '',
            name: c ? c.name : document.getElementById('supName').value.trim(),
            phone: c ? c.phone : window.shNormPhone(document.getElementById('supPhone').value),
            email: c ? (c.email || '') : '',
            assignedTo: '',
            unreadForAdmin: true,
            messages: [{ from: 'customer', text: message, at: now, by: (c ? c.name : 'عميل') }],
            createdAt: now, updatedAt: now
        };
        window.db.collection('tickets').add(ticket).then(function () {
            window.showToast('تم إرسال تذكرتك، سنتواصل معك قريباً 💬', 'success');
            closeSupport();
        }).catch(function () {
            window.showToast('تعذر الإرسال، حاولي مجدداً', 'error');
            btn.disabled = false; btn.textContent = orig;
        });
        return false;
    };

    function loadMyTickets(body, c) {
        window.db.collection('tickets').where('customerId', '==', c.id).get().then(function (snap) {
            var tickets = [];
            snap.forEach(function (d) { var t = d.data(); t.id = d.id; tickets.push(t); });
            tickets.sort(function (a, b) { return String(b.updatedAt).localeCompare(String(a.updatedAt)); });
            if (!tickets.length) {
                body.innerHTML = empty('لا يوجد تذاكر', 'هل تحتاجين مساعدة؟') +
                    '<button class="btn-primary auth-submit" onclick="closeAccount();openSupport()">فتح تذكرة جديدة</button>';
                return;
            }
            var html = '<div class="acc-tickets">';
            tickets.forEach(function (t) {
                var last = t.messages && t.messages.length ? t.messages[t.messages.length - 1] : null;
                html += '<div class="acc-ticket"><div class="acc-order-top"><span class="acc-order-id">' + esc(t.subject) + '</span>' + statusPill(t.status) + '</div>';
                html += '<div class="acc-ticket-thread">';
                (t.messages || []).forEach(function (m) {
                    html += '<div class="acc-msg ' + (m.from === 'staff' ? 'from-staff' : 'from-me') + '"><span>' + esc(m.text) + '</span><time>' + fmtDate(m.at) + '</time></div>';
                });
                html += '</div>';
                if (t.status !== 'closed') {
                    html += '<div class="acc-reply"><input type="text" id="reply-' + t.id + '" placeholder="ردّك..."><button onclick="replyTicket(\'' + t.id + '\')">إرسال</button></div>';
                }
                html += '</div>';
            });
            html += '</div><button class="btn-primary auth-submit" onclick="closeAccount();openSupport()">فتح تذكرة جديدة</button>';
            body.innerHTML = html;
        }).catch(function () { body.innerHTML = empty('تعذر تحميل التذاكر', ''); });
    }
    window.replyTicket = function (ticketId) {
        var input = document.getElementById('reply-' + ticketId);
        var text = input.value.trim();
        if (!text) return;
        var c = window.getCurrentCustomer();
        var ref = window.db.collection('tickets').doc(ticketId);
        var msg = { from: 'customer', text: text, at: new Date().toISOString(), by: c ? c.name : 'عميل' };
        ref.update({
            messages: window.dimaFirebase.FieldValue.arrayUnion(msg),
            updatedAt: new Date().toISOString(),
            status: 'open', unreadForAdmin: true
        }).then(function () { accTab('tickets'); }).catch(function () { window.showToast('تعذر الإرسال', 'error'); });
    };

    /* -------------------- helpers -------------------- */
    function esc(s) { return window.shEsc(s); }
    function spinner() { return '<div class="acc-spinner"><div class="spinner"></div></div>'; }
    function empty(title, sub) { return '<div class="acc-empty"><h4>' + esc(title) + '</h4>' + (sub ? '<p>' + esc(sub) + '</p>' : '') + '</div>'; }
    function statusPill(s) {
        var map = { new: ['جديد', 'new'], processing: ['قيد التجهيز', 'proc'], done: ['مكتمل', 'done'], completed: ['مكتمل', 'done'], cancelled: ['ملغي', 'cancel'], open: ['مفتوح', 'new'], pending: ['قيد المتابعة', 'proc'], closed: ['مغلق', 'done'] };
        var m = map[s] || [s || '—', 'new'];
        return '<span class="status-pill sp-' + m[1] + '">' + esc(m[0]) + '</span>';
    }
    function fmtDate(iso) {
        try { var d = new Date(iso); return d.toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' }); }
        catch (e) { return String(iso || '').split('T')[0]; }
    }
    function animateCount(id, target) {
        var el = document.getElementById(id); if (!el) return;
        if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = target; return; }
        var start = 0, dur = 900, t0 = null;
        function step(ts) {
            if (!t0) t0 = ts;
            var p = Math.min(1, (ts - t0) / dur);
            var eased = 1 - Math.pow(1 - p, 4);
            el.textContent = Math.round(start + (target - start) * eased);
            if (p < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
    }
    window.toggleBrowseAll = function () {
        var wrap = document.getElementById('browseAllWrap');
        var caret = document.getElementById('browseAllCaret');
        var btn = document.getElementById('browseAllBtn');
        if (!wrap) return;
        var show = wrap.hasAttribute('hidden');
        if (show) { wrap.removeAttribute('hidden'); if (caret) caret.textContent = '▴'; if (btn) btn.classList.add('is-open'); wrap.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
        else { wrap.setAttribute('hidden', ''); if (caret) caret.textContent = '▾'; if (btn) btn.classList.remove('is-open'); }
    };
})();
