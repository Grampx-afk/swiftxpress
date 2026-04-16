//  SUPABASE 
const _supa = window.SUPABASE_URL && window.SUPABASE_URL !== '%%SUPABASE_URL%%';
let _supaClient = null;
let _user = null; // Current logged-in user
let _profile = null; // Current user profile

const supabaseInit = new Promise(resolve => {
  if (_supa) {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
    s.onload = () => {
      _supaClient = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
      // Listen for Auth changes
      _supaClient.auth.onAuthStateChange((event, session) => {
        _user = session?.user || null;
        if (!_user) {
          _profile = null;
          currentOrder = {};
          document.getElementById('prof-name').textContent = 'User Account';
          document.getElementById('prof-email').textContent = 'user@example.com';
          document.getElementById('prof-initials').textContent = 'U';
        }
        updateAuthUI();
        if (_user) fetchProfile();
      });
      resolve();
    };
    s.onerror = () => resolve();
    document.head.appendChild(s);
  } else {
    resolve();
  }
});

//  AUTH & PROFILE LOGIC 
function updateAuthUI() {
  const btnLogin = document.getElementById('btn-nav-login');
  const btnProf = document.getElementById('btn-nav-profile');
  const btnNavOrder = document.getElementById('btn-nav-order');
  const btnHeroOrder = document.getElementById('btn-hero-order');

  if (_user) {
    if (btnLogin) btnLogin.style.display = 'none';
    if (btnProf) btnProf.style.display = 'flex';
    if (btnNavOrder) btnNavOrder.style.setProperty('display', 'inline-block', 'important');
    if (btnHeroOrder) btnHeroOrder.style.setProperty('display', 'inline-block', 'important');
    // Pre-fill order form if empty
    if (document.getElementById('f-name') && !document.getElementById('f-name').value) {
      fetchProfile().then(p => {
        if (p) {
          document.getElementById('f-name').value = p.full_name || '';
          document.getElementById('f-phone').value = p.phone || '';
          if (p.saved_address) {
            document.getElementById('addr-selection-wrap').style.display = 'block';
            document.getElementById('f-dropoff').value = p.saved_address;
          }
        }
      });
    }
  } else {
    if (btnLogin) btnLogin.style.display = 'flex';
    if (btnProf) btnProf.style.display = 'none';
    if (btnNavOrder) btnNavOrder.style.setProperty('display', 'none', 'important');
    if (btnHeroOrder) btnHeroOrder.style.setProperty('display', 'none', 'important');
    if (document.getElementById('addr-selection-wrap')) {
      document.getElementById('addr-selection-wrap').style.display = 'none';
    }
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value;
  const pass = document.getElementById('login-password').value;
  const err = document.getElementById('login-err');
  err.style.display = 'none';

  const { data, error } = await _supaClient.auth.signInWithPassword({ email, password: pass });
  if (error) {
    err.textContent = error.message;
    err.style.display = 'block';
  } else {
    closeAuth();
    showPage('home');
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');
  const name = document.getElementById('reg-name').value;
  const email = document.getElementById('reg-email').value;
  const phone = document.getElementById('reg-phone').value;
  const pass = document.getElementById('reg-password').value;
  const err = document.getElementById('reg-err');

  err.style.display = 'none';
  const originalText = btn.textContent;
  btn.textContent = 'CREATING ACCOUNT...';
  btn.disabled = true;

  try {
    const { data, error } = await _supaClient.auth.signUp({
      email,
      password: pass,
      options: {
        data: { full_name: name, phone: phone }
      }
    });

    if (error) {
      err.textContent = error.message;
      err.style.display = 'block';
    } else if (data.user) {
      // Check if session is established (means confirmation is off)
      const session = data.session;

      // Create profile record
      const { error: profError } = await _supaClient.from('profiles').insert([{
        id: data.user.id,
        full_name: name,
        phone: phone
      }]);

      if (profError) {
        console.error('Profile Creation Error:', profError);
        // We don't block the user but notify them
      }

      if (!session) {
        alert('Account created! Please check your email to confirm your account before signing in.');
        closeAuth();
        showAuth('login');
      } else {
        closeAuth();
        showPage('home');
      }
    } else {
      err.textContent = "Something went wrong. Please try again.";
      err.style.display = 'block';
    }
  } catch (ex) {
    err.textContent = "Connection error. Please check your internet.";
    err.style.display = 'block';
    console.error('Registration Exception:', ex);
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
}

async function handleLogout() {
  await _supaClient.auth.signOut();
  showPage('home');
}

async function fetchProfile() {
  if (!_user) return null;

  // Verify user against backend to catch deleted accounts
  const { data: activeUser, error: authErr } = await _supaClient.auth.getUser();
  if (authErr || !activeUser?.user) {
    await handleLogout();
    alert('Your session has expired or your account is no longer valid. Please log in again.');
    return null;
  }

  _profile = null; // Clear old profile before fetching
  let { data, error } = await _supaClient.from('profiles').select('*').eq('id', _user.id).single();

  // If profile doesn't exist, try to create it from auth data
  if (error && error.code === 'PGRST116') {
    const { error: insError } = await _supaClient.from('profiles').insert([{
      id: _user.id,
      full_name: _user.user_metadata?.full_name || 'User Account',
      phone: _user.user_metadata?.phone || ''
    }]);
    if (!insError) {
      const { data: newData } = await _supaClient.from('profiles').select('*').eq('id', _user.id).single();
      data = newData;
    }
  }

  if (data) {
    _profile = data;
    renderProfile();
    return data;
  }
  return null;
}

function renderProfile() {
  if (!_profile) return;
  document.getElementById('prof-name').textContent = _profile.full_name || 'Guest User';
  document.getElementById('prof-email').textContent = _user.email;
  document.getElementById('prof-initials').textContent = (_profile.full_name || 'U').charAt(0).toUpperCase();
  document.getElementById('prof-edit-name').value = _profile.full_name || '';
  document.getElementById('prof-edit-phone').value = _profile.phone || '';

  const addrBox = document.getElementById('prof-addr-text');
  if (addrBox) addrBox.textContent = _profile.saved_address || 'No address saved yet.';
  const addrInput = document.getElementById('prof-address-input');
  if (addrInput) addrInput.value = _profile.saved_address || '';

  fetchUserHistory();
}

function toggleAddrEdit(isEditing) {
  document.getElementById('prof-addr-view').style.display = isEditing ? 'none' : 'block';
  document.getElementById('prof-addr-edit').style.display = isEditing ? 'block' : 'none';
}

async function updateProfile(e) {
  e.preventDefault();
  const name = document.getElementById('prof-edit-name').value;
  const phone = document.getElementById('prof-edit-phone').value;
  const btn = document.getElementById('btn-save-profile');
  btn.textContent = 'SAVING...';
  const { error } = await _supaClient.from('profiles').update({ full_name: name, phone }).eq('id', _user.id);
  if (!error) {
    _profile.full_name = name; _profile.phone = phone;
    renderProfile();
    btn.textContent = 'SAVED ✓';
    setTimeout(() => btn.textContent = 'SAVE CHANGES', 2000);
  }
}

async function saveProfileAddress() {
  const addr = document.getElementById('prof-address-input').value;
  const btn = document.querySelector('#prof-addr-edit .btn-red');
  btn.textContent = 'SAVING...';
  const { error } = await _supaClient.from('profiles').update({ saved_address: addr }).eq('id', _user.id);
  if (!error) {
    _profile.saved_address = addr;
    renderProfile();
    toggleAddrEdit(false);
  }
  btn.textContent = 'SAVE';
}

async function fetchUserHistory() {
  const { data, error } = await _supaClient.from('orders').select('*').eq('user_id', _user.id).order('created_at', { ascending: false });
  const container = document.getElementById('history-container');
  const count = document.getElementById('hist-count');
  if (!error && data) {
    count.textContent = data.length;
    if (data.length === 0) {
      container.innerHTML = `<p style="text-align:center; color:var(--gray); font-size:12px; padding:40px 0;">You haven't placed any orders yet.</p>`;
      return;
    }
    container.innerHTML = data.map(o => `
          <div class="history-item" onclick="showTrackPage('${o.order_number || o.id}')">
            <div class="h-info">
              <h4>${o.item}</h4>
              <p>${new Date(o.created_at).toLocaleDateString()} • ${o.fee}</p>
            </div>
            <div class="h-status ${o.status}">${o.status}</div>
          </div>
        `).join('');
  }
}

// SMART ADDRESS LOGIC
function useSavedAddr() {
  if (!_profile?.saved_address) return;
  document.getElementById('f-dropoff').value = _profile.saved_address;
  document.getElementById('addr-opt-home').classList.add('active');
  document.getElementById('addr-opt-change').classList.remove('active');
}
function changeAddr() {
  document.getElementById('addr-opt-home').classList.remove('active');
  document.getElementById('addr-opt-change').classList.add('active');
  document.getElementById('f-dropoff').focus();
}


//  STATE 
let orders = [];
let currentOrder = {};
const gSettings = JSON.parse(localStorage.getItem('sxSettings') || '{}');
let INSIDE_FEE = gSettings['s-fee'] ? parseInt(gSettings['s-fee']) : 700; // Use 700 as safe default
// Immediately render cached/default fee so placeholder never shows
document.addEventListener('DOMContentLoaded', () => {
  const _fee = INSIDE_FEE;
  ['txt-inside-fee', 'fo-txt-inside-fee', 'er-txt-inside-fee'].forEach(id => {
    const el = document.getElementById(id); if (el) el.textContent = `Fixed fee — ₦${_fee}`;
  });
});
let deliveryType = 'inside';
let orderCategory = 'food';
let foodItemsTotal = 0;
let trackInterval = null;

// Load live delivery fee from Supabase (overrides localStorage)
let liveFeeLoaded = false;
async function loadLiveFee() {
  await supabaseInit;
  if (!_supaClient) return;
  const { data, error } = await _supaClient
    .from('settings')
    .select('value')
    .eq('key', 'delivery_fee')
    .single();
  if (!error && data && data.value) {
    const liveFee = parseInt(data.value);
    if (!isNaN(liveFee) && liveFee > 0) {
      INSIDE_FEE = liveFee;
      liveFeeLoaded = true;
      // Update configuration hints, but NOT the final payment/summary totals if an order is active
      const e1 = document.getElementById('txt-inside-fee'); if (e1) e1.textContent = `Fixed fee — ₦${INSIDE_FEE}`;
      const fe1 = document.getElementById('fo-txt-inside-fee'); if (fe1) fe1.textContent = `Fixed fee — ₦${INSIDE_FEE}`;
      const ee1 = document.getElementById('er-txt-inside-fee'); if (ee1) ee1.textContent = `Fixed fee — ₦${INSIDE_FEE}`;

      // Only update summary/payment elements if WE ARE NOT CURRENTLY VIEWING A SAVED ORDER
      if (!currentOrder || !currentOrder.id) {
        const e2 = document.getElementById('sum-delivery-fee'); if (e2) e2.textContent = `₦${INSIDE_FEE}`;
        const e3 = document.getElementById('sum-fee'); if (e3) e3.textContent = `₦${INSIDE_FEE}`;
        const e4 = document.getElementById('pay-amount'); if (e4) e4.textContent = `₦${INSIDE_FEE}`;
        const e5 = document.getElementById('btn-pay-now'); if (e5) e5.textContent = ` PAY ₦${INSIDE_FEE} SECURELY`;
        const e6 = document.getElementById('rcpt-amount'); if (e6) e6.textContent = `₦${INSIDE_FEE}`;
        const e7 = document.getElementById('fail-amount'); if (e7) e7.textContent = `₦${INSIDE_FEE}`;
      }
    }
  }
}
const liveFeePromise = loadLiveFee();

const fmtId = (id) => String(id).padStart(3, '0');
const generateOrderNumber = () => Math.floor(1000 + Math.random() * 9000).toString();

//  NAVIGATION 
function showPage(id, pushState = true) {
  if (id === 'login' || id === 'register') {
    showAuth(id);
    return;
  }
  closeAuth(); // hide modals if navigating to a real page
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  window.scrollTo(0, 0);
  if (pushState) {
    history.pushState({ page: id }, '', '#' + id);
  }
}

// Handle browser back/forward buttons
window.addEventListener('popstate', function (e) {
  const page = e.state?.page || 'home';
  showPage(page, false);
});

// Set initial history state
(function () {
  const hash = location.hash.replace('#', '');
  const validPages = ['home', 'dtype', 'order', 'food-order', 'errand', 'summary', 'payment', 'confirm', 'pay-failed', 'profile'];
  const startPage = validPages.includes(hash) ? hash : 'home';
  history.replaceState({ page: startPage }, '', startPage === 'home' ? location.pathname : '#' + startPage);
})();
function showAuth(id) {
  document.getElementById('login').classList.remove('active-modal');
  document.getElementById('register').classList.remove('active-modal');
  document.getElementById(id).classList.add('active-modal');
}
function closeAuth() {
  document.getElementById('login').classList.remove('active-modal');
  document.getElementById('register').classList.remove('active-modal');
}

function goHome() { showPage('home'); }
function startOrder() {
  if (!_user) {
    alert('Kindly sign in to your SwiftXpress account to place an order.');
    showAuth('login');
    return;
  }
  // Show T&C modal before proceeding to order form
  document.getElementById('tnc-modal').classList.add('open');
}
async function tncAgree() {
  document.getElementById('tnc-modal').classList.remove('open');
  await loadLiveFee();
  const e1 = document.getElementById('txt-inside-fee'); if (e1) e1.textContent = `Fixed fee – ₦${INSIDE_FEE}`;
  const e2 = document.getElementById('fo-txt-inside-fee'); if (e2) e2.textContent = `Fixed fee – ₦${INSIDE_FEE}`;
  const e3 = document.getElementById('er-txt-inside-fee'); if (e3) e3.textContent = `Fixed fee – ₦${INSIDE_FEE}`;
  // Pre-fill food order + errand forms from profile
  if (_profile) {
    const fn = document.getElementById('fo-name'); if (fn && !fn.value) fn.value = _profile.full_name || '';
    const fp = document.getElementById('fo-phone'); if (fp && !fp.value) fp.value = _profile.phone || '';
    const en = document.getElementById('er-name'); if (en && !en.value) en.value = _profile.full_name || '';
    const ep = document.getElementById('er-phone'); if (ep && !ep.value) ep.value = _profile.phone || '';
    if (_profile.saved_address) {
      document.getElementById('fo-addr-selection-wrap').style.display = 'block';
      document.getElementById('fo-dropoff').value = _profile.saved_address;
    }
  }
  await loadEateries();
  showPage('dtype');
}
function tncDisagree() {
  document.getElementById('tnc-modal').classList.remove('open');
  showPage('home');
}
function openWA(msg) {
  const saved = JSON.parse(localStorage.getItem('sxSettings') || '{}');
  const num = (saved['s-wa'] || window.WA_NUMBER || '2349023413227').replace(/\D/g, '');
  const text = encodeURIComponent(msg || 'Hi SwiftXpress! I need some help or have a question.');
  window.open(`https://wa.me/${num}?text=${text}`, '_blank');
}

//  DELIVERY TYPE & CATEGORY
// ── DELIVERY TYPE PICKER ──
let globalDeliveryMode = 'delivery'; // 'delivery' | 'food' | 'errand'
let foDeliveryType = 'inside';
let erDeliveryType = 'inside';
let foItemsTotal = 0;
let eateries = [];

function selectDeliveryType(mode) {
  globalDeliveryMode = mode;
  if (mode === 'delivery') showPage('order');
  else if (mode === 'food') showPage('food-order');
  else if (mode === 'errand') showPage('errand');
}

// ── EATERIES ──
async function loadEateries() {
  if (!_supaClient) return;
  try {
    const { data, error } = await _supaClient
      .from('eateries')
      .select('id, name, category')
      .eq('active', true)
      .order('name');
    if (error) throw error;
    eateries = data || [];
    renderEateries();
    renderHomeEateries();
  } catch (err) {
    const loadEl = document.getElementById('eatery-loading');
    if (loadEl) loadEl.textContent = 'Could not load eateries. Please try again.';
    console.error('loadEateries error:', err);
  }
}

function renderEateries(filter = '') {
  const grid = document.getElementById('eatery-grid');
  const loadEl = document.getElementById('eatery-loading');
  if (!grid) return;

  const filtered = eateries.filter(e =>
    e.name.toLowerCase().includes(filter.toLowerCase()) ||
    (e.category && e.category.toLowerCase().includes(filter.toLowerCase()))
  );

  if (loadEl) loadEl.style.display = 'none';

  if (filtered.length === 0) {
    grid.innerHTML = `<p style="grid-column:1/-1;text-align:center;padding:20px;color:var(--gray);font-size:13px;">No eateries found matching "${filter}"</p>`;
    return;
  }

  const selectedId = document.getElementById('fo-eatery').value;

  grid.innerHTML = filtered.map(e => {
    const icon = getEateryIcon(e.category);
    const isSelected = String(e.id) === String(selectedId);
    return `
          <div class="eatery-card ${isSelected ? 'selected' : ''}" onclick="selectEatery('${e.id}')">
            <div class="e-icon">${icon}</div>
            <div class="e-name">${e.name}</div>
            <div class="e-cat">${e.category || 'Vendor'}</div>
          </div>
        `;
  }).join('');
}

function renderHomeEateries() {
  const list = document.getElementById('home-eatery-list');
  if (!list) return;
  if (eateries.length === 0) {
    list.innerHTML = `<div style="color:var(--gray);font-size:12px;width:100%;text-align:center;">No eateries active at the moment.</div>`;
    return;
  }
  list.innerHTML = eateries.map(e => {
    const icon = getEateryIcon(e.category);
    return `
                <div class="e-item" onclick="startOrderFromHome('${e.id}')">
                    <div class="icon">${icon}</div>
                    <div class="name">${e.name}</div>
                    <div class="cat">${e.category || 'Vendor'}</div>
                </div>
            `;
  }).join('');
}

function startOrderFromHome(eateryId) {
  if (!_user) {
    alert('Kindly sign in to place an order.');
    showAuth('login');
    return;
  }
  document.getElementById('fo-eatery').value = eateryId;
  // Proceed to agreement or directly to food order
  tncAgree().then(() => {
    selectDeliveryType('food');
    renderEateries(); // highlight the one selected
  });
}

function getEateryIcon(cat) {
  if (!cat) return 'ðŸ´';
  const c = cat.toLowerCase();
  if (c.includes('canteen')) return 'ðŸ²';
  if (c.includes('restaurant')) return 'ðŸ±';
  if (c.includes('fast food')) return 'ðŸ”';
  if (c.includes('supermarket') || c.includes('store')) return 'ðŸ›’';
  if (c.includes('bakery')) return 'ðŸ¥';
  if (c.includes('pharmacy')) return 'ðŸ’Š';
  return 'ðŸ´';
}

function filterEateries(val) {
  renderEateries(val);
}

function selectEatery(id) {
  document.getElementById('fo-eatery').value = id;
  // Update cards UI
  document.querySelectorAll('.eatery-card').forEach(c => {
    c.classList.toggle('selected', c.getAttribute('onclick').includes(`'${id}'`));
  });
  showFoErr('fo-err-eatery', false);
}

// Previous version had redundant function, keeping clean

// ── FOOD ORDER FORM ──
function foSelectType(t) {
  foDeliveryType = t;
  document.getElementById('fo-opt-inside').classList.toggle('selected', t === 'inside');
  document.getElementById('fo-opt-outside').classList.toggle('selected', t === 'outside');
  document.getElementById('fo-outside-notice').classList.toggle('hidden', t !== 'outside');
}
function foUseSavedAddr() {
  document.getElementById('fo-addr-opt-home').classList.add('active');
  document.getElementById('fo-addr-opt-change').classList.remove('active');
  if (_profile?.saved_address) document.getElementById('fo-dropoff').value = _profile.saved_address;
}
function foChangeAddr() {
  document.getElementById('fo-addr-opt-home').classList.remove('active');
  document.getElementById('fo-addr-opt-change').classList.add('active');
  document.getElementById('fo-dropoff').focus();
}
function addFoItem() {
  const cont = document.getElementById('fo-items-container');
  const row = document.createElement('div');
  row.className = 'food-item-row';
  row.style.cssText = 'display:flex;gap:8px;margin-bottom:8px';
  row.innerHTML = `
        <input type="text" class="fo-item-name" placeholder="Item name" style="flex:2" />
        <input type="number" class="fo-item-qty" placeholder="Qty" style="flex:1" min="1" oninput="calcFoTotal()" />
        <input type="number" class="fo-item-price" placeholder="Price (₦)" style="flex:1" min="0" oninput="calcFoTotal()" />
        <button onclick="this.parentElement.remove();calcFoTotal()" style="background:var(--red-dim);border:1px solid var(--red-border);color:var(--red);border-radius:6px;padding:0 10px;cursor:pointer;font-size:16px">✕</button>
      `;
  cont.appendChild(row);
}
function calcFoTotal() {
  foItemsTotal = 0;
  document.querySelectorAll('.fo-item-qty').forEach((q, i) => {
    const p = document.querySelectorAll('.fo-item-price')[i];
    foItemsTotal += (parseFloat(q.value) || 0) * (parseFloat(p?.value) || 0);
  });
  document.getElementById('fo-total-display').textContent = `Items Total: ₦${foItemsTotal}`;
}
function showFoErr(id, show) { document.getElementById(id).style.display = show ? 'block' : 'none'; }
async function submitFoodOrder() {
  const btn = document.querySelector('#food-order .btn-full');
  let valid = true;
  const name = document.getElementById('fo-name').value.trim();
  const phone = document.getElementById('fo-phone').value.trim();
  const eateryId = document.getElementById('fo-eatery').value;
  const dropoff = document.getElementById('fo-dropoff').value.trim();
  showFoErr('fo-err-name', !name); if (!name) valid = false;
  showFoErr('fo-err-phone', phone.length < 8); if (phone.length < 8) valid = false;
  showFoErr('fo-err-eatery', !eateryId); if (!eateryId) valid = false;
  showFoErr('fo-err-dropoff', !dropoff); if (!dropoff) valid = false;
  // Validate items
  const names = document.querySelectorAll('.fo-item-name');
  const qtys = document.querySelectorAll('.fo-item-qty');
  const prices = document.querySelectorAll('.fo-item-price');
  let hasItem = false;
  names.forEach((n, i) => { if (n.value.trim() && qtys[i]?.value > 0 && prices[i]?.value >= 0) hasItem = true; });
  showFoErr('fo-err-items', !hasItem); if (!hasItem) valid = false;
  if (!valid) return;

  btn.textContent = 'SAVING ORDER…'; btn.disabled = true;
  await loadLiveFee();

  const eateryObj = eateries.find(e => String(e.id) === String(eateryId));
  const eateryName = eateryObj ? eateryObj.name : 'Unknown Eatery';
  let itemsArr = [];
  names.forEach((n, i) => {
    if (n.value.trim() && qtys[i]?.value > 0) {
      itemsArr.push(`${n.value.trim()} x${qtys[i].value} @ ₦${prices[i]?.value || 0}`);
    }
  });
  calcFoTotal();
  const itemDesc = `[FOOD from ${eateryName}] ${itemsArr.join(', ')} | Items Total: ₦${foItemsTotal}`;
  const fee = foDeliveryType === 'inside' ? `₦${INSIDE_FEE + foItemsTotal}` : 'Via WhatsApp';
  const ordNum = String(Math.floor(100000 + Math.random() * 900000));

  try {
    const insertData = {
      name, phone,
      item: itemDesc,
      pickup: eateryName,
      dropoff,
      type: foDeliveryType,
      fee,
      time: new Date().toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' }),
      order_number: ordNum,
      status: 'pending',
      user_id: _user?.id || null
    };
    const { data: ord, error } = _supaClient ? await _supaClient.from('orders').insert([insertData]).select().single() : { data: { id: Date.now(), ...insertData }, error: null };
    if (error) throw error;
    currentOrder = { ...insertData, id: ord.id, order_number: ordNum };
    globalDeliveryMode = 'food';
    buildSummary();
    showPage('summary');
  } catch (err) {
    alert('Error saving order. Please try again.');
    console.error(err);
  } finally {
    btn.textContent = 'REVIEW ORDER →'; btn.disabled = false;
  }
}

// ── ERRAND FORM ──
function erSelectType(t) {
  erDeliveryType = t;
  document.getElementById('er-opt-inside').classList.toggle('selected', t === 'inside');
  document.getElementById('er-opt-outside').classList.toggle('selected', t === 'outside');
  document.getElementById('er-outside-notice').classList.toggle('hidden', t !== 'outside');
}
function showErErr(id, show) { document.getElementById(id).style.display = show ? 'block' : 'none'; }
async function submitErrand() {
  const btn = document.querySelector('#errand .btn-full');
  let valid = true;
  const name = document.getElementById('er-name').value.trim();
  const phone = document.getElementById('er-phone').value.trim();
  const task = document.getElementById('er-task').value.trim();
  const pickup = document.getElementById('er-pickup').value.trim();
  const dropoff = document.getElementById('er-dropoff').value.trim();
  showErErr('er-err-name', !name); if (!name) valid = false;
  showErErr('er-err-phone', phone.length < 8); if (phone.length < 8) valid = false;
  showErErr('er-err-task', !task); if (!task) valid = false;
  showErErr('er-err-pickup', !pickup); if (!pickup) valid = false;
  showErErr('er-err-dropoff', !dropoff); if (!dropoff) valid = false;
  if (!valid) return;

  btn.textContent = 'SAVING ORDER…'; btn.disabled = true;
  await loadLiveFee();
  const fee = erDeliveryType === 'inside' ? `₦${INSIDE_FEE}` : 'Via WhatsApp';
  const ordNum = String(Math.floor(100000 + Math.random() * 900000));

  try {
    const insertData = {
      name, phone,
      item: `[ERRAND] ${task}`,
      pickup, dropoff,
      type: erDeliveryType,
      fee,
      time: new Date().toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' }),
      order_number: ordNum,
      status: 'pending',
      user_id: _user?.id || null
    };
    const { data: ord, error } = _supaClient ? await _supaClient.from('orders').insert([insertData]).select().single() : { data: { id: Date.now(), ...insertData }, error: null };
    if (error) throw error;
    currentOrder = { ...insertData, id: ord.id, order_number: ordNum };
    globalDeliveryMode = 'errand';
    buildSummary();
    showPage('summary');
  } catch (err) {
    alert('Error saving order. Please try again.');
    console.error(err);
  } finally {
    btn.textContent = 'REVIEW ORDER →'; btn.disabled = false;
  }
}

// ── GOOGLE AUTH ──
async function handleGoogleAuth() {
  if (!_supaClient) { alert('Authentication not available. Please check your setup.'); return; }
  const { error } = await _supaClient.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin }
  });
  if (error) alert('Google sign-in failed: ' + error.message);
}

