var ADMIN_USER = 'enas';
var ADMIN_PASS = '5555';
var FALLBACK_IMAGE = "data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%27400%27 height=%27400%27 viewBox=%270 0 400 400%27%3E%3Crect fill=%27%232C8C99%27 width=%27400%27 height=%27400%27/%3E%3Ctext fill=%27%23ffffff%27 font-family=%27Arial%27 font-size=%2740%27 x=%2750%2525%27 y=%2745%2525%27 text-anchor=%27middle%27%3E💆%3C/text%3E%3Ctext fill=%27%23ffffff%27 font-family=%27Arial%27 font-size=%2720%27 x=%2750%2525%27 y=%2760%2525%27 text-anchor=%27middle%27%3EEnas Shop%3C/text%3E%3C/svg%3E";

var products = [];
var discounts = [];
var orders = [];
var siteSettings = normalizeSettings(DEFAULT_SITE_SETTINGS);
var unsubscribers = [];
var charts = {};
var isInitializing = false;

var adminReady = {
    products: false,
    discounts: false,
    orders: false,
    settings: false
};

document.addEventListener('DOMContentLoaded', function () {
    if (sessionStorage.getItem('drenasshop_admin') === 'true') {
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('adminPanel').style.display = 'block';
        initializeAdmin();
    }
});

function setAdminLoading(loading) {
    var loader = document.getElementById('adminLoading');
    if (loader) loader.style.display = loading ? 'block' : 'none';
}

var _statusTimeout = null;
function setAdminStatus(message, type) {
    var status = document.getElementById('adminStatus');
    if (!status) return;
    if (_statusTimeout) clearTimeout(_statusTimeout);
    status.classList.remove('hidden');
    status.textContent = message;
    status.className = 'admin-status' + (type ? ' ' + type : '');
    if (type === 'success') {
        _statusTimeout = setTimeout(function () {
            status.style.opacity = '0';
            setTimeout(function () {
                status.textContent = '';
                status.className = 'admin-status hidden';
                status.style.opacity = '';
            }, 500);
        }, 5000);
    }
}

function handleLogin(event) {
    event.preventDefault();
    var user = document.getElementById('loginUser').value;
    var pass = document.getElementById('loginPass').value;
    if (user === ADMIN_USER && pass === ADMIN_PASS) {
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('adminPanel').style.display = 'block';
        sessionStorage.setItem('drenasshop_admin', 'true');
        initializeAdmin();
    } else {
        document.getElementById('loginError').textContent = 'اسم المستخدم أو كلمة المرور غير صحيحة';
    }
}

function logout() {
    sessionStorage.removeItem('drenasshop_admin');
    unsubscribers.forEach(function (unsubscribe) { if (typeof unsubscribe === 'function') unsubscribe(); });
    location.reload();
}

function switchTab(tab, button) {
    document.querySelectorAll('.tab-content').forEach(function (content) { content.classList.remove('active'); });
    document.querySelectorAll('.tab-btn').forEach(function (tabButton) { tabButton.classList.remove('active'); });
    document.getElementById('tab-' + tab).classList.add('active');
    if (button) button.classList.add('active');
    if (tab === 'dashboard') renderDashboard();
    if (tab === 'orders') renderOrdersTable();
}

async function initializeAdmin() {
    if (isInitializing) return;
    isInitializing = true;
    setAdminLoading(true);
    setAdminStatus('جاري مزامنة فايرستور...', '');

    if (!window.db) {
        setAdminLoading(false);
        setAdminStatus('تعذر تهيئة فايربيس. تأكدي من الاتصال بالإنترنت.', 'error');
        isInitializing = false;
        return;
    }

    try {
        await ensureSeedIfEmpty();
        subscribeToCollections();
    } catch (error) {
        console.error(error);
        setAdminStatus('حدث خطأ أثناء تحميل البيانات.', 'error');
        setAdminLoading(false);
    }

    isInitializing = false;
}

async function ensureSeedIfEmpty() {
    var snapshot = await db.collection('products').limit(1).get();
    if (snapshot.empty) {
        setAdminStatus('المتجر فارغ، جاري تنفيذ Seed Data تلقائياً...', 'warning');
        await seedFirestoreData(false);
    }
}

