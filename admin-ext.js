/* ============================================================
   admin-ext.js — Admin extensions for Enas Shop
   Sections, Customers (+block), Tickets, Workers (+roles/perms),
   Loyalty settings + order award, permission gating.
   Requires shared.js + admin.js globals (db, currentAdmin,
   setAdminStatus, setAdminLoading, closeModal, uploadToImgbb,
   products, formatCurrency). ES5, RTL.
   ============================================================ */
(function () {
    'use strict';

    var esc = window.escapeHtml || window.shEsc;
    var extCategories = [], extCustomers = [], extTickets = [], extWorkers = [];
    var extLoyalty = window.SH_DEFAULT_LOYALTY;
    var seedTried = false;
    var ticketFilter = 'open';
    var currentTicketId = null;
    var extUnsub = [];

    /* ---- module <-> tab map for gating ---- */
    var TAB_MODULE = {
        dashboard: 'dashboard', products: 'products', sections: 'sections', offers: 'offers',
        hero: 'hero', orders: 'orders', customers: 'customers', tickets: 'tickets',
        loyalty: 'loyalty', workers: 'workers', settings: 'settings'
    };

    function can(moduleKey, level) { return window.shHasPerm(window.currentAdmin, moduleKey, level || 'read'); }
    function requireWrite(moduleKey) {
        if (!can(moduleKey, 'write')) { window.setAdminStatus && window.setAdminStatus('ليس لديك صلاحية لهذا الإجراء.', 'error'); return false; }
        return true;
    }
    function openM(id) { document.getElementById(id).style.display = 'flex'; }

    /* ============================================================
       INIT + subscriptions
       ============================================================ */
    window.initAdminExt = function () {
        extUnsub.forEach(function (u) { if (typeof u === 'function') u(); });
        extUnsub = [];
        if (!window.db) return;

        extUnsub.push(db.collection('categories').orderBy('order', 'asc').onSnapshot(function (snap) {
            extCategories = snap.docs.map(function (d) { var c = d.data(); c.id = d.id; return c; });
            renderCategoriesList();
            maybeSeedCategories();
        }, function () {}));

        extUnsub.push(db.collection('customers').onSnapshot(function (snap) {
            extCustomers = snap.docs.map(function (d) { var c = d.data(); c.id = d.id; return c; });
            renderCustomersTable();
        }, function () {}));

        extUnsub.push(db.collection('tickets').onSnapshot(function (snap) {
            extTickets = snap.docs.map(function (d) { var t = d.data(); t.id = d.id; return t; });
            extTickets.sort(function (a, b) { return String(b.updatedAt).localeCompare(String(a.updatedAt)); });
            updateTicketBadge();
            renderTicketsList();
            if (currentTicketId) openTicket(currentTicketId, true);
        }, function () {}));

        extUnsub.push(db.collection('workers').onSnapshot(function (snap) {
            extWorkers = snap.docs.map(function (d) { var w = d.data(); w.id = d.id; return w; });
            renderWorkersTable();
        }, function () {}));

        if (window.shSubscribeLoyaltyConfig) {
            extUnsub.push(window.shSubscribeLoyaltyConfig(function (cfg) { extLoyalty = cfg; if (isActive('loyalty')) loadLoyaltyForm(); }));
        }
    };

    function isActive(tab) { var el = document.getElementById('tab-' + tab); return el && el.classList.contains('active'); }

    /* ============================================================
       PERMISSION GATING
       ============================================================ */
    window.applyPermissionGating = function () {
        var admin = window.currentAdmin || { owner: true };
        // user chip
        var chip = document.getElementById('adminUserChip');
        if (chip) {
            var roleName = admin.owner ? 'المالك' : ((window.SH_ROLE_PRESETS[admin.role] || {}).name || 'موظف');
            chip.innerHTML = '<span class="uc-name">' + esc(admin.name || '') + '</span><span class="uc-role">' + esc(roleName) + '</span>';
        }
        var firstVisible = null;
        var btns = document.querySelectorAll('.tab-btn[data-tab]');
        for (var i = 0; i < btns.length; i++) {
            var tab = btns[i].getAttribute('data-tab');
            var mod = TAB_MODULE[tab] || tab;
            var allowed = can(mod, 'read');
            btns[i].style.display = allowed ? '' : 'none';
            if (allowed && !firstVisible) firstVisible = { tab: tab, btn: btns[i] };
            // hide write-only actions when read-only
            if (allowed && !can(mod, 'write')) {
                var content = document.getElementById('tab-' + tab);
                if (content) {
                    var adds = content.querySelectorAll('.btn-add, .btn-save');
                    for (var k = 0; k < adds.length; k++) adds[k].style.display = 'none';
                }
            }
        }
        // if the active tab is now hidden, jump to first allowed
        var activeBtn = document.querySelector('.tab-btn.active');
        if (activeBtn && activeBtn.style.display === 'none' && firstVisible) {
            window.switchTab(firstVisible.tab, firstVisible.btn);
        }
    };

    /* ============================================================
       CATEGORIES (الفئات) — product types with image + description
       ============================================================ */
    var CAT_COVERS = window.SH_DEFAULT_CATEGORY_COVERS || [];

    function catCover(c, idx) {
        return (c && c.image) ? c.image : (CAT_COVERS[(idx || 0) % (CAT_COVERS.length || 1)] || '');
    }
    function productCountForCategory(name) {
        var n = 0;
        (window.products || []).forEach(function (p) { if (p.category === name) n++; });
        return n;
    }
    window.renderCategoriesList = function () {
        var host = document.getElementById('categoriesAdminList');
        if (!host) return;
        if (!extCategories.length) {
            host.innerHTML = emptyCard('لا توجد فئات بعد', 'أضيفي فئة يدوياً أو زامني الفئات من منتجاتك.');
            return;
        }
        var html = '';
        extCategories.forEach(function (c, idx) {
            var count = productCountForCategory(c.name);
            var desc = c.description ? esc(c.description) : '<span class="muted">بدون وصف</span>';
            html += '<div class="cat-admin-row">';
            html += '<div class="cat-row-move">' +
                '<button ' + (idx === 0 ? 'disabled' : '') + ' onclick="moveCategory(\'' + escJs(String(c.id)) + '\',-1)" title="أعلى" aria-label="نقل لأعلى">▲</button>' +
                '<button ' + (idx === extCategories.length - 1 ? 'disabled' : '') + ' onclick="moveCategory(\'' + escJs(String(c.id)) + '\',1)" title="أسفل" aria-label="نقل لأسفل">▼</button></div>';
            html += '<img class="cat-row-cover" src="' + esc(catCover(c, idx)) + '" alt="" loading="lazy">';
            html += '<div class="cat-row-info"><h4>' + esc(c.name) + '</h4>' +
                '<p class="cat-row-count">' + count + ' منتج</p>' +
                '<p class="cat-row-desc">' + desc + '</p></div>';
            html += '<div class="cat-row-actions">' +
                '<button class="mini-btn" onclick="editCategory(\'' + escJs(String(c.id)) + '\')">تعديل</button>' +
                '<button class="mini-btn danger" onclick="deleteCategory(\'' + escJs(String(c.id)) + '\')">حذف</button></div>';
            html += '</div>';
        });
        host.innerHTML = html;
        if (window.shSyncCategoryDatalist) window.shSyncCategoryDatalist(extCategories.map(function (c) { return c.name; }));
    };

    window.shSyncCategoryDatalist = function (managedNames) {
        var dl = document.getElementById('categoriesList');
        if (!dl) return;
        var all = uniq((managedNames || []).concat((window.products || []).map(function (p) { return p.category; })).filter(Boolean));
        dl.innerHTML = all.map(function (v) { return '<option value="' + esc(v) + '">'; }).join('');
    };

    function syncCategoriesFromProducts(silent) {
        if (!can('sections', 'write')) { if (!silent) setAdminStatus('ليس لديك صلاحية لهذا الإجراء.', 'error'); return; }
        var existing = {};
        extCategories.forEach(function (c) { existing[c.name] = true; });
        var names = uniq((window.products || []).map(function (p) { return p.category; }).filter(Boolean));
        var toAdd = names.filter(function (n) { return !existing[n]; });
        if (!toAdd.length) { if (!silent) setAdminStatus('كل الفئات مزامَنة بالفعل.', 'success'); return; }
        var batch = db.batch();
        var base = extCategories.length;
        toAdd.forEach(function (name, i) {
            var ref = db.collection('categories').doc();
            batch.set(ref, {
                name: name,
                image: CAT_COVERS[(base + i) % (CAT_COVERS.length || 1)] || '',
                description: '',
                order: base + i,
                createdAt: new Date().toISOString()
            });
        });
        batch.commit().then(function () {
            if (!silent) setAdminStatus('تمت مزامنة ' + toAdd.length + ' فئة من المنتجات.', 'success');
        }).catch(function (e) { if (!silent) setAdminStatus('تعذّرت المزامنة: ' + e.message, 'error'); });
    }
    window.syncCategoriesFromProducts = function () { syncCategoriesFromProducts(false); };

    function maybeSeedCategories() {
        if (seedTried || extCategories.length) return;
        if (!(window.products || []).length) return;
        if (!can('sections', 'write')) return;
        seedTried = true;
        syncCategoriesFromProducts(true);
    }

    window.openCategoryModal = function (cat) {
        if (!requireWrite('sections')) return;
        document.getElementById('categoryModalTitle').textContent = cat ? 'تعديل الفئة' : 'إضافة فئة';
        document.getElementById('categoryId').value = cat ? cat.id : '';
        document.getElementById('categoryName').value = cat ? cat.name : '';
        document.getElementById('categoryImage').value = cat ? (cat.image || '') : '';
        document.getElementById('categoryImageFile').value = '';
        document.getElementById('categoryDesc').value = cat ? (cat.description || '') : '';
        openM('categoryModal');
    };
    window.editCategory = function (id) { var c = extCategories.filter(function (x) { return x.id === id; })[0]; if (c) window.openCategoryModal(c); };

    window.saveCategory = function () {
        if (!requireWrite('sections')) return;
        var id = document.getElementById('categoryId').value;
        var existing = id ? extCategories.filter(function (x) { return x.id === id; })[0] : null;
        var oldName = existing ? existing.name : '';
        var data = {
            name: document.getElementById('categoryName').value.trim(),
            image: document.getElementById('categoryImage').value.trim(),
            description: document.getElementById('categoryDesc').value.trim()
        };
        if (!data.name) return alert('أدخلي اسم الفئة');
        setAdminLoading(true);
        var file = document.getElementById('categoryImageFile').files[0];
        var pre = file ? uploadToImgbb(file).then(function (url) { data.image = url; }) : Promise.resolve();
        pre.then(function () {
            if (id) {
                return db.collection('categories').doc(id).update(data).then(function () {
                    return renameProductsCategory(oldName, data.name);
                });
            }
            data.order = extCategories.length;
            data.createdAt = new Date().toISOString();
            return db.collection('categories').add(data);
        }).then(function () {
            setAdminLoading(false); setAdminStatus('تم حفظ الفئة.', 'success'); closeModal('categoryModal');
        }).catch(function (e) { setAdminLoading(false); setAdminStatus('تعذّر حفظ الفئة: ' + e.message, 'error'); });
    };

    function renameProductsCategory(oldName, newName) {
        if (!oldName || oldName === newName) return Promise.resolve();
        var affected = (window.products || []).filter(function (p) { return p.category === oldName; });
        if (!affected.length) return Promise.resolve();
        var batch = db.batch();
        affected.forEach(function (p) { batch.update(db.collection('products').doc(String(p.id)), { category: newName }); });
        return batch.commit();
    }

    window.deleteCategory = function (id) {
        if (!requireWrite('sections')) return;
        if (!confirm('حذف هذه الفئة؟ (لن تُحذف المنتجات المرتبطة بها)')) return;
        db.collection('categories').doc(id).delete().then(function () { setAdminStatus('تم حذف الفئة.', 'success'); });
    };

    window.moveCategory = function (id, dir) {
        if (!requireWrite('sections')) return;
        var idx = -1;
        for (var i = 0; i < extCategories.length; i++) if (extCategories[i].id === id) idx = i;
        var swap = idx + dir;
        if (idx < 0 || swap < 0 || swap >= extCategories.length) return;
        var a = extCategories[idx], b = extCategories[swap];
        var batch = db.batch();
        batch.update(db.collection('categories').doc(a.id), { order: swap });
        batch.update(db.collection('categories').doc(b.id), { order: idx });
        batch.commit();
    };

    /* ============================================================
       CUSTOMERS
       ============================================================ */
    window.renderCustomersTable = function () {
        var body = document.getElementById('customersTableBody');
        if (!body) return;
        var q = (document.getElementById('customerSearch') || {}).value || '';
        q = q.trim();
        var list = extCustomers.filter(function (c) {
            return !q || (c.name || '').indexOf(q) >= 0 || (c.phone || '').indexOf(q) >= 0;
        });
        list.sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); });
        var stat = document.getElementById('customersStat');
        if (stat) stat.textContent = extCustomers.length + ' عميل • ' + extCustomers.filter(function (c) { return c.blocked; }).length + ' محظور';
        if (!list.length) { body.innerHTML = '<tr><td colspan="7" class="td-empty">لا يوجد عملاء</td></tr>'; return; }
        var writable = can('customers', 'write');
        body.innerHTML = list.map(function (c) {
            var tier = window.shComputeTier(c.lifetimePoints || 0, extLoyalty);
            return '<tr' + (c.blocked ? ' class="row-blocked"' : '') + '>' +
                '<td>' + esc(c.name) + '</td>' +
                '<td dir="ltr">' + esc(c.phone) + '</td>' +
                '<td><b>' + (c.points || 0) + '</b></td>' +
                '<td><span class="tier-chip tier-' + tier.id + '">' + esc(tier.name) + '</span></td>' +
                '<td>' + (c.ordersCount || 0) + '</td>' +
                '<td>' + (c.blocked ? '<span class="status-tag blocked">محظور</span>' : '<span class="status-tag ok">نشِط</span>') + '</td>' +
                '<td class="row-actions">' +
                '<button class="mini-btn" onclick="openCustomer(\'' + c.id + '\')">تفاصيل</button>' +
                (writable ? '<button class="mini-btn ' + (c.blocked ? '' : 'danger') + '" onclick="toggleBlockCustomer(\'' + c.id + '\')">' + (c.blocked ? 'رفع الحظر' : 'حظر') + '</button>' : '') +
                '</td></tr>';
        }).join('');
    };

    window.openCustomer = function (id) {
        var c = extCustomers.filter(function (x) { return x.id === id; })[0]; if (!c) return;
        var tier = window.shComputeTier(c.lifetimePoints || 0, extLoyalty);
        var writable = can('customers', 'write');
        var html = '';
        html += '<div class="cust-detail">';
        html += '<div class="cust-row"><span>الاسم</span><b>' + esc(c.name) + '</b></div>';
        html += '<div class="cust-row"><span>الهاتف</span><b dir="ltr">' + esc(c.phone) + '</b></div>';
        html += '<div class="cust-row"><span>البريد</span><b dir="ltr">' + esc(c.email || '—') + '</b></div>';
        html += '<div class="cust-row"><span>النقاط الحالية</span><b>' + (c.points || 0) + '</b></div>';
        html += '<div class="cust-row"><span>إجمالي النقاط</span><b>' + (c.lifetimePoints || 0) + ' (' + esc(tier.name) + ')</b></div>';
        html += '<div class="cust-row"><span>عدد الطلبات</span><b>' + (c.ordersCount || 0) + '</b></div>';
        html += '<div class="cust-row"><span>الحالة</span><b>' + (c.blocked ? 'محظور' : 'نشِط') + '</b></div>';
        html += '</div>';
        if (writable) {
            html += '<div class="cust-adjust"><label>تعديل النقاط يدوياً</label>' +
                '<div class="cust-adjust-row"><input type="number" id="custAdjustPoints" placeholder="مثال: 100 أو 100-"><button class="mini-btn" onclick="adjustCustomerPoints(\'' + c.id + '\')">تطبيق</button></div></div>';
            html += '<div class="cust-modal-actions">' +
                '<button class="mini-btn ' + (c.blocked ? '' : 'danger') + '" onclick="toggleBlockCustomer(\'' + c.id + '\',true)">' + (c.blocked ? 'رفع الحظر' : 'حظر العميل') + '</button>' +
                '<button class="mini-btn danger" onclick="deleteCustomer(\'' + c.id + '\')">حذف الحساب</button></div>';
        }
        document.getElementById('customerModalBody').innerHTML = html;
        document.getElementById('customerModalTitle').textContent = 'العميل: ' + c.name;
        openM('customerModal');
    };
    window.toggleBlockCustomer = function (id, closeAfter) {
        if (!requireWrite('customers')) return;
        var c = extCustomers.filter(function (x) { return x.id === id; })[0]; if (!c) return;
        db.collection('customers').doc(id).update({ blocked: !c.blocked, updatedAt: new Date().toISOString() }).then(function () {
            setAdminStatus(c.blocked ? 'تم رفع الحظر.' : 'تم حظر العميل.', 'success');
            if (closeAfter) closeModal('customerModal');
        });
    };
    window.adjustCustomerPoints = function (id) {
        if (!requireWrite('customers')) return;
        var v = parseInt(document.getElementById('custAdjustPoints').value, 10);
        if (isNaN(v) || v === 0) return alert('أدخلي رقماً (موجب للإضافة، سالب للخصم)');
        window.shApplyPoints(id, v, 'adjust', { note: 'تعديل يدوي من الإدارة' }).then(function () {
            setAdminStatus('تم تعديل النقاط.', 'success'); closeModal('customerModal');
        }).catch(function (e) { setAdminStatus('تعذر التعديل: ' + e.message, 'error'); });
    };
    window.deleteCustomer = function (id) {
        if (!requireWrite('customers')) return;
        if (!confirm('حذف حساب العميل نهائياً؟')) return;
        db.collection('customers').doc(id).delete().then(function () { setAdminStatus('تم حذف الحساب.', 'success'); closeModal('customerModal'); });
    };

    /* ============================================================
       TICKETS
       ============================================================ */
    function updateTicketBadge() {
        var open = extTickets.filter(function (t) { return t.status !== 'closed' && t.unreadForAdmin; }).length;
        var badge = document.getElementById('ticketBadge');
        if (!badge) return;
        if (open > 0) { badge.textContent = open; badge.style.display = 'flex'; } else { badge.style.display = 'none'; }
    }
    window.filterTickets = function (f, btn) {
        ticketFilter = f;
        var chips = document.querySelectorAll('#ticketsFilter .chip');
        for (var i = 0; i < chips.length; i++) chips[i].classList.toggle('active', chips[i] === btn);
        renderTicketsList();
    };
    window.renderTicketsList = function () {
        var host = document.getElementById('ticketsList');
        if (!host) return;
        var list = extTickets.filter(function (t) {
            if (ticketFilter === 'open') return t.status !== 'closed';
            if (ticketFilter === 'closed') return t.status === 'closed';
            return true;
        });
        if (!list.length) { host.innerHTML = '<div class="ticket-empty">لا توجد تذاكر</div>'; return; }
        host.innerHTML = list.map(function (t) {
            var last = t.messages && t.messages.length ? t.messages[t.messages.length - 1].text : '';
            return '<div class="ticket-item' + (t.id === currentTicketId ? ' active' : '') + (t.unreadForAdmin && t.status !== 'closed' ? ' unread' : '') + '" onclick="openTicket(\'' + t.id + '\')">' +
                '<div class="ti-top"><b>' + esc(t.subject) + '</b>' + ticketPill(t.status) + '</div>' +
                '<div class="ti-name">' + esc(t.name || '') + ' • ' + esc(t.phone || '') + '</div>' +
                '<div class="ti-last">' + esc((last || '').substring(0, 60)) + '</div></div>';
        }).join('');
    };
    window.openTicket = function (id, keepScroll) {
        currentTicketId = id;
        var t = extTickets.filter(function (x) { return x.id === id; })[0];
        var host = document.getElementById('ticketDetail');
        if (!t) { host.innerHTML = '<div class="ticket-empty">التذكرة غير موجودة</div>'; return; }
        if (!keepScroll) renderTicketsList();
        if (t.unreadForAdmin) db.collection('tickets').doc(id).update({ unreadForAdmin: false }).catch(function () {});
        var writable = can('tickets', 'write');
        var workerOpts = ['<option value="">— غير مُعيّن —</option>'].concat(extWorkers.map(function (w) {
            return '<option value="' + w.id + '"' + (t.assignedTo === w.id ? ' selected' : '') + '>' + esc(w.name) + '</option>';
        })).join('');
        var html = '';
        html += '<div class="td-head"><div><h3>' + esc(t.subject) + '</h3><p>' + esc(t.name) + ' • <span dir="ltr">' + esc(t.phone) + '</span></p></div>' + ticketPill(t.status) + '</div>';
        if (writable) {
            html += '<div class="td-controls">' +
                '<select id="ticketAssign" onchange="assignTicket(\'' + id + '\')">' + workerOpts + '</select>' +
                (t.status === 'closed'
                    ? '<button class="mini-btn" onclick="setTicketStatus(\'' + id + '\',\'open\')">إعادة فتح</button>'
                    : '<button class="mini-btn" onclick="setTicketStatus(\'' + id + '\',\'pending\')">قيد المتابعة</button><button class="mini-btn danger" onclick="setTicketStatus(\'' + id + '\',\'closed\')">إغلاق</button>') +
                '</div>';
        }
        html += '<div class="td-thread" id="tdThread">';
        (t.messages || []).forEach(function (m) {
            html += '<div class="td-msg ' + (m.from === 'staff' ? 'staff' : 'cust') + '"><div class="td-msg-by">' + esc(m.by || (m.from === 'staff' ? 'الدعم' : 'العميل')) + '</div><div class="td-msg-text">' + esc(m.text) + '</div><time>' + fmtDate(m.at) + '</time></div>';
        });
        html += '</div>';
        if (writable && t.status !== 'closed') {
            html += '<div class="td-reply"><input type="text" id="ticketReplyInput" placeholder="اكتبي ردّك..." onkeydown="if(event.key===\'Enter\')replyTicketAdmin(\'' + id + '\')"><button class="btn-save" onclick="replyTicketAdmin(\'' + id + '\')">إرسال</button></div>';
        }
        host.innerHTML = html;
        var thread = document.getElementById('tdThread'); if (thread) thread.scrollTop = thread.scrollHeight;
    };
    window.replyTicketAdmin = function (id) {
        if (!requireWrite('tickets')) return;
        var input = document.getElementById('ticketReplyInput');
        var text = input.value.trim(); if (!text) return;
        var by = (window.currentAdmin && window.currentAdmin.name) || 'الدعم';
        var msg = { from: 'staff', text: text, at: new Date().toISOString(), by: by };
        db.collection('tickets').doc(id).update({
            messages: window.dimaFirebase.FieldValue.arrayUnion(msg),
            updatedAt: new Date().toISOString(), status: 'pending', unreadForAdmin: false
        }).then(function () { input.value = ''; });
    };
    window.assignTicket = function (id) {
        if (!requireWrite('tickets')) return;
        var val = document.getElementById('ticketAssign').value;
        db.collection('tickets').doc(id).update({ assignedTo: val });
    };
    window.setTicketStatus = function (id, status) {
        if (!requireWrite('tickets')) return;
        db.collection('tickets').doc(id).update({ status: status, updatedAt: new Date().toISOString() }).then(function () {
            setAdminStatus('تم تحديث حالة التذكرة.', 'success');
        });
    };
    function ticketPill(s) {
        var m = { open: ['مفتوح', 'new'], pending: ['قيد المتابعة', 'proc'], closed: ['مغلق', 'done'] }[s] || [s, 'new'];
        return '<span class="status-pill sp-' + m[1] + '">' + esc(m[0]) + '</span>';
    }

    /* ============================================================
       LOYALTY
       ============================================================ */
    window.loadLoyaltyForm = function () {
        var c = extLoyalty || window.SH_DEFAULT_LOYALTY;
        setVal('loyEnabled', c.enabled, true);
        setVal('loyEarnRate', c.earnRate);
        setVal('loyRedeemValue', c.redeemValue);
        setVal('loyMinRedeem', c.minRedeem);
        setVal('loyMaxPercent', c.maxRedeemPercent);
        setVal('loySignupBonus', c.signupBonus);
        renderTiersEditor(c.tiers || []);
    };
    function renderTiersEditor(tiers) {
        var host = document.getElementById('loyTiersEditor');
        if (!host) return;
        host.innerHTML = tiers.map(function (t, i) { return tierRow(t, i); }).join('');
    }
    function tierRow(t, i) {
        t = t || {};
        return '<div class="tier-row" data-tier>' +
            '<input class="t-name" placeholder="الاسم" value="' + esc(t.name || '') + '">' +
            '<input class="t-min" type="number" min="0" placeholder="أقل نقاط" value="' + (t.min || 0) + '">' +
            '<input class="t-mult" type="number" step="0.05" min="1" placeholder="مضاعف" value="' + (t.perkMultiplier || 1) + '">' +
            '<label class="t-free"><input type="checkbox" class="t-free-cb"' + (t.freeDelivery ? ' checked' : '') + '> توصيل مجاني</label>' +
            '<button type="button" class="mini-btn danger" onclick="this.parentNode.remove()">×</button></div>';
    }
    window.addTierRow = function () {
        var host = document.getElementById('loyTiersEditor');
        host.insertAdjacentHTML('beforeend', tierRow({ perkMultiplier: 1 }, host.children.length));
    };
    window.saveLoyaltyConfig = function () {
        if (!requireWrite('loyalty')) return;
        var tiers = [];
        var rows = document.querySelectorAll('#loyTiersEditor [data-tier]');
        for (var i = 0; i < rows.length; i++) {
            var r = rows[i];
            var name = r.querySelector('.t-name').value.trim();
            if (!name) continue;
            tiers.push({
                id: slug(name) || ('tier' + i),
                name: name,
                min: parseInt(r.querySelector('.t-min').value, 10) || 0,
                perkMultiplier: parseFloat(r.querySelector('.t-mult').value) || 1,
                freeDelivery: r.querySelector('.t-free-cb').checked
            });
        }
        if (!tiers.length) tiers = window.SH_DEFAULT_LOYALTY.tiers;
        var cfg = {
            enabled: document.getElementById('loyEnabled').checked,
            earnRate: parseFloat(document.getElementById('loyEarnRate').value) || 0,
            redeemValue: parseFloat(document.getElementById('loyRedeemValue').value) || 0,
            minRedeem: parseInt(document.getElementById('loyMinRedeem').value, 10) || 0,
            maxRedeemPercent: parseInt(document.getElementById('loyMaxPercent').value, 10) || 0,
            signupBonus: parseInt(document.getElementById('loySignupBonus').value, 10) || 0,
            tiers: tiers,
            updatedAt: new Date().toISOString()
        };
        setAdminLoading(true);
        db.collection('loyalty').doc('config').set(cfg).then(function () {
            setAdminLoading(false); setAdminStatus('تم حفظ إعدادات الولاء.', 'success');
        }).catch(function (e) { setAdminLoading(false); setAdminStatus('تعذر الحفظ: ' + e.message, 'error'); });
    };

    // called by admin.js when an order is marked completed
    window.awardLoyaltyForOrder = function (orderId) {
        return db.collection('orders').doc(orderId).get().then(function (snap) {
            if (!snap.exists) return;
            var o = snap.data();
            if (o.loyaltyAwarded) return;
            if (!extLoyalty || !extLoyalty.enabled) return;
            var total = o.total || 0;
            if (total <= 0) return;
            // find customer by id or phone
            var findC;
            if (o.customerId) findC = db.collection('customers').doc(o.customerId).get().then(function (s) { return s.exists ? s.id : null; });
            else findC = db.collection('customers').where('phone', '==', window.shNormPhone(o.customerPhone)).limit(1).get().then(function (s) { return s.empty ? null : s.docs[0].id; });
            return findC.then(function (cid) {
                if (!cid) return;
                var pts = Math.floor(total * (extLoyalty.earnRate || 1));
                if (pts <= 0) return;
                return window.shApplyPoints(cid, pts, 'order', { orderId: orderId, spend: total, incOrders: true }).then(function () {
                    return db.collection('orders').doc(orderId).update({ loyaltyAwarded: true, loyaltyPointsEarned: pts });
                });
            });
        });
    };

    /* ============================================================
       WORKERS
       ============================================================ */
    window.renderWorkersTable = function () {
        var body = document.getElementById('workersTableBody');
        if (!body) return;
        if (!extWorkers.length) { body.innerHTML = '<tr><td colspan="5" class="td-empty">لا يوجد موظفون بعد</td></tr>'; return; }
        body.innerHTML = extWorkers.map(function (w) {
            var roleName = (window.SH_ROLE_PRESETS[w.role] || {}).name || 'مخصّص';
            return '<tr>' +
                '<td>' + esc(w.name) + '</td>' +
                '<td dir="ltr">' + esc(w.username) + '</td>' +
                '<td>' + esc(roleName) + '</td>' +
                '<td>' + (w.active === false ? '<span class="status-tag blocked">معطّل</span>' : '<span class="status-tag ok">مفعّل</span>') + '</td>' +
                '<td class="row-actions">' +
                '<button class="mini-btn" onclick="editWorker(\'' + w.id + '\')">تعديل</button>' +
                '<button class="mini-btn" onclick="toggleWorkerActive(\'' + w.id + '\')">' + (w.active === false ? 'تفعيل' : 'تعطيل') + '</button>' +
                '<button class="mini-btn danger" onclick="deleteWorker(\'' + w.id + '\')">حذف</button></td></tr>';
        }).join('');
    };

    window.openWorkerModal = function (worker) {
        if (!requireWrite('workers')) return;
        document.getElementById('workerModalTitle').textContent = worker ? 'تعديل موظف' : 'إضافة موظف';
        document.getElementById('workerId').value = worker ? worker.id : '';
        document.getElementById('workerName').value = worker ? worker.name : '';
        document.getElementById('workerUsername').value = worker ? worker.username : '';
        document.getElementById('workerPassword').value = '';
        document.getElementById('workerPassHint').textContent = worker ? '(اتركيها فارغة للإبقاء على الحالية)' : '';
        document.getElementById('workerActive').checked = worker ? worker.active !== false : true;
        // role dropdown
        var roleSel = document.getElementById('workerRole');
        roleSel.innerHTML = '<option value="">مخصّص</option>' + Object.keys(window.SH_ROLE_PRESETS).map(function (k) {
            var r = window.SH_ROLE_PRESETS[k]; return '<option value="' + k + '">' + esc(r.name) + '</option>';
        }).join('');
        roleSel.value = worker ? (worker.role || '') : '';
        buildPermsGrid(worker ? worker.permissions : (worker && worker.role ? window.SH_ROLE_PRESETS[worker.role].perms : {}));
        openM('workerModal');
    };
    window.editWorker = function (id) { var w = extWorkers.filter(function (x) { return x.id === id; })[0]; if (w) openWorkerModal(w); };

    function buildPermsGrid(perms) {
        perms = perms || {};
        var host = document.getElementById('workerPermsGrid');
        var mods = window.SH_MODULES.filter(function (m) { return m.key !== 'workers'; });
        host.innerHTML = mods.map(function (m) {
            var cur = perms[m.key] || 'none';
            return '<div class="perm-row"><span>' + esc(m.label) + '</span>' +
                '<select data-perm="' + m.key + '">' +
                '<option value="none"' + (cur === 'none' ? ' selected' : '') + '>لا شيء</option>' +
                '<option value="read"' + (cur === 'read' ? ' selected' : '') + '>عرض</option>' +
                '<option value="write"' + (cur === 'write' ? ' selected' : '') + '>تعديل</option>' +
                '</select></div>';
        }).join('');
    }
    window.applyRolePreset = function () {
        var role = document.getElementById('workerRole').value;
        var preset = window.SH_ROLE_PRESETS[role];
        buildPermsGrid(preset ? preset.perms : {});
    };
    function collectPerms() {
        var perms = { workers: 'none' };
        var sels = document.querySelectorAll('#workerPermsGrid [data-perm]');
        for (var i = 0; i < sels.length; i++) perms[sels[i].getAttribute('data-perm')] = sels[i].value;
        return perms;
    }
    window.saveWorker = function () {
        if (!requireWrite('workers')) return;
        var id = document.getElementById('workerId').value;
        var name = document.getElementById('workerName').value.trim();
        var username = document.getElementById('workerUsername').value.trim().toLowerCase();
        var password = document.getElementById('workerPassword').value;
        var role = document.getElementById('workerRole').value;
        var active = document.getElementById('workerActive').checked;
        var perms = collectPerms();
        if (!name || !username) return alert('أدخلي الاسم واسم المستخدم');
        if (username === 'enas') return alert('اسم المستخدم محجوز');
        if (!id && password.length < 6) return alert('كلمة المرور 6 أحرف على الأقل');
        setAdminLoading(true);

        var dupCheck = db.collection('workers').where('username', '==', username).limit(1).get().then(function (snap) {
            if (!snap.empty && snap.docs[0].id !== id) throw new Error('اسم المستخدم مستخدم بالفعل');
        });

        dupCheck.then(function () {
            var base = { name: name, username: username, role: role, permissions: perms, active: active, updatedAt: new Date().toISOString() };
            if (password) {
                var salt = window.shRandomSalt();
                return window.shHashPassword(password, salt).then(function (hash) {
                    base.salt = salt; base.passHash = hash;
                    return persist(base);
                });
            }
            return persist(base);
        }).then(function () {
            setAdminLoading(false); setAdminStatus('تم حفظ الموظف.', 'success'); closeModal('workerModal');
        }).catch(function (e) { setAdminLoading(false); setAdminStatus('تعذر الحفظ: ' + e.message, 'error'); });

        function persist(base) {
            if (id) return db.collection('workers').doc(id).update(base);
            base.createdAt = new Date().toISOString();
            return db.collection('workers').add(base);
        }
    };
    window.toggleWorkerActive = function (id) {
        if (!requireWrite('workers')) return;
        var w = extWorkers.filter(function (x) { return x.id === id; })[0]; if (!w) return;
        db.collection('workers').doc(id).update({ active: w.active === false });
    };
    window.deleteWorker = function (id) {
        if (!requireWrite('workers')) return;
        if (!confirm('حذف هذا الموظف؟')) return;
        db.collection('workers').doc(id).delete().then(function () { setAdminStatus('تم حذف الموظف.', 'success'); });
    };

    /* ---------- helpers ---------- */
    function uniq(arr) { var o = {}, r = []; arr.forEach(function (x) { if (!o[x]) { o[x] = 1; r.push(x); } }); return r; }
    function setVal(id, v, isCheck) { var el = document.getElementById(id); if (!el) return; if (isCheck) el.checked = !!v; else el.value = v; }
    function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
    function fmtDate(iso) { try { return new Date(iso).toLocaleString('ar-EG', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } }
    function escJs(s) { return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }
    function emptyCard(title, sub) { return '<div class="ext-empty"><h4>' + esc(title) + '</h4><p>' + esc(sub) + '</p></div>'; }

    /* renderCategoriesList is exported directly on window above */
})();