function selectType(t) {
  deliveryType = t;
  document.getElementById('opt-inside').classList.toggle('selected', t === 'inside');
  document.getElementById('opt-outside').classList.toggle('selected', t === 'outside');
  document.getElementById('outside-notice').classList.toggle('hidden', t !== 'outside');
}

function selectCat(c) {
  // Logic removed as category selection is no longer in the Package Delivery form.
}

function addFoodItem() {
  const cont = document.getElementById('food-items-container');
  const row = document.createElement('div');
  row.className = 'food-item-row';
  row.style.display = 'flex';
  row.style.gap = '8px';
  row.style.marginBottom = '8px';
  row.innerHTML = `
        <input type="text" class="f-food-name" placeholder="Item name" style="flex:2" />
        <input type="number" class="f-food-qty" placeholder="Qty" style="flex:1" min="1" oninput="calcFoodTotal()" />
        <input type="number" class="f-food-price" placeholder="Price (₦)" style="flex:1" min="0" oninput="calcFoodTotal()" />
        <button onclick="this.parentElement.remove(); calcFoodTotal();" style="flex:none;width:36px;height:42.5px;border-radius:6px;border:1px solid var(--border2);background:transparent;color:var(--gray);cursor:pointer;">X</button>
      `;
  cont.appendChild(row);
}