function subscribeToCollections() {
    unsubscribers.forEach(function (unsubscribe) { if (typeof unsubscribe === 'function') unsubscribe(); });
    unsubscribers = [];

    subscribeToHero();

    unsubscribers.push(db.collection('products').onSnapshot(function (snapshot) {
        products = snapshot.docs.map(function (docSnap) { var d = docSnap.data(); d.id = docSnap.id; return normalizeProduct(d); });
        adminReady.products = true;
        renderProductsTable();
        renderDiscountValueOptions();
        checkAdminReady();
    }, function (error) {
        console.error(error);
        setAdminStatus('تعذر تحميل المنتجات.', 'error');
        setAdminLoading(false);
    }));

    unsubscribers.push(db.collection('discounts').onSnapshot(function (snapshot) {
        discounts = snapshot.docs.map(function (docSnap) { return normalizeDiscount(docSnap.data()); });
        adminReady.discounts = true;
        renderDiscountsTable();
        checkAdminReady();
    }, function (error) {
        console.error(error);
        setAdminStatus('تعذر تحميل الخصومات.', 'error');
        setAdminLoading(false);
    }));

    unsubscribers.push(db.collection('orders').orderBy('date', 'desc').onSnapshot(function (snapshot) {
        orders = snapshot.docs.map(function (docSnap) {
            var data = docSnap.data();
            data._docId = docSnap.id;
            return data;
        });
        adminReady.orders = true;
        renderOrdersTable();
        renderDashboard();
        checkAdminReady();
    }, function (error) {
        console.error(error);
        setAdminStatus('تعذر تحميل الطلبات.', 'error');
        setAdminLoading(false);
    }));

    unsubscribers.push(db.collection('settings').doc('config').onSnapshot(function (docSnap) {
        siteSettings = normalizeSettings(docSnap.exists ? docSnap.data() : DEFAULT_SITE_SETTINGS);
        adminReady.settings = true;
        loadSettingsForm();
        checkAdminReady();
    }, function (error) {
        console.error(error);
        setAdminStatus('تعذر تحميل الإعدادات.', 'error');
        setAdminLoading(false);
    }));
}

function checkAdminReady() {
    if (adminReady.products && adminReady.discounts && adminReady.orders && adminReady.settings) {
        setAdminLoading(false);
        setAdminStatus('تمت مزامنة البيانات بنجاح.', 'success');
    }
}

function renderProductsTable() {
    var tbody = document.getElementById('productsTableBody');
    var statusLabels = { normal: 'عادي', bestseller: 'الأكثر مبيعاً', special: 'مميز', soldout: 'نفذت الكمية' };
    if (!products.length) {
        tbody.innerHTML = '<tr><td colspan="10" class="empty-state">لا توجد منتجات حالياً.</td></tr>';
        return;
    }

    tbody.innerHTML = products.map(function (product) {
        return '<tr><td><input type="checkbox" class="product-select" value="' + product.id + '" onchange="updateBulkBar()"></td><td><img src="' + product.image + '" alt="' + product.name + '" onerror="this.src=\'' + FALLBACK_IMAGE + '\'"></td><td>' + product.name + '</td><td>' + product.brand + '</td><td>' + product.category + '</td><td>' + formatSizes(product) + '</td><td>' + formatPrices(product) + '</td><td>' + (product.discount ? product.discount + '%' : '-') + '</td><td><span class="status-tag ' + (product.status || 'normal') + '">' + statusLabels[product.status || 'normal'] + '</span></td><td class="actions"><button class="btn-edit" onclick="editProduct(' + product.id + ')">تعديل</button><button class="btn-delete" onclick="deleteProduct(' + product.id + ')">حذف</button></td></tr>';
    }).join('');
    updateBulkBar();
}

function getSelectedProductIds() {
    var checkboxes = document.querySelectorAll('.product-select:checked');
    var ids = [];
    for (var i = 0; i < checkboxes.length; i++) {
        ids.push(checkboxes[i].value);
    }
    return ids;
}

function toggleSelectAll(masterCheckbox) {
    var checkboxes = document.querySelectorAll('.product-select');
    for (var i = 0; i < checkboxes.length; i++) {
        checkboxes[i].checked = masterCheckbox.checked;
    }
    updateBulkBar();
}

function updateBulkBar() {
    var selected = getSelectedProductIds();
    var bar = document.getElementById('bulkActionsBar');
    var count = document.getElementById('bulkSelectedCount');
    if (selected.length > 0) {
        bar.style.display = 'flex';
        count.textContent = selected.length;
    } else {
        bar.style.display = 'none';
    }
}

async function bulkChangeStatus() {
    var ids = getSelectedProductIds();
    var status = document.getElementById('bulkStatusSelect').value;
    if (!ids.length || !status) return;
    var batch = db.batch();
    ids.forEach(function (id) {
        batch.update(db.collection('products').doc(String(id)), { status: status });
    });
    await batch.commit();
    document.getElementById('bulkStatusSelect').value = '';
}

async function bulkApplyDiscount() {
    var ids = getSelectedProductIds();
    var discount = parseInt(document.getElementById('bulkDiscountInput').value, 10);
    if (!ids.length || isNaN(discount) || discount < 0 || discount > 99) return;
    var batch = db.batch();
    ids.forEach(function (id) {
        batch.update(db.collection('products').doc(String(id)), { discount: discount });
    });
    await batch.commit();
    document.getElementById('bulkDiscountInput').value = '';
}

async function bulkDeleteProducts() {
    var ids = getSelectedProductIds();
    if (!ids.length) return;
    if (!confirm('هل تريد حذف ' + ids.length + ' منتج؟')) return;
    var batch = db.batch();
    ids.forEach(function (id) {
        batch.delete(db.collection('products').doc(String(id)));
    });
    await batch.commit();
    var selectAll = document.getElementById('selectAllProducts');
    if (selectAll) selectAll.checked = false;
}

function formatSizes(product) {
    return product.sizes.map(function (size) { return getSizeLabel(size); }).join(' / ');
}

