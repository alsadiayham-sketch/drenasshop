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
            html += '<div class="acc-head-id"><h2>' + esc(d.name) + '</h2><p class="acc-phone">' + esc(d.phone) + '</p></div>';
            html += '<button class="acc-logout" onclick="confirmLogout()" aria-label="تسجيل الخروج"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg><span>خروج</span></button></div>';

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
            html += '<button class="acc-tab" data-at="addresses" onclick="accTab(\'addresses\')">عناويني</button>';
            html += '<button class="acc-tab" data-at="cards" onclick="accTab(\'cards\')">بطاقاتي</button>';
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

    // Polished, intentional sign-out with a confirmation sheet.
    window.confirmLogout = function () {
        var host = document.getElementById('accountModalBody');
        if (!host) { window.logoutCustomer(); return; }
        var prev = document.getElementById('logoutConfirm');
        if (prev) prev.parentNode.removeChild(prev);
        var el = document.createElement('div');
        el.id = 'logoutConfirm';
        el.className = 'acc-confirm';
        el.innerHTML =
            '<div class="acc-confirm-sheet" role="dialog" aria-modal="true">' +
            '<div class="acc-confirm-icon"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg></div>' +
            '<h4>تسجيل الخروج؟</h4><p>سيتم إنهاء جلستك على هذا الجهاز. تبقى نقاطك وطلباتك محفوظة في حسابك.</p>' +
            '<div class="acc-confirm-actions"><button class="acc-btn-ghost" onclick="dismissLogout()">إلغاء</button>' +
            '<button class="acc-btn-danger" onclick="logoutCustomer()">تأكيد الخروج</button></div></div>';
        el.addEventListener('click', function (e) { if (e.target === el) window.dismissLogout(); });
        host.appendChild(el);
        void el.offsetWidth; el.classList.add('is-open');
    };
    window.dismissLogout = function () {
        var el = document.getElementById('logoutConfirm');
        if (!el) return;
        el.classList.remove('is-open');
        setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 220);
    };

    window.accTab = function (which) {
        var body = document.getElementById('accTabBody');
        var tabs = document.querySelectorAll('.acc-tab');
        for (var i = 0; i < tabs.length; i++) tabs[i].classList.toggle('active', tabs[i].getAttribute('data-at') === which);
        if (!body) return;
        var c = window.getCurrentCustomer();
        if (which === 'orders') { body.innerHTML = spinner(); loadMyOrders(body, c); }
        else if (which === 'wishlist') { renderWishlist(body, c); }
        else if (which === 'addresses') { renderAddresses(body, c); }
        else if (which === 'cards') { renderCards(body, c); }
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

    /* -------- Saved addresses -------- */
    var REGION_LABELS = { westbank: 'الضفة', jerusalem: 'القدس', inside: 'الداخل' };

    function renderAddresses(body, c) {
        var list = (window.getCurrentCustomer().addresses) || [];
        var html = '<div class="acc-panel-head"><p class="acc-panel-sub">عناوينك المحفوظة تُملأ تلقائياً عند إتمام الطلب.</p>' +
            '<button class="acc-add-btn" onclick="openAddrForm()">+ عنوان جديد</button></div>';
        if (!list.length) {
            html += empty('لا يوجد عناوين محفوظة', 'أضيفي عنواناً لتسريع الطلبات القادمة');
        } else {
            html += '<div class="acc-saved-list">';
            list.forEach(function (a) {
                html += '<div class="acc-saved-card">' +
                    '<div class="acc-saved-main"><div class="acc-saved-title">' + esc(a.label) +
                    (a.isDefault ? '<span class="acc-default-pill">افتراضي</span>' : '') + '</div>' +
                    '<div class="acc-saved-line">' + esc(REGION_LABELS[a.region] || '') + (a.city ? ' • ' + esc(a.city) : '') + '</div>' +
                    '<div class="acc-saved-line dim">' + esc(a.details) + (a.phone ? ' • ' + esc(a.phone) : '') + '</div></div>' +
                    '<div class="acc-saved-actions">' +
                    (a.isDefault ? '' : '<button class="acc-mini" onclick="setDefaultAddr(\'' + a.id + '\')">تعيين افتراضي</button>') +
                    '<button class="acc-mini" onclick="openAddrForm(\'' + a.id + '\')">تعديل</button>' +
                    '<button class="acc-mini danger" onclick="deleteAddr(\'' + a.id + '\')">حذف</button></div></div>';
            });
            html += '</div>';
        }
        body.innerHTML = html;
    }

    window.openAddrForm = function (id) {
        var list = (window.getCurrentCustomer().addresses) || [];
        var a = id ? list.filter(function (x) { return x.id === id; })[0] : null;
        a = a || { label: '', region: 'westbank', city: '', details: '', phone: '' };
        var body = document.getElementById('accTabBody');
        var regs = ['westbank', 'jerusalem', 'inside'];
        var opts = regs.map(function (r) { return '<option value="' + r + '"' + (a.region === r ? ' selected' : '') + '>' + REGION_LABELS[r] + '</option>'; }).join('');
        body.innerHTML = '<form class="acc-form" onsubmit="return saveAddr(event,' + (id ? '\'' + id + '\'' : 'null') + ')">' +
            '<div class="auth-field"><label>الاسم المختصر</label><input id="adLabel" type="text" value="' + esc(a.label) + '" placeholder="البيت، العمل..." required></div>' +
            '<div class="acc-form-row"><div class="auth-field"><label>المنطقة</label><select id="adRegion">' + opts + '</select></div>' +
            '<div class="auth-field"><label>المدينة</label><input id="adCity" type="text" value="' + esc(a.city) + '" placeholder="المدينة"></div></div>' +
            '<div class="auth-field"><label>تفاصيل العنوان</label><textarea id="adDetails" rows="2" placeholder="الحي، الشارع، أقرب معلم..." required>' + esc(a.details) + '</textarea></div>' +
            '<div class="auth-field"><label>هاتف للتواصل (اختياري)</label><input id="adPhone" type="tel" value="' + esc(a.phone || '') + '" placeholder="05xxxxxxxx"></div>' +
            '<div class="acc-form-actions"><button type="button" class="acc-btn-ghost" onclick="accTab(\'addresses\')">رجوع</button>' +
            '<button type="submit" class="btn-primary auth-submit">حفظ العنوان</button></div></form>';
    };
    window.saveAddr = function (e, id) {
        e.preventDefault();
        var c = window.getCurrentCustomer();
        var payload = {
            id: id || undefined,
            label: document.getElementById('adLabel').value,
            region: document.getElementById('adRegion').value,
            city: document.getElementById('adCity').value,
            details: document.getElementById('adDetails').value,
            phone: document.getElementById('adPhone').value
        };
        window.shSaveAddress(c.id, payload).then(function () {
            window.showToast('تم حفظ العنوان', 'success'); accTab('addresses');
        }).catch(function (err) { window.showToast(err.message || 'تعذر الحفظ', 'error'); });
        return false;
    };
    window.deleteAddr = function (id) {
        var c = window.getCurrentCustomer();
        window.shDeleteAddress(c.id, id).then(function () {
            window.showToast('تم حذف العنوان', 'info'); accTab('addresses');
        }).catch(function () { window.showToast('تعذر الحذف', 'error'); });
    };
    window.setDefaultAddr = function (id) {
        var c = window.getCurrentCustomer();
        window.shSetDefaultAddress(c.id, id).then(function () { accTab('addresses'); });
    };

    /* -------- Saved cards (display metadata only) -------- */
    function brandMark(brand) {
        return '<span class="acc-card-brand brand-' + esc(brand) + '">' + esc(window.shCardBrandLabel(brand)) + '</span>';
    }
    function renderCards(body, c) {
        var list = (window.getCurrentCustomer().cards) || [];
        var html = '<div class="acc-panel-head"><p class="acc-panel-sub">بطاقاتك محفوظة للعرض فقط — تتم المعالجة بأمان عبر بوابة البنك.</p>' +
            '<button class="acc-add-btn" onclick="openCardForm()">+ بطاقة جديدة</button></div>';
        if (!list.length) {
            html += empty('لا توجد بطاقات محفوظة', 'أضيفي بطاقة لإتمام الدفع بشكل أسرع');
        } else {
            html += '<div class="acc-cards-grid">';
            list.forEach(function (cd) {
                html += '<div class="acc-pay-card brand-' + esc(cd.brand) + '">' +
                    '<div class="acc-pay-top">' + brandMark(cd.brand) + (cd.isDefault ? '<span class="acc-default-pill light">افتراضي</span>' : '') + '</div>' +
                    '<div class="acc-pay-num">•••• •••• •••• ' + esc(cd.last4) + '</div>' +
                    '<div class="acc-pay-foot"><span>' + esc(cd.holder || '') + '</span><span>' + esc((cd.expMonth || '') + '/' + (cd.expYear || '')) + '</span></div>' +
                    '<div class="acc-pay-actions">' +
                    (cd.isDefault ? '' : '<button class="acc-mini" onclick="setDefaultCard(\'' + cd.id + '\')">افتراضي</button>') +
                    '<button class="acc-mini danger" onclick="deleteCard(\'' + cd.id + '\')">حذف</button></div></div>';
            });
            html += '</div>';
        }
        body.innerHTML = html;
    }
    window.openCardForm = function () {
        var body = document.getElementById('accTabBody');
        var years = [];
        var y = new Date().getFullYear();
        for (var i = 0; i < 9; i++) years.push(String((y + i) % 100).padStart(2, '0'));
        var months = [];
        for (var m = 1; m <= 12; m++) months.push(('0' + m).slice(-2));
        body.innerHTML = '<form class="acc-form" onsubmit="return saveCard(event)">' +
            '<div class="acc-secure-note"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> لا نحفظ رقم بطاقتك كاملاً — فقط آخر 4 أرقام للعرض.</div>' +
            '<div class="auth-field"><label>اسم حامل البطاقة</label><input id="cdHolder" type="text" placeholder="كما هو مكتوب على البطاقة" required></div>' +
            '<div class="auth-field"><label>رقم البطاقة</label><input id="cdNumber" type="tel" inputmode="numeric" maxlength="19" placeholder="0000 0000 0000 0000" oninput="fmtCardInput(this)" required></div>' +
            '<div class="acc-form-row"><div class="auth-field"><label>الشهر</label><select id="cdMonth">' + months.map(function (mm) { return '<option>' + mm + '</option>'; }).join('') + '</select></div>' +
            '<div class="auth-field"><label>السنة</label><select id="cdYear">' + years.map(function (yy) { return '<option>' + yy + '</option>'; }).join('') + '</select></div></div>' +
            '<div class="acc-form-actions"><button type="button" class="acc-btn-ghost" onclick="accTab(\'cards\')">رجوع</button>' +
            '<button type="submit" class="btn-primary auth-submit">حفظ البطاقة</button></div></form>';
    };
    window.fmtCardInput = function (el) {
        var v = el.value.replace(/[^\d]/g, '').slice(0, 16);
        el.value = v.replace(/(.{4})/g, '$1 ').trim();
    };
    window.saveCard = function (e) {
        e.preventDefault();
        var c = window.getCurrentCustomer();
        var payload = {
            number: document.getElementById('cdNumber').value,
            holder: document.getElementById('cdHolder').value,
            expMonth: document.getElementById('cdMonth').value,
            expYear: document.getElementById('cdYear').value
        };
        window.shSaveCard(c.id, payload).then(function () {
            window.showToast('تم حفظ البطاقة', 'success'); accTab('cards');
        }).catch(function (err) { window.showToast(err.message || 'تعذر الحفظ', 'error'); });
        return false;
    };
    window.deleteCard = function (id) {
        var c = window.getCurrentCustomer();
        window.shDeleteCard(c.id, id).then(function () {
            window.showToast('تم حذف البطاقة', 'info'); accTab('cards');
        }).catch(function () { window.showToast('تعذر الحذف', 'error'); });
    };
    window.setDefaultCard = function (id) {
        var c = window.getCurrentCustomer();
        window.shSetDefaultCard(c.id, id).then(function () { accTab('cards'); });
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