function calcFoodTotal() {
  foodItemsTotal = 0;
  const qtys = document.querySelectorAll('.f-food-qty');
  const prices = document.querySelectorAll('.f-food-price');
  for (let i = 0; i < qtys.length; i++) {
    let q = parseInt(qtys[i].value) || 0;
    let p = parseInt(prices[i].value) || 0;
    foodItemsTotal += q * p;
  }
  document.getElementById('food-total-display').textContent = 'Items Total: ₦' + foodItemsTotal;
}

//  FORM VALIDATION 
function val(id, errId, check) {
  const v = document.getElementById(id).value.trim();
  const ok = check(v);
  document.getElementById(errId).style.display = ok ? 'none' : 'block';
  return ok;
}

async function submitOrder() {
  const n = val('f-name', 'err-name', v => v.length > 1);
  const p = val('f-phone', 'err-phone', v => v.replace(/\s/g, '').length >= 10);
  const pu = val('f-pickup', 'err-pickup', v => v.length > 1);
  const dr = val('f-dropoff', 'err-dropoff', v => v.length > 1);

  let itemDesc = '';
  let iValid = true;

  iValid = val('f-item', 'err-item', v => v.length > 3);
  itemDesc = document.getElementById('f-item').value.trim();

  if (!n || !p || !iValid || !pu || !dr) return;

  const btn = document.querySelector('#order .btn-full');
  if (btn) { btn.disabled = true; btn.textContent = 'Processing…'; }

  // Ensure we have the latest fee from Supabase before saving the order
  await liveFeePromise;
  await loadLiveFee();
  await supabaseInit;

  if (!_supaClient) {
    alert('System error: Database connection is unavailable.');
    if (btn) { btn.disabled = false; btn.textContent = 'REVIEW ORDER →'; }
    return;
  }

  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' }) + ' Â· ' +
    now.toLocaleDateString('en-NG', { day: 'numeric', month: 'short' });

  const orderData = {
    name: document.getElementById('f-name').value.trim(),
    phone: document.getElementById('f-phone').value.trim(),
    item: itemDesc,
    pickup: document.getElementById('f-pickup').value.trim(),
    dropoff: document.getElementById('f-dropoff').value.trim(),
    type: deliveryType,
    fee: deliveryType === 'inside' ? `₦${INSIDE_FEE}` : 'Via WhatsApp',
    time: timeStr,
    status: 'pending',
    order_number: currentOrder && currentOrder.order_number ? currentOrder.order_number : generateOrderNumber()
  };

  let savedData = null;
  if (currentOrder && currentOrder.id) {
    // Update existing order
    savedData = await updateOrder(currentOrder.id, orderData);
    if (savedData) {
      currentOrder = { ...orderData, id: currentOrder.id };
    }
  } else {
    // Insert new order
    savedData = await saveOrder(orderData);
    if (savedData) {
      currentOrder = savedData;
    }
  }

  if (!savedData) {
    if (btn) { btn.disabled = false; btn.textContent = 'REVIEW ORDER →'; }
    return;
  }

  buildSummary();
  if (btn) { btn.disabled = false; btn.textContent = 'REVIEW ORDER →'; }
}