function formatPrices(product) {
    var prices = product.sizes.map(function (size) { return size.price; });
    if (!prices.length) return '-';
    if (prices.length === 1) return formatCurrency(prices[0]);
    return formatCurrency(Math.min.apply(null, prices)) + ' - ' + formatCurrency(Math.max.apply(null, prices));
}

function createEmptySize() { return { size: 'واحد', unit: 'قطعة', price: '' }; }

function addSizeRow(sizeData) {
    var safeSize = sizeData || createEmptySize();
    var container = document.getElementById('sizesContainer');
    var row = document.createElement('div');
    row.className = 'size-row';
    row.innerHTML = '<input type="text" class="size-value" placeholder="الحجم أو النوع" value="' + safeSize.size + '"><select class="size-unit"><option value="قطعة" ' + (safeSize.unit === 'قطعة' ? 'selected' : '') + '>قطعة</option><option value="ml" ' + (safeSize.unit === 'ml' ? 'selected' : '') + '>مل (ml)</option><option value="g" ' + (safeSize.unit === 'g' ? 'selected' : '') + '>غرام (g)</option></select><input type="number" class="size-price" min="0" placeholder="السعر ₪" value="' + safeSize.price + '"><button type="button" class="btn-remove-size" onclick="removeSizeRow(this)">حذف</button>';
    container.appendChild(row);
}

function removeSizeRow(button) {
    var container = document.getElementById('sizesContainer');
    if (container.children.length === 1) return;
    button.closest('.size-row').remove();
}

function renderSizeRows(sizes) {
    var container = document.getElementById('sizesContainer');
    container.innerHTML = '';
    (sizes && sizes.length ? sizes : [createEmptySize()]).forEach(function (size) { addSizeRow(size); });
}

function openProductModal(product) {
    document.getElementById('productModalTitle').textContent = product ? 'تعديل المنتج' : 'إضافة منتج جديد';
    document.getElementById('productId').value = product ? product.id : '';
    document.getElementById('productName').value = product ? product.name : '';
    document.getElementById('productBrand').value = product ? product.brand : '';
    document.getElementById('productCategory').value = product ? product.category : '';
    document.getElementById('productDiscount').value = product ? product.discount : 0;
    document.getElementById('productImage').value = product ? product.image : '';
    document.getElementById('productImageFile').value = '';
    document.getElementById('imagePreview').innerHTML = product && product.image ? '<img src="' + product.image + '" onerror="this.style.display=\'none\'">' : '';
    document.getElementById('productStatus').value = product ? product.status : 'normal';
    renderSizeRows(product ? product.sizes : [createEmptySize()]);
    document.getElementById('brandsList').innerHTML = Array.from(new Set(products.map(function (entry) { return entry.brand; }))).map(function (brand) { return '<option value="' + brand + '">'; }).join('');
    document.getElementById('categoriesList').innerHTML = Array.from(new Set(products.map(function (entry) { return entry.category; }))).map(function (category) { return '<option value="' + category + '">'; }).join('');
    document.getElementById('productModal').style.display = 'flex';
}

function editProduct(id) {
    var product = products.find(function (entry) { return entry.id === id; });
    if (product) openProductModal(product);
}

function collectSizes() {
    return Array.from(document.querySelectorAll('#sizesContainer .size-row')).map(function (row) {
        return {
            size: row.querySelector('.size-value').value.trim(),
            unit: row.querySelector('.size-unit').value,
            price: parseFloat(row.querySelector('.size-price').value || '0')
        };
    }).filter(function (size) { return size.size && size.price > 0; });
}

async function saveProduct(event) {
    event.preventDefault();
    var id = document.getElementById('productId').value;
    var sizes = collectSizes();
    if (!sizes.length) return alert('أضيفي حجماً واحداً على الأقل مع السعر.');

    var nextId = id ? id : 'product_' + Date.now();

    // Handle image upload
    var imageUrl = document.getElementById('productImage').value.trim();
    var fileInput = document.getElementById('productImageFile');
    if (fileInput.files && fileInput.files[0]) {
        setAdminLoading(true);
        setAdminStatus('جاري رفع الصورة...', 'info');
        imageUrl = await uploadProductImage(fileInput.files[0], nextId);
    }

    var productData = normalizeProduct({
        id: nextId,
        name: document.getElementById('productName').value.trim(),
        brand: document.getElementById('productBrand').value.trim(),
        category: document.getElementById('productCategory').value.trim(),
        sizes: sizes,
        discount: parseInt(document.getElementById('productDiscount').value || '0', 10) || 0,
        image: imageUrl,
        status: document.getElementById('productStatus').value
    });

    setAdminLoading(true);
    await db.collection('products').doc(String(productData.id)).set(productData, { merge: false });
    setAdminLoading(false);
    closeModal('productModal');
    setAdminStatus('تم حفظ المنتج بنجاح.', 'success');
}

async function deleteProduct(id) {
    if (!confirm('هل أنتِ متأكدة من حذف هذا المنتج؟')) return;
    setAdminLoading(true);
    await db.collection('products').doc(String(id)).delete();
    setAdminLoading(false);
    setAdminStatus('تم حذف المنتج.', 'success');
}

