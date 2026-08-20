import{s as e}from"./speed-insights-DFDjlVMP.js";import{E as t,O as n,T as r,b as i,f as a,m as o,p as s,w as c}from"./nav-utils-Bc-WWpNs.js";import{n as l,r as u}from"./reviews-utils-CivoFhuJ.js";function d(e){return e?String(e).replace(/&/g,`&amp;`).replace(/</g,`&lt;`).replace(/>/g,`&gt;`).replace(/"/g,`&quot;`).replace(/'/g,`&#39;`):``}async function f(t){let[{data:n,error:r},i]=await Promise.all([e.from(`products`).select(`id, title, description, price, compare_at_price, offer_expires_at, stock, image_url, stores(id, name, delivery_fee, free_shipping_threshold), product_images(url, position), product_variants(id, name, price, stock)`).eq(`id`,t).single(),l(`product`,t)]);if(r||!n)throw r||Error(`Producto no encontrado`);let o=new Date().toISOString().slice(0,10),s=!!(n.offer_expires_at&&n.offer_expires_at<o),c=!!(n.compare_at_price&&n.compare_at_price>n.price&&!s),u=c?Math.round((1-n.price/n.compare_at_price)*100):0,f=n.stores||{},p=(n.product_images||[]).slice().sort((e,t)=>e.position-t.position),m=[n.image_url||`/img/no-image.svg`,...p.map(e=>e.url)],h=f.free_shipping_threshold!=null&&n.price>=f.free_shipping_threshold,g;g=f.delivery_fee==null?`El costo de envío se calcula en el carrito, según el comercio.`:h||f.delivery_fee===0?`Envío gratis en este comercio.`:`Envío: ${a(f.delivery_fee)}`+(f.free_shipping_threshold?` (gratis desde ${a(f.free_shipping_threshold)})`:``);let _=``,v=``;c?(_=`-${u}%`,v=`descuento`):h&&(_=`Envío gratis`,v=`envio`);let y=i.average,b=i.count,x=y?Math.floor(y):0,S=y&&y-Math.floor(y)>=.5?1:0,C=Math.max(0,5-x-S);return{id:n.id,price:n.price,name:d(n.title||`Producto`),description:d(n.description||``),shop:d(f.name||`Comercio`),shopId:f.id||null,priceText:a(n.price),priceOldText:c?a(n.compare_at_price):``,discountText:c?`-${u}%`:``,images:m,imgSrc:m[0],imgAlt:d(n.title||`Producto`),shippingText:g,fullStars:x,halfStars:S,emptyStars:C,ratingCount:b,hasRating:b>0,badgeText:_,badgeType:v,stock:n.stock??0,variants:n.product_variants||[]}}function p(e,t,n){let r=``;for(let t=0;t<e;t++)r+=`<i class="fa-solid fa-star"></i>`;for(let e=0;e<t;e++)r+=`<i class="fa-solid fa-star-half-stroke"></i>`;let i=5-e-t;for(let e=0;e<i;e++)r+=`<i class="fa-regular fa-star empty"></i>`;return r}function m(e){return e<=0?{text:`Sin stock disponible`,cssClass:`low`,fillClass:`pm-stock__fill--low`}:e<=10?{text:`¡Últimas ${e} unidades!`,cssClass:`low`,fillClass:`pm-stock__fill--low`}:e<=25?{text:`Quedan ${e} unidades`,cssClass:`ok`,fillClass:`pm-stock__fill--mid`}:{text:`Disponible (${e} unidades)`,cssClass:`ok`,fillClass:`pm-stock__fill--high`}}function h(e,t){let n=document.querySelectorAll(`.product-card`),r=[];return n.forEach(n=>{if(n.id===e)return;let i=(n.dataset.category||``).split(` `);t.some(e=>e&&i.includes(e))&&r.push(n)}),r.length<8&&n.forEach(t=>{t.id!==e&&!r.includes(t)&&r.length<12&&r.push(t)}),r.slice(0,12)}function g(e){return`${window.location.pathname.includes(`/pages/`)?`./`:`./pages/`}comercio.html?id=${encodeURIComponent(e)}`}function _(){return`
    <div class="product-modal" role="dialog" aria-modal="true" aria-label="Cargando producto">
      <div class="pm-topbar">
        <button class="pm-topbar__back" id="pm-close-back" aria-label="Volver"><i class="fa-solid fa-chevron-left"></i> Atrás</button>
        <div class="pm-topbar__actions">
          <button class="pm-topbar__btn pm-topbar__btn--close" id="pm-close-btn" aria-label="Cerrar"><i class="fa-solid fa-xmark"></i></button>
        </div>
      </div>
      <div class="pm-loading">
        <i class="fa-solid fa-spinner fa-spin"></i>
        <p>Cargando producto...</p>
      </div>
    </div>
  `}function v(){return`
    <div class="product-modal" role="dialog" aria-modal="true" aria-label="Error al cargar el producto">
      <div class="pm-topbar">
        <button class="pm-topbar__back" id="pm-close-back" aria-label="Volver"><i class="fa-solid fa-chevron-left"></i> Atrás</button>
        <div class="pm-topbar__actions">
          <button class="pm-topbar__btn pm-topbar__btn--close" id="pm-close-btn" aria-label="Cerrar"><i class="fa-solid fa-xmark"></i></button>
        </div>
      </div>
      <div class="pm-modal-error">
        <i class="fa-solid fa-triangle-exclamation"></i>
        <p>No se pudo cargar el producto.</p>
        <button type="button" class="pm-modal-error__retry" id="pm-retry-btn">Reintentar</button>
      </div>
    </div>
  `}function y(e){let t=m(e.stock),n=e.stock<=0,r=(e.shop||`?`).charAt(0).toUpperCase(),i=h(e.id,e.categories||[]),o=``;i.forEach(e=>{let t=d(e.querySelector(`.product-card__name`)?.textContent?.trim()||``),n=d(e.querySelector(`.product-card__price`)?.textContent||``),r=encodeURI(e.querySelector(`.product-card__image img`)?.getAttribute(`src`)||``),i=d(e.id||``);o+=`
      <div class="pm-related-card" data-related-id="${i}" tabindex="0" role="button" aria-label="Ver ${t}">
        <div class="pm-related-card__img">
          <img src="${r}" alt="${t}" loading="lazy" />
        </div>
        <div class="pm-related-card__body">
          <div class="pm-related-card__name">${t}</div>
          <div class="pm-related-card__price">${n}</div>
        </div>
      </div>
    `});let s=``;e.badgeText&&(s=`<span class="pm-gallery__badge pm-gallery__badge--${e.badgeType||`descuento`}">${e.badgeText}</span>`);let c=e.discountText?`<span class="pm-discount-tag">${e.discountText}</span>`:``,l=e.priceOldText?`<span class="pm-price-old">${e.priceOldText}</span>`:``,u=``;e.images.length>1&&(u=`
      <div class="pm-thumbs-row">
        ${e.images.map((t,n)=>`<img class="pm-thumb${n===0?` is-active`:``}" data-thumb-src="${encodeURI(t)}" src="${encodeURI(t)}" alt="${e.imgAlt}" loading="lazy" />`).join(``)}
      </div>
    `);let f=e.hasRating?`
      <div class="pm-rating__stars">${p(e.fullStars,e.halfStars,e.emptyStars)}</div>
      <span class="pm-rating__count">(${e.ratingCount} reseña${e.ratingCount===1?``:`s`})</span>
    `:`<span class="pm-rating__count">Todavía no tiene reseñas</span>`,g=``;return e.variants.length>0&&(g=`
      <div class="pm-variants">
        <p class="pm-variants__title" style="font-weight:600; margin-bottom:0.4rem;">Opciones disponibles:</p>
        <ul class="pm-variants__list" style="list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:0.3rem;">
          ${e.variants.map(e=>`<li style="font-size:0.85rem; color:var(--bl-text-secondary);">${d(e.name)} — ${a(e.price)} (${e.stock>0?`stock: ${e.stock}`:`sin stock`})</li>`).join(``)}
        </ul>
        <p style="font-size:0.75rem; color:var(--bl-text-muted); margin-top:0.3rem;">Para pedir una opción específica, consultá con el vendedor.</p>
      </div>
    `),`
    <div class="product-modal" role="dialog" aria-modal="true" aria-label="Detalle de ${e.name}">

      <div class="pm-topbar">
        <button class="pm-topbar__back" id="pm-close-back" aria-label="Volver">
          <i class="fa-solid fa-chevron-left"></i> Atrás
        </button>
        <div class="pm-topbar__actions">
          <button class="pm-topbar__btn" id="pm-share-btn" aria-label="Compartir producto">
            <i class="fa-solid fa-share-nodes"></i>
          </button>
          <button class="pm-topbar__btn pm-topbar__btn--close" id="pm-close-btn" aria-label="Cerrar">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
      </div>

      <div class="pm-main">

        <div class="pm-gallery-col">
          <div class="pm-gallery" id="pm-gallery">
            ${s}
            <button class="pm-gallery__fav" id="pm-fav-btn" aria-label="Agregar a favoritos">
              <i class="fa-regular fa-heart"></i>
            </button>
            <img class="pm-gallery__img" id="pm-gallery-img" src="${encodeURI(e.imgSrc)}" alt="${e.imgAlt}" />
          </div>
          ${u}
        </div>

        <div class="pm-info">

          <div class="pm-shop" id="pm-shop-link" tabindex="0" role="link" aria-label="Ver tienda ${e.shop}">
            ${e.shop}
          </div>

          <h2 class="pm-name">${e.name}</h2>

          <div class="pm-rating">
            ${f}
          </div>

          <div class="pm-price-block">
            <div class="pm-price-row">
              <span class="pm-price">${e.priceText}</span>
              ${l}
              ${c}
            </div>
            <div class="pm-shipping">
              ${e.shippingText}
            </div>
          </div>

          <!-- Stock -->
          <div class="pm-stock">
            <div class="pm-stock__text pm-stock__text--${t.cssClass}">
              <i class="fa-solid fa-circle-info"></i>
              ${t.text}
            </div>
            <div class="pm-stock__bar">
              <div class="pm-stock__fill ${t.fillClass}"></div>
            </div>
          </div>

          ${g}

          <!-- Quantity -->
          <div class="pm-quantity">
            <span class="pm-quantity__label">Cantidad:</span>
            <div class="pm-quantity__controls">
              <button class="pm-quantity__btn" id="pm-qty-minus" aria-label="Reducir cantidad" disabled>
                <i class="fa-solid fa-minus"></i>
              </button>
              <input type="number" class="pm-quantity__value" id="pm-qty-value" value="1" min="1" max="${Math.max(e.stock,1)}" aria-label="Cantidad" ${n?`disabled`:``} />
              <button class="pm-quantity__btn" id="pm-qty-plus" aria-label="Aumentar cantidad" ${n?`disabled`:``}>
                <i class="fa-solid fa-plus"></i>
              </button>
            </div>
          </div>

          <!-- Actions -->
          <div class="pm-actions">
            ${n?`
            <button class="pm-btn pm-btn--cart" id="pm-add-cart" disabled>
              Sin stock
            </button>
            `:`
            <button class="pm-btn pm-btn--cart" id="pm-add-cart">
              Añadir al carrito
            </button>
            <button class="pm-btn pm-btn--buy" id="pm-buy-now">
              Comprar ahora
            </button>
            `}
          </div>

        </div>
      </div>

      <hr class="pm-divider" />

      <!-- Tabs -->
      <div class="pm-tabs-section">
        <div class="pm-tabs" role="tablist">
          <button class="pm-tab is-active" data-tab="desc" role="tab" aria-selected="true">Descripción</button>
          <button class="pm-tab" data-tab="specs" role="tab" aria-selected="false">Características</button>
          <button class="pm-tab" data-tab="shop" role="tab" aria-selected="false">Sobre la tienda</button>
          <button class="pm-tab" data-tab="reviews" role="tab" aria-selected="false">Reseñas${e.hasRating?` (${e.ratingCount})`:``}</button>
        </div>

        <div class="pm-tab-content is-visible" data-tab-content="desc">
          <p class="pm-description">
            ${e.description||`Producto de <strong>${e.shop}</strong>, disponible en tu zona. Comprando local apoyás a los comercios de Baradero.`}
          </p>
        </div>

        <div class="pm-tab-content" data-tab-content="specs">
          <div class="pm-features">
            <div class="pm-feature-item">Vendido por ${e.shop}</div>
            <div class="pm-feature-item">${e.shippingText}</div>
            <div class="pm-feature-item">Disponible para envío y retiro en tienda</div>
          </div>
        </div>

        <div class="pm-tab-content" data-tab-content="shop">
          <div class="pm-shop-info">
            <div class="pm-shop-info__avatar">${r}</div>
            <div class="pm-shop-info__details">
              <div class="pm-shop-info__name">${e.shop}</div>
              <div class="pm-shop-info__meta">
                <i class="fa-solid fa-circle-check"></i> Comercio verificado • Baradero
              </div>
            </div>
            <button class="pm-shop-info__link" id="pm-view-shop-btn" aria-label="Ver todos los productos de ${e.shop}">
              Ver tienda
            </button>
          </div>
        </div>

        <div class="pm-tab-content" data-tab-content="reviews">
          <div id="pm-reviews-container">
            <p style="color: var(--bl-text-muted); font-size: 0.9rem;">Cargando reseñas...</p>
          </div>
        </div>
      </div>

      ${i.length>0?`
        <hr class="pm-divider" />
        <!-- Related Products -->
        <div class="pm-related">
          <h3 class="pm-related__title">Productos relacionados</h3>
          <div class="pm-related__scroll">
            ${o}
          </div>
        </div>
      `:``}

    </div>
  `}var b=null,x=null,S=null;function C(e){let t=(history.state?.pmDepth||0)+1;history.pushState({pmProduct:e,pmDepth:t},``,location.href)}function w(){let e=history.state?.pmDepth||0;e>0?history.go(-e):E()}window.addEventListener(`popstate`,e=>{let t=e.state?.pmProduct,n=t&&document.getElementById(t);n?T(n,{skipHistoryPush:!0}):b&&E()});async function T(e,{skipHistoryPush:t=!1}={}){if(!e.id){console.error(`Se intentó abrir el modal de un producto sin id real (UUID)`);return}b&&E(),x=document.activeElement;let n=e.id,r=(e.dataset.category||``).split(` `);t||C(n);let i=document.createElement(`div`);i.className=`product-modal-overlay`,i.id=`pm-overlay`,i.innerHTML=_(),document.body.appendChild(i),b=i;let a=window.innerWidth-document.documentElement.clientWidth;document.documentElement.style.setProperty(`--scrollbar-width`,a+`px`),document.body.classList.add(`modal-open`),i.offsetHeight,requestAnimationFrame(()=>i.classList.add(`is-open`)),i.addEventListener(`click`,e=>{(e.target.closest(`#pm-close-back`)||e.target.closest(`#pm-close-btn`))&&w()}),S=e=>{e.key===`Escape`&&w()},document.addEventListener(`keydown`,S);try{let e=await f(n);if(e.categories=r,b!==i)return;i.innerHTML=y(e),D(i,e);let t=i.querySelector(`.pm-stock__fill`);if(t){let n=e.stock<=0?`0%`:``;t.style.width=`0%`,requestAnimationFrame(()=>{requestAnimationFrame(()=>{t.style.width=n})})}}catch(t){if(console.error(`Error al cargar el producto en el modal:`,t),b!==i)return;i.innerHTML=v(),i.querySelector(`#pm-retry-btn`)?.addEventListener(`click`,()=>T(e))}}function E(){if(!b)return;b.classList.remove(`is-open`),document.body.classList.remove(`modal-open`),document.documentElement.style.removeProperty(`--scrollbar-width`);let e=b;b=null,S&&=(document.removeEventListener(`keydown`,S),null),setTimeout(()=>{e.remove()},400),x&&=(x.focus(),null)}function D(e,a){let l=e.querySelector(`.product-modal`),d=e.querySelector(`#pm-gallery`);d?.addEventListener(`click`,e=>{e.target.closest(`.pm-gallery__fav`)||d.classList.toggle(`is-zoomed`)});let f=e.querySelector(`#pm-gallery-img`);if(e.querySelectorAll(`.pm-thumb`).forEach(t=>{t.addEventListener(`click`,()=>{let n=t.dataset.thumbSrc;f&&n&&(f.src=n),e.querySelectorAll(`.pm-thumb`).forEach(e=>e.classList.remove(`is-active`)),t.classList.add(`is-active`)})}),a.shopId){let t=()=>{window.location.href=g(a.shopId)},n=e.querySelector(`#pm-shop-link`);n?.addEventListener(`click`,t),n?.addEventListener(`keydown`,e=>{(e.key===`Enter`||e.key===` `)&&(e.preventDefault(),t())}),e.querySelector(`#pm-view-shop-btn`)?.addEventListener(`click`,t)}let p=e.querySelector(`#pm-fav-btn`);if(p&&a.id){let e=p.querySelector(`i`),n=!1;o().then(t=>{n=t.includes(a.id),p.classList.toggle(`is-active`,n),e.classList.toggle(`fa-solid`,n),e.classList.toggle(`fa-regular`,!n)}),p.addEventListener(`click`,async()=>{let i=n;n=!i,p.classList.toggle(`is-active`,n),e.classList.toggle(`fa-solid`,n),e.classList.toggle(`fa-regular`,!n),r(n?`Agregado a favoritos`:`Eliminado de favoritos`,n?`success`:`default`);try{await t(a.id,i)}catch(e){console.error(`Error al actualizar favoritos:`,e)}})}let m=e.querySelector(`#pm-qty-value`),h=e.querySelector(`#pm-qty-minus`),_=e.querySelector(`#pm-qty-plus`);function v(){let e=parseInt(m.value,10)||1;h.disabled=e<=1,_.disabled=e>=a.stock}h?.addEventListener(`click`,()=>{let e=parseInt(m.value,10)||1;e>1&&(m.value=e-1),v()}),_?.addEventListener(`click`,()=>{let e=parseInt(m.value,10)||1;e<a.stock&&(m.value=e+1),v()}),m?.addEventListener(`change`,()=>{let e=parseInt(m.value,10)||1;e=Math.max(1,Math.min(e,a.stock)),m.value=e,v()});let y=e.querySelector(`#pm-add-cart`);y?.addEventListener(`click`,()=>{let e=parseInt(m?.value,10)||1,t=i(a.priceOldText),o=s(),l=o.find(e=>e.id===a.id);l?(l.qty+=e,l.selected=!0):o.push({id:a.id,name:a.name,shop:a.shop,price:a.price,priceOld:t||null,image:a.imgSrc,qty:e,selected:!0}),c(o),n(),y.classList.add(`pm-btn--added`);let u=y.innerHTML;y.innerHTML=`<i class="fa-solid fa-check"></i> ¡Agregado!`,setTimeout(()=>{y.classList.remove(`pm-btn--added`),y.innerHTML=u},1800),r(`${a.name} agregado al carrito (x${e})`,`success`)}),e.querySelector(`#pm-buy-now`)?.addEventListener(`click`,()=>{let e=parseInt(m?.value,10)||1,t=i(a.priceOldText),r=s(),o=r.find(e=>e.id===a.id);o?(o.qty+=e,o.selected=!0):r.push({id:a.id,name:a.name,shop:a.shop,price:a.price,priceOld:t||null,image:a.imgSrc,qty:e,selected:!0}),c(r),n(),E();let l=window.location.pathname.includes(`/pages/`);window.location.href=l?`./carrito.html`:`./pages/carrito.html`}),e.querySelector(`#pm-share-btn`)?.addEventListener(`click`,async()=>{let e={title:a.name,text:`Mirá ${a.name} en Baradero Local por ${a.priceText}`,url:window.location.href};try{navigator.share?await navigator.share(e):(await navigator.clipboard.writeText(`${e.text} — ${e.url}`),r(`¡Link copiado al portapapeles!`,`success`))}catch(e){if(e.name!==`AbortError`)try{await navigator.clipboard.writeText(window.location.href),r(`¡Link copiado!`,`success`)}catch{}}});let b=e.querySelectorAll(`.pm-tab`),x=e.querySelectorAll(`.pm-tab-content`),S=!1;b.forEach(t=>{t.addEventListener(`click`,()=>{b.forEach(e=>{e.classList.remove(`is-active`),e.setAttribute(`aria-selected`,`false`)}),x.forEach(e=>e.classList.remove(`is-visible`)),t.classList.add(`is-active`),t.setAttribute(`aria-selected`,`true`);let n=t.dataset.tab,r=e.querySelector(`[data-tab-content="${n}"]`);if(r&&r.classList.add(`is-visible`),n===`reviews`&&!S){S=!0;let t=e.querySelector(`#pm-reviews-container`);t&&u(t,`product`,a.id)}})}),e.querySelectorAll(`.pm-related-card`).forEach(e=>{let t=()=>{let t=e.dataset.relatedId,n=document.getElementById(t);n&&(E(),setTimeout(()=>T(n),450))};e.addEventListener(`click`,t),e.addEventListener(`keydown`,e=>{(e.key===`Enter`||e.key===` `)&&(e.preventDefault(),t())})});let C=l.querySelectorAll(`button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])`),w=C[0],D=C[C.length-1];l.addEventListener(`keydown`,e=>{e.key===`Tab`&&(e.shiftKey?document.activeElement===w&&(e.preventDefault(),D.focus()):document.activeElement===D&&(e.preventDefault(),w.focus()))}),setTimeout(()=>w?.focus(),100)}function O(){document.querySelectorAll(`.products__grid`).forEach(e=>{e.addEventListener(`click`,e=>{if(e.target.closest(`.product-card__add, .product-card__wishlist`))return;let t=e.target.closest(`.product-card`);t&&(e.preventDefault(),T(t))})})}typeof window<`u`&&(window.initProductModal=O,window.openProductModal=T,window.closeProductModal=E);