function buildSummary() {
  if (!currentOrder || !currentOrder.id) return;

  const sid = currentOrder.order_number || fmtId(currentOrder.id);
  document.getElementById('sum-id').textContent = sid;
  document.getElementById('sum-time').textContent = currentOrder.time || '';
  document.getElementById('sum-name').textContent = currentOrder.name;
  document.getElementById('sum-phone').textContent = currentOrder.phone;
  document.getElementById('sum-item').textContent = currentOrder.item;
  document.getElementById('sum-pickup').textContent = currentOrder.pickup;
  document.getElementById('sum-dropoff').textContent = currentOrder.dropoff;

  const activeType = currentOrder.type || deliveryType;
  document.getElementById('sum-type').textContent = activeType === 'inside' ? 'Inside Campus' : 'Outside Campus';

  const feeEl = document.getElementById('sum-fee');
  const rowFood = document.getElementById('row-food-total');
  const foodTotalEl = document.getElementById('sum-food-total');
  const deliveryFeeEl = document.getElementById('sum-delivery-fee');

  if (activeType === 'inside') {
    feeEl.className = 'sum-val big';

    if (globalDeliveryMode === 'food') {
      rowFood.classList.remove('hidden');
      // If we have foItemsTotal (new order), use it. Otherwise try to extract from description.
      let foodTotal = foItemsTotal;
      if (!foodTotal && currentOrder.item && currentOrder.item.includes('Items Total: ₦')) {
        foodTotal = parseInt(currentOrder.item.split('Items Total: ₦')[1]) || 0;
      }

      foodTotalEl.textContent = `₦${foodTotal}`;
      deliveryFeeEl.textContent = `₦${INSIDE_FEE}`;
      // ALWAYS Prefer the stored fee if available
      feeEl.textContent = currentOrder.fee || `₦${INSIDE_FEE + foodTotal}`;
    } else {
      // Standard package delivery or errand
      rowFood.classList.add('hidden');
      deliveryFeeEl.textContent = `₦${INSIDE_FEE}`;
      feeEl.textContent = currentOrder.fee || `₦${INSIDE_FEE}`;
    }
  } else {
    rowFood.classList.add('hidden');
    deliveryFeeEl.textContent = 'TBD';
    feeEl.className = 'sum-val pending';
    feeEl.textContent = currentOrder.fee || 'Will be sent via WhatsApp before payment';
  }

  // Fix Edit button to go to correct page
  const editBtn = document.querySelector('#summary .btn-outline-red');
  if (editBtn) {
    if (globalDeliveryMode === 'food') editBtn.onclick = () => showPage('food-order');
    else if (globalDeliveryMode === 'errand') editBtn.onclick = () => showPage('errand');
    else editBtn.onclick = () => showPage('order');
  }

  showPage('summary');
}