function renderDiscountValueOptions() {
    var type = document.getElementById('discountType');
    var container = document.getElementById('discountValueCheckboxes');
    if (!type || !container) return;
    var mode = type.value;
    var values = [];
    if (mode === 'brand') {
        values = Array.from(new Set(products.map(function (product) { return product.brand; })));
    } else if (mode === 'category') {
        values = Array.from(new Set(products.map(function (product) { return product.category; })));
    }
    container.innerHTML = values.map(function (value) {
        return '<label class="checkbox-item"><input type="checkbox" value="' + value + '"><span>' + value + '</span></label>';
    }).join('');
}

function toggleDiscountValueField() {
    var type = document.getElementById('discountType').value;
    document.getElementById('discountValueGroup').style.display = (type === 'brand' || type === 'category') ? 'block' : 'none';
    document.getElementById('discountManualGroup').style.display = type === 'manual' ? 'block' : 'none';
    if (type === 'brand' || type === 'category') renderDiscountValueOptions();
}

function renderDiscountsTable() {
    var tbody = document.getElementById('discountsTableBody');
    if (!discounts.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state">لا توجد خصومات مضافة.</td></tr>';
        return;
    }
    var typeLabels = { brand: 'ماركة', category: 'فئة', manual: 'يدوي', all: 'جميع المنتجات' };
    var now = new Date().toISOString().slice(0, 10);
    tbody.innerHTML = discounts.map(function (discount) {
        var expired = discount.expiresAt && discount.expiresAt < now;
        var expiryText = discount.expiresAt ? discount.expiresAt : 'بدون تاريخ';
        var rowClass = expired ? ' style="opacity:0.5;"' : '';
        return '<tr' + rowClass + '><td>' + typeLabels[discount.type] + '</td><td>' + (discount.type === 'all' ? 'الكل' : discount.value) + '</td><td>' + discount.percentage + '%</td><td>' + expiryText + (expired ? ' (منتهي)' : '') + '</td><td>' + discount.description + '</td><td class="actions"><button class="btn-edit" onclick="editDiscount(\'' + discount.id + '\')">تعديل</button><button class="btn-delete" onclick="deleteDiscount(\'' + discount.id + '\')">حذف</button></td></tr>';
    }).join('');
}

function openDiscountModal(discount) {
    document.getElementById('discountModalTitle').textContent = discount ? 'تعديل خصم' : 'إضافة خصم';
    document.getElementById('discountId').value = discount ? discount.id : '';
    document.getElementById('discountType').value = discount ? discount.type : 'all';
    toggleDiscountValueField();
    if (discount && (discount.type === 'brand' || discount.type === 'category')) {
        var container = document.getElementById('discountValueCheckboxes');
        var vals = discount.values || [];
        var checkboxes = container.querySelectorAll('input[type="checkbox"]');
        for (var i = 0; i < checkboxes.length; i++) {
            checkboxes[i].checked = vals.indexOf(checkboxes[i].value) >= 0;
        }
    }
    document.getElementById('discountManualValue').value = discount && discount.type === 'manual' ? discount.value : '';
    document.getElementById('discountPercentage').value = discount ? discount.percentage : '';
    document.getElementById('discountExpiry').value = discount ? (discount.expiresAt || '') : '';
    document.getElementById('discountDescription').value = discount ? discount.description : '';
    document.getElementById('discountModal').style.display = 'flex';
}

function editDiscount(id) {
    var discount = discounts.find(function (entry) { return entry.id === id; });
    if (discount) openDiscountModal(discount);
}

async function saveDiscount(event) {
    event.preventDefault();
    var existingId = document.getElementById('discountId').value;
    var type = document.getElementById('discountType').value;
    var values = [];
    if (type === 'brand' || type === 'category') {
        var container = document.getElementById('discountValueCheckboxes');
        var checkboxes = container.querySelectorAll('input[type="checkbox"]:checked');
        for (var i = 0; i < checkboxes.length; i++) {
            values.push(checkboxes[i].value);
        }
    } else if (type === 'manual') {
        var manualVal = document.getElementById('discountManualValue').value.trim();
        if (manualVal) values = [manualVal];
    }
    // For "all" type, values stays empty (applies to everything)
    var discountData = normalizeDiscount({
        id: existingId || String(Date.now()),
        type: type,
        values: values,
        value: values.join(', '),
        percentage: parseInt(document.getElementById('discountPercentage').value || '0', 10),
        description: document.getElementById('discountDescription').value.trim(),
        expiresAt: document.getElementById('discountExpiry').value || ''
    });

    setAdminLoading(true);
    await db.collection('discounts').doc(String(discountData.id)).set(discountData, { merge: false });
    setAdminLoading(false);
    closeModal('discountModal');
    setAdminStatus('تم حفظ الخصم.', 'success');
}

async function deleteDiscount(id) {
    if (!confirm('حذف هذا الخصم؟')) return;
    setAdminLoading(true);
    await db.collection('discounts').doc(String(id)).delete();
    setAdminLoading(false);
    setAdminStatus('تم حذف الخصم.', 'success');
}

