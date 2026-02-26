// ═════════════════════════════════════════════════════════════════
// BANKING DBMS — SHARED APP UTILITIES v2
// ═════════════════════════════════════════════════════════════════

// ─── API fetch helper ─────────────────────────────────────────────
async function apiFetch(url, method = 'GET', body = null) {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(url, opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
}

// ─── Toast Notifications ──────────────────────────────────────────
function showToast(message, type = 'success') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }
    const icons = { success: '✅', error: '❌', info: 'ℹ️' };
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
    <span class="toast-icon">${icons[type] || '💬'}</span>
    <span>${message}</span>
    <span class="toast-close" onclick="this.parentElement.remove()">✕</span>
  `;
    container.appendChild(toast);
    setTimeout(() => {
        if (!toast.parentElement) return;
        toast.style.animation = 'toastOut 0.35s forwards';
        setTimeout(() => toast.remove(), 380);
    }, 3500);
}

// ─── Modal helpers ────────────────────────────────────────────────
function openModal(overlayId) {
    const el = document.getElementById(overlayId);
    if (el) { el.classList.add('open'); el.removeAttribute('aria-hidden'); }
}
function closeModal(overlayId) {
    const el = document.getElementById(overlayId);
    if (el) { el.classList.remove('open'); el.setAttribute('aria-hidden', 'true'); }
}

document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay')) e.target.classList.remove('open');
});
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape')
        document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
});

// ─── Custom Confirm Dialog ────────────────────────────────────────
function showConfirm({ title = 'Are you sure?', message = '', icon = '⚠️', confirmText = 'Delete', onConfirm }) {
    let overlay = document.getElementById('confirm-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'confirm-overlay';
        overlay.className = 'modal-overlay confirm-modal';
        overlay.innerHTML = `
      <div class="modal" style="max-width:400px;text-align:center;padding:40px 32px">
        <div id="confirm-icon" class="confirm-icon"></div>
        <div id="confirm-title" class="confirm-title"></div>
        <div id="confirm-message" class="confirm-text"></div>
        <div class="confirm-actions">
          <button class="btn btn-ghost" id="confirm-cancel">Cancel</button>
          <button class="btn btn-danger" id="confirm-ok"></button>
        </div>
      </div>
    `;
        document.body.appendChild(overlay);
        overlay.querySelector('#confirm-cancel').addEventListener('click', () => overlay.classList.remove('open'));
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.classList.remove('open'); });
    }
    overlay.querySelector('#confirm-icon').textContent = icon;
    overlay.querySelector('#confirm-title').textContent = title;
    overlay.querySelector('#confirm-message').textContent = message;
    overlay.querySelector('#confirm-ok').textContent = confirmText;
    overlay.querySelector('#confirm-ok').onclick = () => {
        overlay.classList.remove('open');
        if (onConfirm) onConfirm();
    };
    overlay.classList.add('open');
}

// ─── Skeleton loading rows ────────────────────────────────────────
function renderSkeletonRows(tbodyId, cols = 5, rows = 5) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    tbody.innerHTML = Array.from({ length: rows }, () => `
    <tr class="skeleton-row">
      ${Array.from({ length: cols }, (_, i) => `
        <td><div class="skeleton skeleton-cell ${i === 0 ? 'short' : i === cols - 1 ? 'badge' : ''}"></div></td>
      `).join('')}
    </tr>
  `).join('');
}

// ─── Format helpers ───────────────────────────────────────────────
function formatCurrency(amount, currency = 'INR') {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency', currency,
        minimumFractionDigits: 2, maximumFractionDigits: 2,
    }).format(amount);
}

function formatDate(d) {
    if (!d) return '—';
    return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', {
        year: 'numeric', month: 'short', day: 'numeric'
    });
}

function formatCompact(n) {
    if (n >= 10000000) return '₹' + (n / 10000000).toFixed(1) + 'Cr';
    if (n >= 100000) return '₹' + (n / 100000).toFixed(1) + 'L';
    if (n >= 1000) return '₹' + (n / 1000).toFixed(1) + 'K';
    return '₹' + n.toFixed(0);
}

// ─── Animated counter ─────────────────────────────────────────────
function animateCounter(el, target, prefix = '', duration = 1200) {
    const start = performance.now();
    function update(time) {
        const progress = Math.min((time - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 4);
        const current = Math.round(target * eased);
        el.textContent = prefix + current.toLocaleString('en-IN');
        if (progress < 1) requestAnimationFrame(update);
    }
    requestAnimationFrame(update);
}

// ─── Active nav highlighting ──────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    const page = location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.nav-item').forEach(item => {
        const href = (item.getAttribute('href') || '').replace('./', '');
        const match = href === page || (page === '' && href === 'index.html');
        if (match) item.classList.add('active');
        else item.classList.remove('active');
    });
});

// ─── Table search filter ──────────────────────────────────────────
function filterTable(inputId, tableId) {
    const input = document.getElementById(inputId);
    if (!input) return;
    input.addEventListener('input', () => {
        const q = input.value.toLowerCase();
        document.querySelectorAll(`#${tableId} tbody tr:not(.skeleton-row)`).forEach(row => {
            row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none';
        });
    });
}

// ─── Chart.js global defaults (Deep Space Neon theme) ────────────
if (window.Chart) {
    Chart.defaults.color = 'rgba(200,220,255,0.65)';
    Chart.defaults.borderColor = 'rgba(0,229,255,0.08)';
    Chart.defaults.font.family = "'Inter', sans-serif";
    Chart.defaults.font.size = 11;
    Chart.defaults.plugins.legend.labels.color = 'rgba(200,220,255,0.75)';
    Chart.defaults.plugins.legend.labels.boxWidth = 10;
    Chart.defaults.plugins.legend.labels.padding = 12;
    Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(4,9,22,0.96)';
    Chart.defaults.plugins.tooltip.borderColor = 'rgba(0,229,255,0.35)';
    Chart.defaults.plugins.tooltip.borderWidth = 1;
    Chart.defaults.plugins.tooltip.padding = 10;
    Chart.defaults.plugins.tooltip.titleColor = '#00e5ff';
    Chart.defaults.plugins.tooltip.bodyColor = 'rgba(200,220,255,0.85)';
    Chart.defaults.plugins.tooltip.titleFont = { family: "'Space Grotesk'", size: 12, weight: '700' };
    Chart.defaults.plugins.tooltip.bodyFont = { family: "'Inter'", size: 11 };
    Chart.defaults.animation.duration = 700;
    Chart.defaults.animation.easing = 'easeInOutQuart';
}