//  PAYMENT 
async function goToPayment() {
  if (!currentOrder || !currentOrder.id) {
    alert('System error: Order data missing. Please try again.');
    showPage('order');
    return;
  }

  const sid = currentOrder.order_number || fmtId(currentOrder.id);

  const hasNumericFee = currentOrder.fee && currentOrder.fee.match(/\d+/);

  if (currentOrder.type === 'inside' || hasNumericFee) {
    // Robust amount extraction: removes currency, commas, but handles decimals if people happen to enter them
    const feeStr = currentOrder.fee || `${INSIDE_FEE}`;
    const totalAmount = parseInt(feeStr.replace(/[^\d]/g, '')) || INSIDE_FEE;

    // Show inside campus Paystack card, hide outside card
    document.getElementById('pay-card-inside').style.display = '';
    document.getElementById('pay-card-outside').style.display = 'none';
    document.getElementById('pay-id').textContent = sid;
    document.getElementById('pay-amount').textContent = `₦${totalAmount}`;
    document.getElementById('btn-pay-now').style.display = '';
    document.getElementById('btn-pay-now').textContent = ` PAY ₦${totalAmount} SECURELY`;
    document.getElementById('pay-verifying').style.display = 'none';
  } else {
    // Outside campus – show WhatsApp card
    document.getElementById('pay-card-inside').style.display = 'none';
    document.getElementById('pay-card-outside').style.display = '';
    document.getElementById('pay-id-outside').textContent = sid;
    resendOutsideWA();
  }

  showPage('payment');
}

function resendOutsideWA() {
  if (!currentOrder) return;
  const sid = currentOrder.order_number || fmtId(currentOrder.id);
  const msg = `Hi SwiftXpress! I'm placing an OUTSIDE campus order.\n\nOrder ID: #${sid}\nName: ${currentOrder.name}\nPhone: ${currentOrder.phone}\nOrder: ${currentOrder.item}\nPickup: ${currentOrder.pickup}\nDelivery: ${currentOrder.dropoff}\n\nPlease confirm the delivery fee.`;
  openWA(msg);
}