function loadSettingsForm() {
    document.getElementById('settingWhatsappNumber').value = siteSettings.whatsappNumber || '';
    document.getElementById('settingHero').value = siteSettings.heroSubtitle || '';
    document.getElementById('settingAbout').value = siteSettings.aboutText || '';
    document.getElementById('settingInstagram').value = siteSettings.instagramLink || '';
    document.getElementById('settingTiktok').value = siteSettings.tiktokLink || '';
}

async function saveSettingsForm(event) {
    event.preventDefault();
    siteSettings = normalizeSettings({
        whatsappNumber: document.getElementById('settingWhatsappNumber').value,
        heroSubtitle: document.getElementById('settingHero').value,
        aboutText: document.getElementById('settingAbout').value,
        instagramLink: document.getElementById('settingInstagram').value,
        tiktokLink: document.getElementById('settingTiktok').value
    });
    setAdminLoading(true);
    await db.collection('settings').doc('config').set(siteSettings, { merge: true });
    setAdminLoading(false);
    setAdminStatus('تم حفظ الإعدادات بنجاح.', 'success');
}

function renderOrdersTable() {
    var tbody = document.getElementById('ordersTableBody');
    var search = (document.getElementById('orderSearchInput') ? document.getElementById('orderSearchInput').value : '').trim().toLowerCase();
    var statusFilter = document.getElementById('orderStatusFilter') ? document.getElementById('orderStatusFilter').value : 'all';

    var filteredOrders = orders.filter(function (order) {
        var matchesStatus = statusFilter === 'all' || order.status === statusFilter;
        var haystack = (String(order.customerName || '') + ' ' + String(order.customerPhone || '')).toLowerCase();
        return matchesStatus && (!search || haystack.indexOf(search) >= 0);
    }).sort(function (a, b) {
        return new Date(b.date).getTime() - new Date(a.date).getTime();
    });

    if (!filteredOrders.length) {
        tbody.innerHTML = '<tr><td colspan="8" class="empty-state">لا توجد طلبات مطابقة.</td></tr>';
        return;
    }

    tbody.innerHTML = filteredOrders.map(function (order) {
        var itemsCount = (order.items || []).reduce(function (sum, item) { return sum + (Number(item.qty) || 0); }, 0);
        var deliveryText = order.delivery === 'pickup' ? 'استلام' : (order.region ? DELIVERY_REGION_LABEL(order.region) : 'توصيل');
        return '<tr class="order-main-row" onclick="toggleOrderDetails(\'' + order.id + '\')"><td>' + order.id + '</td><td>' + formatDateTime(order.date) + '</td><td>' + (order.customerName || '-') + '</td><td>' + (order.customerPhone || '-') + '</td><td>' + itemsCount + '</td><td>' + formatCurrency(order.total) + '</td><td>' + deliveryText + '</td><td><select class="order-status-select" onclick="event.stopPropagation()" onchange="updateOrderStatus(\'' + order.id + '\', this.value)">' + ['new', 'processing', 'completed', 'cancelled'].map(function (status) { return '<option value="' + status + '" ' + (order.status === status ? 'selected' : '') + '>' + ORDER_STATUS_LABEL(status) + '</option>'; }).join('') + '</select></td></tr><tr class="order-details-row" id="details-' + order.id + '" style="display:none;"><td colspan="8">' + renderOrderDetails(order) + '</td></tr>';
    }).join('');
}

function renderOrderDetails(order) {
    var itemsHtml = (order.items || []).map(function (item) {
        return '<div class="order-item-card"><strong>' + item.name + '</strong><div>' + item.brand + ' • ' + item.sizeLabel + '</div><div>الكمية: ' + item.qty + ' • السعر: ' + formatCurrency(item.price) + ' • الإجمالي: ' + formatCurrency(item.lineTotal) + '</div></div>';
    }).join('');

    return '<div class="order-details"><div class="order-items-list">' + itemsHtml + '</div><div class="order-meta"><div><strong>الاسم:</strong> ' + (order.customerName || '-') + '<br><strong>الهاتف:</strong> ' + (order.customerPhone || '-') + '<br><strong>العنوان:</strong> ' + (order.address || '-') + '</div><div><strong>طريقة التوصيل:</strong> ' + (order.delivery === 'pickup' ? 'استلام ذاتي' : 'توصيل') + '<br><strong>المنطقة:</strong> ' + DELIVERY_REGION_LABEL(order.region) + '<br><strong>المجموع الفرعي:</strong> ' + formatCurrency(order.subtotal) + '<br><strong>التوصيل:</strong> ' + formatCurrency(order.deliveryCost || 0) + '<br><strong>الإجمالي:</strong> ' + formatCurrency(order.total) + '</div></div>' + (order.notes ? '<div class="order-item-card"><strong>ملاحظات:</strong><div>' + order.notes + '</div></div>' : '') + '</div>';
}

function toggleOrderDetails(orderId) {
    var row = document.getElementById('details-' + orderId);
    if (!row) return;
    row.style.display = row.style.display === 'none' ? 'table-row' : 'none';
}

async function updateOrderStatus(orderId, status) {
    setAdminLoading(true);
    await db.collection('orders').doc(String(orderId)).update({ status: status });
    setAdminLoading(false);
    setAdminStatus('تم تحديث حالة الطلب.', 'success');
}

