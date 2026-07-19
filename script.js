var FALLBACK_IMAGE = "data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%27400%27 height=%27400%27 viewBox=%270 0 400 400%27%3E%3Crect fill=%27%232C8C99%27 width=%27400%27 height=%27400%27/%3E%3Ctext fill=%27%23ffffff%27 font-family=%27Arial%27 font-size=%2740%27 x=%2750%2525%27 y=%2745%2525%27 text-anchor=%27middle%27%3E💆%3C/text%3E%3Ctext fill=%27%23ffffff%27 font-family=%27Arial%27 font-size=%2720%27 x=%2750%2525%27 y=%2760%2525%27 text-anchor=%27middle%27%3EEnas Shop%3C/text%3E%3C/svg%3E";

var products = [];
var discounts = [];
var siteSettings = normalizeSettings(DEFAULT_SITE_SETTINGS);
var currentFilter = 'all';
var cart = normalizeCartItems(JSON.parse(localStorage.getItem('drenasshop_cart') || '[]'), normalizeProducts(DEFAULT_PRODUCTS));
var deliveryMethod = localStorage.getItem('drenasshop_delivery_method') || 'delivery';
var currentPDPProduct = null;
var currentPDPSizeIdx = 0;
var pdpQty = 1;
var usedFallbackData = false;
var comboOffers = [];
var comboSelectedIds = [];
var currentComboOffer = null;
var storePackages = [];
var unsubscribers = [];
var storeLoadState = {
    products: false,
    discounts: false,
    settings: false
};