function launchPaystack() {
  if (typeof PaystackPop === 'undefined') {
    alert('Payment system is still loading, please try again in a moment.');
    return;
  }
  if (!currentOrder || !currentOrder.id) return;

  const key = window.PAYSTACK_PUBLIC_KEY;
  if (!key || key === '%%PAYSTACK_PUBLIC_KEY%%') {
    alert('Paystack is not configured yet. Please contact SwiftXpress support.');
    return;
  }

  const phone = currentOrder.phone.replace(/\s/g, '');
  // Paystack requires an email. Build one from the phone number.
  const email = `${phone}@swiftxpress.ng`;
  const ref = `SX-${currentOrder.id}-${Date.now()}`;
  const btn = document.getElementById('btn-pay-now');
  btn.disabled = true;
  btn.textContent = 'Opening payment…';

  const totalAmountStr = currentOrder.fee ? currentOrder.fee.replace(/[^0-9]/g, '') : `${INSIDE_FEE}`;
  const totalAmount = parseInt(totalAmountStr) || INSIDE_FEE;

  const handler = PaystackPop.setup({
    key: key,
    email: email,
    amount: totalAmount * 100, // kobo
    currency: 'NGN',
    ref: ref,
    metadata: {
      order_id: currentOrder.id,
      order_number: currentOrder.order_number || fmtId(currentOrder.id),
      customer_name: currentOrder.name,
      customer_phone: currentOrder.phone,
    },
    callback: function (response) {
      // Payment popup closed with success – now verify server-side
      btn.style.display = 'none';
      document.getElementById('pay-verifying').style.display = 'block';
      verifyAndConfirmPayment(response.reference);
    },
    onClose: function () {
      // User closed popup without completing payment
      btn.disabled = false;
      const feeStr = currentOrder.fee || `${INSIDE_FEE}`;
      const totalAmount = parseInt(feeStr.replace(/[^\d]/g, '')) || INSIDE_FEE;
      btn.textContent = ` PAY ₦${totalAmount} SECURELY`;
      showFailedReceipt(ref, 'Payment was cancelled — you closed the payment window without completing it.');
    }
  });

  handler.openIframe();
}

async function verifyAndConfirmPayment(reference) {
  try {
    const res = await fetch(
      `${window.SUPABASE_URL}/functions/v1/verify-payment`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${window.SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify({
          reference: reference,
          order_id: currentOrder.id
        })
      }
    );

    const result = await res.json();

    if (res.ok && result.verified) {
      // ✅ Payment confirmed – show success receipt
      currentOrder.status = 'paid';
      showSuccessReceipt(reference);
      const trackingUrl = `${window.location.origin}${window.location.pathname}?track=${currentOrder.order_number || fmtId(currentOrder.id)}`;
      const msg = `Hi SwiftXpress! My payment is confirmed for Order #${currentOrder.order_number || fmtId(currentOrder.id)}.\n\nPaystack Ref: ${reference}\nName: ${currentOrder.name}\nPhone: ${currentOrder.phone}\nItem: ${currentOrder.item}\nPickup: ${currentOrder.pickup}\nDropoff: ${currentOrder.dropoff}\n\nðŸ“¦ Track my order live: ${trackingUrl}\n\nThank you!`;
      openWA(msg);
      startTracking(currentOrder.id);
    } else {
      // ✌ Verification failed – show failed receipt
      document.getElementById('pay-verifying').style.display = 'none';
      const btn = document.getElementById('btn-pay-now');
      btn.style.display = '';
      btn.disabled = false;
      const feeStr = currentOrder.fee || `${INSIDE_FEE}`;
      const totalAmount = parseInt(feeStr.replace(/[^\d]/g, '')) || INSIDE_FEE;
      btn.textContent = ` PAY ₦${totalAmount} SECURELY`;
      showFailedReceipt(reference, result.error || 'Payment could not be verified. Please try again or contact support.');
    }
  } catch (err) {
    console.error('Verification error:', err);
    document.getElementById('pay-verifying').style.display = 'none';
    const btn = document.getElementById('btn-pay-now');
    btn.style.display = '';
    btn.disabled = false;
    const feeStr = currentOrder.fee || `${INSIDE_FEE}`;
    const totalAmount = parseInt(feeStr.replace(/[^\d]/g, '')) || INSIDE_FEE;
    btn.textContent = ` PAY ₦${totalAmount} SECURELY`;
    showFailedReceipt(reference, 'Network error during verification. Please contact support.');
  }
}