function ORDER_STATUS_LABEL(status) {
    return { new: 'جديد', processing: 'قيد المعالجة', completed: 'مكتمل', cancelled: 'ملغي' }[status] || status;
}

function DELIVERY_REGION_LABEL(region) {
    return { pickup: 'استلام', westbank: 'الضفة', jerusalem: 'القدس', inside: 'الداخل' }[region] || '-';
}

function renderDashboard() {
    var completedOrders = orders.filter(function (order) { return order.status === 'completed'; });
    var totalRevenue = completedOrders.reduce(function (sum, order) { return sum + (Number(order.total) || 0); }, 0);
    var totalOrders = orders.length;
    var pendingOrders = orders.filter(function (order) { return order.status === 'new' || order.status === 'processing'; }).length;
    var completedCount = completedOrders.length;
    var weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 7);
    var monthStart = new Date();
    monthStart.setMonth(monthStart.getMonth() - 1);
    var ordersWeek = orders.filter(function (order) { return new Date(order.date) >= weekStart; }).length;
    var ordersMonth = orders.filter(function (order) { return new Date(order.date) >= monthStart; }).length;

    document.getElementById('statsGrid').innerHTML = [
        statCard('إجمالي الإيراد', formatCurrency(totalRevenue), 'من الطلبات المكتملة'),
        statCard('إجمالي الطلبات', totalOrders, 'كل الحالات'),
        statCard('الطلبات المعلقة', pendingOrders, 'جديد + قيد المعالجة'),
        statCard('الطلبات المكتملة', completedCount, 'مكتملة فقط'),
        statCard('طلبات هذا الأسبوع', ordersWeek, 'آخر 7 أيام'),
        statCard('طلبات هذا الشهر', ordersMonth, 'آخر 30 يوم'),
        statCard('عدد المنتجات', products.length, 'في المتجر'),
        statCard('عدد الخصومات', discounts.length, 'الخصومات النشطة')
    ].join('');

    renderRevenueChart();
    renderStatusChart();
    renderRegionChart();
    renderTopProductsChart();
}

function statCard(title, value, subtitle) {
    return '<div class="stat-card"><h4>' + title + '</h4><strong>' + value + '</strong><span>' + subtitle + '</span></div>';
}

function destroyChart(key) {
    if (charts[key]) {
        charts[key].destroy();
        charts[key] = null;
    }
}

