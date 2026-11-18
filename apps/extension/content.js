const API = 'http://localhost:8787';

async function lookup() {
  const response = await fetch(`${API}/api/lookup?url=${encodeURIComponent(location.href)}`);
  if (!response.ok) return null;
  const body = await response.json();
  return body.product;
}

function panel(text) {
  const root = document.createElement('aside');
  root.setAttribute('dir', 'rtl');
  root.style.cssText =
    'position:fixed;z-index:2147483646;bottom:16px;left:16px;max-width:280px;background:#1c1915;color:#f6f0e6;border-radius:16px;padding:14px;font:14px/1.5 Tahoma,sans-serif';
  root.textContent = text;
  document.body.append(root);
}

lookup()
  .then((product) => {
    if (!product?.bestOffer) {
      panel('صفقة: الصفحة دي لسه متتبعةش. افتح safqa وابحث عن المنتج.');
      return;
    }
    const price = product.bestOffer.priceEgp;
    panel(`صفقة · ${product.titleAr}\nأحسن سعر متسجل: ${price} ج.م\nدرجة ${product.bestOffer.dealScore}`);
  })
  .catch(() => {
    panel('صفقة: الـ API مش متاح.');
  });