function showSuccessReceipt(reference) {
  const now = new Date().toLocaleString('en-NG', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const totalAmountStr = currentOrder.fee ? currentOrder.fee.replace(/[^0-9]/g, '') : `${INSIDE_FEE}`;
  const totalAmount = parseInt(totalAmountStr) || INSIDE_FEE;

  document.getElementById('rcpt-order-id').textContent = `#${currentOrder.order_number || fmtId(currentOrder.id)}`;
  document.getElementById('rcpt-ref').textContent = reference;
  document.getElementById('rcpt-name').textContent = currentOrder.name;
  document.getElementById('rcpt-phone').textContent = currentOrder.phone;
  document.getElementById('rcpt-item').textContent = currentOrder.item;
  document.getElementById('rcpt-pickup').textContent = currentOrder.pickup;
  document.getElementById('rcpt-dropoff').textContent = currentOrder.dropoff;
  document.getElementById('rcpt-amount').textContent = `₦${totalAmount}`;
  document.getElementById('rcpt-time').textContent = now;

  // Wire up Track My Order button
  const orderId = currentOrder.order_number || fmtId(currentOrder.id);
  const trackBtn = document.getElementById('btn-track-my-order');
  if (trackBtn) trackBtn.onclick = () => showTrackPage(orderId);

  showPage('confirm');
}

function showFailedReceipt(reference, reason) {
  const now = new Date().toLocaleString('en-NG', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const totalAmountStr = currentOrder.fee ? currentOrder.fee.replace(/[^0-9]/g, '') : `${INSIDE_FEE}`;
  const totalAmount = parseInt(totalAmountStr) || INSIDE_FEE;

  document.getElementById('fail-order-id').textContent = `#${currentOrder.order_number || fmtId(currentOrder.id)}`;
  document.getElementById('fail-ref').textContent = reference || 'N/A';
  document.getElementById('fail-name').textContent = currentOrder.name || '—';
  document.getElementById('fail-amount').textContent = `₦${totalAmount}`;
  document.getElementById('fail-reason').textContent = reason || 'Payment was not completed';
  document.getElementById('fail-time').textContent = now;

  showPage('pay-failed');
}

function retryPayment() {
  showPage('payment');
  // Reset the pay button
  const btn = document.getElementById('btn-pay-now');
  if (btn) {
    btn.style.display = '';
    btn.disabled = false;
    const feeStr = currentOrder.fee || `${INSIDE_FEE}`;
    const totalAmount = parseInt(feeStr.replace(/[^\d]/g, '')) || INSIDE_FEE;
    btn.textContent = ` PAY ₦${totalAmount} SECURELY`;
  }
  document.getElementById('pay-verifying').style.display = 'none';
}

function copyAcct(btn, text) {
  navigator.clipboard.writeText(text).catch(() => { });
  btn.textContent = 'Copied!';
  btn.classList.add('copied');
  setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 2000);
}

//  LIVE TRACKING 
function startTracking(id) {
  if (trackInterval) clearInterval(trackInterval);
  updateTrackingUI('paid'); // Set initial state
  trackInterval = setInterval(async () => {
    if (!_supaClient) return;
    const { data, error } = await _supaClient.from('orders').select('status').eq('id', id).single();
    if (!error && data) {
      updateTrackingUI(data.status);
      if (data.status === 'delivered') clearInterval(trackInterval);
    }
  }, 4000);
}

function updateTrackingUI(status) {
  const map = { 'pending': 0, 'paid': 1, 'assigned': 2, 'delivered': 3 };
  const idx = map[status] ?? 0;
  const ids = ['tr-received', 'tr-paid', 'tr-assigned', 'tr-delivered'];

  ids.forEach((sid, i) => {
    const el = document.getElementById(sid);
    const dot = el.querySelector('.sdot');
    if (i < idx) {
      dot.className = 'sdot active'; // Green dot (actually green is not defined, using active)
      dot.style.background = 'var(--green)';
      dot.style.animation = 'none';
    } else if (i === idx) {
      dot.className = 'sdot active';
      dot.style.background = 'var(--green)';
      dot.style.animation = 'blink 1.3s infinite';
    } else {
      dot.className = 'sdot idle';
      dot.style.background = 'var(--border2)';
      dot.style.animation = 'none';
    }
  });
}

//  STORAGE 
async function saveOrder(order) {
  if (_supaClient) {
    // Defensively remove 'id' if it exists to avoid identity column conflicts
    const { id, ...dataToSave } = order;
    // Link to user if logged in
    if (_user) dataToSave.user_id = _user.id;
    const { data, error } = await _supaClient.from('orders').insert([dataToSave]).select();
    if (error) {
      console.error('Supabase insert error details:', error);
      console.error('Error details:', { message: error.message, details: error.details, hint: error.hint });
      alert('Database Error: ' + (error.message || 'Check console for details'));
    }
    return data ? data[0] : null;
  }
  return null;
}

async function loadOrders() {
  if (_supaClient) {
    const { data, error } = await _supaClient.from('orders').select('*').order('created_at', { ascending: false });
    if (!error && data) orders = data;
    else if (error) {
      console.error('Supabase load error:', error);
      console.error('Error details:', { message: error.message, details: error.details, hint: error.hint });
    }
  }
}

async function updateOrder(id, order) {
  if (_supaClient) {
    const { data, error } = await _supaClient.from('orders').update(order).eq('id', id).select();
    if (error) {
      console.error('Supabase update error:', error);
      alert('Failed to update order.');
      return null;
    }
    return data ? data[0] : null;
  }
  return null;
}

async function updateOrderStatus(id, status) {
  if (_supaClient) {
    const { error } = await _supaClient.from('orders').update({ status }).eq('id', id);
    if (error) console.error('Supabase update status error:', error);
  }
}



//  TRACKING PAGE
let trackPageInterval = null;

function showTrackPage(orderId) {
  showPage('track');
  if (orderId) {
    document.getElementById('track-input').value = orderId;
    lookupOrder();
  }
}

async function lookupOrder() {
  const raw = document.getElementById('track-input').value.trim();
  const errEl = document.getElementById('track-err');
  const resultCard = document.getElementById('track-result-card');
  errEl.style.display = 'none';
  resultCard.classList.remove('visible');

  if (!raw) { errEl.style.display = 'block'; errEl.textContent = 'Please enter your Order ID.'; return; }
  if (!_supaClient) { errEl.style.display = 'block'; errEl.textContent = 'Database not available. Please try again.'; return; }

  // Search by order_number (4-digit) or numeric id
  const { data, error } = await _supaClient
    .from('orders')
    .select('*')
    .or(`order_number.eq.${raw},id.eq.${isNaN(raw) ? -1 : parseInt(raw)}`)
    .limit(1)
    .single();

  if (error || !data) {
    errEl.style.display = 'block';
    errEl.textContent = 'Order not found. Check your Order ID and try again.';
    return;
  }

  renderTrackResult(data);

  // Start auto-refresh
  if (trackPageInterval) clearInterval(trackPageInterval);
  trackPageInterval = setInterval(async () => {
    const { data: fresh } = await _supaClient.from('orders').select('*').eq('id', data.id).single();
    if (fresh) renderTrackResult(fresh);
    if (fresh && fresh.status === 'delivered') clearInterval(trackPageInterval);
  }, 5000);
}

function renderTrackResult(order) {
  const resultCard = document.getElementById('track-result-card');
  const statusMap = { pending: 0, paid: 1, assigned: 2, delivered: 3 };
  const idx = statusMap[order.status] ?? 0;

  // Header
  document.getElementById('tr-order-id').textContent = order.order_number || fmtId(order.id);

  // Badge
  const badge = document.getElementById('tr-badge');
  const badgeLabels = { pending: 'Awaiting Payment', paid: 'Paid – Preparing', assigned: 'Rider Dispatched', delivered: 'Delivered ✓' };
  badge.textContent = badgeLabels[order.status] || order.status;
  badge.className = 'track-status-badge ' + (order.status || 'pending');

  // Timeline steps
  const steps = ['received', 'paid', 'assigned', 'delivered'];
  steps.forEach((s, i) => {
    const dot = document.getElementById(`trdot-${s}`);
    const label = document.getElementById(`trlabel-${s}`);
    const step = document.getElementById(`trstep-${s}`);
    dot.className = 'track-dot';
    label.className = 'track-step-name';
    step.className = 'track-step';
    if (i < idx) {
      dot.classList.add('done'); dot.textContent = '✓';
      label.classList.add('done'); step.classList.add('done');
    } else if (i === idx) {
      dot.classList.add('active-dot'); dot.textContent = i + 1;
      label.classList.add('active-step'); step.classList.add('active-step');
    } else {
      dot.textContent = i + 1;
    }
  });

  // Details
  document.getElementById('tr-name').textContent = order.name || '–';
  document.getElementById('tr-item').textContent = order.item || '–';
  document.getElementById('tr-pickup').textContent = order.pickup || '–';
  document.getElementById('tr-dropoff').textContent = order.dropoff || '–';
  document.getElementById('tr-fee').textContent = order.fee || '–';

  const hasNumericFee = order.fee && order.fee.match(/\d+/);
  const isPending = order.status === 'pending';
  const trBtnPay = document.getElementById('tr-btn-pay');
  if (trBtnPay) {
    if (isPending && hasNumericFee) {
      trBtnPay.style.display = '';
      currentOrder = order;
      deliveryType = order.type;
    } else {
      trBtnPay.style.display = 'none';
    }
  }

  resultCard.classList.add('visible');
}

function goToPaymentFromTrack() {
  if (!currentOrder) return;
  deliveryType = currentOrder.type;
  goToPayment();
}

// Check URL for ?track=XXXX on load
(function checkTrackParam() {
  const params = new URLSearchParams(window.location.search);
  const trackId = params.get('track');
  if (trackId) {
    // Wait for supabase to init then open track page
    supabaseInit.then(() => showTrackPage(trackId));
  }
})();
loadOrders();

//  SCROLL REVEAL 
function initReveal() {
  const els = document.querySelectorAll('.step, .item-card, .how, .what, .sec-label, .sec-title, .steps-grid, .items-grid');
  els.forEach((el, i) => {
    if (!el.classList.contains('reveal') && !el.classList.contains('reveal-scale')) {
      el.classList.add('reveal');
      el.style.transitionDelay = (i % 4) * 0.08 + 's';
    }
  });
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('visible');
        observer.unobserve(e.target);
      }
    });
  }, { threshold: 0.12 });
  document.querySelectorAll('.reveal, .reveal-left, .reveal-scale').forEach(el => observer.observe(el));
}

