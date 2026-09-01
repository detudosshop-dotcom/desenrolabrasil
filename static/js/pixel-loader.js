/**
 * Universal Pixel Loader & Tracker (UTMify, Facebook/Meta & TikTok)
 * Automatically fetches active pixels from /api/pixels/public and tracks events
 */
(function() {
  window._pixelConfig = window._pixelConfig || { utmify: [], facebook: [], tiktok: [] };

  // 1. Base Facebook Pixel snippet
  function initFacebookBase() {
    if (window.fbq) return;
    !function(f,b,e,v,n,t,s)
    {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};
    if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
    n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t,s)}(window, document,'script',
    'https://connect.facebook.net/en_US/fbevents.js');
  }

  // 2. Base TikTok Pixel snippet
  function initTikTokBase() {
    if (window.ttq) return;
    !function (w, d, t) {
      w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e},ttq.load=function(e,n){var i="https://analytics.tiktok.com/i18n/pixel/events.js";ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=i,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};var o=document.createElement("script");o.type="text/javascript",o.async=!0,o.src=i+"?sdkid="+e+"&lib="+t;var a=document.getElementsByTagName("script")[0];a.parentNode.insertBefore(o,a)};
    }(window, document, 'ttq');
  }

  // 3. Load & Initialize All Pixels
  async function loadPixels() {
    try {
      const res = await fetch('/api/pixels/public');
      if (res.ok) {
        const data = await res.json();
        if (data && data.pixels) {
          window._pixelConfig = data.pixels;
          applyPixels(data.pixels);
        }
      }
    } catch (e) {
      console.warn('Pixel loader fallback:', e.message);
    }
  }

  function applyPixels(pixels) {
    // A. Apply Facebook Pixels
    if (pixels.facebook && pixels.facebook.length > 0) {
      initFacebookBase();
      pixels.facebook.forEach(fb => {
        if (fb.active !== false && fb.pixelId) {
          fbq('init', fb.pixelId);
          fbq('track', 'PageView');
          if (fb.code) {
            try { eval(fb.code); } catch(err) { console.error('Error in custom FB code:', err); }
          }
        }
      });
    }

    // B. Apply TikTok Pixels
    if (pixels.tiktok && pixels.tiktok.length > 0) {
      initTikTokBase();
      pixels.tiktok.forEach(tt => {
        if (tt.active !== false && tt.pixelId) {
          ttq.load(tt.pixelId);
          ttq.page();
          if (tt.code) {
            try { eval(tt.code); } catch(err) { console.error('Error in custom TT code:', err); }
          }
        }
      });
    }

    // C. Apply UTMify Scripts
    if (pixels.utmify && pixels.utmify.length > 0) {
      pixels.utmify.forEach(utm => {
        if (utm.active !== false && utm.token) {
          const s = document.createElement('script');
          s.async = true;
          s.src = 'https://cdn.utmify.com.br/scripts/utms/latest.js';
          s.setAttribute('data-utmify-token', utm.token);
          document.head.appendChild(s);
        }
      });
    }
  }

  // 4. Global Event Dispatcher
  window.firePixelEvent = function(eventName, data) {
    data = data || {};

    // Facebook Track
    if (window.fbq && window._pixelConfig.facebook) {
      window._pixelConfig.facebook.forEach(fb => {
        if (fb.active !== false && fb.pixelId) {
          fbq('trackSingle', fb.pixelId, eventName, data);
        }
      });
    }

    // TikTok Track
    if (window.ttq && window._pixelConfig.tiktok) {
      window._pixelConfig.tiktok.forEach(tt => {
        if (tt.active !== false && tt.pixelId) {
          ttq.instance(tt.pixelId).track(eventName, data);
        }
      });
    }

    console.log('[Pixel Event Fired]:', eventName, data);
  };

  // Auto initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadPixels);
  } else {
    loadPixels();
  }
})();