function renderRevenueChart() {
    var labels = [];
    var values = [];
    for (var index = 29; index >= 0; index -= 1) {
        var day = new Date();
        day.setHours(0, 0, 0, 0);
        day.setDate(day.getDate() - index);
        var nextDay = new Date(day);
        nextDay.setDate(day.getDate() + 1);
        labels.push(day.toLocaleDateString('ar-PS', { month: 'short', day: 'numeric' }));
        values.push(orders.filter(function (order) {
            var orderDate = new Date(order.date);
            return order.status === 'completed' && orderDate >= day && orderDate < nextDay;
        }).reduce(function (sum, order) { return sum + (Number(order.total) || 0); }, 0));
    }

    destroyChart('revenue');
    charts.revenue = new Chart(document.getElementById('revenueChart'), {
        type: 'line',
        data: { labels: labels, datasets: [{ label: 'الإيراد', data: values, borderColor: '#d4af37', backgroundColor: 'rgba(212,175,55,0.18)', fill: true, tension: 0.35 }] },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

function renderStatusChart() {
    var statuses = ['new', 'processing', 'completed', 'cancelled'];
    destroyChart('status');
    charts.status = new Chart(document.getElementById('statusChart'), {
        type: 'doughnut',
        data: {
            labels: statuses.map(ORDER_STATUS_LABEL),
            datasets: [{ data: statuses.map(function (status) { return orders.filter(function (order) { return order.status === status; }).length; }), backgroundColor: ['#60a5fa', '#fbbf24', '#34d399', '#f87171'] }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

function renderRegionChart() {
    var regions = ['pickup', 'westbank', 'jerusalem', 'inside'];
    destroyChart('region');
    charts.region = new Chart(document.getElementById('regionChart'), {
        type: 'pie',
        data: {
            labels: regions.map(DELIVERY_REGION_LABEL),
            datasets: [{ data: regions.map(function (region) { return orders.filter(function (order) { return (order.region || 'pickup') === region; }).length; }), backgroundColor: ['#d4af37', '#b8860b', '#c9a96e', '#1a1a1a'] }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

function renderTopProductsChart() {
    var totals = {};
    orders.forEach(function (order) {
        (order.items || []).forEach(function (item) {
            totals[item.name] = (totals[item.name] || 0) + (Number(item.qty) || 0);
        });
    });
    var topProducts = Object.keys(totals).map(function (name) {
        return { name: name, qty: totals[name] };
    }).sort(function (a, b) { return b.qty - a.qty; }).slice(0, 5);

    destroyChart('topProducts');
    charts.topProducts = new Chart(document.getElementById('topProductsChart'), {
        type: 'bar',
        data: {
            labels: topProducts.map(function (item) { return item.name; }),
            datasets: [{ label: 'الكمية', data: topProducts.map(function (item) { return item.qty; }), backgroundColor: '#d4af37' }]
        },
        options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y' }
    });
}

async function seedData(force) {
    var shouldForce = force || confirm('سيتم تعبئة فايرستور بالمنتجات الافتراضية إذا كان فارغاً. للكتابة فوق البيانات الحالية اختاري موافق.');
    setAdminLoading(true);
    var result = await seedFirestoreData(shouldForce);
    setAdminLoading(false);
    if (result.seeded) setAdminStatus('تم تنفيذ Seed Data بنجاح.', 'success');
    else setAdminStatus('تم تجاهل Seed Data لأن المنتجات موجودة بالفعل.', 'warning');
}

function closeModal(id) {
    document.getElementById(id).style.display = 'none';
}

// Image upload functions
function previewImage(input) {
    var preview = document.getElementById('imagePreview');
    if (input.files && input.files[0]) {
        var reader = new FileReader();
        reader.onload = function (e) {
            preview.innerHTML = '<img src="' + e.target.result + '">';
        };
        reader.readAsDataURL(input.files[0]);
        // Clear URL input when file is selected
        document.getElementById('productImage').value = '';
    } else {
        preview.innerHTML = '';
    }
}

async function uploadProductImage(file, productId) {
    // Compress and convert to base64 data URL (stored in Firestore directly)
    return new Promise(function (resolve) {
        var reader = new FileReader();
        reader.onload = function (e) {
            var img = new Image();
            img.onload = function () {
                var canvas = document.createElement('canvas');
                var maxSize = 400;
                var w = img.width;
                var h = img.height;
                if (w > h) { if (w > maxSize) { h = h * maxSize / w; w = maxSize; } }
                else { if (h > maxSize) { w = w * maxSize / h; h = maxSize; } }
                canvas.width = w;
                canvas.height = h;
                var ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, w, h);
                var dataUrl = canvas.toDataURL('image/jpeg', 0.7);
                resolve(dataUrl);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}
// ===== Hero Display Management =====
var heroSlides = [];

function subscribeToHero() {
    unsubscribers.push(db.collection('heroDisplay').orderBy('order', 'asc').onSnapshot(function(snapshot) {
        heroSlides = snapshot.docs.map(function(doc) { var d = doc.data(); d.id = doc.id; return d; });
        renderHeroSlides();
    }, function(error) {
        console.error('Hero subscribe error:', error);
    }));
}

function renderHeroSlides() {
    var container = document.getElementById('heroSlidesList');
    if (!container) return;
    if (!heroSlides.length) {
        container.innerHTML = '<div class="empty-hero-state"><p>لا توجد شرائح في العرض الرئيسي حالياً</p><button class="btn-add" onclick="openHeroModal()">إضافة أول شريحة</button></div>';
        return;
    }
    container.innerHTML = heroSlides.map(function(slide, idx) {
        var preview = slide.type === 'video'
            ? '<video src="' + slide.url + '" muted></video>'
            : '<img src="' + slide.url + '" alt="' + (slide.title || 'Hero') + '">';
        return '<div class="hero-slide-card">' +
            '<div class="slide-preview">' + preview + '</div>' +
            '<div class="slide-info">' +
                '<span class="slide-type">' + (slide.type === 'video' ? '🎬 فيديو' : '🖼️ صورة') + '</span>' +
                '<h4>' + (slide.title || '(بدون عنوان)') + '</h4>' +
                '<p>' + (slide.subtitle || '(بدون وصف)') + '</p>' +
                '<p style="font-size:0.75rem; color:#999;">ترتيب: ' + (slide.order || 1) + '</p>' +
            '</div>' +
            '<div class="slide-actions">' +
                '<div class="slide-order">' +
                    '<button onclick="moveHeroSlide(\'' + slide.id + '\', -1)" title="أعلى">↑</button>' +
                    '<button onclick="moveHeroSlide(\'' + slide.id + '\', 1)" title="أسفل">↓</button>' +
                '</div>' +
                '<button class="btn-edit" onclick="editHeroSlide(\'' + slide.id + '\')">تعديل</button>' +
                '<button class="btn-delete" onclick="deleteHeroSlide(\'' + slide.id + '\')">حذف</button>' +
            '</div>' +
        '</div>';
    }).join('');
}

function openHeroModal(slideId) {
    document.getElementById('heroSlideId').value = '';
    document.getElementById('heroSlideType').value = 'image';
    document.getElementById('heroSlideUrl').value = '';
    document.getElementById('heroSlideTitle').value = '';
    document.getElementById('heroSlideSubtitle').value = '';
    document.getElementById('heroSlideOrder').value = heroSlides.length + 1;
    document.getElementById('heroMediaPreview').innerHTML = '';
    document.getElementById('heroModalTitle').textContent = 'إضافة شريحة جديدة';
    document.getElementById('heroModal').style.display = 'flex';
}

function editHeroSlide(slideId) {
    var slide = heroSlides.find(function(s) { return s.id === slideId; });
    if (!slide) return;
    document.getElementById('heroSlideId').value = slideId;
    document.getElementById('heroSlideType').value = slide.type || 'image';
    document.getElementById('heroSlideUrl').value = slide.url || '';
    document.getElementById('heroSlideTitle').value = slide.title || '';
    document.getElementById('heroSlideSubtitle').value = slide.subtitle || '';
    document.getElementById('heroSlideOrder').value = slide.order || 1;
    document.getElementById('heroMediaPreview').innerHTML = '';
    document.getElementById('heroModalTitle').textContent = 'تعديل الشريحة';
    document.getElementById('heroModal').style.display = 'flex';
}

async function saveHeroSlide() {
    var id = document.getElementById('heroSlideId').value;
    var type = document.getElementById('heroSlideType').value;
    var url = document.getElementById('heroSlideUrl').value.trim();
    var title = document.getElementById('heroSlideTitle').value.trim();
    var subtitle = document.getElementById('heroSlideSubtitle').value.trim();
    var order = parseInt(document.getElementById('heroSlideOrder').value) || 1;

    // Check if file uploaded (image)
    var fileInput = document.getElementById('heroSlideFile');
    if (fileInput.files && fileInput.files[0]) {
        var file = fileInput.files[0];
        setAdminLoading(true);
        setAdminStatus('جاري رفع الصورة...', 'info');
        try {
            var imgbbUrl = await uploadToImgbb(file);
            await saveHeroSlideData(id, { type: 'image', url: imgbbUrl, title: title, subtitle: subtitle, order: order });
        } catch (err) {
            console.error(err);
            setAdminStatus('فشل رفع الصورة: ' + err.message, 'error');
            setAdminLoading(false);
        }
        return;
    }

    if (!url) { alert('يرجى إدخال رابط أو رفع صورة'); return; }
    await saveHeroSlideData(id, { type: type, url: url, title: title, subtitle: subtitle, order: order });
}

async function uploadToImgbb(file) {
    var IMGBB_API_KEY = 'd14f65fb697224837b49489e5f8d8b57';
    var formData = new FormData();
    formData.append('image', file);
    var response = await fetch('https://api.imgbb.com/1/upload?key=' + IMGBB_API_KEY, {
        method: 'POST',
        body: formData
    });
    var data = await response.json();
    if (!data.success) throw new Error(data.error ? data.error.message : 'Upload failed');
    return data.data.url;
}

async function saveHeroSlideData(id, data) {
    try {
        setAdminLoading(true);
        if (id) {
            await db.collection('heroDisplay').doc(id).update(data);
            setAdminStatus('تم تحديث الشريحة بنجاح.', 'success');
        } else {
            await db.collection('heroDisplay').add(data);
            setAdminStatus('تمت إضافة الشريحة بنجاح.', 'success');
        }
        closeModal('heroModal');
    } catch (error) {
        console.error(error);
        setAdminStatus('حدث خطأ أثناء حفظ الشريحة.', 'error');
    }
    setAdminLoading(false);
}

async function deleteHeroSlide(slideId) {
    if (!confirm('هل تريدين حذف هذه الشريحة؟')) return;
    try {
        setAdminLoading(true);
        await db.collection('heroDisplay').doc(slideId).delete();
        setAdminStatus('تم حذف الشريحة.', 'success');
    } catch (error) {
        console.error(error);
        setAdminStatus('حدث خطأ أثناء الحذف.', 'error');
    }
    setAdminLoading(false);
}

async function moveHeroSlide(slideId, direction) {
    var idx = heroSlides.findIndex(function(s) { return s.id === slideId; });
    if (idx < 0) return;
    var newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= heroSlides.length) return;
    try {
        var batch = rawDb.batch();
        var currentRef = db.collection('heroDisplay').doc(heroSlides[idx].id);
        var swapRef = db.collection('heroDisplay').doc(heroSlides[newIdx].id);
        batch.update(currentRef, { order: heroSlides[newIdx].order || (newIdx + 1) });
        batch.update(swapRef, { order: heroSlides[idx].order || (idx + 1) });
        await batch.commit();
    } catch (error) {
        console.error(error);
    }
}

function previewHeroMedia(input) {
    var preview = document.getElementById('heroMediaPreview');
    if (!input.files || !input.files[0]) { preview.innerHTML = ''; return; }
    var file = input.files[0];
    var reader = new FileReader();
    reader.onload = function(e) {
        if (file.type.startsWith('video/')) {
            preview.innerHTML = '<video src="' + e.target.result + '" style="max-width:200px; max-height:120px; border-radius:10px;" controls muted></video>';
        } else {
            preview.innerHTML = '<img src="' + e.target.result + '" style="max-width:200px; max-height:120px; border-radius:10px; object-fit:cover;">';
        }
        // Auto-detect type
        document.getElementById('heroSlideType').value = file.type.startsWith('video/') ? 'video' : 'image';
    };
    reader.readAsDataURL(file);
}

function toggleHeroMediaField() {
    var type = document.getElementById('heroSlideType').value;
    var uploadGroup = document.getElementById('heroImageUploadGroup');
    if (type === 'video') {
        uploadGroup.style.display = 'none';
    } else {
        uploadGroup.style.display = '';
    }
}