// Stagger step cards
document.querySelectorAll('.step').forEach((el, i) => {
  el.style.animationDelay = (i * 0.1) + 's';
});
// Stagger item cards
document.querySelectorAll('.item-card').forEach((el, i) => {
  el.style.animationDelay = (i * 0.08) + 's';
});
// Stagger stat cards
document.querySelectorAll('.stat').forEach((el, i) => {
  el.style.animationDelay = (i * 0.07) + 's';
});

initReveal();

// Re-run reveal on page switches
const _showPageCore = showPage;
window.showPage = function (id) {
  _showPageCore(id);
  setTimeout(initReveal, 50);
};
// Update hardcoded 700 to dynamic INSIDE_FEE
document.addEventListener('DOMContentLoaded', () => {
  const e1 = document.getElementById('txt-inside-fee'); if (e1) e1.textContent = `Fixed fee – ₦${INSIDE_FEE}`;
  const e2 = document.getElementById('sum-delivery-fee'); if (e2) e2.textContent = `₦${INSIDE_FEE}`;
  const e3 = document.getElementById('sum-fee'); if (e3) e3.textContent = `₦${INSIDE_FEE}`;
  const e4 = document.getElementById('pay-amount'); if (e4) e4.textContent = `₦${INSIDE_FEE}`;
  const e5 = document.getElementById('btn-pay-now'); if (e5) e5.textContent = ` PAY ₦${INSIDE_FEE} SECURELY`;
  const e6 = document.getElementById('rcpt-amount'); if (e6) e6.textContent = `₦${INSIDE_FEE}`;
  const e7 = document.getElementById('fail-amount'); if (e7) e7.textContent = `₦${INSIDE_FEE}`;
});

//  REVIEWS SLIDER LOGIC 
let currentRev = 0;
const revCards = document.querySelectorAll('.rev-card');
const revDots = document.querySelectorAll('.rdot');
const revTrack = document.getElementById('rev-track');

function updateReviews() {
  if (!revTrack || revCards.length === 0) return;

  revCards.forEach((c, idx) => {
    if (idx === currentRev) c.classList.add('active');
    else c.classList.remove('active');
  });
  revDots.forEach((d, idx) => {
    if (idx === currentRev) d.classList.add('active');
    else d.classList.remove('active');
  });

  // Calculate center shift
  const activeCard = revCards[currentRev];
  const containerWidth = document.querySelector('.rev-slider-container').offsetWidth;

  // Calculate distance from start of track to center of active card
  const cardCenterOffset = activeCard.offsetLeft + (activeCard.offsetWidth / 2);

  // Shift track to align card center with container center
  const shiftX = (containerWidth / 2) - cardCenterOffset;
  revTrack.style.transform = `translateX(${shiftX}px)`;
}

function changeRev(direction) {
  currentRev += direction;
  if (currentRev < 0) currentRev = revCards.length - 1;
  if (currentRev >= revCards.length) currentRev = 0;
  updateReviews();
}

function goToRev(index) {
  currentRev = index;
  updateReviews();
}

// Initialize reviews layout on load and window resize
window.addEventListener('load', () => { setTimeout(updateReviews, 100); });
window.addEventListener('resize', updateReviews);

// Auto slide for continuous animation
setInterval(() => { changeRev(1); }, 4000);

// ── Review Modal ──────────────────────────────────────
let _reviewStar = 0;

function openReviewModal() {
  _reviewStar = 0;
  document.querySelectorAll('.star-btn').forEach(b => b.classList.remove('lit'));
  document.getElementById('review-text-input').value = '';
  document.getElementById('review-name-input').value = (_profile && _profile.name) ? _profile.name : '';
  document.getElementById('review-modal').classList.add('open');
}

function closeReviewModal() {
  document.getElementById('review-modal').classList.remove('open');
}

function setReviewStar(val) {
  _reviewStar = val;
  document.querySelectorAll('.star-btn').forEach(b => {
    b.classList.toggle('lit', parseInt(b.dataset.val) <= val);
  });
}

async function submitReview() {
  const text = document.getElementById('review-text-input').value.trim();
  const name = document.getElementById('review-name-input').value.trim() || 'Anonymous';
  if (!_reviewStar) { alert('Please select a star rating first.'); return; }
  if (text.length < 10) { alert('Please write a slightly longer review (at least 10 characters).'); return; }

  const btn = document.getElementById('btn-submit-review');
  btn.disabled = true;
  btn.textContent = 'Submitting...';

  try {
    if (_supaClient) {
      const { error } = await _supaClient.from('reviews').insert({
        name,
        rating: _reviewStar,
        text,
        user_id: _user ? _user.id : null,
        created_at: new Date().toISOString()
      });
      if (error) console.warn('Review DB error:', error.message);
    }

    // Inject new card into slider immediately
    const track = document.getElementById('rev-track');
    const initials = name.split(' ').filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 2) || '??';
    const colors = ['#0F766E', '#B45309', '#1D4ED8', '#6B21A8', '#059669', '#DC2626', '#0369A1'];
    const color = colors[Math.floor(Math.random() * colors.length)];
    const stars = '☦'.repeat(_reviewStar) + '☠'.repeat(5 - _reviewStar);

    const card = document.createElement('div');
    card.className = 'rev-card';
    card.innerHTML = `
          <div class="quote-icon">"</div>
          <p class="rev-text" style="margin-bottom:12px;">"${text}"</p>
          <div style="font-size:14px;color:#F59E0B;letter-spacing:2px;margin-bottom:16px;">${stars}</div>
          <div class="rev-author">
            <div class="r-avatar" style="background:${color}">${initials}</div>
            <div>
              <div class="r-name">${name}</div>
              <div class="r-sub">Student • LAUTECH</div>
            </div>
          </div>`;
    track.appendChild(card);

    // Add a dot for the new card
    const dotsContainer = document.querySelector('.rev-dots');
    if (dotsContainer) {
      const dot = document.createElement('span');
      dot.className = 'rdot';
      const newIdx = dotsContainer.children.length;
      dot.onclick = () => goToRev(newIdx);
      dotsContainer.appendChild(dot);
    }

    closeReviewModal();
    setTimeout(updateReviews, 100);
    alert('Thanks for your review! ðŸŽ‰ It\'s now showing on the page.');
  } catch (e) {
    console.error(e);
    closeReviewModal();
    alert('Review submitted – thanks for the feedback!');
  }

  btn.disabled = false;
  btn.textContent = 'SUBMIT REVIEW';
}

// Close review modal when clicking outside the box
document.getElementById('review-modal').addEventListener('click', function (e) {
  if (e.target === this) closeReviewModal();
});