document.addEventListener('DOMContentLoaded', function () {
    saveCart();
    renderBrands();
    setupSearch('navSearchInput', 'navSearchDropdown');
    setupSearch('productsSearchInput', 'productsSearchDropdown');
    initializeOrderTracking();
    updateCartBadge();
    updateCheckoutLink(cart.length ? updateCartTotal() : 0);
    setDeliveryMethod(deliveryMethod);
    setLoadingState(true);
    subscribeToStoreData();

    // Smooth scroll for anchor links
    document.addEventListener('click', function(e) {
        var link = e.target.closest('a[href^="#"]');
        if (!link) return;
        var target = document.querySelector(link.getAttribute('href'));
        if (target) {
            e.preventDefault();
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    });
    // Fallback if Firestore takes too long
    setTimeout(function () {
        if (!storeLoadState.products || !storeLoadState.discounts || !storeLoadState.settings) {
            applyFallbackStoreData('');
        }
    }, 6000);
});

function setLoadingState(isLoading) {
    var loading = document.getElementById('storeLoading');
    var grid = document.getElementById('productsGrid');
    if (loading) loading.style.display = isLoading ? 'flex' : 'none';
    if (grid) grid.classList.toggle('is-loading', !!isLoading);
}

function setStoreMessage(message, type) {
    var notice = document.getElementById('storeNotice');
    if (!notice) return;
    if (!message) {
        notice.style.display = 'none';
        notice.textContent = '';
        notice.className = 'store-notice';
        return;
    }
    notice.textContent = message;
    notice.className = 'store-notice ' + (type || 'info');
    notice.style.display = 'block';
}

function markStoreLoaded(key) {
    storeLoadState[key] = true;
    if (storeLoadState.products && storeLoadState.discounts && storeLoadState.settings) {
        setLoadingState(false);
        renderStorefront();
    }
}

function subscribeToStoreData() {
    if (!window.db) {
        applyFallbackStoreData('تعذر الاتصال بفايربيس، تم عرض البيانات الاحتياطية.');
        return;
    }

    unsubscribers.forEach(function (unsubscribe) {
        if (typeof unsubscribe === 'function') unsubscribe();
    });
    unsubscribers = [];

    // Load first 6 products fast, then load the rest
    db.collection('products').orderBy('id').limit(6).get().then(function (snapshot) {
        if (!snapshot.empty) {
            products = snapshot.docs.map(function (docSnap) {
                var d = docSnap.data(); d.id = docSnap.id; return normalizeProduct(d);
            });
            syncCartWithProducts();
            markStoreLoaded('products');
        }
        // Now subscribe to all products for real-time updates
        unsubscribers.push(db.collection('products').onSnapshot(function (fullSnapshot) {
            products = fullSnapshot.docs.map(function (docSnap) {
                var d = docSnap.data(); d.id = docSnap.id; return normalizeProduct(d);
            }).sort(function (a, b) { return a.id - b.id; });
            syncCartWithProducts();
            markStoreLoaded('products');
        }, function () {
            if (!storeLoadState.products) applyFallbackStoreData('تعذر تحميل المنتجات من فايرستور، تم استخدام البيانات الاحتياطية.');
            else setStoreMessage('تعذر تحديث المنتجات حالياً.', 'error');
        }));
    }).catch(function () {
        // Fallback to full subscription if initial fetch fails
        unsubscribers.push(db.collection('products').onSnapshot(function (snapshot) {
            products = snapshot.docs.map(function (docSnap) {
                var d = docSnap.data(); d.id = docSnap.id; return normalizeProduct(d);
            }).sort(function (a, b) { return a.id - b.id; });
            syncCartWithProducts();
            markStoreLoaded('products');
        }, function () {
            if (!storeLoadState.products) applyFallbackStoreData('تعذر تحميل المنتجات من فايرستور، تم استخدام البيانات الاحتياطية.');
            else setStoreMessage('تعذر تحديث المنتجات حالياً.', 'error');
        }));
    });

    unsubscribers.push(db.collection('discounts').onSnapshot(function (snapshot) {
        discounts = snapshot.docs.map(function (docSnap) {
            return normalizeDiscount(docSnap.data());
        });
        markStoreLoaded('discounts');
    }, function () {
        discounts = normalizeDiscounts(DEFAULT_DISCOUNTS);
        markStoreLoaded('discounts');
        setStoreMessage('تعذر تحميل الخصومات الحالية.', 'warning');
    }));

    unsubscribers.push(db.collection('settings').doc('config').onSnapshot(function (docSnap) {
        siteSettings = normalizeSettings(docSnap.exists ? docSnap.data() : DEFAULT_SITE_SETTINGS);
        markStoreLoaded('settings');
    }, function () {
        siteSettings = normalizeSettings(DEFAULT_SITE_SETTINGS);
        markStoreLoaded('settings');
        setStoreMessage('تعذر تحميل إعدادات المتجر الحالية.', 'warning');
    }));

    // Subscribe to hero display slides
    unsubscribers.push(db.collection('heroDisplay').orderBy('order', 'asc').onSnapshot(function (snapshot) {
        var slides = snapshot.docs.map(function (doc) { var d = doc.data(); d.id = doc.id; return d; });
        if (slides.length > 0) renderHeroSlider(slides);
    }, function () { /* keep default hero if fails */ }));

    // Subscribe to combo offers (filter by date)
    unsubscribers.push(db.collection('offers').onSnapshot(function (snapshot) {
        var now = new Date().toISOString().split('T')[0];
        comboOffers = [];
        snapshot.forEach(function(doc) {
            var d = doc.data();
            d.id = doc.id;
            if (d.type !== 'combo') return;
            if (d.active === false) return;
            if (d.startDate && now < d.startDate) return;
            if (d.endDate && now > d.endDate) return;
            comboOffers.push(d);
        });
        renderComboBanner();
        renderComboOffersSection();
    }, function () { /* ignore */ }));

    // Subscribe to packages
    unsubscribers.push(db.collection('packages').onSnapshot(function (snapshot) {
        storePackages = [];
        snapshot.forEach(function(doc) {
            var d = doc.data();
            d.id = doc.id;
            if (d.active !== false) storePackages.push(d);
        });
        renderPackagesBanner();
    }, function () { /* ignore */ }));
}

function applyFallbackStoreData(message) {
    usedFallbackData = true;
    products = normalizeProducts(DEFAULT_PRODUCTS);
    discounts = normalizeDiscounts(DEFAULT_DISCOUNTS);
    siteSettings = normalizeSettings(DEFAULT_SITE_SETTINGS);
    storeLoadState.products = true;
    storeLoadState.discounts = true;
    storeLoadState.settings = true;
    syncCartWithProducts();
    setStoreMessage(message, 'warning');
    setLoadingState(false);
    renderStorefront();
}

function syncCartWithProducts() {
    cart = normalizeCartItems(cart, products);
    saveCart();
}

function renderStorefront() {
    applySettings();
    renderFilters();
    checkDiscountBanner();
    renderComboBanner();
    updateCartBadge();
    renderProducts(getFilteredProducts(currentFilter));
    updateCheckoutLink(updateCartTotal());
    renderComboOffersSection();
    if (!usedFallbackData) setStoreMessage('', 'info');
}

function applySettings() {
    var heroSub = document.getElementById('heroSubtitle');
    if (heroSub) heroSub.textContent = siteSettings.heroSubtitle;

    var aboutText = document.getElementById('aboutText');
    if (aboutText) aboutText.innerHTML = siteSettings.aboutText.replace(/\n/g, '<br>');

    var whatsappLink = document.getElementById('whatsappLink');
    if (whatsappLink) whatsappLink.href = buildWhatsAppUrl(siteSettings.whatsappNumber);

    var instagramLink = document.getElementById('instagramLink');
    if (instagramLink) instagramLink.href = siteSettings.instagramLink;

    var tiktokLink = document.getElementById('tiktokLink');
    if (tiktokLink) {
        if (siteSettings.tiktokLink) {
            tiktokLink.href = siteSettings.tiktokLink;
            tiktokLink.style.display = 'flex';
        } else {
            tiktokLink.style.display = 'none';
        }
    }
}

function checkDiscountBanner() {
    var banner = document.getElementById('discountBanner');
    var textNode = document.getElementById('bannerText');
    if (!banner || !textNode) return;

    var now = new Date().toISOString().slice(0, 10);
    var activeDiscounts = discounts.filter(function (discount) {
        if (!discount.description) return false;
        if (discount.expiresAt && discount.expiresAt < now) return false;
        return true;
    });

    if (activeDiscounts.length) {
        document.body.classList.add('has-banner');
        banner.style.display = 'block';
        var text = activeDiscounts.map(function (discount) {
            return discount.description;
        }).join('     |     ');
        textNode.textContent = text + '     |     ' + text;
    } else {
        document.body.classList.remove('has-banner');
        banner.style.display = 'none';
        textNode.textContent = '';
    }
}

function getFilteredProducts(filter) {
    if (filter === 'bestseller' || filter === 'special' || filter === 'soldout') {
        return products.filter(function (product) {
            return product.status === filter;
        });
    }

    if (filter !== 'all') {
        return products.filter(function (product) {
            return product.category === filter || product.brand === filter;
        });
    }

    return products.slice();
}

function getPriceHTML(pricing) {
    return (pricing.hasDiscount ? '<span class="original-price">' + formatCurrency(pricing.original) + '</span>' : '') + '<span>' + formatCurrency(pricing.final) + '</span>';
}

function renderProducts(productsToShow) {
    var grid = document.getElementById('productsGrid');
    if (!grid) return;
    grid.innerHTML = '';

    if (!productsToShow.length) {
        grid.innerHTML = '<div class="empty-products">لا توجد منتجات متاحة حالياً.</div>';
        return;
    }

    productsToShow.forEach(function (product) {
        var pricing = getFinalPrice(product, 0, discounts);
        var desc = (product.description || '').substring(0, 70);

        var card = document.createElement('div');
        card.className = 'product-card';
        card.dataset.productId = String(product.id);
        card.dataset.brand = product.brand || '';
        card.dataset.category = product.category || '';
        card.onclick = function() { openPDP(product.id); };
        card.style.cursor = 'pointer';
        card.innerHTML = '<img src="' + (product.image || '') + '" alt="' + product.name + '" loading="lazy" onerror="this.src=\'' + FALLBACK_IMAGE + '\'">' +
            '<div class="product-info">' +
            '<div class="product-brand">' + (product.brand || '') + '</div>' +
            '<div class="product-name">' + product.name + '</div>' +
            (desc ? '<div class="product-desc">' + desc + '</div>' : '') +
            '<div class="product-footer">' +
            '<div class="product-price">' + getPriceHTML(pricing) + '</div>' +
            '</div>' +
            '</div>';
        grid.appendChild(card);
    });
}

function updateProductSize(productId, sizeIdx) {
    var product = products.find(function (entry) { return entry.id === productId; });
    if (!product) return;
    var sizeData = getSizeData(product, sizeIdx);
    var pricing = getFinalPrice(product, sizeIdx, discounts);
    var sizeEl = document.getElementById('productSize-' + productId);
    var priceEl = document.getElementById('productPrice-' + productId);
    if (sizeEl) sizeEl.textContent = getSizeLabel(sizeData);
    if (priceEl) priceEl.innerHTML = getPriceHTML(pricing);
}

function getStatusBadge(status) {
    switch (status) {
        case 'bestseller': return '<span class="status-badge bestseller">الأكثر مبيعاً</span>';
        case 'special': return '<span class="status-badge special">مميز</span>';
        case 'soldout': return '<span class="status-badge soldout">نفذت الكمية</span>';
        default: return '';
    }
}

function filterProducts(filter) {
    currentFilter = filter;
    // Reset dropdowns when status filter is used
    var brandSelect = document.getElementById('brandFilter');
    var catSelect = document.getElementById('categoryFilter');
    if (brandSelect) brandSelect.value = 'all';
    if (catSelect) catSelect.value = 'all';
    document.querySelectorAll('.filter-btn').forEach(function (button) {
        button.classList.remove('active');
    });
    var activeBtn = document.querySelector('[data-filter="' + filter + '"]');
    if (activeBtn) activeBtn.classList.add('active');
    renderProducts(getFilteredProducts(filter));
}

function toggleFilters() {
    var panel = document.getElementById('filterPanel');
    var btn = document.querySelector('.filter-toggle-btn');
    if (!panel || !btn) return;
    var isHidden = panel.style.display === 'none';
    panel.style.display = isHidden ? 'block' : 'none';
    btn.textContent = isHidden ? 'فلتر ▲' : 'فلتر ▼';
}

function createFilterButton(value) {
    var button = document.createElement('button');
    button.className = 'filter-btn';
    button.dataset.filter = value;
    button.textContent = value;
    button.addEventListener('click', function () {
        filterProducts(value);
    });
    return button;
}

function renderFilters() {
    var categories = Array.from(new Set(products.map(function (product) { return product.category; }).filter(Boolean)));
    var brands = Array.from(new Set(products.map(function (product) { return product.brand; }).filter(Boolean)));
    var catSelect = document.getElementById('categoryFilter');
    var brandSelect = document.getElementById('brandFilter');
    if (!brandSelect || !catSelect) return;
    catSelect.innerHTML = '<option value="all">كل الفئات</option>' + categories.map(function(c) { return '<option value="' + c + '">' + c + '</option>'; }).join('');
    brandSelect.innerHTML = '<option value="all">كل البراندات</option>' + brands.map(function(b) { return '<option value="' + b + '">' + b + '</option>'; }).join('');
}

function applyFilters() {
    var brand = document.getElementById('brandFilter').value;
    var category = document.getElementById('categoryFilter').value;
    var filtered = products.filter(function(p) {
        var showBrand = brand === 'all' || p.brand === brand;
        var showCat = category === 'all' || p.category === category;
        return showBrand && showCat;
    });
    currentFilter = 'all';
    renderProducts(filtered);
}

function renderBrands() {
    var grid = document.getElementById('brandsGrid');
    if (!grid) return;
    grid.innerHTML = BRANDS_DATA.map(function (brand) {
        return '<img src="' + brand.logo + '" alt="' + brand.name + '" class="brand-logo" title="' + brand.name + '" onerror="this.style.display=\'none\'">';
    }).join('');
}

function setupSearch(inputId, dropdownId) {
    var input = document.getElementById(inputId);
    var dropdown = document.getElementById(dropdownId);
    if (!input || !dropdown) return;

    input.addEventListener('input', function () {
        var query = this.value.trim();
        if (query.length < 2) {
            dropdown.classList.remove('active');
            return;
        }

        var results = products.filter(function (product) {
            return product.name.indexOf(query) >= 0 || product.category.indexOf(query) >= 0 || product.brand.toLowerCase().indexOf(query.toLowerCase()) >= 0;
        }).slice(0, 8);

        if (!results.length) {
            dropdown.innerHTML = '<div class="search-item"><div class="search-item-info"><h4>لا توجد نتائج</h4></div></div>';
        } else {
            dropdown.innerHTML = results.map(function (product) {
                var pricing = getFinalPrice(product, 0, discounts);
                return '<div class="search-item" onclick="scrollToProduct(' + product.id + ')"><img src="' + product.image + '" alt="' + product.name + '" onerror="this.src=\'' + FALLBACK_IMAGE + '\'"><div class="search-item-info"><h4>' + product.name + '</h4><span>' + product.brand + ' • ' + product.category + ' • ' + getSizeLabel(getSizeData(product, 0)) + ' • ' + formatCurrency(pricing.final) + '</span></div></div>';
            }).join('');
        }
        dropdown.classList.add('active');
    });

    document.addEventListener('click', function (event) {
        if (!input.contains(event.target) && !dropdown.contains(event.target)) dropdown.classList.remove('active');
    });
}

function scrollToProduct(productId) {
    filterProducts('all');
    document.getElementById('products').scrollIntoView({ behavior: 'smooth' });
    document.querySelectorAll('.search-dropdown').forEach(function (dropdown) { dropdown.classList.remove('active'); });
    document.querySelectorAll('.nav-search input, .products-search input').forEach(function (input) { input.value = ''; });
    setTimeout(function () {
        var card = document.querySelector('.product-card[data-product-id="' + productId + '"]');
        if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 150);
}

function toggleMobileMenu() {
    document.getElementById('mobileMenu').classList.toggle('active');
}

document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
    anchor.addEventListener('click', function (event) {
        event.preventDefault();
        var target = document.querySelector(this.getAttribute('href'));
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
});

window.addEventListener('scroll', function () {
    var navbar = document.getElementById('navbar');
    if (!navbar) return;
    navbar.style.boxShadow = window.scrollY > 50 ? '0 4px 20px rgba(0,0,0,0.1)' : '0 2px 10px rgba(0,0,0,0.05)';
});


function createDefaultPackagingSet() {
    return {
        chocolateType: 'mixed',
        filling: 'plain',
        qty: 1
    };
}

function getPackagingTypeLabel(value) {
    switch (value) {
        case 'dark': return 'داكن';
        case 'milk': return 'حليب';
        case 'white': return 'أبيض';
        default: return 'مشكل';
    }
}

function getPackagingFillingLabel(value) {
    switch (value) {
        case 'plain': return 'سادا / بدون حشوة';
        case 'hazelnut': return 'بندق';
        case 'caramel': return 'كراميل';
        case 'pistachio': return 'فستق';
        case 'coconut': return 'جوز الهند';
        case 'strawberry': return 'فراولة';
        case 'orange': return 'برتقال';
        default: return 'سادا / بدون حشوة';
    }
}

function getWrapperColorLabel(value) {
    switch (value) {
        case 'gold': return 'ذهبي';
        case 'silver': return 'فضي';
        case 'red': return 'أحمر';
        case 'pink': return 'زهري';
        case 'purple': return 'بنفسجي';
        case 'black': return 'أسود';
        case 'white': return 'أبيض';
        case 'blue': return 'أزرق';
        default: return 'ذهبي';
    }
}

function buildPackagingOptions(options, selectedValue) {
    return options.map(function (option) {
        return '<option value="' + option.value + '"' + (selectedValue === option.value ? ' selected' : '') + '>' + option.label + '</option>';
    }).join('');
}

function renderPackagingSets() {
    var container = document.getElementById('packagingSetsContainer');
    if (!container) return;
    var typeOptions = [
        { value: 'dark', label: 'داكن' },
        { value: 'milk', label: 'حليب' },
        { value: 'white', label: 'أبيض' },
        { value: 'mixed', label: 'مشكل' }
    ];
    var fillingOptions = [
        { value: 'plain', label: 'سادا / بدون حشوة' },
        { value: 'hazelnut', label: 'بندق' },
        { value: 'caramel', label: 'كراميل' },
        { value: 'pistachio', label: 'فستق' },
        { value: 'coconut', label: 'جوز الهند' },
        { value: 'strawberry', label: 'فراولة' },
        { value: 'orange', label: 'برتقال' }
    ];
    container.innerHTML = packagingBuilderSets.map(function (setItem, index) {
        return '<div class="builder-set">'
            + '<div class="builder-set-head"><h5>تشكيلة ' + (index + 1) + '</h5>'
            + (packagingBuilderSets.length > 1 ? '<button type="button" class="builder-remove-set" onclick="removePackagingSet(' + index + ')">حذف</button>' : '')
            + '</div>'
            + '<div class="builder-set-grid">'
            + '<div class="builder-field"><label>نوع الشوكولاتة</label><select onchange="updatePackagingSetField(' + index + ', \'chocolateType\', this.value)">' + buildPackagingOptions(typeOptions, setItem.chocolateType) + '</select></div>'
            + '<div class="builder-field"><label>الحشوة</label><select onchange="updatePackagingSetField(' + index + ', \'filling\', this.value)">' + buildPackagingOptions(fillingOptions, setItem.filling) + '</select></div>'
            + '<div class="builder-field"><label>الكمية</label><input type="number" min="1" value="' + (parseInt(setItem.qty, 10) || 1) + '" onchange="updatePackagingSetField(' + index + ', \'qty\', this.value)"></div>'
            + '</div></div>';
    }).join('');
}

function updatePackagingSetField(index, field, value) {
    if (!packagingBuilderSets[index]) return;
    if (field === 'qty') packagingBuilderSets[index][field] = Math.max(1, parseInt(value, 10) || 1);
    else packagingBuilderSets[index][field] = value;
}

function addPackagingSet(prefill) {
    packagingBuilderSets.push(normalizeCustomPackageSet(prefill || createDefaultPackagingSet()));
    renderPackagingSets();
}

function removePackagingSet(index) {
    if (packagingBuilderSets.length <= 1) packagingBuilderSets = [createDefaultPackagingSet()];
    else packagingBuilderSets.splice(index, 1);
    renderPackagingSets();
}

function togglePackagingDeliveryFields() {
    var selected = document.querySelector('input[name="packageDelivery"]:checked');
    var locationField = document.getElementById('packageLocationField');
    if (locationField) locationField.style.display = selected && selected.value === 'delivery' ? 'flex' : 'none';
}

function resetPackagingBuilderForm() {
    editingCustomPackageId = '';
    packagingBuilderSets = [createDefaultPackagingSet()];
    var title = document.getElementById('packagingBuilderTitle');
    var submit = document.getElementById('packagingBuilderSubmit');
    if (title) title.textContent = 'صممي علبتك المخصصة';
    if (submit) submit.textContent = 'أضيفي إلى السلة';
    if (document.getElementById('packageWrapperColor')) document.getElementById('packageWrapperColor').value = 'gold';
    if (document.getElementById('packageNotes')) document.getElementById('packageNotes').value = '';
    if (document.getElementById('packageCustomerName')) document.getElementById('packageCustomerName').value = '';
    if (document.getElementById('packageCustomerPhone')) document.getElementById('packageCustomerPhone').value = '';
    if (document.getElementById('packageCustomerLocation')) document.getElementById('packageCustomerLocation').value = '';
    document.querySelectorAll('input[name="packageDelivery"]').forEach(function (input) {
        input.checked = input.value === 'delivery';
    });
    renderPackagingSets();
    togglePackagingDeliveryFields();
}

function populatePackagingBuilder(item) {
    var normalized = normalizeCustomPackageItem(item);
    editingCustomPackageId = normalized.id;
    packagingBuilderSets = normalized.sets.map(function (setItem) { return normalizeCustomPackageSet(setItem); });
    if (document.getElementById('packagingBuilderTitle')) document.getElementById('packagingBuilderTitle').textContent = 'تعديل العلبة المخصصة';
    if (document.getElementById('packagingBuilderSubmit')) document.getElementById('packagingBuilderSubmit').textContent = 'حفظ التعديلات';
    renderPackagingSets();
    document.getElementById('packageWrapperColor').value = normalized.wrapperColor;
    document.getElementById('packageNotes').value = normalized.notes;
    document.getElementById('packageCustomerName').value = normalized.customerName;
    document.getElementById('packageCustomerPhone').value = normalized.customerPhone;
    document.getElementById('packageCustomerLocation').value = normalized.customerLocation || '';
    document.querySelectorAll('input[name="packageDelivery"]').forEach(function (input) {
        input.checked = input.value === normalized.delivery;
    });
    togglePackagingDeliveryFields();
}

function openPackagingBuilder(itemId) {
    var modal = document.getElementById('packagingBuilderModal');
    if (!modal) return;
    if (itemId) {
        var item = cart.find(function (entry) { return entry.type === 'custom_package' && entry.id === itemId; });
        if (!item) return;
        populatePackagingBuilder(item);
    } else {
        resetPackagingBuilderForm();
    }
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function closePackagingBuilder(event) {
    if (event && event.target !== event.currentTarget) return;
    var modal = document.getElementById('packagingBuilderModal');
    if (!modal) return;
    modal.style.display = 'none';
    document.body.style.overflow = '';
    resetPackagingBuilderForm();
}

function saveCustomPackageFromBuilder() {
    var selectedDelivery = document.querySelector('input[name="packageDelivery"]:checked');
    var customerName = (document.getElementById('packageCustomerName').value || '').trim();
    var customerPhone = (document.getElementById('packageCustomerPhone').value || '').trim();
    var customerLocation = (document.getElementById('packageCustomerLocation').value || '').trim();
    if (!customerName || !customerPhone) {
        alert('الرجاء إدخال الاسم ورقم الهاتف للعلبة المخصصة');
        return;
    }
    if (selectedDelivery && selectedDelivery.value === 'delivery' && !customerLocation) {
        alert('الرجاء إدخال موقع التوصيل للعلبة المخصصة');
        return;
    }
    var packageItem = normalizeCustomPackageItem({
        id: editingCustomPackageId || 'pkg_' + Date.now(),
        sets: packagingBuilderSets,
        wrapperColor: document.getElementById('packageWrapperColor').value,
        notes: document.getElementById('packageNotes').value,
        delivery: selectedDelivery ? selectedDelivery.value : 'delivery',
        customerName: customerName,
        customerPhone: customerPhone,
        customerLocation: customerLocation,
        qty: 1
    });
    var existingIndex = cart.findIndex(function (entry) {
        return entry.type === 'custom_package' && entry.id === packageItem.id;
    });
    if (existingIndex >= 0) cart[existingIndex] = packageItem;
    else cart.push(packageItem);
    saveCart();
    updateCartBadge();
    updateCheckoutLink(updateCartTotal());
    renderCart();
    closePackagingBuilder();
    alert(existingIndex >= 0 ? 'تم تحديث العلبة المخصصة بنجاح' : 'تمت إضافة العلبة المخصصة إلى السلة');
}

function editCustomPackage(itemId) {
    if (document.getElementById('cartSidebar').classList.contains('active')) toggleCart();
    setTimeout(function () {
        openPackagingBuilder(itemId);
    }, 180);
}

function getCustomPackageSetsHtml(sets) {
    return (Array.isArray(sets) ? sets : []).map(function (setItem, index) {
        return '<span class="custom-package-set-line">تشكيلة ' + (index + 1) + ': ' + getPackagingTypeLabel(setItem.chocolateType) + ' • ' + getPackagingFillingLabel(setItem.filling) + ' • الكمية ' + (parseInt(setItem.qty, 10) || 1) + '</span>';
    }).join('');
}

function getCustomPackageDeliveryLabel(item) {
    return item.delivery === 'pickup' ? 'استلام من المصنع' : 'توصيل';
}

function renderCustomPackageCartItem(item) {
    var customerParts = ['<span class="custom-package-meta">لون التغليف: ' + getWrapperColorLabel(item.wrapperColor) + '</span>'];
    customerParts.push('<span class="custom-package-meta">طريقة الاستلام: ' + getCustomPackageDeliveryLabel(item) + '</span>');
    customerParts.push('<span class="custom-package-meta">الاسم: ' + escapeHtml(item.customerName) + ' • الهاتف: ' + escapeHtml(item.customerPhone) + '</span>');
    if (item.delivery === 'delivery' && item.customerLocation) customerParts.push('<span class="custom-package-meta">الموقع: ' + escapeHtml(item.customerLocation) + '</span>');
    if (item.notes) customerParts.push('<span class="custom-package-note">ملاحظات: ' + escapeHtml(item.notes) + '</span>');
    return '<div class="cart-item custom-package-item">'
        + '<div class="custom-package-icon">🎁</div>'
        + '<div class="cart-item-info"><h4>' + getCustomPackageTitle(item) + '</h4>'
        + '<div class="custom-package-sets">' + getCustomPackageSetsHtml(item.sets) + '</div>'
        + customerParts.join('')
        + '<div class="cart-item-price pending-price">السعر يحدد بعد مراجعة الإدارة</div></div>'
        + '<div class="cart-custom-actions"><button type="button" class="cart-item-edit" onclick="editCustomPackage(\'' + item.id + '\')">تعديل</button><button class="cart-item-remove" onclick="removeFromCart(\'' + item.id + '\', -1)">✕</button></div>'
        + '</div>';
}

function getCartKnownTotal() {
    return cart.reduce(function (sum, item) {
        if (item.type === 'custom_package') return sum;
        // Combo items have their price pre-set (comboPrice / pickCount)
        if (item.comboOfferId) return sum + (item.price * item.qty);
        // Package items have their price pre-set
        if (item.type === 'package') return sum + (item.price * item.qty);
        var product = products.find(function (entry) { return String(entry.id) === String(item.id); });
        return product ? sum + getFinalPrice(product, item.sizeIdx, discounts).final * item.qty : sum;
    }, 0);
}

function initializePackagingBuilder() {
    var form = document.getElementById('packagingBuilderForm');
    if (!form) return;
    resetPackagingBuilderForm();
    form.addEventListener('submit', function (event) {
        event.preventDefault();
        saveCustomPackageFromBuilder();
    });
}

function getOrderStatusLabel(status) {
    switch (status) {
        case 'confirmed': return 'تم التأكيد';
        case 'processing': return 'قيد التجهيز';
        case 'completed': return 'مكتمل';
        case 'cancelled': return 'ملغي';
        default: return 'طلب جديد';
    }
}

function renderTrackedOrderItem(item) {
    if (item.type === 'custom_package') {
        return '<div class="tracking-order-item">'
            + '<div class="tracking-order-item-head"><h5>' + getCustomPackageTitle(item) + '</h5><span class="tracking-order-price">السعر يحدد لاحقاً</span></div>'
            + '<span class="tracking-order-extra">لون التغليف: ' + getWrapperColorLabel(item.wrapperColor) + '</span>'
            + '<div class="custom-package-sets">' + getCustomPackageSetsHtml(item.sets) + '</div>'
            + '<span class="tracking-order-extra">طريقة الاستلام: ' + getCustomPackageDeliveryLabel(item) + '</span>'
            + '<span class="tracking-order-extra">الاسم: ' + escapeHtml(item.customerName || '') + ' • الهاتف: ' + escapeHtml(item.customerPhone || '') + '</span>'
            + ((item.delivery === 'delivery' && item.customerLocation) ? '<span class="tracking-order-extra">الموقع: ' + escapeHtml(item.customerLocation) + '</span>' : '')
            + (item.notes ? '<span class="tracking-order-note">ملاحظات: ' + escapeHtml(item.notes) + '</span>' : '')
            + '</div>';
    }
    return '<div class="tracking-order-item">'
        + '<div class="tracking-order-item-head"><h5>' + escapeHtml(item.name) + '</h5><span class="tracking-order-price">' + formatCurrency(item.lineTotal) + '</span></div>'
        + '<span class="tracking-order-details">' + escapeHtml(item.brand || '') + ' • ' + escapeHtml(item.sizeLabel || '') + ' • الكمية ' + (parseInt(item.qty, 10) || 1) + '</span>'
        + '</div>';
}

function renderTrackedOrder(order) {
    var result = document.getElementById('orderTrackingResult');
    if (!result) return;
    var totalItems = (Array.isArray(order.items) ? order.items : []).reduce(function (sum, item) {
        return sum + Math.max(1, parseInt(item.qty, 10) || 1);
    }, 0);
    var totalText = order.totalDisplay || getTotalDisplayText(order.total, !!order.pricingPending);
    result.innerHTML = '<div class="tracking-result-card">'
        + '<div class="tracking-result-head"><div><h4>الطلب ' + escapeHtml(order.id) + '</h4><p>' + formatDateTime(order.date) + '</p></div><span class="tracking-status">' + getOrderStatusLabel(order.status) + '</span></div>'
        + '<div class="tracking-order-items">' + (order.items || []).map(function (item) { return renderTrackedOrderItem(item); }).join('') + '</div>'
        + '<div class="tracking-order-summary">'
        + '<div class="tracking-order-summary-row"><span>عدد المنتجات</span><strong>' + totalItems + '</strong></div>'
        + '<div class="tracking-order-summary-row"><span>الإجمالي</span><strong>' + totalText + '</strong></div>'
        + '<div class="tracking-order-summary-row"><span>الحالة</span><strong>' + getOrderStatusLabel(order.status) + '</strong></div>'
        + '</div></div>';
}

function trackOrder() {
    var input = document.getElementById('orderTrackingInput');
    var result = document.getElementById('orderTrackingResult');
    if (!input || !result) return;
    var orderId = (input.value || '').trim();
    if (!orderId) {
        result.innerHTML = '<div class="order-tracking-message error">أدخلي رقم الطلب أولاً.</div>';
        return;
    }
    if (!window.db) {
        result.innerHTML = '<div class="order-tracking-message error">تعذر الاتصال بقاعدة البيانات حالياً.</div>';
        return;
    }
    result.innerHTML = '<div class="order-tracking-message">جاري البحث عن الطلب...</div>';
    db.collection('orders').doc(orderId).get().then(function (docSnap) {
        if (!docSnap.exists) {
            result.innerHTML = '<div class="order-tracking-message error">لم يتم العثور على طلب بهذا الرقم.</div>';
            return;
        }
        var order = docSnap.data() || {};
        order.id = docSnap.id;
        renderTrackedOrder(order);
    }).catch(function () {
        result.innerHTML = '<div class="order-tracking-message error">تعذر جلب بيانات الطلب حالياً. حاولي مرة أخرى.</div>';
    });
}

function initializeOrderTracking() {
    var input = document.getElementById('orderTrackingInput');
    if (!input) return;
    input.addEventListener('keypress', function (event) {
        if (event.keyCode === 13) {
            event.preventDefault();
            trackOrder();
        }
    });
}

function getSelectedCardSizeIndex(productId) {
    var select = document.getElementById('sizeSelect-' + productId);
    return select ? parseInt(select.value || '0', 10) || 0 : 0;
}

function addToCart(event, productId) {
    event.stopPropagation();
    var product = products.find(function (entry) { return entry.id === productId; });
    if (!product || product.status === 'soldout') return;

    var qty = parseInt(document.getElementById('cardQty-' + productId).textContent, 10) || 1;
    var sizeIdx = getSelectedCardSizeIndex(productId);
    var pricing = getFinalPrice(product, sizeIdx, discounts);
    var btn = event.currentTarget;
    var img = btn.closest('.product-card').querySelector('.product-image img');
    flyToCart(img, product);

    var existing = cart.find(function (item) { return item.id === productId && item.sizeIdx === sizeIdx; });
    if (existing) existing.qty += qty;
    else cart.push({ id: productId, sizeIdx: sizeIdx, qty: qty, price: pricing.final });

    saveCart();
    updateCartBadge();
    updateCheckoutLink(updateCartTotal());

    btn.textContent = 'تمت الإضافة';
    btn.classList.add('added');
    setTimeout(function () {
        btn.textContent = 'أضيفي';
        btn.classList.remove('added');
    }, 1500);

    document.getElementById('cardQty-' + productId).textContent = '1';
}

function flyToCart(imgElement, product) {
    var cartIcon = document.getElementById('cartIcon');
    if (!imgElement || !cartIcon) return;

    var imgRect = imgElement.getBoundingClientRect();
    var cartRect = cartIcon.getBoundingClientRect();

    // Create bubble element
    var bubble = document.createElement('div');
    bubble.className = 'cart-bubble';
    bubble.textContent = product.name;
    document.body.appendChild(bubble);

    // Position at product center
    var startX = imgRect.left + imgRect.width / 2;
    var startY = imgRect.top + imgRect.height / 2;
    bubble.style.left = startX + 'px';
    bubble.style.top = startY + 'px';

    // Calculate destination (cart icon center)
    var endX = cartRect.left + cartRect.width / 2;
    var endY = cartRect.top + cartRect.height / 2;
    var dx = endX - startX;
    var dy = endY - startY;

    bubble.style.setProperty('--bubble-dx', dx + 'px');
    bubble.style.setProperty('--bubble-dy', dy + 'px');

    // Trigger animation
    requestAnimationFrame(function () {
        bubble.classList.add('animate');
    });

    // Cart shake after bubble arrives
    setTimeout(function () {
        cartIcon.classList.add('cart-shake');
        setTimeout(function () { cartIcon.classList.remove('cart-shake'); }, 600);
    }, 800);

    // Clean up bubble
    setTimeout(function () {
        if (bubble.parentNode) bubble.parentNode.removeChild(bubble);
    }, 1100);
}

function changeCardQty(productId, delta) {
    var span = document.getElementById('cardQty-' + productId);
    if (!span) return;
    var qty = (parseInt(span.textContent, 10) || 1) + delta;
    if (qty < 1) qty = 1;
    if (qty > 99) qty = 99;
    span.textContent = qty;
}

function updateCartBadge() {
    var badge = document.getElementById('cartBadge');
    if (!badge) return;
    var totalItems = cart.reduce(function (sum, item) { return sum + item.qty; }, 0);
    if (totalItems > 0) {
        badge.style.display = 'flex';
        badge.textContent = totalItems;
    } else {
        badge.style.display = 'none';
    }
}

function toggleCart() {
    var sidebar = document.getElementById('cartSidebar');
    var overlay = document.getElementById('cartOverlay');
    if (!sidebar || !overlay) return;
    var isOpen = sidebar.classList.contains('active');

    if (isOpen) {
        sidebar.classList.remove('active');
        overlay.classList.remove('active');
        document.body.style.overflow = '';
    } else {
        sidebar.classList.add('active');
        overlay.classList.add('active');
        document.body.style.overflow = 'hidden';
        renderCart();
    }
}

function renderCart() {
    renderCartItems();
}

function updateCartQty(productId, sizeIdx, delta) {
    var item = cart.find(function (entry) { return String(entry.id) === String(productId) && entry.sizeIdx === sizeIdx; });
    if (!item || item.type === 'custom_package') return;
    item.qty += delta;
    if (item.qty < 1) {
        removeFromCart(productId, sizeIdx);
        return;
    }
    saveCart();
    updateCartBadge();
    renderCart();
}

function removeFromCart(productId, sizeIdx) {
    cart = cart.filter(function (entry) {
        if (entry.type === 'custom_package') return entry.id !== String(productId);
        return !(String(entry.id) === String(productId) && entry.sizeIdx === sizeIdx);
    });
    saveCart();
    updateCartBadge();
    renderCart();
}

function clearCart() {
    cart = [];
    saveCart();
    updateCartBadge();
    renderCart();
}

function updateCartTotal() {
    var total = getCartKnownTotal();
    var totalEl = document.getElementById('cartTotal');
    if (totalEl) totalEl.textContent = getTotalDisplayText(total, hasCustomPricingPending(cart));
    return total;
}

function updateCheckoutLink(total) {
    var btn = document.getElementById('checkoutBtn');
    if (!btn) return;
    btn.href = 'checkout.html';
    btn.classList.toggle('disabled', cart.length === 0);
}

function saveCart() {
    localStorage.setItem('drenasshop_cart', JSON.stringify(normalizeCartItems(cart, products.length ? products : normalizeProducts(DEFAULT_PRODUCTS))));
}

function setDeliveryMethod(method) {
    deliveryMethod = method;
    localStorage.setItem('drenasshop_delivery_method', method);
    var pickupBtn = document.getElementById('optPickup');
    var deliveryBtn = document.getElementById('optDelivery');
    if (pickupBtn) pickupBtn.classList.toggle('active', method === 'pickup');
    if (deliveryBtn) deliveryBtn.classList.toggle('active', method === 'delivery');
}

function openPDP(productId) {
    var product = products.find(function (entry) { return entry.id === productId; });
    if (!product) return;

    currentPDPProduct = product;
    currentPDPSizeIdx = 0;
    pdpQty = 1;

    document.getElementById('pdpImage').innerHTML = '<img src="' + product.image + '" alt="' + product.name + '" onerror="this.src=\'' + FALLBACK_IMAGE + '\'">';
    document.getElementById('pdpBrand').textContent = product.brand;
    document.getElementById('pdpName').textContent = product.name;
    document.getElementById('pdpQty').textContent = '1';
    renderPDPSizeOptions();
    updatePDPDisplay();

    var addBtn = document.getElementById('pdpAddBtn');
    if (product.status === 'soldout') {
        addBtn.textContent = 'نفذت الكمية';
        addBtn.disabled = true;
        addBtn.style.background = '#9ca3af';
    } else {
        addBtn.textContent = 'أضيفي للسلة';
        addBtn.disabled = false;
        addBtn.style.background = '';
    }

    renderRelatedProducts(product);
    document.getElementById('pdpModal').style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function renderRelatedProducts(product) {
    var container = document.getElementById('pdpRelatedGrid');
    var section = document.getElementById('pdpRelated');
    if (!container || !section) return;

    var related = products.filter(function (p) {
        return p.id !== product.id && (p.category === product.category || p.brand === product.brand);
    }).slice(0, 4);

    if (related.length === 0) {
        section.style.display = 'none';
        return;
    }

    section.style.display = 'block';
    container.innerHTML = related.map(function (p) {
        var pricing = getFinalPrice(p, 0, discounts);
        return '<div class="pdp-related-item" onclick="openPDP(\'' + p.id + '\')">' +
            '<img src="' + p.image + '" alt="' + p.name + '" onerror="this.src=\'' + FALLBACK_IMAGE + '\'">' +
            '<div class="related-info"><p>' + p.name + '</p><span>' + formatCurrency(pricing.final) + '</span></div>' +
            '</div>';
    }).join('');
}

function renderPDPSizeOptions() {
    var section = document.getElementById('pdpSizeSection');
    var container = document.getElementById('pdpSizes');
    if (!currentPDPProduct || !section || !container) return;

    if (currentPDPProduct.sizes.length <= 1) {
        section.style.display = 'none';
        container.innerHTML = '';
        return;
    }

    section.style.display = 'flex';
    container.innerHTML = currentPDPProduct.sizes.map(function (size, idx) {
        return '<button type="button" class="pdp-size-btn ' + (idx === currentPDPSizeIdx ? 'active' : '') + '" onclick="selectPDPSize(' + idx + ')">' + getSizeLabel(size) + '</button>';
    }).join('');
}

function selectPDPSize(sizeIdx) {
    currentPDPSizeIdx = sizeIdx;
    renderPDPSizeOptions();
    updatePDPDisplay();
}

function updatePDPDisplay() {
    if (!currentPDPProduct) return;
    var sizeData = getSizeData(currentPDPProduct, currentPDPSizeIdx);
    var pricing = getFinalPrice(currentPDPProduct, currentPDPSizeIdx, discounts);
    document.getElementById('pdpMeta').innerHTML = '<span>' + currentPDPProduct.category + '</span><span>' + getSizeLabel(sizeData) + '</span>';
    document.getElementById('pdpPrice').innerHTML = (pricing.hasDiscount ? '<span class="original-price">' + formatCurrency(pricing.original) + '</span>' : '') + '<span class="final-price">' + formatCurrency(pricing.final) + '</span>';
}

function closePDP(event) {
    if (event && event.target !== event.currentTarget) return;
    document.getElementById('pdpModal').style.display = 'none';
    document.body.style.overflow = '';
    currentPDPProduct = null;
}

function changePDPQty(delta) {
    pdpQty += delta;
    if (pdpQty < 1) pdpQty = 1;
    if (pdpQty > 99) pdpQty = 99;
    document.getElementById('pdpQty').textContent = pdpQty;
}

function addFromPDP() {
    if (!currentPDPProduct || currentPDPProduct.status === 'soldout') return;

    var pricing = getFinalPrice(currentPDPProduct, currentPDPSizeIdx, discounts);
    var existing = cart.find(function (item) { return item.id === currentPDPProduct.id && item.sizeIdx === currentPDPSizeIdx; });
    if (existing) existing.qty += pdpQty;
    else cart.push({ id: currentPDPProduct.id, sizeIdx: currentPDPSizeIdx, qty: pdpQty, price: pricing.final });

    saveCart();
    updateCartBadge();
    updateCheckoutLink(updateCartTotal());

    var img = document.querySelector('#pdpImage img');
    if (img) flyToCart(img, currentPDPProduct);

    var btn = document.getElementById('pdpAddBtn');
    btn.textContent = 'تمت الإضافة';
    btn.classList.add('added');
    setTimeout(function () {
        btn.textContent = 'أضيفي للسلة';
        btn.classList.remove('added');
        closePDP();
    }, 1200);
}

// ===== Hero Slider from Firestore =====
var heroSlideIndex = 0;
var heroSlideTimer = null;

function renderHeroSlider(slides) {
    var slider = document.getElementById('heroSlider');
    var dots = document.getElementById('heroDots');
    var hero = document.getElementById('heroSection');
    if (!slider || !slides.length) return;

    // The static hero-bg.png shows until slides load and fade in
    if (hero) hero.style.background = 'linear-gradient(135deg, #0a1628 0%, #1a3a5c 50%, #0d2847 100%)';

    slider.innerHTML = slides.map(function(slide, idx) {
        var mediaHTML = '';
        if (slide.type === 'video') {
            mediaHTML = '<video class="hero-slide-media" src="' + slide.url + '" muted playsinline' + (idx === 0 ? ' autoplay' : '') + '></video>';
        } else {
            mediaHTML = '<img class="hero-slide-media" src="' + slide.url + '" alt="' + (slide.title || 'Enas Shop') + '">';
        }
        var captionHTML = '<div class="hero-overlay" style="background:linear-gradient(180deg,rgba(0,102,204,0.1) 0%,rgba(26,42,58,0.4) 100%);"></div>' +
            '<div class="hero-content">' +
            (slide.title ? '<h1 style="font-size:2.8rem; font-weight:800; color:white; text-shadow:2px 2px 20px rgba(0,0,0,0.3); margin-bottom:12px;">' + slide.title + '</h1>' : '') +
            (slide.subtitle ? '<p style="font-size:1.3rem; color:rgba(255,255,255,0.9); margin-bottom:24px;">' + slide.subtitle + '</p>' : '') +
            '<a href="#products" class="btn-primary" style="background:#B7E1EF;color:#fff;border-radius:8px;padding:14px 35px;">تسوقي الآن</a>' +
            '</div>';
        return '<div class="hero-slide' + (idx === 0 ? ' active' : '') + '">' + mediaHTML + captionHTML + '</div>';
    }).join('');

    // Render dots
    if (slides.length > 1) {
        dots.innerHTML = slides.map(function(_, idx) {
            return '<button class="' + (idx === 0 ? 'active' : '') + '" onclick="goHeroSlide(' + idx + ')"></button>';
        }).join('');
        dots.style.display = 'flex';
    } else {
        dots.style.display = 'none';
    }

    heroSlideIndex = 0;
    startHeroSlideTimer(slides);
}

function goHeroSlide(idx) {
    var allSlides = document.querySelectorAll('#heroSlider .hero-slide');
    var allDots = document.querySelectorAll('#heroDots button');
    if (!allSlides.length) return;

    allSlides[heroSlideIndex].classList.remove('active');
    if (allDots[heroSlideIndex]) allDots[heroSlideIndex].classList.remove('active');

    heroSlideIndex = idx;

    allSlides[heroSlideIndex].classList.add('active');
    if (allDots[heroSlideIndex]) allDots[heroSlideIndex].classList.add('active');

    // Handle video autoplay
    var video = allSlides[heroSlideIndex].querySelector('video');
    if (video) { video.currentTime = 0; video.play(); }
}

function startHeroSlideTimer(slides) {
    if (heroSlideTimer) clearInterval(heroSlideTimer);
    if (slides.length <= 1) return;
    heroSlideTimer = setInterval(function() {
        var nextIdx = (heroSlideIndex + 1) % slides.length;
        goHeroSlide(nextIdx);
    }, 5000);
}

// ===== Combo Offer System =====
function renderComboBanner() {
    var banner = document.getElementById('comboBanner');
    if (!banner) return;

    // Collect combo offer texts
    var texts = comboOffers.map(function(o) { return o.title || 'عرض خاص!'; });

    // Collect active discount texts
    var now = new Date().toISOString().slice(0, 10);
    discounts.forEach(function(d) {
        if (!d.description) return;
        if (d.expiresAt && d.expiresAt < now) return;
        texts.push('🏷️ ' + d.description);
    });

    if (texts.length === 0) {
        banner.style.display = 'none';
        document.body.classList.remove('has-combo-banner');
        return;
    }
    document.getElementById('comboBannerText').textContent = texts.join('   •   ');
    banner.style.display = 'block';
    document.body.classList.add('has-combo-banner');
    // Hide the separate discount banner since combo banner already includes discounts
    var discBanner = document.getElementById('discountBanner');
    if (discBanner) { discBanner.style.display = 'none'; document.body.classList.remove('has-banner'); }
}

function renderComboOffersSection() {
    var section = document.getElementById('comboOffersSection');
    var grid = document.getElementById('comboOffersGrid');
    if (!section || !grid) return;
    if (comboOffers.length === 0) { section.style.display = 'none'; return; }
    section.style.display = 'block';
    grid.innerHTML = comboOffers.map(function(offer) {
        var eligiblePreview = (offer.eligibleProducts || []).slice(0, 6).map(function(pid) {
            var p = products.find(function(pr) { return pr.id === pid; });
            if (!p) return '';
            return '<img src="' + p.image + '" alt="' + p.name + '" onerror="this.src=\'' + FALLBACK_IMAGE + '\'" title="' + p.name + '">';
        }).join('');
        var moreCount = (offer.eligibleProducts || []).length - 6;
        return '<div class="combo-offer-card">' +
            '<div class="combo-offer-badge">عرض محدود</div>' +
            '<h3>' + (offer.title || 'عرض خاص') + '</h3>' +
            '<div class="combo-offer-price"><span class="combo-price-tag">₪' + (offer.comboPrice || 0) + '</span> <span class="combo-pick-info">لـ ' + (offer.pickCount || 4) + ' منتجات</span></div>' +
            '<div class="combo-offer-preview">' + eligiblePreview + (moreCount > 0 ? '<span class="combo-more">+' + moreCount + '</span>' : '') + '</div>' +
            '<button class="btn-primary combo-get-btn" onclick="openComboModal(null, \'' + offer.id + '\')">اختاري باكيج بسعر خاص</button>' +
            '</div>';
    }).join('');
}

function openComboModal(initialSelection, offerId) {
    if (comboOffers.length === 0) return;
    if (offerId) {
        currentComboOffer = comboOffers.find(function(o) { return o.id === offerId; });
    }
    if (!currentComboOffer) currentComboOffer = comboOffers[0];
    var modal = document.getElementById('comboModal');
    if (!modal) return;

    document.getElementById('comboTitle').textContent = currentComboOffer.title || 'عرض خاص';
    document.getElementById('comboDesc').textContent = currentComboOffer.description || '';
    document.getElementById('comboTotal').textContent = currentComboOffer.pickCount || 4;
    document.getElementById('comboPrice').textContent = '₪' + (currentComboOffer.comboPrice || 0);

    // Use initial selection if editing, otherwise start empty
    if (initialSelection && initialSelection.length > 0) {
        comboSelectedIds = initialSelection.slice();
    } else {
        comboSelectedIds = [];
    }

    renderComboProducts();
    updateComboProgress();
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function closeComboModal() {
    var modal = document.getElementById('comboModal');
    if (modal) modal.style.display = 'none';
    document.body.style.overflow = '';
}

function renderComboProducts() {
    var grid = document.getElementById('comboProductsGrid');
    if (!grid || !currentComboOffer) return;
    var eligible = currentComboOffer.eligibleProducts || [];
    var pickCount = currentComboOffer.pickCount || 4;
    var allowDuplicates = !currentComboOffer.uniqueOnly;

    grid.innerHTML = eligible.map(function(pid) {
        var product = products.find(function(p) { return String(p.id) === String(pid); });
        if (!product) return '';
        var selectedCount = comboSelectedIds.filter(function(id) { return id === pid; }).length;
        var isSelected = selectedCount > 0;
        var isDisabled = comboSelectedIds.length >= pickCount && !isSelected;
        if (allowDuplicates) isDisabled = comboSelectedIds.length >= pickCount;
        var disabledClass = isDisabled ? ' disabled' : '';
        var selectedClass = isSelected ? ' selected' : '';
        var price = product.sizes && product.sizes[0] ? product.sizes[0].price : 0;
        var badge = allowDuplicates && selectedCount > 0 ? '<div class="combo-card-count">' + selectedCount + '</div>' : '';
        var removeBtn = allowDuplicates && selectedCount > 0 ? '<button class="combo-card-remove" onclick="event.stopPropagation();removeComboProduct(\'' + pid + '\')">−</button>' : '';
        return '<div class="combo-product-card' + selectedClass + disabledClass + '" onclick="toggleComboProduct(\'' + pid + '\')">' +
            '<div class="combo-card-check">✓</div>' + badge + removeBtn +
            '<img src="' + product.image + '" alt="' + product.name + '" onerror="this.src=\'' + FALLBACK_IMAGE + '\'">' +
            '<div class="combo-card-info"><h4>' + product.name + '</h4>' +
            '<span class="original-price">₪' + price + '</span></div></div>';
    }).join('');
}

function toggleComboProduct(pid) {
    if (!currentComboOffer) return;
    var pickCount = currentComboOffer.pickCount || 4;
    var idx = comboSelectedIds.indexOf(pid);

    if (currentComboOffer.uniqueOnly) {
        // Unique mode: toggle on/off
        if (idx !== -1) {
            comboSelectedIds.splice(idx, 1);
        } else {
            if (comboSelectedIds.length >= pickCount) return;
            comboSelectedIds.push(pid);
        }
    } else {
        // Duplicates allowed: clicking always adds
        if (comboSelectedIds.length >= pickCount) return;
        comboSelectedIds.push(pid);
    }
    renderComboProducts();
    updateComboProgress();
}

function removeComboProduct(pid) {
    var idx = comboSelectedIds.lastIndexOf(pid);
    if (idx !== -1) comboSelectedIds.splice(idx, 1);
    renderComboProducts();
    updateComboProgress();
}

function updateComboProgress() {
    var countEl = document.getElementById('comboCount');
    var btn = document.getElementById('comboConfirmBtn');
    var pickCount = currentComboOffer ? (currentComboOffer.pickCount || 4) : 4;
    if (countEl) countEl.textContent = comboSelectedIds.length;
    if (btn) {
        var complete = comboSelectedIds.length === pickCount;
        btn.disabled = !complete;
        btn.style.opacity = complete ? '1' : '0.5';
    }
}

function confirmCombo() {
    if (!currentComboOffer || comboSelectedIds.length !== (currentComboOffer.pickCount || 4)) return;
    var unitPrice = (currentComboOffer.comboPrice || 0) / (currentComboOffer.pickCount || 1);
    unitPrice = Math.round(unitPrice * 100) / 100;

    // Remove existing combo items for this offer
    cart = cart.filter(function(item) { return !item.comboOfferId || item.comboOfferId !== currentComboOffer.id; });

    // Add new combo items
    comboSelectedIds.forEach(function(pid) {
        cart.push({
            id: pid + '__combo__' + currentComboOffer.id,
            productId: pid,
            sizeIdx: 0,
            qty: 1,
            price: unitPrice,
            comboOfferId: currentComboOffer.id,
            comboTitle: currentComboOffer.title
        });
    });

    saveCart();
    updateCartBadge();
    updateCheckoutLink(updateCartTotal());
    closeComboModal();
    renderCartItems();
}

// Override renderCartItems to show combo groups
var _originalRenderCartItems = typeof renderCartItems === 'function' ? renderCartItems : null;

function renderCartItems() {
    var container = document.getElementById('cartItems');
    var footer = document.getElementById('cartFooter');
    if (!container) return;
    if (cart.length === 0) {
        container.innerHTML = '<div class="cart-empty"><span>•</span><p>السلة فارغة</p></div>';
        if (footer) footer.style.display = 'none';
        return;
    }
    if (footer) footer.style.display = 'block';

    // Separate combo items, packages, and regular items
    var comboGroups = {};
    var packageItems = [];
    var regularItems = [];
    cart.forEach(function(item) {
        if (item.comboOfferId) {
            if (!comboGroups[item.comboOfferId]) comboGroups[item.comboOfferId] = { title: item.comboTitle || 'عرض خاص', items: [], offerId: item.comboOfferId };
            comboGroups[item.comboOfferId].items.push(item);
        } else if (item.type === 'package') {
            packageItems.push(item);
        } else {
            regularItems.push(item);
        }
    });

    var html = '';

    // Render combo groups
    Object.keys(comboGroups).forEach(function(offerId) {
        var group = comboGroups[offerId];
        var totalPrice = group.items.reduce(function(sum, item) { return sum + item.price; }, 0);
        html += '<div class="cart-combo-group">';
        html += '<div class="cart-combo-header"><span>🎁 ' + group.title + ' - ₪' + Math.round(totalPrice) + '</span>';
        html += '<button class="cart-combo-edit" onclick="editCombo(\'' + offerId + '\')">تعديل</button></div>';
        html += '<div class="cart-combo-items">';
        group.items.forEach(function(item) {
            var product = products.find(function(p) { return String(p.id) === String(item.productId); });
            if (product) {
                html += '<div class="cart-combo-item"><img src="' + product.image + '" onerror="this.src=\'' + FALLBACK_IMAGE + '\'">' + product.name + '</div>';
            }
        });
        html += '</div>';
        html += '<button class="btn-clear-cart" style="font-size:0.75rem;padding:4px 10px;margin-top:8px;" onclick="removeCombo(\'' + offerId + '\')">حذف العرض</button>';
        html += '</div>';
    });

    // Render package items
    packageItems.forEach(function(item) {
        var productNames = (item.packageProducts || []).map(function(pid) {
            var p = products.find(function(pr) { return String(pr.id) === String(pid); });
            return p ? p.name : '';
        }).filter(Boolean).join('، ');
        html += '<div class="cart-item cart-package-item">';
        html += '<div style="width:50px;height:50px;background:#eff6ff;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:1.5rem;">📦</div>';
        html += '<div class="cart-item-info"><h4>' + (item.packageName || 'باقة') + '</h4>';
        html += '<span class="cart-item-size" style="font-size:0.7rem;color:#6b7280;">' + productNames + '</span>';
        html += '<span class="cart-item-price">₪' + item.price + '</span></div>';
        html += '<div class="cart-item-qty"><button onclick="changeCartQty(\'' + item.id + '\', 0, -1)">−</button>';
        html += '<span>' + item.qty + '</span>';
        html += '<button onclick="changeCartQty(\'' + item.id + '\', 0, 1)">+</button></div>';
        html += '<button class="cart-item-remove" onclick="removeFromCart(\'' + item.id + '\', 0)">✕</button>';
        html += '</div>';
    });

    // Render regular items
    regularItems.forEach(function(item) {
        var product = products.find(function(p) { return String(p.id) === String(item.id); });
        if (!product) return;
        var sizeData = product.sizes[item.sizeIdx] || product.sizes[0];
        html += '<div class="cart-item">';
        html += '<img src="' + product.image + '" alt="' + product.name + '" onerror="this.src=\'' + FALLBACK_IMAGE + '\'">';
        html += '<div class="cart-item-info"><h4>' + product.name + '</h4>';
        if (sizeData && sizeData.size !== '-') html += '<span class="cart-item-size">' + sizeData.size + (sizeData.unit || '') + '</span>';
        html += '<span class="cart-item-price">₪' + item.price + '</span></div>';
        html += '<div class="cart-item-qty"><button onclick="changeCartQty(\'' + item.id + '\', ' + item.sizeIdx + ', -1)">−</button>';
        html += '<span>' + item.qty + '</span>';
        html += '<button onclick="changeCartQty(\'' + item.id + '\', ' + item.sizeIdx + ', 1)">+</button></div>';
        html += '<button class="cart-item-remove" onclick="removeFromCart(\'' + item.id + '\', ' + item.sizeIdx + ')">✕</button>';
        html += '</div>';
    });

    container.innerHTML = html;
    document.getElementById('cartTotal').textContent = '₪' + updateCartTotal();
}

function editCombo(offerId) {
    var comboItems = cart.filter(function(item) { return item.comboOfferId === offerId; });
    var selectedIds = comboItems.map(function(item) { return item.productId; });
    currentComboOffer = comboOffers.find(function(o) { return o.id === offerId; });
    if (!currentComboOffer) return;
    openComboModal(selectedIds);
}

function removeCombo(offerId) {
    cart = cart.filter(function(item) { return item.comboOfferId !== offerId; });
    saveCart();
    updateCartBadge();
    updateCheckoutLink(updateCartTotal());
    renderCartItems();
}

function changeCartQty(itemId, sizeIdx, delta) {
    var item = cart.find(function(i) { return i.id === itemId && i.sizeIdx === sizeIdx; });
    if (!item) return;
    item.qty += delta;
    if (item.qty < 1) {
        cart = cart.filter(function(i) { return !(i.id === itemId && i.sizeIdx === sizeIdx); });
    }
    saveCart();
    updateCartBadge();
    updateCheckoutLink(updateCartTotal());
    renderCartItems();
}

function removeFromCart(itemId, sizeIdx) {
    cart = cart.filter(function(i) { return !(i.id === itemId && i.sizeIdx === sizeIdx); });
    saveCart();
    updateCartBadge();
    updateCheckoutLink(updateCartTotal());
    renderCartItems();
}

// ===== Packages System =====
function renderPackagesBanner() {
    var banner = document.getElementById('packagesBanner');
    if (!banner) return;
    if (storePackages.length === 0) { banner.style.display = 'none'; return; }
    banner.style.display = 'flex';
}

function openPackagesPopup() {
    var modal = document.getElementById('packagesModal');
    if (!modal) return;
    var grid = document.getElementById('packagesGrid');
    if (!grid) return;
    grid.innerHTML = storePackages.map(function(pkg) {
        var productsHTML = (pkg.products || []).map(function(pid) {
            var p = products.find(function(pr) { return pr.id === pid; });
            if (!p) return '';
            return '<div class="pkg-product-item"><img src="' + p.image + '" onerror="this.src=\'' + FALLBACK_IMAGE + '\'"><span>' + p.name + '</span></div>';
        }).join('');
        return '<div class="pkg-card">' +
            '<h3>' + (pkg.name || 'باقة') + '</h3>' +
            (pkg.description ? '<p class="pkg-desc">' + pkg.description + '</p>' : '') +
            '<div class="pkg-price">₪' + (pkg.price || 0) + '</div>' +
            '<div class="pkg-products-list">' + productsHTML + '</div>' +
            '<button class="btn-primary pkg-add-btn" onclick="addPackageToCart(\'' + pkg.id + '\')">أضيفي للسلة</button>' +
            '</div>';
    }).join('');
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function closePackagesPopup() {
    var modal = document.getElementById('packagesModal');
    if (modal) modal.style.display = 'none';
    document.body.style.overflow = '';
}

function addPackageToCart(pkgId) {
    var pkg = storePackages.find(function(p) { return p.id === pkgId; });
    if (!pkg) return;
    // Add as a single cart item (type: package, no editing)
    var existingIdx = -1;
    cart.forEach(function(item, i) { if (item.id === 'pkg__' + pkgId) existingIdx = i; });
    if (existingIdx !== -1) {
        cart[existingIdx].qty += 1;
    } else {
        cart.push({
            id: 'pkg__' + pkgId,
            type: 'package',
            packageId: pkgId,
            packageName: pkg.name,
            packageProducts: pkg.products || [],
            price: pkg.price || 0,
            qty: 1,
            sizeIdx: 0
        });
    }
    saveCart();
    updateCartBadge();
    updateCheckoutLink(updateCartTotal());
    renderCartItems();
    closePackagesPopup();
}
